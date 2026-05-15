"""DataLens FastAPI backend — AI-powered CSV data analyst."""
import os
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
    return JSONResponse(
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
