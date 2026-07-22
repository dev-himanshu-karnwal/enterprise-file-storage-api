from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from dependencies.auth import get_current_user, require_roles
from database import get_db
from models import User, UserRole
from schemas.auth import (
    AuthResponse,
    CreateUserRequest,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    SignupRequest,
    UserResponse,
)
from services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    return auth_service.signup(db, payload)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    return auth_service.login(db, payload)


@router.post("/logout", response_model=MessageResponse)
def logout(
    payload: LogoutRequest,
    _: User = Depends(get_current_user),
) -> MessageResponse:
    auth_service.logout(payload.refresh_token)
    return MessageResponse(message="Logged out successfully")


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
