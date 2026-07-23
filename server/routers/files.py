from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from core.pagination import pagination_params
from database import get_db
from dependencies.auth import get_current_user, require_write_access
from dependencies.rate_limit import rate_limit
from models import AuditAction, User
from schemas.common import PaginatedResponse, PaginationParams
from schemas.files import (
    CompleteUploadRequest,
    DownloadResponse,
    FileResponse,
    FileVersionResponse,
    PresignUploadRequest,
    PresignUploadResponse,
    UpdateFileRequest,
)
from services import audit_service, file_service

files_router = APIRouter(prefix="/files", tags=["files"])


@files_router.post("/uploads/presign", response_model=PresignUploadResponse)
def presign_upload(
    payload: PresignUploadRequest,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
    _: None = Depends(rate_limit(name="upload", limit=10, window_seconds=60)),
) -> PresignUploadResponse:
    return file_service.presign_upload(db, actor=current_user, payload=payload)


@files_router.post(
    "/uploads/complete",
    response_model=FileResponse,
    status_code=status.HTTP_201_CREATED,
)
def complete_upload(
    payload: CompleteUploadRequest,
    request: Request,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> FileResponse:
    stored = file_service.complete_upload(db, actor=current_user, payload=payload)
    audit_service.record_audit(
        db,
        action=AuditAction.UPLOAD,
        entity="file",
        entity_id=stored.id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
        metadata={
            "filename": stored.filename,
            "version": stored.current_version,
            "size": stored.size,
            "tags": stored.tags,
        },
    )
    return stored


@files_router.get("", response_model=PaginatedResponse[FileResponse])
def list_files(
    project_id: UUID = Query(...),
    folder_id: UUID | None = Query(None),
    include_deleted: bool = Query(False),
    uploaded_after: datetime | None = Query(None),
    uploaded_before: datetime | None = Query(None),
    file_type: str | None = Query(
        None,
        description="One of: image, pdf, video, zip, document",
    ),
    size_min: int | None = Query(None, ge=0),
    size_max: int | None = Query(None, ge=0),
    owner: UUID | None = Query(None, description="uploaded_by user id"),
    tag: str | None = Query(None),
    filter_mode: bool = Query(
        False,
        description="If true, folder_id is optional; omit it to list across all folders",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    params: PaginationParams = Depends(pagination_params),
) -> PaginatedResponse[FileResponse]:
    return file_service.list_files(
        db,
        actor=current_user,
        project_id=project_id,
        folder_id=folder_id,
        include_deleted=include_deleted,
        uploaded_after=uploaded_after,
        uploaded_before=uploaded_before,
        file_type=file_type,
        size_min=size_min,
        size_max=size_max,
        owner=owner,
        tag=tag,
        filter_mode=filter_mode,
        params=params,
    )


@files_router.get("/{file_id}", response_model=FileResponse)
def get_file(
    file_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    return file_service.get_file(db, actor=current_user, file_id=file_id)


@files_router.patch("/{file_id}", response_model=FileResponse)
def update_file(
    file_id: UUID,
    payload: UpdateFileRequest,
    request: Request,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> FileResponse:
    stored, hints = file_service.update_file(
        db,
        actor=current_user,
        file_id=file_id,
        payload=payload,
    )
    ip = audit_service.get_client_ip(request)
    if hints.get("moved"):
        audit_service.record_audit(
            db,
            action=AuditAction.MOVE_FILE,
            entity="file",
            entity_id=stored.id,
            organization_id=current_user.organization_id,
            user_id=current_user.id,
            ip_address=ip,
            metadata={
                "filename": stored.filename,
                "from_folder_id": hints.get("from_folder_id"),
                "to_folder_id": hints.get("to_folder_id"),
            },
        )
    if hints.get("tags_updated"):
        audit_service.record_audit(
            db,
            action=AuditAction.UPDATE_FILE,
            entity="file",
            entity_id=stored.id,
            organization_id=current_user.organization_id,
            user_id=current_user.id,
            ip_address=ip,
            metadata={"filename": stored.filename, "tags": hints.get("tags")},
        )
    return stored


@files_router.get("/{file_id}/download", response_model=DownloadResponse)
def download_file(
    file_id: UUID,
    request: Request,
    version: int | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DownloadResponse:
    result = file_service.get_download(
        db,
        actor=current_user,
        file_id=file_id,
        version=version,
    )
    audit_service.record_audit(
        db,
        action=AuditAction.DOWNLOAD,
        entity="file",
        entity_id=file_id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
        metadata={"version": result.version, "filename": result.filename},
    )
    return result


@files_router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: UUID,
    request: Request,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> None:
    file_service.delete_file(db, actor=current_user, file_id=file_id)
    audit_service.record_audit(
        db,
        action=AuditAction.DELETE,
        entity="file",
        entity_id=file_id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
    )


@files_router.post("/{file_id}/restore", response_model=FileResponse)
def restore_file(
    file_id: UUID,
    request: Request,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> FileResponse:
    stored = file_service.restore_file(db, actor=current_user, file_id=file_id)
    audit_service.record_audit(
        db,
        action=AuditAction.RESTORE,
        entity="file",
        entity_id=stored.id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
    )
    return stored


@files_router.get("/{file_id}/versions", response_model=list[FileVersionResponse])
def list_versions(
    file_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FileVersionResponse]:
    return file_service.list_versions(db, actor=current_user, file_id=file_id)


@files_router.post(
    "/{file_id}/restore-version/{version}",
    response_model=FileResponse,
)
def restore_version(
    file_id: UUID,
    version: int,
    request: Request,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> FileResponse:
    stored = file_service.restore_version(
        db,
        actor=current_user,
        file_id=file_id,
        version=version,
    )
    audit_service.record_audit(
        db,
        action=AuditAction.RESTORE,
        entity="file_version",
        entity_id=file_id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
        metadata={"version": version},
    )
    return stored
