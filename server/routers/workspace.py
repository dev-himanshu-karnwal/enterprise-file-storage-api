from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth import get_current_user, require_write_access
from models import User
from schemas.workspace import (
    CreateFolderRequest,
    CreateProjectRequest,
    FolderResponse,
    ProjectResponse,
    UpdateFolderRequest,
    UpdateProjectRequest,
)
from services import workspace_service

projects_router = APIRouter(prefix="/projects", tags=["projects"])
folders_router = APIRouter(prefix="/folders", tags=["folders"])


@projects_router.get("", response_model=list[ProjectResponse])
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ProjectResponse]:
    return workspace_service.list_projects(db, actor=current_user)


@projects_router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: CreateProjectRequest,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> ProjectResponse:
    return workspace_service.create_project(db, actor=current_user, payload=payload)


@projects_router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: UUID,
    payload: UpdateProjectRequest,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> ProjectResponse:
    return workspace_service.update_project(
        db,
        actor=current_user,
        project_id=project_id,
        payload=payload,
    )


@projects_router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: UUID,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> None:
    workspace_service.delete_project(db, actor=current_user, project_id=project_id)


@folders_router.get("", response_model=list[FolderResponse])
def list_folders(
    project_id: UUID = Query(...),
    parent_folder_id: UUID | None = Query(None),
    include_deleted: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FolderResponse]:
    return workspace_service.list_folders(
        db,
        actor=current_user,
        project_id=project_id,
        parent_folder_id=parent_folder_id,
        include_deleted=include_deleted,
    )


@folders_router.post("", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
def create_folder(
    payload: CreateFolderRequest,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> FolderResponse:
    return workspace_service.create_folder(db, actor=current_user, payload=payload)


@folders_router.get("/{folder_id}", response_model=FolderResponse)
def get_folder(
    folder_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FolderResponse:
    return workspace_service.get_folder(db, actor=current_user, folder_id=folder_id)


@folders_router.patch("/{folder_id}", response_model=FolderResponse)
def update_folder(
    folder_id: UUID,
    payload: UpdateFolderRequest,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> FolderResponse:
    return workspace_service.update_folder(
        db,
        actor=current_user,
        folder_id=folder_id,
        payload=payload,
    )


@folders_router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(
    folder_id: UUID,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> None:
    workspace_service.delete_folder(db, actor=current_user, folder_id=folder_id)


@folders_router.post("/{folder_id}/restore", response_model=FolderResponse)
def restore_folder(
    folder_id: UUID,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> FolderResponse:
    return workspace_service.restore_folder(db, actor=current_user, folder_id=folder_id)
