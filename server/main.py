from contextlib import asynccontextmanager

import redis
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from config import get_settings
from database import engine
from routers import (
    auth_router,
    folders_router,
    organizations_router,
    projects_router,
    users_router,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Enterprise File Storage API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(organizations_router)
app.include_router(projects_router)
app.include_router(folders_router)


@app.get("/")
def read_root():
    return {"message": "Welcome to the Enterprise File Storage API"}


@app.get("/health")
def health():
    checks: dict[str, str] = {}
    healthy = True

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except SQLAlchemyError as exc:
        healthy = False
        checks["database"] = f"error: {exc.__class__.__name__}"

    try:
        client = redis.from_url(settings.redis_url, socket_connect_timeout=2)
        if client.ping():
            checks["redis"] = "ok"
        else:
            healthy = False
            checks["redis"] = "error: ping failed"
    except redis.RedisError as exc:
        healthy = False
        checks["redis"] = f"error: {exc.__class__.__name__}"

    response_status = "healthy" if healthy else "unhealthy"
    http_status = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(
        status_code=http_status,
        content={"status": response_status, "checks": checks},
    )
