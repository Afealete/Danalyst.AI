"""Dataset summary, preview, and sample dataset routes."""
import io
import os
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from utils.session_store import get_session, get_latest_session, create_session

router = APIRouter()

SAMPLE_DATASETS = [
    {
        "id": "sales",
        "name": "Sales Data",
        "description": "Monthly sales by region, product category, and sales rep",
        "rows": 500,
        "columns": 10,
    },
    {
        "id": "ecommerce",
        "name": "E-Commerce Orders",
        "description": "Online orders with customer info, products, and shipping",
        "rows": 300,
        "columns": 12,
    },
]

_SAMPLE_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def _resolve_session(session_id: str | None):
    if session_id:
        sess = get_session(session_id)
        if not sess:
            raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
        return sess
    sess = get_latest_session()
    if not sess:
        raise HTTPException(status_code=404, detail="No dataset loaded. Upload a file first.")
    return sess


@router.get("/dataset-summary")
async def get_dataset_summary(session_id: str | None = Query(default=None)):
    sess = _resolve_session(session_id)
    df = sess.df

    columns_info = []
    for col in df.columns:
        null_count = int(df[col].isnull().sum())
        sample = df[col].dropna().head(3).tolist()
        columns_info.append({
            "name": col,
            "dtype": str(df[col].dtype),
            "null_count": null_count,
            "null_pct": round(null_count / len(df) * 100, 1) if len(df) > 0 else 0.0,
            "sample_values": sample,
        })

    numeric_summary = {}
    num_df = df.select_dtypes(include="number")
    if not num_df.empty:
        desc = num_df.describe().round(2)
        numeric_summary = desc.to_dict()

    mem_bytes = df.memory_usage(deep=True).sum()
    if mem_bytes >= 1024 * 1024:
        mem_str = f"{mem_bytes / 1024 / 1024:.1f} MB"
    else:
        mem_str = f"{mem_bytes / 1024:.1f} KB"

    return {
        "session_id": sess.session_id,
        "filename": sess.filename,
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "columns_info": columns_info,
        "numeric_summary": numeric_summary,
        "memory_usage": mem_str,
    }


@router.get("/dataset-preview")
async def get_dataset_preview(
    session_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
):
    sess = _resolve_session(session_id)
    df = sess.df.head(limit)
    df = df.where(pd.notnull(df), None)

    return {
        "columns": df.columns.tolist(),
        "rows": df.values.tolist(),
        "total_rows": int(sess.df.shape[0]),
    }


@router.get("/sample-datasets")
async def get_sample_datasets():
    return SAMPLE_DATASETS


@router.post("/load-sample")
async def load_sample_dataset(body: dict):
    dataset_id = body.get("dataset_id", "")
    sample_path = os.path.join(_SAMPLE_DIR, f"{dataset_id}.csv")

    if not os.path.exists(sample_path):
        raise HTTPException(status_code=404, detail=f"Sample dataset '{dataset_id}' not found.")

    try:
        df = pd.read_csv(sample_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not load sample: {e}")

    meta = next((s for s in SAMPLE_DATASETS if s["id"] == dataset_id), None)
    filename = f"{dataset_id}.csv"
    session_id = create_session(filename, df)

    return {
        "session_id": session_id,
        "filename": filename,
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "message": f"Loaded sample dataset '{meta['name'] if meta else dataset_id}' — {df.shape[0]:,} rows.",
        "column_names": df.columns.tolist(),
    }
