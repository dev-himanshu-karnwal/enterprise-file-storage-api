from typing import Any
from uuid import UUID

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.pagination import paginate
from models.audit import AuditAction, AuditLog
from models.user import User
from schemas.common import AuditLogResponse, PaginatedResponse, PaginationParams


def get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client:
        return request.client.host
    return None


def record_audit(
    db: Session,
    *,
    action: AuditAction,
    entity: str,
    entity_id: str | UUID | None = None,
    organization_id: UUID | None = None,
    user_id: UUID | None = None,
    ip_address: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            organization_id=organization_id,
            user_id=user_id,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            ip_address=ip_address,
            metadata_=metadata,
        )
    )
    db.commit()


def list_audit_logs(
    db: Session,
    *,
    actor: User,
    params: PaginationParams,
    action: AuditAction | None = None,
) -> PaginatedResponse[AuditLogResponse]:
    query = select(AuditLog).where(AuditLog.organization_id == actor.organization_id)
    if action is not None:
        query = query.where(AuditLog.action == action)

    def serialize(row: AuditLog) -> AuditLogResponse:
        return AuditLogResponse(
            id=row.id,
            organization_id=row.organization_id,
            user_id=row.user_id,
            action=row.action,
            entity=row.entity,
            entity_id=row.entity_id,
            ip_address=row.ip_address,
            metadata=row.metadata_,
            created_at=row.created_at,
        )

    return paginate(
        db,
        query,
        params=params,
        model=AuditLog,
        allowed_sort={"created_at", "action"},
        serialize=serialize,
    )
