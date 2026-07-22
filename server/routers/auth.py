from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth import get_current_user, require_roles
from models import User, UserRole
from schemas.auth import (
    AuthResponse,
    CreateOrganizationRequest,
    CreateUserRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    OrganizationResponse,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
    UpdateOrganizationRequest,
    UpdateUserRequest,
    UserResponse,
)
from services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])
organizations_router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    return auth_service.signup(db, payload)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    return auth_service.login(db, payload)


@router.post("/refresh", response_model=AuthResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> AuthResponse:
    return auth_service.refresh_tokens(db, payload.refresh_token)


@router.post("/logout", response_model=MessageResponse)
def logout(
    payload: LogoutRequest,
    _: User = Depends(get_current_user),
) -> MessageResponse:
    auth_service.logout(payload.refresh_token)
    return MessageResponse(message="Logged out successfully")


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
) -> ForgotPasswordResponse:
    return auth_service.forgot_password(db, payload.email)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> MessageResponse:
    auth_service.reset_password(
        db,
        token=payload.token,
        new_password=payload.new_password,
    )
    return MessageResponse(message="Password updated successfully")


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


@users_router.get("", response_model=list[UserResponse])
def list_users(
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> list[UserResponse]:
    return auth_service.list_users_for_org(db, actor=current_user)


@users_router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: CreateUserRequest,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> UserResponse:
    return auth_service.create_user_for_org(db, actor=current_user, payload=payload)


@users_router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: UUID,
    payload: UpdateUserRequest,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> UserResponse:
    return auth_service.update_user(
        db,
        actor=current_user,
        user_id=user_id,
        payload=payload,
    )


@users_router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> None:
    auth_service.delete_user(db, actor=current_user, user_id=user_id)


@organizations_router.get("", response_model=list[OrganizationResponse])
def list_organizations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[OrganizationResponse]:
    return auth_service.list_organizations(db, actor=current_user)


@organizations_router.post(
    "",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_organization(
    payload: CreateOrganizationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrganizationResponse:
    return auth_service.create_organization(db, actor=current_user, payload=payload)


@organizations_router.patch("/{organization_id}", response_model=OrganizationResponse)
def update_organization(
    organization_id: UUID,
    payload: UpdateOrganizationRequest,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> OrganizationResponse:
    return auth_service.update_organization(
        db,
        actor=current_user,
        organization_id=organization_id,
        payload=payload,
    )
