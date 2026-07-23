import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class AuditAction(str, enum.Enum):
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    SIGNUP = "SIGNUP"
    UPLOAD = "UPLOAD"
    DOWNLOAD = "DOWNLOAD"
    DELETE = "DELETE"
    RESTORE = "RESTORE"
    CREATE_FOLDER = "CREATE_FOLDER"
    UPDATE_FOLDER = "UPDATE_FOLDER"
    DELETE_FOLDER = "DELETE_FOLDER"
    RESTORE_FOLDER = "RESTORE_FOLDER"
    CREATE_PROJECT = "CREATE_PROJECT"
    UPDATE_PROJECT = "UPDATE_PROJECT"
    DELETE_PROJECT = "DELETE_PROJECT"
    CREATE_USER = "CREATE_USER"
    UPDATE_USER = "UPDATE_USER"
    DELETE_USER = "DELETE_USER"
    UPDATE_ROLE = "UPDATE_ROLE"
    UPDATE_ORGANIZATION = "UPDATE_ORGANIZATION"
    MOVE_FILE = "MOVE_FILE"
    UPDATE_FILE = "UPDATE_FILE"


class AuditLog(Base):
    """Immutable audit trail for important actions (PRD §4 / §7)."""

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[AuditAction] = mapped_column(
        Enum(
            AuditAction,
            name="audit_action",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        index=True,
    )
    entity: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata",
        JSONB,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    def __repr__(self) -> str:
        return f"<AuditLog action={self.action} entity={self.entity}>"
