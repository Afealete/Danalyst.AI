"""Gemini AI service for generating pandas code from natural language queries."""
import os
import json
import logging
import random
from typing import Optional
from openai import AsyncOpenAI as GeminiCompatibleClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

_client: Optional[GeminiCompatibleClient] = None
_logger = logging.getLogger(__name__)

GEMINI_BASE_URL = os.environ.get(
    "GEMINI_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta/openai/"
)
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")


def get_dynamic_colors() -> list[str]:
    """Generate a random set of distinct professional colors."""
    color_palettes = [
        ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F"],
        ["#6C5CE7", "#A29BFE", "#00B894", "#FDCB6E", "#E17055", "#74B9FF"],
        ["#2E86AB", "#A23B72", "#F18F01", "#C73E1D", "#6A994E", "#BC4749"],
        ["#264653", "#2A9D8F", "#E9C46A", "#F4A261", "#E76F51", "#9D84B7"],
        ["#D62828", "#F77F00", "#FCBF49", "#EAE2B7", "#003049", "#780000"],
    ]
    return random.choice(color_palettes)


def get_client() -> Optional[GeminiCompatibleClient]:
    global _client
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    if _client is None:
        _client = GeminiCompatibleClient(api_key=api_key, base_url=GEMINI_BASE_URL)
    return _client


def _extract_json_object(content: str) -> dict:
    """Parse a JSON object, tolerating providers that wrap it in extra text."""
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        parsed = json.loads(content[start:end + 1])

    if not isinstance(parsed, dict):
        raise ValueError("Gemini response was not a JSON object.")
    return parsed


SYSTEM_PROMPT = """You are a data analyst assistant helping non-technical business users understand their data. Given a pandas DataFrame (already loaded as `df`) and a user's question, generate SAFE Python code to analyze the data.

STRICT RULES:
1. The following are ALREADY available in the namespace — do NOT import them:
   - `df` — the DataFrame
   - `pd` — pandas
   - `np` — numpy
   - `px` — plotly.express
   - `go` — plotly.graph_objects
2. DO NOT write any import statements at all. Using import will cause an error.
3. NEVER use: os, sys, subprocess, open(), eval(), exec(), socket, requests
4. Store your final result in a variable called `result`
5. If creating a chart, store the plotly figure in a variable called `fig` (use px or go)
6. `result` should be either:
   - A pandas DataFrame or Series (for table results)
   - A string (for text answers)
   - A number (for numeric answers)
7. Keep code concise and correct
8. Choose the MOST APPROPRIATE visualization for the data type:
   - Bar charts for comparisons and categories
   - Line charts for trends over time
   - Pie charts only for showing proportions of a whole (not for many categories)
   - Scatter plots for relationships between two variables
   - Histograms for distributions
9. Make explanations clear and understandable for non-technical people - avoid jargon

CHART STYLING (IMPORTANT - Apply to ALL generated figures):
Use professional styling with vibrant colors. After creating the figure, ALWAYS add professional styling:
  fig.update_layout(
      template="plotly_white",
      hovermode="x unified",
      showlegend=True,
      font=dict(family="Inter, -apple-system, sans-serif", size=13),
      xaxis=dict(showgrid=True, gridwidth=1, gridcolor="rgba(0,0,0,0.08)"),
      yaxis=dict(showgrid=True, gridwidth=1, gridcolor="rgba(0,0,0,0.08)"),
      margin=dict(l=60, r=30, t=80, b=60),
      title_font_size=16
  )
Always include descriptive titles and axis labels that explain what's being shown.

EXAMPLE (no imports, use pre-loaded names):
  grouped = df.groupby('region')['revenue'].sum().reset_index().sort_values('revenue', ascending=False)
  fig = px.bar(grouped, x='region', y='revenue', title='Total Revenue by Region')
  fig.update_layout(
      template="plotly_white",
      hovermode="x unified",
      font=dict(family="Inter, -apple-system, sans-serif", size=13),
      xaxis=dict(showgrid=True, gridwidth=1, gridcolor="rgba(0,0,0,0.08)"),
      yaxis=dict(showgrid=True, gridwidth=1, gridcolor="rgba(0,0,0,0.08)"),
      margin=dict(l=60, r=30, t=80, b=60),
      title_font_size=16
  )
  result = grouped

You must respond with a JSON object with these fields:
{
  "code": "python code here",
  "chart_type": "bar|line|pie|scatter|histogram|none",
  "explanation": "plain English explanation of what this shows and why it matters"
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
        return _fallback_analysis(question, error="GEMINI_API_KEY is not configured")

    user_message = f"""DataFrame schema:
{df_schema}

Sample data (first 3 rows):
{sample_data}

User question: {question}

Generate Python code to answer this question. Remember: DataFrame is already loaded as `df`."""

    try:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message}
        ]
        try:
            response = await client.chat.completions.create(
                model=GEMINI_MODEL,
                messages=messages,
                temperature=0.1,
                max_tokens=1000,
                response_format={"type": "json_object"}
            )
        except Exception as first_error:
            _logger.warning(
                "Gemini code generation failed with response_format; retrying without it: %s",
                first_error,
            )
            response = await client.chat.completions.create(
                model=GEMINI_MODEL,
                messages=messages,
                temperature=0.1,
                max_tokens=1000,
            )

        content = response.choices[0].message.content
        parsed = _extract_json_object(content or "")
        return {
            "code": parsed.get("code", "result = 'Could not generate code'"),
            "chart_type": parsed.get("chart_type", "none"),
            "explanation": parsed.get("explanation", ""),
            "used_fallback": False,
            "fallback_reason": None,
        }
    except Exception as e:
        _logger.exception("Gemini code generation failed; using rule-based fallback.")
        return _fallback_analysis(question, error=str(e))


INSIGHT_SYSTEM_PROMPT = """You are a data analyst writing insights for business managers and non-technical people. Given analysis results, write 2-4 short, clear, and practical insights in plain English.

Guidelines:
- Write for everyday business readers, not technical experts
- Use simple words and short sentences
- Avoid jargon, acronyms, and technical terms like p-value, variance, distribution, correlation, or regression
- Focus on what matters most for decision-making
- Start each insight with a clear observation or fact
- Include concrete numbers when they help explain the point
- Explain why the finding matters in business terms
- When useful, add a simple recommendation such as what to focus on, what to watch, or what to do next
- Keep each insight friendly, natural, and easy to read

Good style examples:
- "The North region brings in more than half of revenue, so it deserves the most attention."
- "Sales jump in the summer months, which suggests it may be smart to plan inventory earlier."
- "A small number of products drive most of the sales, so the team should focus on those first."
- "Customer complaints dropped after the process change, which is a strong sign the update is helping."

Bad style examples:
- "The statistical summary indicates significant variance across categories."
- "The metrics show a notable deviation from the baseline."

Return a JSON object with this shape: {"insights": ["first insight", "second insight"]}. No markdown, no extra text."""


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
            model=GEMINI_MODEL,
            messages=[
                {"role": "system", "content": INSIGHT_SYSTEM_PROMPT},
                {"role": "user", "content": f"Question: {question}\n\nResult preview:\n{result_preview}\n\nGenerate insights."}
            ],
            temperature=0.3,
            max_tokens=400,
            response_format={"type": "json_object"}
        )

        content = response.choices[0].message.content
        parsed = _extract_json_object(content or "")
        for key in ["insights", "data", "results"]:
            if key in parsed and isinstance(parsed[key], list):
                return parsed[key]
        return []
    except Exception as e:
        _logger.warning("Gemini insight generation failed: %s", e)
        return []


def _fallback_analysis(question: str, error: str = "") -> dict:
    """
    Fallback rule-based analysis when Gemini is not configured or unavailable.
    IMPORTANT: Generated code must NOT use import statements — pd, np, px, go are
    pre-injected into the exec namespace by the execution service.
    """
    q_lower = question.lower()

    # Helper: detect a groupby column name mentioned in the question
    def _groupby_hint(col_keywords: list[str]) -> str | None:
        for kw in col_keywords:
            if kw in q_lower:
                return kw
        return None

    groupby_words = ["region", "category", "product", "country", "status",
                     "rep", "sales_rep", "month", "year", "customer", "payment"]

    # ── PIE CHART ─────────────────────────────────────────────────────────────
    if any(kw in q_lower for kw in ["pie", "pie chart", "proportion", "share", "breakdown"]):
        code = """cat_cols = df.select_dtypes(include='object').columns.tolist()
num_cols = df.select_dtypes(include='number').columns.tolist()
if cat_cols:
    col = cat_cols[0]
    counts = df[col].value_counts().head(10).reset_index()
    counts.columns = [col, 'count']
    fig = px.pie(counts, names=col, values='count', title=f'Distribution of {col}')
    result = counts
else:
    result = df.describe()"""
        chart_type = "pie"

    # ── TREND / LINE ──────────────────────────────────────────────────────────
    elif any(kw in q_lower for kw in ["trend", "over time", "monthly", "yearly", "daily", "time series", "timeline"]):
        code = """date_cols = [c for c in df.columns if any(kw in c.lower() for kw in ['date','time','month','year','day'])]
num_cols = df.select_dtypes(include='number').columns.tolist()
if date_cols and num_cols:
    dcol = date_cols[0]
    ncol = num_cols[0]
    tmp = df.copy()
    tmp[dcol] = pd.to_datetime(tmp[dcol], errors='coerce')
    tmp = tmp.dropna(subset=[dcol]).sort_values(dcol)
    monthly = tmp.set_index(dcol)[ncol].resample('ME').sum().reset_index()
    fig = px.line(monthly, x=dcol, y=ncol, title=f'{ncol} over Time')
    result = monthly
else:
    result = df.describe()"""
        chart_type = "line"

    # ── HISTOGRAM / DISTRIBUTION ──────────────────────────────────────────────
    elif any(kw in q_lower for kw in ["distribution", "histogram", "spread", "frequency"]):
        code = """num_cols = df.select_dtypes(include='number').columns.tolist()
if num_cols:
    col = num_cols[0]
    fig = px.histogram(df, x=col, title=f'Distribution of {col}', nbins=30)
    result = df[col].describe().round(2)
else:
    result = df.describe()"""
        chart_type = "histogram"

    # ── SCATTER ───────────────────────────────────────────────────────────────
    elif any(kw in q_lower for kw in ["scatter", "correlation", "relate", "vs", "versus", "relationship"]):
        code = """num_cols = df.select_dtypes(include='number').columns.tolist()
if len(num_cols) >= 2:
    fig = px.scatter(df, x=num_cols[0], y=num_cols[1],
                     title=f'{num_cols[0]} vs {num_cols[1]}')
    result = df[num_cols].corr().round(3)
else:
    result = df.describe()"""
        chart_type = "scatter"

    # ── GROUPBY + BAR: "by <dimension>" ───────────────────────────────────────
    elif any(f" by {kw}" in q_lower or f"per {kw}" in q_lower for kw in groupby_words):
        code = """cat_cols = df.select_dtypes(include='object').columns.tolist()
num_cols = df.select_dtypes(include='number').columns.tolist()
if cat_cols and num_cols:
    gcol = cat_cols[0]
    ncol = num_cols[0]
    grouped = df.groupby(gcol)[ncol].sum().reset_index().sort_values(ncol, ascending=False)
    fig = px.bar(grouped, x=gcol, y=ncol, title=f'{ncol} by {gcol}')
    result = grouped
else:
    result = df.describe()"""
        chart_type = "bar"

    # ── TOP N ─────────────────────────────────────────────────────────────────
    elif any(kw in q_lower for kw in ["top", "highest", "best", "most", "largest", "biggest"]):
        code = """num_cols = df.select_dtypes(include='number').columns.tolist()
cat_cols = df.select_dtypes(include='object').columns.tolist()
if num_cols:
    ncol = num_cols[0]
    top = df.nlargest(10, ncol)
    if cat_cols:
        fig = px.bar(top, x=cat_cols[0], y=ncol, title=f'Top 10 by {ncol}')
    result = top
else:
    result = df.head(10)"""
        chart_type = "bar"

    # ── AVERAGE / MEAN ────────────────────────────────────────────────────────
    elif any(kw in q_lower for kw in ["mean", "average", "avg"]):
        code = """num_cols = df.select_dtypes(include='number').columns.tolist()
means = df[num_cols].mean().round(2).reset_index()
means.columns = ['column', 'mean']
fig = px.bar(means, x='column', y='mean', title='Column Averages')
result = means"""
        chart_type = "bar"

    # ── MISSING VALUES ────────────────────────────────────────────────────────
    elif any(kw in q_lower for kw in ["missing", "null", "nan", "empty", "incomplete"]):
        code = """missing = df.isnull().sum().reset_index()
missing.columns = ['column', 'missing_count']
missing['missing_pct'] = (missing['missing_count'] / len(df) * 100).round(2)
missing = missing[missing['missing_count'] > 0]
if not missing.empty:
    fig = px.bar(missing, x='column', y='missing_pct', title='Missing Values (%)')
result = missing if not missing.empty else pd.DataFrame({'message': ['No missing values found']})"""
        chart_type = "bar"

    # ── COUNT / HOW MANY ──────────────────────────────────────────────────────
    elif any(kw in q_lower for kw in ["how many", "count rows", "number of rows"]):
        code = "result = f'Dataset contains {len(df):,} rows and {len(df.columns)} columns.'"
        chart_type = "none"

    # ── TOTAL (sum of a numeric column) ───────────────────────────────────────
    elif "total" in q_lower:
        code = """num_cols = df.select_dtypes(include='number').columns.tolist()
cat_cols = df.select_dtypes(include='object').columns.tolist()
if num_cols and cat_cols:
    ncol = num_cols[0]
    gcol = cat_cols[0]
    grouped = df.groupby(gcol)[ncol].sum().reset_index().sort_values(ncol, ascending=False)
    fig = px.bar(grouped, x=gcol, y=ncol, title=f'Total {ncol} by {gcol}')
    result = grouped
elif num_cols:
    totals = df[num_cols].sum().round(2).reset_index()
    totals.columns = ['column', 'total']
    fig = px.bar(totals, x='column', y='total', title='Column Totals')
    result = totals
else:
    result = df.describe()"""
        chart_type = "bar"

    # ── ANOMALY DETECTION ─────────────────────────────────────────────────────
    elif any(kw in q_lower for kw in ["anomaly", "anomalies", "outlier", "outliers", "unusual", "abnormal"]):
        code = """num_cols = df.select_dtypes(include='number').columns.tolist()
if num_cols:
    col = num_cols[0]
    Q1 = df[col].quantile(0.25)
    Q3 = df[col].quantile(0.75)
    IQR = Q3 - Q1
    lower = Q1 - 1.5 * IQR
    upper = Q3 + 1.5 * IQR
    anomalies = df[(df[col] < lower) | (df[col] > upper)].copy()
    anomalies['_outlier_value'] = anomalies[col]
    fig = px.scatter(df, x=df.index, y=col,
                     title=f'Anomaly Detection: {col} (IQR method)',
                     labels={'index': 'Row Index', col: col})
    result = anomalies if not anomalies.empty else pd.DataFrame({'message': [f'No outliers found in {col} using IQR method']})
else:
    result = df.describe()"""
        chart_type = "scatter"

    # ── DEFAULT: full summary ─────────────────────────────────────────────────
    else:
        code = """num_cols = df.select_dtypes(include='number').columns.tolist()
result = df[num_cols].describe().round(2) if num_cols else df.head(20)"""
        chart_type = "none"

    suffix = f" (Gemini fallback used{': ' + error if error else ''})"
    # Generate a more specific explanation for fallback analysis
    explanations = {
        "pie": "Shows how the items break down - like seeing what slice each category takes.",
        "line": "Shows how things change over time - like watching a trend go up or down.",
        "histogram": "Shows how spread out values are - like seeing if most are high, low, or mixed.",
        "scatter": "Shows if two things are connected - like whether one goes up when the other does.",
        "bar": "Compares amounts across different groups - like seeing which group has the most.",
        "none": "Summarizes your data - showing key numbers and patterns."
    }
    explanation = explanations.get(chart_type, "Analyzes your data") + suffix
    if error:
        _logger.warning("Using rule-based fallback analysis: %s", error)
    return {
        "code": code,
        "chart_type": chart_type,
        "explanation": explanation,
        "used_fallback": True,
        "fallback_reason": error or "Gemini API was not available",
    }
