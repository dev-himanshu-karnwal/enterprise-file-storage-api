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
