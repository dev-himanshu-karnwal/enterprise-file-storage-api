import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    MEMBER = "member"
    READ_ONLY = "read_only"


class User(Base):
    """Application user belonging to an organization (PRD §7 Database Design)."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    # FK to organizations.id will be added when the Organization model exists.
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(
        String(320),
        nullable=False,
        unique=True,
        index=True,
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(
            UserRole,
            name="user_role",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=UserRole.MEMBER,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r} role={self.role}>"
