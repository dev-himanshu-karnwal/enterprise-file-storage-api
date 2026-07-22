from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a DB session and closes it afterward."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
