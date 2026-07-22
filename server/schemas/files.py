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


class MessageResponse(BaseModel):
    message: str = Field(default="ok")
