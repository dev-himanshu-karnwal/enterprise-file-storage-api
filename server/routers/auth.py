from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from core.pagination import pagination_params
from database import get_db
from dependencies.auth import get_current_user, require_roles
from dependencies.rate_limit import rate_limit
from models import AuditAction, User, UserRole
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
from schemas.common import PaginatedResponse, PaginationParams
from services import audit_service, auth_service

router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])
organizations_router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(
    payload: SignupRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AuthResponse:
    result = auth_service.signup(db, payload)
    audit_service.record_audit(
        db,
        action=AuditAction.SIGNUP,
        entity="user",
        entity_id=result.user.id,
        organization_id=result.user.organization_id,
        user_id=result.user.id,
        ip_address=audit_service.get_client_ip(request),
        metadata={"email": result.user.email},
    )
    return result


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(rate_limit(name="login", limit=10, window_seconds=60)),
) -> AuthResponse:
    result = auth_service.login(db, payload)
    audit_service.record_audit(
        db,
        action=AuditAction.LOGIN,
        entity="user",
        entity_id=result.user.id,
        organization_id=result.user.organization_id,
        user_id=result.user.id,
        ip_address=audit_service.get_client_ip(request),
    )
    return result


@router.post("/refresh", response_model=AuthResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> AuthResponse:
    return auth_service.refresh_tokens(db, payload.refresh_token)


@router.post("/logout", response_model=MessageResponse)
def logout(
    payload: LogoutRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    auth_service.logout(payload.refresh_token)
    audit_service.record_audit(
        db,
        action=AuditAction.LOGOUT,
        entity="user",
        entity_id=current_user.id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
    )
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


@users_router.get("", response_model=PaginatedResponse[UserResponse])
def list_users(
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
    params: PaginationParams = Depends(pagination_params),
) -> PaginatedResponse[UserResponse]:
    return auth_service.list_users_for_org(db, actor=current_user, params=params)


@users_router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: CreateUserRequest,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> UserResponse:
    user = auth_service.create_user_for_org(db, actor=current_user, payload=payload)
    audit_service.record_audit(
        db,
        action=AuditAction.CREATE_USER,
        entity="user",
        entity_id=user.id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
        metadata={"email": user.email, "role": user.role.value},
    )
    return user


@users_router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: UUID,
    payload: UpdateUserRequest,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> UserResponse:
    data = payload.model_dump(exclude_unset=True)
    user = auth_service.update_user(
        db,
        actor=current_user,
        user_id=user_id,
        payload=payload,
    )
    action = AuditAction.UPDATE_ROLE if "role" in data else AuditAction.UPDATE_USER
    audit_service.record_audit(
        db,
        action=action,
        entity="user",
        entity_id=user.id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
        metadata=data,
    )
    return user


@users_router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> None:
    auth_service.delete_user(db, actor=current_user, user_id=user_id)
    audit_service.record_audit(
        db,
        action=AuditAction.DELETE_USER,
        entity="user",
        entity_id=user_id,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
    )


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
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> OrganizationResponse:
    org = auth_service.update_organization(
        db,
        actor=current_user,
        organization_id=organization_id,
        payload=payload,
    )
    audit_service.record_audit(
        db,
        action=AuditAction.UPDATE_ORGANIZATION,
        entity="organization",
        entity_id=org.id,
        organization_id=org.id,
        user_id=current_user.id,
        ip_address=audit_service.get_client_ip(request),
        metadata=payload.model_dump(exclude_unset=True),
    )
    return org
