# DataLens — AI-Powered CSV Data Analyst

Upload any CSV or Excel spreadsheet, ask questions in plain English, and instantly get charts, summaries, and AI-generated insights.

## Features

- Drag-and-drop CSV / Excel upload
- Natural language queries powered by the Gemini API
- Auto-generated Plotly charts (bar, line, pie, histogram, scatter)
- Dataset preview with column stats and missing value analysis
- Safe code execution with AST validation (no `os`, `subprocess`, `eval`, etc.)
- Query history with re-viewable results
- CSV export of any result table
- Built-in sample datasets (Sales, E-Commerce)
- Dark mode

## Setup

### 1. Install Python dependencies
```bash
cd backend && pip install -r requirements.txt
```

### 2. Set your Gemini API key (optional)
```bash
cp backend/.env.example backend/.env
# Edit backend/.env and add your GEMINI_API_KEY
```

> **Without an API key**, the app still works using a built-in rule-based fallback that handles common questions (distributions, top values, trends, correlations, missing values).

### 3. Run the backend
```bash
cd backend 
uvicorn main:app --reload --port 8080
```

### 4. Run the frontend
On Windows PowerShell:
```powershell
$env:PORT = "5173"
$env:BASE_PATH = "/"
pnpm --filter ./artifacts/csv-analyst... run dev
```

On cmd.exe:
```cmd
set PORT=5173&& set BASE_PATH=/&& pnpm --filter ./artifacts/csv-analyst... run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/healthz` | Health check |
| POST | `/api/upload` | Upload CSV/Excel (multipart/form-data, field: `file`) |
| GET | `/api/dataset-summary` | Column info, types, missing values |
| GET | `/api/dataset-preview` | First N rows as table |
| POST | `/api/query` | Natural language question → chart + insights |
| GET | `/api/query-history` | Past queries in session |
| POST | `/api/export-results` | Download result as CSV |
| GET | `/api/sample-datasets` | List built-in sample datasets |
| POST | `/api/load-sample` | Load a built-in sample dataset |

## Project Structure

```
backend/
├── main.py              # FastAPI app
├── requirements.txt
├── routes/
│   ├── health.py
│   ├── upload.py        # CSV/Excel file upload
│   ├── dataset.py       # Preview, summary, sample data
│   └── query.py         # NL query, history, export
├── services/
│   ├── ai_service.py    # Gemini code generation + insights
│   └── execution.py     # Safe pandas code execution
├── utils/
│   ├── validator.py     # AST-based code safety validator
│   └── session_store.py # In-memory session storage
└── data/
    ├── sales.csv        # Sample: 500 rows of sales data
    └── ecommerce.csv    # Sample: 300 rows of e-commerce orders

artifacts/csv-analyst/   # React + Vite frontend
lib/api-spec/            # OpenAPI contract
```

## Security

Generated pandas code is validated through an AST parser before execution. The following are always blocked:

- `os`, `sys`, `subprocess`, `socket`, `requests` imports
- `eval()`, `exec()`, `open()`, `__import__()`
- File system writes, network calls
- Any import not in the allowed list (pandas, numpy, plotly, matplotlib)
