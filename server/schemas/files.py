from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _normalize_tags(tags: list[str] | None) -> list[str]:
    if not tags:
        return []
    seen: set[str] = set()
    result: list[str] = []
    for raw in tags:
        tag = " ".join(raw.strip().lower().split())
        if not tag or tag in seen:
            continue
        if len(tag) > 64:
            raise ValueError("Each tag must be at most 64 characters")
        seen.add(tag)
        result.append(tag)
        if len(result) > 20:
            raise ValueError("At most 20 tags are allowed")
    return result


class FileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    folder_id: UUID | None
    current_version: int
    filename: str
    extension: str
    mime_type: str
    size: int
    checksum: str
    storage_key: str
    tags: list[str] = Field(default_factory=list)
    uploaded_by: UUID | None
    deleted_at: datetime | None
    deleted_by: UUID | None
    created_at: datetime
    updated_at: datetime


class FileVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    file_id: UUID
    version: int
    storage_key: str
    size: int
    checksum: str
    uploaded_by: UUID | None
    created_at: datetime


class DownloadResponse(BaseModel):
    download_url: str
    expires_in: int
    filename: str
    version: int
    size: int
    mime_type: str


class PresignUploadRequest(BaseModel):
    project_id: UUID
    folder_id: UUID | None = None
    filename: str = Field(min_length=1, max_length=512)
    content_type: str = Field(default="application/octet-stream", max_length=255)
    size: int = Field(gt=0)
    tags: list[str] = Field(default_factory=list)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        return _normalize_tags(value)


class PresignUploadResponse(BaseModel):
    upload_id: str
    upload_url: str
    storage_key: str
    file_id: UUID
    version: int
    headers: dict[str, str]
    expires_in: int


class CompleteUploadRequest(BaseModel):
    upload_id: str = Field(min_length=1)
    checksum: str | None = Field(default=None, max_length=128)


class UpdateFileRequest(BaseModel):
    """Move a file (`folder_id`) and/or replace its tags.

    Omit a field to leave it unchanged. Send ``folder_id: null`` to move to project root.
    """

    folder_id: UUID | None = None
    tags: list[str] | None = None

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return _normalize_tags(value)


class MessageResponse(BaseModel):
    message: str = Field(default="ok")
