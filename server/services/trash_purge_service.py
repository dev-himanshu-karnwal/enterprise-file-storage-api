"""Permanently delete soft-deleted files/folders past the retention window."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from config import get_settings
from core.s3 import delete_object
from models.file import StoredFile
from models.folder import Folder

logger = logging.getLogger(__name__)


def purge_expired_trash(db: Session) -> dict[str, int]:
    """Hard-delete trash older than ``trash_retention_seconds``.

    Returns counts of purged files and folders.
    """
    settings = get_settings()
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.trash_retention_seconds)

    files_purged = _purge_expired_files(db, cutoff=cutoff)
    folders_purged = _purge_expired_folders(db, cutoff=cutoff)

    if files_purged or folders_purged:
        logger.info(
            "Trash purge complete: files=%s folders=%s cutoff=%s",
            files_purged,
            folders_purged,
            cutoff.isoformat(),
        )

    return {"files": files_purged, "folders": folders_purged}


def _purge_expired_files(db: Session, *, cutoff: datetime) -> int:
    expired = db.scalars(
        select(StoredFile)
        .where(
            StoredFile.deleted_at.is_not(None),
            StoredFile.deleted_at <= cutoff,
        )
        .options(selectinload(StoredFile.versions))
    ).all()

    count = 0
    for stored in expired:
        _delete_s3_keys_for_file(stored)
        db.delete(stored)
        count += 1

    if count:
        db.commit()
    return count


def _purge_expired_folders(db: Session, *, cutoff: datetime) -> int:
    # Deepest paths first so parent deletes do not race with children we still hold.
    expired = db.scalars(
        select(Folder)
        .where(
            Folder.deleted_at.is_not(None),
            Folder.deleted_at <= cutoff,
        )
        .order_by(Folder.path.desc())
    ).all()

    count = 0
    for folder in expired:
        # Parent purge may have already cascade-deleted this row.
        if db.get(Folder, folder.id) is None:
            continue

        for stored in _files_in_folder_subtree(db, folder):
            _delete_s3_keys_for_file(stored)
            db.delete(stored)

        db.delete(folder)
        count += 1

    if count:
        db.commit()
    return count


def _files_in_folder_subtree(db: Session, folder: Folder) -> list[StoredFile]:
    folder_ids = db.scalars(
        select(Folder.id).where(
            Folder.project_id == folder.project_id,
            or_(
                Folder.id == folder.id,
                Folder.path.startswith(f"{folder.path}/"),
            ),
        )
    ).all()
    if not folder_ids:
        return []

    return list(
        db.scalars(
            select(StoredFile)
            .where(StoredFile.folder_id.in_(folder_ids))
            .options(selectinload(StoredFile.versions))
        ).all()
    )


def _delete_s3_keys_for_file(stored: StoredFile) -> None:
    keys = {stored.storage_key}
    for version in stored.versions:
        keys.add(version.storage_key)
    for key in keys:
        delete_object(key)
