# DataLens — AI-Powered CSV Data Analyst

Upload any CSV or Excel spreadsheet, ask questions in plain English, and get charts, summaries, and AI-generated insights.

## Run & Operate

- Frontend: `pnpm --filter @workspace/csv-analyst run dev` (port auto-assigned)
- Backend: `cd backend && uvicorn main:app --host 0.0.0.0 --port 8080 --reload`
- Codegen: `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- Required env: `OPENAI_API_KEY` (optional — app works without it using rule-based fallback)

## Stack

- **Frontend**: React + Vite, TypeScript, Tailwind CSS, Plotly (react-plotly.js), TanStack Query
- **Backend**: Python FastAPI + uvicorn
- **Data**: pandas, numpy, openpyxl
- **Charts**: Plotly (server-side generation, JSON serialized)
- **AI**: OpenAI GPT-4o-mini (optional)
- **Safety**: AST-based code validator (no os/subprocess/eval/exec)
- **API codegen**: Orval (from OpenAPI spec)

## Where things live

- `backend/main.py` — FastAPI app entry point
- `backend/routes/` — upload, dataset, query routes
- `backend/services/ai_service.py` — OpenAI code generation + insights
- `backend/services/execution.py` — safe pandas code execution
- `backend/utils/validator.py` — AST-based code safety validator
- `backend/utils/session_store.py` — in-memory session storage
- `backend/data/` — sample CSV datasets (sales.csv, ecommerce.csv)
- `artifacts/csv-analyst/src/` — React frontend
- `lib/api-spec/openapi.yaml` — API contract (source of truth)

## Architecture decisions

- **Python FastAPI backend** instead of the default Node.js server — pandas/numpy/plotly are Python-native
- **In-memory sessions** — datasets stored in process memory, keyed by UUID session_id; no database needed
- **AST validation before exec()** — generated code is parsed and all imports/calls are checked against an allowlist before execution
- **OpenAI fallback** — if no API key is set, rule-based analysis handles common question patterns
- **Plotly JSON serialization** — charts are generated server-side as JSON and rendered client-side via react-plotly.js

## Product

Users upload CSV/Excel files or load built-in sample datasets (Sales 500 rows, E-Commerce 300 rows). They ask natural language questions in a chat interface. The backend uses GPT-4o-mini to generate safe pandas code, executes it with AST validation, and returns the result as a Plotly chart + data table + AI-generated insights. Query history is preserved in the session. Results can be exported as CSV.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Python backend runs from `backend/` directory; the artifact.toml uses `cd ../../backend` to navigate from the artifact directory
- File uploads use native `fetch()` with FormData (not the generated `useUploadFile` hook) because multipart binary files don't fit the generated client pattern
- `plotly.js` must be installed as a peer alongside `react-plotly.js`
- Sessions are in-memory only — restarting the backend clears all uploaded data
