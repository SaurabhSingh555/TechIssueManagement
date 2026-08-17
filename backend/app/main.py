"""Tech Issue Management System — FastAPI backend.

Run locally:
    cd backend
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000

Deploy on Render / Railway: start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
"""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .routers import auth, issues, workflow, dashboard, settings as settings_router, misc

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Tech Issue Management System API",
    version="1.0.0",
    description="Centralized tech issue portal: RCA, solutions, client-wide checks, "
                "global fixes, monitoring, closure engine and recurrence control.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(issues.router)
app.include_router(workflow.router)
app.include_router(dashboard.router)
app.include_router(settings_router.router)
app.include_router(misc.router)


@app.get("/api/health")
def health():
    from .database import fetchone
    try:
        fetchone("select 1")
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok", "database": db_ok}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logging.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
