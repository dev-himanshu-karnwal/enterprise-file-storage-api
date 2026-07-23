from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.pagination import pagination_params
from database import get_db
from dependencies.auth import get_current_user, require_roles
from dependencies.rate_limit import rate_limit
from models import AuditAction, User, UserRole
from schemas.common import (
    AuditLogResponse,
    PaginatedResponse,
    PaginationParams,
    SearchFileResult,
)
from services import audit_service, file_service

search_router = APIRouter(prefix="/search", tags=["search"])
audit_router = APIRouter(prefix="/audit-logs", tags=["audit"])


@search_router.get("/files", response_model=PaginatedResponse[SearchFileResult])
def search_files(
    q: str | None = Query(None, description="Filename contains"),
    extension: str | None = Query(None),
    uploaded_by: UUID | None = Query(None),
    project_id: UUID | None = Query(None),
    folder_id: UUID | None = Query(None),
    tag: str | None = Query(None),
    uploaded_after: datetime | None = Query(None),
    uploaded_before: datetime | None = Query(None),
    file_type: str | None = Query(
        None,
        description="One of: image, pdf, video, zip, document",
    ),
    size_min: int | None = Query(None, ge=0),
    size_max: int | None = Query(None, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    params: PaginationParams = Depends(pagination_params),
    _: None = Depends(rate_limit(name="search", limit=50, window_seconds=60)),
) -> PaginatedResponse[SearchFileResult]:
    return file_service.search_files(
        db,
        actor=current_user,
        params=params,
        q=q,
        extension=extension,
        uploaded_by=uploaded_by,
        project_id=project_id,
        folder_id=folder_id,
        tag=tag,
        uploaded_after=uploaded_after,
        uploaded_before=uploaded_before,
        file_type=file_type,
        size_min=size_min,
        size_max=size_max,
    )


@audit_router.get("", response_model=PaginatedResponse[AuditLogResponse])
def list_audit_logs(
    action: AuditAction | None = Query(None),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
    params: PaginationParams = Depends(pagination_params),
) -> PaginatedResponse[AuditLogResponse]:
    return audit_service.list_audit_logs(
        db,
        actor=current_user,
        params=params,
        action=action,
    )
