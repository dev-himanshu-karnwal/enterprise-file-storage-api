from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from core.pagination import pagination_params
from database import get_db
from dependencies.auth import get_current_user, require_write_access
from models import AuditAction, User
from schemas.common import PaginatedResponse, PaginationParams
from schemas.workspace import (
    CreateFolderRequest,
    CreateProjectRequest,
    FolderResponse,
    ProjectResponse,
    UpdateFolderRequest,
    UpdateProjectRequest,
)
from services import audit_service, workspace_service

projects_router = APIRouter(prefix="/projects", tags=["projects"])
folders_router = APIRouter(prefix="/folders", tags=["folders"])


@projects_router.get("", response_model=PaginatedResponse[ProjectResponse])
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    params: PaginationParams = Depends(pagination_params),
) -> PaginatedResponse[ProjectResponse]:
    return workspace_service.list_projects(db, actor=current_user, params=params)


@projects_router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: CreateProjectRequest,
    request: Request,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> ProjectResponse:
    project = workspace_service.create_project(db, actor=current_user, payload=payload)
    audit_service.record_audit(
        db,
        action=AuditAction.CREATE_PROJECT,
        entity="project",
        entity_id=project.id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
        metadata={"name": project.name},
    )
    return project


@projects_router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: UUID,
    payload: UpdateProjectRequest,
    request: Request,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> ProjectResponse:
    project = workspace_service.update_project(
        db,
        actor=current_user,
        project_id=project_id,
        payload=payload,
    )
    audit_service.record_audit(
        db,
        action=AuditAction.UPDATE_PROJECT,
        entity="project",
        entity_id=project.id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
        metadata=payload.model_dump(exclude_unset=True),
    )
    return project


@projects_router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: UUID,
    request: Request,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> None:
    workspace_service.delete_project(db, actor=current_user, project_id=project_id)
    audit_service.record_audit(
        db,
        action=AuditAction.DELETE_PROJECT,
        entity="project",
        entity_id=project_id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
    )


@folders_router.get("", response_model=PaginatedResponse[FolderResponse])
def list_folders(
    project_id: UUID = Query(...),
    parent_folder_id: UUID | None = Query(None),
    include_deleted: bool = Query(False),
    all_folders: bool = Query(
        False,
        description="If true, return every active folder in the project (ignores parent_folder_id)",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    params: PaginationParams = Depends(pagination_params),
) -> PaginatedResponse[FolderResponse]:
    return workspace_service.list_folders(
        db,
        actor=current_user,
        project_id=project_id,
        parent_folder_id=parent_folder_id,
        include_deleted=include_deleted,
        all_folders=all_folders,
        params=params,
    )


@folders_router.post("", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
def create_folder(
    payload: CreateFolderRequest,
    request: Request,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> FolderResponse:
    folder = workspace_service.create_folder(db, actor=current_user, payload=payload)
    audit_service.record_audit(
        db,
        action=AuditAction.CREATE_FOLDER,
        entity="folder",
        entity_id=folder.id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
        metadata={"name": folder.name, "path": folder.path},
    )
    return folder


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
    request: Request,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> FolderResponse:
    folder = workspace_service.update_folder(
        db,
        actor=current_user,
        folder_id=folder_id,
        payload=payload,
    )
    audit_service.record_audit(
        db,
        action=AuditAction.UPDATE_FOLDER,
        entity="folder",
        entity_id=folder.id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
        metadata=payload.model_dump(exclude_unset=True),
    )
    return folder


@folders_router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(
    folder_id: UUID,
    request: Request,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> None:
    workspace_service.delete_folder(db, actor=current_user, folder_id=folder_id)
    audit_service.record_audit(
        db,
        action=AuditAction.DELETE_FOLDER,
        entity="folder",
        entity_id=folder_id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
    )


@folders_router.post("/{folder_id}/restore", response_model=FolderResponse)
def restore_folder(
    folder_id: UUID,
    request: Request,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> FolderResponse:
    folder = workspace_service.restore_folder(db, actor=current_user, folder_id=folder_id)
    audit_service.record_audit(
        db,
        action=AuditAction.RESTORE_FOLDER,
        entity="folder",
        entity_id=folder.id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
    )
    return folder
