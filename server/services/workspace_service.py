import re
import uuid
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.pagination import paginate
from models import Folder, Project, StoredFile, User
from schemas.common import PaginatedResponse, PaginationParams
from schemas.workspace import (
    CreateFolderRequest,
    CreateProjectRequest,
    FolderResponse,
    ProjectResponse,
    UpdateFolderRequest,
    UpdateProjectRequest,
)


def _slug_segment(name: str) -> str:
    cleaned = re.sub(r"[\\/]+", "-", name.strip())
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:255] or "folder"


def _build_path(parent: Folder | None, name: str) -> str:
    segment = _slug_segment(name)
    if parent is None:
        return f"/{segment}"
    return f"{parent.path.rstrip('/')}/{segment}"


def _get_project_for_org(
    db: Session,
    *,
    project_id: UUID,
    organization_id: UUID,
) -> Project:
    project = db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.organization_id == organization_id,
        )
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _get_active_folder(
    db: Session,
    *,
    folder_id: UUID,
    organization_id: UUID,
    include_deleted: bool = False,
) -> Folder:
    folder = db.scalar(
        select(Folder)
        .join(Project, Folder.project_id == Project.id)
        .where(
            Folder.id == folder_id,
            Project.organization_id == organization_id,
        )
    )
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    if folder.deleted_at is not None and not include_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return folder


def _assert_unique_sibling_name(
    db: Session,
    *,
    project_id: UUID,
    parent_folder_id: UUID | None,
    name: str,
    exclude_folder_id: UUID | None = None,
) -> None:
    query = select(Folder).where(
        Folder.project_id == project_id,
        Folder.parent_folder_id == parent_folder_id,
        Folder.name == name,
        Folder.deleted_at.is_(None),
    )
    if exclude_folder_id is not None:
        query = query.where(Folder.id != exclude_folder_id)
    if db.scalar(query):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A folder with this name already exists here",
        )


def _is_descendant(db: Session, *, ancestor_id: UUID, candidate_id: UUID) -> bool:
    """Return True if candidate_id is ancestor_id or nested under it."""
    current_id: UUID | None = candidate_id
    seen: set[UUID] = set()
    while current_id is not None:
        if current_id == ancestor_id:
            return True
        if current_id in seen:
            break
        seen.add(current_id)
        parent_id = db.scalar(
            select(Folder.parent_folder_id).where(Folder.id == current_id)
        )
        current_id = parent_id
    return False


def _update_descendant_paths(db: Session, folder: Folder, old_path: str, new_path: str) -> None:
    descendants = db.scalars(
        select(Folder).where(
            Folder.project_id == folder.project_id,
            Folder.path.startswith(f"{old_path}/"),
        )
    ).all()
    for child in descendants:
        child.path = new_path + child.path[len(old_path) :]


# ——— Projects ———


def list_projects(
    db: Session,
    *,
    actor: User,
    params: PaginationParams,
) -> PaginatedResponse[ProjectResponse]:
    query = select(Project).where(Project.organization_id == actor.organization_id)
    return paginate(
        db,
        query,
        params=params,
        model=Project,
        allowed_sort={"created_at", "name", "updated_at"},
        serialize=lambda row: ProjectResponse.model_validate(row),
    )


def create_project(
    db: Session,
    *,
    actor: User,
    payload: CreateProjectRequest,
) -> ProjectResponse:
    project = Project(
        id=uuid.uuid4(),
        organization_id=actor.organization_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectResponse.model_validate(project)


def update_project(
    db: Session,
    *,
    actor: User,
    project_id: UUID,
    payload: UpdateProjectRequest,
) -> ProjectResponse:
    project = _get_project_for_org(
        db,
        project_id=project_id,
        organization_id=actor.organization_id,
    )
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    if "name" in data and data["name"] is not None:
        project.name = data["name"].strip()
    if "description" in data:
        value = data["description"]
        project.description = value.strip() if isinstance(value, str) and value.strip() else None

    db.commit()
    db.refresh(project)
    return ProjectResponse.model_validate(project)


def delete_project(db: Session, *, actor: User, project_id: UUID) -> None:
    project = _get_project_for_org(
        db,
        project_id=project_id,
        organization_id=actor.organization_id,
    )
    db.delete(project)
    db.commit()


# ——— Folders ———


def list_folders(
    db: Session,
    *,
    actor: User,
    project_id: UUID,
    parent_folder_id: UUID | None = None,
    include_deleted: bool = False,
    all_folders: bool = False,
    params: PaginationParams,
) -> PaginatedResponse[FolderResponse]:
    _get_project_for_org(
        db,
        project_id=project_id,
        organization_id=actor.organization_id,
    )

    query = select(Folder).where(Folder.project_id == project_id)

    if include_deleted:
        query = query.where(Folder.deleted_at.is_not(None))
    else:
        query = query.where(Folder.deleted_at.is_(None))
        if all_folders:
            pass
        elif parent_folder_id is None:
            query = query.where(Folder.parent_folder_id.is_(None))
        else:
            _get_active_folder(
                db,
                folder_id=parent_folder_id,
                organization_id=actor.organization_id,
            )
            query = query.where(Folder.parent_folder_id == parent_folder_id)

    return paginate(
        db,
        query,
        params=params,
        model=Folder,
        allowed_sort={"created_at", "name", "updated_at", "path"},
        serialize=lambda row: FolderResponse.model_validate(row),
    )


def get_folder(db: Session, *, actor: User, folder_id: UUID) -> FolderResponse:
    folder = _get_active_folder(
        db,
        folder_id=folder_id,
        organization_id=actor.organization_id,
    )
    return FolderResponse.model_validate(folder)


def create_folder(
    db: Session,
    *,
    actor: User,
    payload: CreateFolderRequest,
) -> FolderResponse:
    project = _get_project_for_org(
        db,
        project_id=payload.project_id,
        organization_id=actor.organization_id,
    )

    parent: Folder | None = None
    if payload.parent_folder_id is not None:
        parent = _get_active_folder(
            db,
            folder_id=payload.parent_folder_id,
            organization_id=actor.organization_id,
        )
        if parent.project_id != project.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent folder must belong to the same project",
            )

    name = payload.name.strip()
    _assert_unique_sibling_name(
        db,
        project_id=project.id,
        parent_folder_id=payload.parent_folder_id,
        name=name,
    )

    folder = Folder(
        id=uuid.uuid4(),
        project_id=project.id,
        parent_folder_id=payload.parent_folder_id,
        name=name,
        path=_build_path(parent, name),
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return FolderResponse.model_validate(folder)


def update_folder(
    db: Session,
    *,
    actor: User,
    folder_id: UUID,
    payload: UpdateFolderRequest,
) -> FolderResponse:
    folder = _get_active_folder(
        db,
        folder_id=folder_id,
        organization_id=actor.organization_id,
    )
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    new_name = data["name"].strip() if "name" in data and data["name"] is not None else folder.name
    moving = "parent_folder_id" in data
    new_parent_id = data["parent_folder_id"] if moving else folder.parent_folder_id

    new_parent: Folder | None = None
    if new_parent_id is not None:
        new_parent = _get_active_folder(
            db,
            folder_id=new_parent_id,
            organization_id=actor.organization_id,
        )
        if new_parent.project_id != folder.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent folder must belong to the same project",
            )
        if _is_descendant(db, ancestor_id=folder.id, candidate_id=new_parent.id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot move a folder into itself or its descendant",
            )

    if new_name != folder.name or new_parent_id != folder.parent_folder_id:
        _assert_unique_sibling_name(
            db,
            project_id=folder.project_id,
            parent_folder_id=new_parent_id,
            name=new_name,
            exclude_folder_id=folder.id,
        )

    old_path = folder.path
    folder.name = new_name
    folder.parent_folder_id = new_parent_id
    folder.path = _build_path(new_parent, new_name)

    if folder.path != old_path:
        _update_descendant_paths(db, folder, old_path, folder.path)

    db.commit()
    db.refresh(folder)
    return FolderResponse.model_validate(folder)


def delete_folder(db: Session, *, actor: User, folder_id: UUID) -> None:
    folder = _get_active_folder(
        db,
        folder_id=folder_id,
        organization_id=actor.organization_id,
    )
    now = datetime.now(timezone.utc)
    folder.deleted_at = now
    folder.deleted_by = actor.id

    # Soft-delete descendants as well.
    descendants = db.scalars(
        select(Folder).where(
            Folder.project_id == folder.project_id,
            Folder.path.startswith(f"{folder.path}/"),
            Folder.deleted_at.is_(None),
        )
    ).all()
    for child in descendants:
        child.deleted_at = now
        child.deleted_by = actor.id

    folder_ids = [folder.id, *[child.id for child in descendants]]
    files = db.scalars(
        select(StoredFile).where(
            StoredFile.folder_id.in_(folder_ids),
            StoredFile.deleted_at.is_(None),
        )
    ).all()
    for stored in files:
        stored.deleted_at = now
        stored.deleted_by = actor.id

    db.commit()


def restore_folder(db: Session, *, actor: User, folder_id: UUID) -> FolderResponse:
    folder = _get_active_folder(
        db,
        folder_id=folder_id,
        organization_id=actor.organization_id,
        include_deleted=True,
    )
    if folder.deleted_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Folder is not deleted",
        )

    # If parent is deleted, restore to root to avoid broken trees.
    if folder.parent_folder_id is not None:
        parent = db.scalar(select(Folder).where(Folder.id == folder.parent_folder_id))
        if parent is None or parent.deleted_at is not None:
            folder.parent_folder_id = None
            folder.path = _build_path(None, folder.name)

    _assert_unique_sibling_name(
        db,
        project_id=folder.project_id,
        parent_folder_id=folder.parent_folder_id,
        name=folder.name,
        exclude_folder_id=folder.id,
    )

    folder.deleted_at = None
    folder.deleted_by = None

    # Restore direct descendants that were deleted in the same cascade window
    # under this path (best-effort: restore all soft-deleted under this path).
    descendants = db.scalars(
        select(Folder).where(
            Folder.project_id == folder.project_id,
            Folder.path.startswith(f"{folder.path}/"),
            Folder.deleted_at.is_not(None),
        )
    ).all()
    for child in descendants:
        child.deleted_at = None
        child.deleted_by = None

    folder_ids = [folder.id, *[child.id for child in descendants]]
    files = db.scalars(
        select(StoredFile).where(
            StoredFile.folder_id.in_(folder_ids),
            StoredFile.deleted_at.is_not(None),
        )
    ).all()
    for stored in files:
        stored.deleted_at = None
        stored.deleted_by = None

    db.commit()
    db.refresh(folder)
    return FolderResponse.model_validate(folder)
