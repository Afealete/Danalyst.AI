"""Natural language query route — generates and executes pandas code."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from utils.session_store import (
    get_session, get_latest_session, add_query_record, get_query_history,
    get_query_record, QueryRecord
)
from services.ai_service import generate_analysis_code, generate_insights
from services.execution import execute_code, result_to_preview, result_to_answer

router = APIRouter()


class QueryInput(BaseModel):
    question: str
    session_id: str | None = None


class ExportInput(BaseModel):
    query_id: str


@router.post("/query")
async def run_query(body: QueryInput):
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    # Resolve session
    if body.session_id:
        sess = get_session(body.session_id)
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found. Upload a file first.")
    else:
        sess = get_latest_session()
        if not sess:
            raise HTTPException(status_code=404, detail="No dataset loaded. Upload a file first.")

    df = sess.df

    # Build schema description for AI
    schema_lines = []
    for col in df.columns:
        dtype = str(df[col].dtype)
        non_null = int(df[col].notna().sum())
        schema_lines.append(f"  {col}: {dtype} ({non_null} non-null values)")
    df_schema = f"DataFrame shape: {df.shape[0]} rows × {df.shape[1]} cols\nColumns:\n" + "\n".join(schema_lines)

    try:
        sample_data = df.head(3).to_string(index=False)
    except Exception:
        sample_data = "(unable to show sample)"

    # Generate code via AI
    ai_result = await generate_analysis_code(df_schema, sample_data, question)
    code = ai_result["code"]
    chart_type = ai_result.get("chart_type", "none")

    # Execute code safely
    exec_result = execute_code(code, df)

    if not exec_result.success:
        # Provide a graceful fallback answer
        raise HTTPException(
            status_code=422,
            detail=f"Could not execute analysis: {exec_result.error}"
        )

    # Build response
    answer = result_to_answer(exec_result.result)
    result_table = result_to_preview(exec_result.result)

    chart_data = {"type": "none", "plotly_json": None}
    if exec_result.fig_json:
        chart_data = {"type": chart_type, "plotly_json": exec_result.fig_json}
    elif chart_type != "none":
        chart_data = {"type": chart_type, "plotly_json": None}

    # Generate insights
    preview_str = ""
    if result_table:
        import pandas as pd
        try:
            preview_df = pd.DataFrame(result_table["rows"], columns=result_table["columns"])
            preview_str = preview_df.head(5).to_string(index=False)
        except Exception:
            preview_str = answer

    insights = await generate_insights(question, answer, preview_str or answer)
    if ai_result.get("used_fallback"):
        fallback_reason = ai_result.get("fallback_reason") or "Gemini API was not available"
        friendly_fallback = (
            "The AI helper is temporarily unavailable, so I used a simpler built-in analysis instead."
            if "quota" in fallback_reason.lower() or "429" in fallback_reason.lower()
            else f"The AI helper is currently unavailable, so I used a simpler built-in analysis instead."
        )
        insights = [friendly_fallback, *insights]

    query_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    # Store record
    import pandas as pd
    result_df = None
    if result_table:
        try:
            result_df = pd.DataFrame(result_table["rows"], columns=result_table["columns"])
        except Exception:
            pass

    record = QueryRecord(
        query_id=query_id,
        question=question,
        answer=answer,
        chart_type=chart_data["type"] if chart_data["type"] != "none" else None,
        has_chart=bool(exec_result.fig_json),
        has_table=result_table is not None,
        created_at=created_at,
        result_df=result_df,
    )
    add_query_record(sess.session_id, record)

    return {
        "query_id": query_id,
        "question": question,
        "answer": answer,
        "chart": chart_data,
        "result_table": result_table,
        "insights": insights,
        "generated_code": code,
        "execution_time_ms": round(exec_result.execution_time_ms, 1),
        "ai_status": "fallback" if ai_result.get("used_fallback") else "gemini",
        "ai_error": ai_result.get("fallback_reason") if ai_result.get("used_fallback") else None,
    }


@router.get("/query-history")
async def get_query_history_route(session_id: str | None = None):
    if session_id:
        sess = get_session(session_id)
        if not sess:
            return []
        history = get_query_history(session_id)
    else:
        sess = get_latest_session()
        if not sess:
            return []
        history = get_query_history(sess.session_id)

    return [
        {
            "query_id": r.query_id,
            "question": r.question,
            "answer": r.answer,
            "chart_type": r.chart_type,
            "created_at": r.created_at,
            "has_chart": r.has_chart,
            "has_table": r.has_table,
        }
        for r in reversed(history)
    ]


@router.post("/export-results")
async def export_results(body: ExportInput):
    sess = get_latest_session()
    if not sess:
        raise HTTPException(status_code=404, detail="No active session.")

    record = get_query_record(sess.session_id, body.query_id)
    if not record:
        raise HTTPException(status_code=404, detail="Query result not found.")

    if record.result_df is None:
        # Return answer as CSV
        import io
        import pandas as pd
        df_out = pd.DataFrame([{"answer": record.answer}])
    else:
        df_out = record.result_df

    csv_str = df_out.to_csv(index=False)
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=query_result.csv"}
    )
