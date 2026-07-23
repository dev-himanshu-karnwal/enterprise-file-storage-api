import json
import uuid
from datetime import datetime, timezone
from pathlib import PurePosixPath
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from config import get_settings
from core import redis_client
from core import s3 as s3_storage
from core.mime_allowlist import (
    FILE_TYPE_EXTENSIONS,
    FILE_TYPE_MIME_EXACT,
    FILE_TYPE_MIME_PREFIXES,
    allowlist_error_detail,
    is_allowed_upload,
)
from core.pagination import paginate
from models import FileVersion, Folder, Organization, Project, StoredFile, User
from schemas.common import PaginatedResponse, PaginationParams, SearchFileResult
from schemas.files import (
    CompleteUploadRequest,
    DownloadResponse,
    FileResponse,
    FileVersionResponse,
    PresignUploadRequest,
    PresignUploadResponse,
    UpdateFileRequest,
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


def org_storage_used(db: Session, *, organization_id: UUID) -> int:
    """Bytes used by all file versions in the org (includes trash until purge)."""
    total = db.scalar(
        select(func.coalesce(func.sum(FileVersion.size), 0))
        .select_from(FileVersion)
        .join(StoredFile, FileVersion.file_id == StoredFile.id)
        .join(Project, StoredFile.project_id == Project.id)
        .where(Project.organization_id == organization_id)
    )
    return int(total or 0)


def _assert_storage_quota(db: Session, *, organization_id: UUID, additional_bytes: int) -> None:
    organization = db.scalar(select(Organization).where(Organization.id == organization_id))
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    used = org_storage_used(db, organization_id=organization_id)
    if used + additional_bytes > organization.storage_limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"Organization storage limit exceeded "
                f"({used + additional_bytes} > {organization.storage_limit} bytes)"
            ),
        )


def _apply_file_filters(
    query: Select[tuple[StoredFile]],
    *,
    uploaded_after: datetime | None = None,
    uploaded_before: datetime | None = None,
    file_type: str | None = None,
    size_min: int | None = None,
    size_max: int | None = None,
    owner: UUID | None = None,
    tag: str | None = None,
) -> Select[tuple[StoredFile]]:
    if uploaded_after is not None:
        query = query.where(StoredFile.created_at >= uploaded_after)
    if uploaded_before is not None:
        query = query.where(StoredFile.created_at <= uploaded_before)
    if size_min is not None:
        query = query.where(StoredFile.size >= size_min)
    if size_max is not None:
        query = query.where(StoredFile.size <= size_max)
    if owner is not None:
        query = query.where(StoredFile.uploaded_by == owner)
    if tag:
        normalized = tag.strip().lower()
        if normalized:
            query = query.where(StoredFile.tags.contains([normalized]))
    if file_type:
        query = _apply_file_type_filter(query, file_type=file_type.strip().lower())
    return query


def _apply_file_type_filter(
    query: Select[tuple[StoredFile]],
    *,
    file_type: str,
) -> Select[tuple[StoredFile]]:
    prefixes = FILE_TYPE_MIME_PREFIXES.get(file_type, ())
    exact = FILE_TYPE_MIME_EXACT.get(file_type, frozenset())
    extensions = FILE_TYPE_EXTENSIONS.get(file_type, frozenset())

    if not prefixes and not exact and not extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="file_type must be one of: image, pdf, video, zip, document",
        )

    clauses = []
    for prefix in prefixes:
        clauses.append(StoredFile.mime_type.ilike(f"{prefix}%"))
    if exact:
        clauses.append(StoredFile.mime_type.in_(exact))
    if extensions:
        clauses.append(StoredFile.extension.in_(extensions))
    return query.where(or_(*clauses))


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

    filename = payload.filename.strip() or "untitled"
    content_type = (payload.content_type or "application/octet-stream").strip()
    if not is_allowed_upload(filename=filename, content_type=content_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=allowlist_error_detail(),
        )

    _assert_storage_quota(
        db,
        organization_id=actor.organization_id,
        additional_bytes=payload.size,
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
        "tags": payload.tags,
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
    tags = list(pending.get("tags") or [])

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
            tags=tags,
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
    if tags:
        existing.tags = tags

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
    uploaded_after: datetime | None = None,
    uploaded_before: datetime | None = None,
    file_type: str | None = None,
    size_min: int | None = None,
    size_max: int | None = None,
    owner: UUID | None = None,
    tag: str | None = None,
    # When True, folder_id is an optional filter (None = all folders).
    # When False (browse mode), None means project root only.
    filter_mode: bool = False,
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
        if filter_mode:
            if folder_id is not None:
                _get_folder_in_project(
                    db,
                    folder_id=folder_id,
                    project_id=project_id,
                    organization_id=actor.organization_id,
                )
                query = query.where(StoredFile.folder_id == folder_id)
        elif folder_id is None:
            query = query.where(StoredFile.folder_id.is_(None))
        else:
            _get_folder_in_project(
                db,
                folder_id=folder_id,
                project_id=project_id,
                organization_id=actor.organization_id,
            )
            query = query.where(StoredFile.folder_id == folder_id)

    query = _apply_file_filters(
        query,
        uploaded_after=uploaded_after,
        uploaded_before=uploaded_before,
        file_type=file_type,
        size_min=size_min,
        size_max=size_max,
        owner=owner,
        tag=tag,
    )

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
    folder_id: UUID | None = None,
    tag: str | None = None,
    uploaded_after: datetime | None = None,
    uploaded_before: datetime | None = None,
    file_type: str | None = None,
    size_min: int | None = None,
    size_max: int | None = None,
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
        if folder_id is not None:
            _get_folder_in_project(
                db,
                folder_id=folder_id,
                project_id=project_id,
                organization_id=actor.organization_id,
            )
            query = query.where(StoredFile.folder_id == folder_id)
    elif folder_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="folder_id requires project_id",
        )

    if q:
        query = query.where(StoredFile.filename.ilike(f"%{q.strip()}%"))
    if extension:
        query = query.where(StoredFile.extension == extension.lstrip(".").lower())

    query = _apply_file_filters(
        query,
        uploaded_after=uploaded_after,
        uploaded_before=uploaded_before,
        file_type=file_type,
        size_min=size_min,
        size_max=size_max,
        owner=uploaded_by,
        tag=tag,
    )

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


def update_file(
    db: Session,
    *,
    actor: User,
    file_id: UUID,
    payload: UpdateFileRequest,
) -> tuple[FileResponse, dict]:
    """Update folder (move) and/or tags. Returns (file, audit hints)."""
    stored = _get_file_for_org(
        db,
        file_id=file_id,
        organization_id=actor.organization_id,
    )
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    audit_hints: dict = {}
    previous_folder_id = stored.folder_id

    if "folder_id" in data:
        new_folder_id = data["folder_id"]
        if new_folder_id is not None:
            _get_folder_in_project(
                db,
                folder_id=new_folder_id,
                project_id=stored.project_id,
                organization_id=actor.organization_id,
            )
        clash = _find_active_by_name(
            db,
            project_id=stored.project_id,
            folder_id=new_folder_id,
            filename=stored.filename,
        )
        if clash and clash.id != stored.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An active file with this name already exists in the destination",
            )
        stored.folder_id = new_folder_id
        if previous_folder_id != new_folder_id:
            audit_hints["moved"] = True
            audit_hints["from_folder_id"] = str(previous_folder_id) if previous_folder_id else None
            audit_hints["to_folder_id"] = str(new_folder_id) if new_folder_id else None

    if "tags" in data and data["tags"] is not None:
        stored.tags = data["tags"]
        audit_hints["tags_updated"] = True
        audit_hints["tags"] = data["tags"]

    db.commit()
    db.refresh(stored)
    return FileResponse.model_validate(stored), audit_hints


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
