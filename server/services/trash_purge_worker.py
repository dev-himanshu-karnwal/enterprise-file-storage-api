"""Background loop that permanently purges expired trash."""

from __future__ import annotations

import asyncio
import logging

from config import get_settings
from database import SessionLocal
from services.trash_purge_service import purge_expired_trash

logger = logging.getLogger(__name__)


async def run_trash_purge_loop() -> None:
    settings = get_settings()
    interval = max(5, settings.trash_purge_interval_seconds)
    logger.info(
        "Trash purge loop started (retention=%ss, interval=%ss)",
        settings.trash_retention_seconds,
        interval,
    )

    while True:
        try:
            await asyncio.to_thread(_run_purge_once)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - keep the loop alive
            logger.exception("Trash purge run failed")
        await asyncio.sleep(interval)


def _run_purge_once() -> None:
    db = SessionLocal()
    try:
        purge_expired_trash(db)
    finally:
        db.close()
