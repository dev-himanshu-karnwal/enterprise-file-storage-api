from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth import get_current_user, require_write_access
from models import User
from schemas.files import DownloadResponse, FileResponse, FileVersionResponse
from services import file_service

files_router = APIRouter(prefix="/files", tags=["files"])


@files_router.post("/upload", response_model=FileResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    project_id: UUID = Form(...),
    folder_id: UUID | None = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> FileResponse:
    return await file_service.upload_file(
        db,
        actor=current_user,
        upload=file,
        project_id=project_id,
        folder_id=folder_id,
    )


@files_router.get("", response_model=list[FileResponse])
def list_files(
    project_id: UUID = Query(...),
    folder_id: UUID | None = Query(None),
    include_deleted: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FileResponse]:
    return file_service.list_files(
        db,
        actor=current_user,
        project_id=project_id,
        folder_id=folder_id,
        include_deleted=include_deleted,
    )


@files_router.get("/{file_id}", response_model=FileResponse)
def get_file(
    file_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    return file_service.get_file(db, actor=current_user, file_id=file_id)


@files_router.get("/{file_id}/download", response_model=DownloadResponse)
def download_file(
    file_id: UUID,
    version: int | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DownloadResponse:
    return file_service.get_download(
        db,
        actor=current_user,
        file_id=file_id,
        version=version,
    )


@files_router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: UUID,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> None:
    file_service.delete_file(db, actor=current_user, file_id=file_id)


@files_router.post("/{file_id}/restore", response_model=FileResponse)
def restore_file(
    file_id: UUID,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> FileResponse:
    return file_service.restore_file(db, actor=current_user, file_id=file_id)


@files_router.get("/{file_id}/versions", response_model=list[FileVersionResponse])
def list_versions(
    file_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FileVersionResponse]:
    return file_service.list_versions(db, actor=current_user, file_id=file_id)


@files_router.post(
    "/{file_id}/restore-version/{version}",
    response_model=FileResponse,
)
def restore_version(
    file_id: UUID,
    version: int,
    current_user: User = Depends(require_write_access()),
    db: Session = Depends(get_db),
) -> FileResponse:
    return file_service.restore_version(
        db,
        actor=current_user,
        file_id=file_id,
        version=version,
    )
