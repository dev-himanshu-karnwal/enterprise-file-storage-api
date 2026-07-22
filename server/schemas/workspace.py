from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)


class UpdateProjectRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


class CreateFolderRequest(BaseModel):
    project_id: UUID
    name: str = Field(min_length=1, max_length=255)
    parent_folder_id: UUID | None = None


class UpdateFolderRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_folder_id: UUID | None = None


class FolderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    parent_folder_id: UUID | None
    name: str
    path: str
    deleted_at: datetime | None
    deleted_by: UUID | None
    created_at: datetime
    updated_at: datetime
