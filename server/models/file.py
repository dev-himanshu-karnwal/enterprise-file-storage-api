import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class StoredFile(Base):
    """File metadata; bytes live in S3 (PRD §7 File)."""

    __tablename__ = "files"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("folders.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    extension: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    mime_type: Mapped[str] = mapped_column(String(255), nullable=False, default="application/octet-stream")
    size: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    checksum: Mapped[str] = mapped_column(String(128), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    tags: Mapped[list[Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default="[]",
    )
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
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

    versions: Mapped[list["FileVersion"]] = relationship(
        "FileVersion",
        back_populates="file",
        cascade="all, delete-orphan",
        order_by="FileVersion.version",
    )

    def __repr__(self) -> str:
        return f"<StoredFile id={self.id} filename={self.filename!r}>"


class FileVersion(Base):
    """Immutable version snapshot for a file (PRD §7 FileVersion)."""

    __tablename__ = "file_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum: Mapped[str] = mapped_column(String(128), nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    file: Mapped[StoredFile] = relationship("StoredFile", back_populates="versions")

    def __repr__(self) -> str:
        return f"<FileVersion file_id={self.file_id} version={self.version}>"
