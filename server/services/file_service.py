import json
import uuid
from datetime import datetime, timezone
from pathlib import PurePosixPath
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import get_settings
from core import redis_client
from core import s3 as s3_storage
from core.pagination import paginate
from models import FileVersion, Folder, Project, StoredFile, User
from schemas.common import PaginatedResponse, PaginationParams, SearchFileResult
from schemas.files import (
    CompleteUploadRequest,
    DownloadResponse,
    FileResponse,
    FileVersionResponse,
    PresignUploadRequest,
    PresignUploadResponse,
)

settings = get_settings()


def _get_project_for_org(
    db: Session,
    *,
    project_id: UUID,
    organization_id: UUID,
) -> Project:
    project = db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.organization_id == organization_id,
        )
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _get_folder_in_project(
    db: Session,
    *,
    folder_id: UUID,
    project_id: UUID,
    organization_id: UUID,
) -> Folder:
    folder = db.scalar(
        select(Folder)
        .join(Project, Folder.project_id == Project.id)
        .where(
            Folder.id == folder_id,
            Folder.project_id == project_id,
            Project.organization_id == organization_id,
            Folder.deleted_at.is_(None),
        )
    )
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return folder


def _get_file_for_org(
    db: Session,
    *,
    file_id: UUID,
    organization_id: UUID,
    include_deleted: bool = False,
) -> StoredFile:
    stored = db.scalar(
        select(StoredFile)
        .join(Project, StoredFile.project_id == Project.id)
        .where(
            StoredFile.id == file_id,
            Project.organization_id == organization_id,
        )
    )
    if stored is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if stored.deleted_at is not None and not include_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return stored


def _extension_of(filename: str) -> str:
    suffix = PurePosixPath(filename).suffix
    return suffix.lstrip(".").lower()[:64]


def _find_active_by_name(
    db: Session,
    *,
    project_id: UUID,
    folder_id: UUID | None,
    filename: str,
) -> StoredFile | None:
    return db.scalar(
        select(StoredFile).where(
            StoredFile.project_id == project_id,
            StoredFile.folder_id == folder_id,
            StoredFile.filename == filename,
            StoredFile.deleted_at.is_(None),
        )
    )


def presign_upload(
    db: Session,
    *,
    actor: User,
    payload: PresignUploadRequest,
) -> PresignUploadResponse:
    if not settings.s3_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="S3 is not configured on the server",
        )
    if payload.size > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds max size of {settings.max_upload_size_bytes} bytes",
        )

    project = _get_project_for_org(
        db,
        project_id=payload.project_id,
        organization_id=actor.organization_id,
    )
    if payload.folder_id is not None:
        _get_folder_in_project(
            db,
            folder_id=payload.folder_id,
            project_id=project.id,
            organization_id=actor.organization_id,
        )

    filename = payload.filename.strip() or "untitled"
    content_type = (payload.content_type or "application/octet-stream").strip()
    existing = _find_active_by_name(
        db,
        project_id=project.id,
        folder_id=payload.folder_id,
        filename=filename,
    )

    if existing is None:
        file_id = uuid.uuid4()
        version = 1
        existing_file_id = None
    else:
        file_id = existing.id
        version = existing.current_version + 1
        existing_file_id = str(existing.id)

    storage_key = s3_storage.build_storage_key(
        organization_id=str(actor.organization_id),
        project_id=str(project.id),
        file_id=str(file_id),
        version=version,
        filename=filename,
    )
    upload_url = s3_storage.create_presigned_put_url(storage_key)
    upload_id = str(uuid.uuid4())
    pending = {
        "upload_id": upload_id,
        "user_id": str(actor.id),
        "organization_id": str(actor.organization_id),
        "project_id": str(project.id),
        "folder_id": str(payload.folder_id) if payload.folder_id else None,
        "file_id": str(file_id),
        "existing_file_id": existing_file_id,
        "version": version,
        "filename": filename,
        "content_type": content_type,
        "size": payload.size,
        "storage_key": storage_key,
    }
    redis_client.store_pending_upload(
        upload_id=upload_id,
        payload=json.dumps(pending),
        ttl_seconds=settings.s3_presign_expire_seconds,
    )

    return PresignUploadResponse(
        upload_id=upload_id,
        upload_url=upload_url,
        storage_key=storage_key,
        file_id=file_id,
        version=version,
        headers={},
        expires_in=settings.s3_presign_expire_seconds,
    )


def complete_upload(
    db: Session,
    *,
    actor: User,
    payload: CompleteUploadRequest,
) -> FileResponse:
    if not settings.s3_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="S3 is not configured on the server",
        )

    raw = redis_client.pop_pending_upload(payload.upload_id)
    if raw is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload session expired or invalid",
        )

    pending = json.loads(raw)
    if pending["user_id"] != str(actor.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Upload session mismatch")

    head = s3_storage.head_object(pending["storage_key"])
    actual_size = int(head.get("ContentLength") or 0)
    expected_size = int(pending["size"])
    if actual_size != expected_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Uploaded size mismatch (expected {expected_size}, got {actual_size})",
        )

    checksum = (payload.checksum or "").strip() or str(head.get("ETag", "")).strip('"')
    if not checksum:
        checksum = "unknown"

    file_id = UUID(pending["file_id"])
    version = int(pending["version"])
    folder_id = UUID(pending["folder_id"]) if pending["folder_id"] else None
    filename = pending["filename"]
    content_type = pending["content_type"]
    storage_key = pending["storage_key"]

    if pending["existing_file_id"] is None:
        stored = StoredFile(
            id=file_id,
            project_id=UUID(pending["project_id"]),
            folder_id=folder_id,
            current_version=version,
            filename=filename,
            extension=_extension_of(filename),
            mime_type=content_type,
            size=actual_size,
            checksum=checksum,
            storage_key=storage_key,
            uploaded_by=actor.id,
        )
        version_row = FileVersion(
            id=uuid.uuid4(),
            file_id=file_id,
            version=version,
            storage_key=storage_key,
            size=actual_size,
            checksum=checksum,
            uploaded_by=actor.id,
        )
        db.add(stored)
        db.add(version_row)
        db.commit()
        db.refresh(stored)
        return FileResponse.model_validate(stored)

    existing = _get_file_for_org(
        db,
        file_id=file_id,
        organization_id=actor.organization_id,
    )
    existing.current_version = version
    existing.mime_type = content_type
    existing.size = actual_size
    existing.checksum = checksum
    existing.storage_key = storage_key
    existing.uploaded_by = actor.id
    existing.extension = _extension_of(filename)

    version_row = FileVersion(
        id=uuid.uuid4(),
        file_id=existing.id,
        version=version,
        storage_key=storage_key,
        size=actual_size,
        checksum=checksum,
        uploaded_by=actor.id,
    )
    db.add(version_row)
    db.commit()
    db.refresh(existing)
    return FileResponse.model_validate(existing)


def list_files(
    db: Session,
    *,
    actor: User,
    project_id: UUID,
    folder_id: UUID | None = None,
    include_deleted: bool = False,
    params: PaginationParams,
) -> PaginatedResponse[FileResponse]:
    _get_project_for_org(
        db,
        project_id=project_id,
        organization_id=actor.organization_id,
    )

    query = select(StoredFile).where(StoredFile.project_id == project_id)

    if include_deleted:
        query = query.where(StoredFile.deleted_at.is_not(None))
    else:
        query = query.where(StoredFile.deleted_at.is_(None))
        if folder_id is None:
            query = query.where(StoredFile.folder_id.is_(None))
        else:
            _get_folder_in_project(
                db,
                folder_id=folder_id,
                project_id=project_id,
                organization_id=actor.organization_id,
            )
            query = query.where(StoredFile.folder_id == folder_id)

    return paginate(
        db,
        query,
        params=params,
        model=StoredFile,
        allowed_sort={"created_at", "filename", "size", "updated_at"},
        serialize=lambda row: FileResponse.model_validate(row),
    )


def search_files(
    db: Session,
    *,
    actor: User,
    params: PaginationParams,
    q: str | None = None,
    extension: str | None = None,
    uploaded_by: UUID | None = None,
    project_id: UUID | None = None,
) -> PaginatedResponse[SearchFileResult]:
    query = (
        select(StoredFile)
        .join(Project, StoredFile.project_id == Project.id)
        .where(
            Project.organization_id == actor.organization_id,
            StoredFile.deleted_at.is_(None),
        )
    )

    if project_id is not None:
        _get_project_for_org(
            db,
            project_id=project_id,
            organization_id=actor.organization_id,
        )
        query = query.where(StoredFile.project_id == project_id)

    if q:
        query = query.where(StoredFile.filename.ilike(f"%{q.strip()}%"))
    if extension:
        query = query.where(StoredFile.extension == extension.lstrip(".").lower())
    if uploaded_by is not None:
        query = query.where(StoredFile.uploaded_by == uploaded_by)

    # Default search sort to filename when caller leaves created_at — keep flexible.
    return paginate(
        db,
        query,
        params=params,
        model=StoredFile,
        allowed_sort={"created_at", "filename", "size", "updated_at", "extension"},
        serialize=lambda row: SearchFileResult.model_validate(row),
    )


def get_file(db: Session, *, actor: User, file_id: UUID) -> FileResponse:
    stored = _get_file_for_org(
        db,
        file_id=file_id,
        organization_id=actor.organization_id,
    )
    return FileResponse.model_validate(stored)


def get_download(
    db: Session,
    *,
    actor: User,
    file_id: UUID,
    version: int | None = None,
) -> DownloadResponse:
    stored = _get_file_for_org(
        db,
        file_id=file_id,
        organization_id=actor.organization_id,
    )

    target_version = version or stored.current_version
    version_row = db.scalar(
        select(FileVersion).where(
            FileVersion.file_id == stored.id,
            FileVersion.version == target_version,
        )
    )
    if version_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    url = s3_storage.create_presigned_get_url(
        version_row.storage_key,
        filename=stored.filename,
    )
    return DownloadResponse(
        download_url=url,
        expires_in=settings.s3_presign_expire_seconds,
        filename=stored.filename,
        version=version_row.version,
        size=version_row.size,
        mime_type=stored.mime_type,
    )


def delete_file(db: Session, *, actor: User, file_id: UUID) -> None:
    stored = _get_file_for_org(
        db,
        file_id=file_id,
        organization_id=actor.organization_id,
    )
    stored.deleted_at = datetime.now(timezone.utc)
    stored.deleted_by = actor.id
    db.commit()


def restore_file(db: Session, *, actor: User, file_id: UUID) -> FileResponse:
    stored = _get_file_for_org(
        db,
        file_id=file_id,
        organization_id=actor.organization_id,
        include_deleted=True,
    )
    if stored.deleted_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is not deleted")

    # If parent folder is gone/deleted, move file to project root.
    if stored.folder_id is not None:
        folder = db.scalar(select(Folder).where(Folder.id == stored.folder_id))
        if folder is None or folder.deleted_at is not None:
            stored.folder_id = None

    clash = _find_active_by_name(
        db,
        project_id=stored.project_id,
        folder_id=stored.folder_id,
        filename=stored.filename,
    )
    if clash and clash.id != stored.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active file with this name already exists in the destination",
        )

    stored.deleted_at = None
    stored.deleted_by = None
    db.commit()
    db.refresh(stored)
    return FileResponse.model_validate(stored)


def list_versions(db: Session, *, actor: User, file_id: UUID) -> list[FileVersionResponse]:
    stored = _get_file_for_org(
        db,
        file_id=file_id,
        organization_id=actor.organization_id,
        include_deleted=True,
    )
    versions = db.scalars(
        select(FileVersion)
        .where(FileVersion.file_id == stored.id)
        .order_by(FileVersion.version.desc())
    ).all()
    return [FileVersionResponse.model_validate(item) for item in versions]


def restore_version(
    db: Session,
    *,
    actor: User,
    file_id: UUID,
    version: int,
) -> FileResponse:
    stored = _get_file_for_org(
        db,
        file_id=file_id,
        organization_id=actor.organization_id,
    )
    version_row = db.scalar(
        select(FileVersion).where(
            FileVersion.file_id == stored.id,
            FileVersion.version == version,
        )
    )
    if version_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    stored.current_version = version_row.version
    stored.storage_key = version_row.storage_key
    stored.size = version_row.size
    stored.checksum = version_row.checksum
    stored.uploaded_by = version_row.uploaded_by
    db.commit()
    db.refresh(stored)
    return FileResponse.model_validate(stored)
