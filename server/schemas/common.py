from datetime import datetime
from typing import Any, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from models.audit import AuditAction

T = TypeVar("T")


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort: str = "created_at"
    order: str = Field(default="desc", pattern="^(?i)(asc|desc)$")

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def is_desc(self) -> bool:
        return self.order.lower() == "desc"


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total: int
    total_pages: int


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID | None
    user_id: UUID | None
    action: AuditAction
    entity: str
    entity_id: str | None
    ip_address: str | None
    metadata: dict[str, Any] | None = None
    created_at: datetime


class SearchFileResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    folder_id: UUID | None
    filename: str
    extension: str
    mime_type: str
    size: int
    current_version: int
    uploaded_by: UUID | None
    created_at: datetime
    updated_at: datetime
