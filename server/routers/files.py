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
        },
    )
    return stored


@files_router.get("", response_model=PaginatedResponse[FileResponse])
def list_files(
    project_id: UUID = Query(...),
    folder_id: UUID | None = Query(None),
    include_deleted: bool = Query(False),
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
        params=params,
    )


@files_router.get("/{file_id}", response_model=FileResponse)
def get_file(
    file_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    return file_service.get_file(db, actor=current_user, file_id=file_id)


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
