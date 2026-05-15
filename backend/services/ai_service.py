"""AI service for generating pandas code from natural language queries."""
import os
import json
from typing import Optional
from openai import AsyncOpenAI

_client: Optional[AsyncOpenAI] = None


def get_client() -> Optional[AsyncOpenAI]:
    global _client
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    if _client is None:
        _client = AsyncOpenAI(api_key=api_key)
    return _client


SYSTEM_PROMPT = """You are a data analyst assistant. Given a pandas DataFrame (already loaded as `df`) and a user's question, generate SAFE Python code to answer the question.

STRICT RULES:
1. Only use: pandas (as pd), numpy (as np), plotly.express (as px), plotly.graph_objects (as go)
2. NEVER use: os, sys, subprocess, open(), eval(), exec(), __import__, socket, requests
3. NEVER delete files, make network calls, or access the filesystem
4. The DataFrame is already loaded as `df`
5. Store your final result in a variable called `result`
6. If creating a chart, store the plotly figure in a variable called `fig` (use plotly, not matplotlib)
7. `result` should be either:
   - A pandas DataFrame or Series (for table results)
   - A string (for text answers)
   - A number (for numeric answers)
8. Keep code concise and correct

You must respond with a JSON object with these fields:
{
  "code": "python code here",
  "chart_type": "bar|line|pie|scatter|histogram|none",
  "explanation": "brief explanation of what the code does"
}

Respond ONLY with the JSON object, no markdown, no extra text."""


async def generate_analysis_code(
    df_schema: str,
    sample_data: str,
    question: str
) -> dict:
    """
    Generate pandas/plotly code for the given question.
    Returns dict with keys: code, chart_type, explanation
    """
    client = get_client()
    if not client:
        return _fallback_analysis(question)

    user_message = f"""DataFrame schema:
{df_schema}

Sample data (first 3 rows):
{sample_data}

User question: {question}

Generate Python code to answer this question. Remember: DataFrame is already loaded as `df`."""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message}
            ],
            temperature=0.1,
            max_tokens=1000,
            response_format={"type": "json_object"}
        )

        content = response.choices[0].message.content
        parsed = json.loads(content)
        return {
            "code": parsed.get("code", "result = 'Could not generate code'"),
            "chart_type": parsed.get("chart_type", "none"),
            "explanation": parsed.get("explanation", "")
        }
    except Exception as e:
        return _fallback_analysis(question, error=str(e))


INSIGHT_SYSTEM_PROMPT = """You are a data analyst. Given data analysis results, write 2-4 concise, human-readable insights.

Each insight should be a single sentence like:
- "The East region generated 42% of total revenue."
- "Sales peaked in Q3 with $1.2M, 34% above average."
- "Product A has the highest return rate at 8.3%."

Return a JSON array of insight strings. No markdown, no extra text."""


async def generate_insights(
    question: str,
    answer: str,
    result_preview: str
) -> list[str]:
    """Generate human-readable insights from analysis results."""
    client = get_client()
    if not client:
        return []

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": INSIGHT_SYSTEM_PROMPT},
                {"role": "user", "content": f"Question: {question}\n\nResult preview:\n{result_preview}\n\nGenerate insights."}
            ],
            temperature=0.3,
            max_tokens=400,
            response_format={"type": "json_object"}
        )

        content = response.choices[0].message.content
        parsed = json.loads(content)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            for key in ["insights", "data", "results"]:
                if key in parsed and isinstance(parsed[key], list):
                    return parsed[key]
        return []
    except Exception:
        return []


def _fallback_analysis(question: str, error: str = "") -> dict:
    """Fallback when OpenAI is not available — generate basic statistical code."""
    q_lower = question.lower()

    if any(kw in q_lower for kw in ["mean", "average", "avg"]):
        code = "result = df.select_dtypes(include='number').mean().round(2)"
        chart_type = "bar"
    elif any(kw in q_lower for kw in ["count", "how many", "total"]):
        code = "result = df.shape[0]\nresult = f'Total rows: {result}'"
        chart_type = "none"
    elif any(kw in q_lower for kw in ["distribution", "histogram", "spread"]):
        num_cols = "df.select_dtypes(include='number').columns.tolist()"
        code = f"""import plotly.express as px
num_cols = df.select_dtypes(include='number').columns.tolist()
if num_cols:
    fig = px.histogram(df, x=num_cols[0], title=f'Distribution of {{num_cols[0]}}')
    result = df[num_cols[0]].describe().round(2)
else:
    result = df.describe()"""
        chart_type = "histogram"
    elif any(kw in q_lower for kw in ["correlation", "relate", "relationship"]):
        code = "result = df.select_dtypes(include='number').corr().round(3)"
        chart_type = "none"
    elif any(kw in q_lower for kw in ["missing", "null", "nan", "empty"]):
        code = "result = df.isnull().sum().reset_index()\nresult.columns = ['column', 'missing_count']\nresult['missing_pct'] = (result['missing_count'] / len(df) * 100).round(2)"
        chart_type = "bar"
    elif any(kw in q_lower for kw in ["top", "highest", "best", "most", "largest"]):
        code = """num_cols = df.select_dtypes(include='number').columns.tolist()
if num_cols:
    col = num_cols[0]
    result = df.nlargest(10, col)
else:
    result = df.head(10)"""
        chart_type = "bar"
    elif any(kw in q_lower for kw in ["trend", "over time", "monthly", "yearly", "daily"]):
        code = """import plotly.express as px
date_cols = df.select_dtypes(include=['datetime64', 'object']).columns.tolist()
num_cols = df.select_dtypes(include='number').columns.tolist()
if date_cols and num_cols:
    fig = px.line(df, x=date_cols[0], y=num_cols[0], title=f'{num_cols[0]} over time')
    result = df[[date_cols[0], num_cols[0]]].head(20)
else:
    result = df.head(20)"""
        chart_type = "line"
    else:
        code = "result = df.describe(include='all').round(2)"
        chart_type = "none"

    explanation = f"Statistical analysis of the dataset (OpenAI not configured{': ' + error if error else ''})."
    return {"code": code, "chart_type": chart_type, "explanation": explanation}
