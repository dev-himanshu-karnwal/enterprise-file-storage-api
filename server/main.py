from contextlib import asynccontextmanager

import redis
from fastapi import FastAPI, status
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/")
def read_root():
    return {"message": "Welcome to my FastAPI application!"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: str | None = None):
    return {"item_id": item_id, "query_param": q}


@app.get("/health")
def health():
    checks: dict[str, str] = {}
    healthy = True

    try:
        engine = create_engine(settings.database_url, pool_pre_ping=True)
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
