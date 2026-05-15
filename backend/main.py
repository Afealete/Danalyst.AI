"""DataLens FastAPI backend — AI-powered CSV data analyst."""
import os
import json
import math
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

from routes.health import router as health_router
from routes.upload import router as upload_router
from routes.dataset import router as dataset_router
from routes.query import router as query_router


class NumpySafeJSONResponse(JSONResponse):
    """
    JSONResponse subclass that handles numpy/pandas scalar types (int64,
    float64, NaN, Inf) that the default encoder would raise TypeError on.
    """
    def render(self, content) -> bytes:
        def _default(obj):
            try:
                import numpy as np
                if isinstance(obj, np.integer):
                    return int(obj)
                if isinstance(obj, np.floating):
                    if math.isnan(float(obj)) or math.isinf(float(obj)):
                        return None
                    return float(obj)
                if isinstance(obj, np.ndarray):
                    return obj.tolist()
                if isinstance(obj, np.bool_):
                    return bool(obj)
            except ImportError:
                pass
            try:
                import pandas as pd
                if isinstance(obj, pd.Timestamp):
                    return obj.isoformat()
                if obj is pd.NA:
                    return None
            except ImportError:
                pass
            if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
                return None
            raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

        return json.dumps(content, default=_default, ensure_ascii=False).encode("utf-8")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("DataLens API starting up...")
    yield
    print("DataLens API shutting down.")


app = FastAPI(
    title="DataLens API",
    description="AI-powered CSV data analyst",
    version="1.0.0",
    lifespan=lifespan,
    default_response_class=NumpySafeJSONResponse,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return NumpySafeJSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


# Mount all routers under /api prefix
app.include_router(health_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(dataset_router, prefix="/api")
app.include_router(query_router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
