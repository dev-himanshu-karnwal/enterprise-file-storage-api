from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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


class MessageResponse(BaseModel):
    message: str = Field(default="ok")
