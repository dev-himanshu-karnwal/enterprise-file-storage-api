import re
import uuid
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from config import get_settings
from core import redis_client
from core.password_reset import (
    consume_password_reset_token,
    create_password_reset_token,
    store_password_reset_token,
)
from core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    hash_password,
    require_token_type,
    safe_decode,
    verify_password,
)
from core.pagination import paginate
from models import Organization, User, UserRole
from schemas.auth import (
    AuthResponse,
    CreateOrganizationRequest,
    CreateUserRequest,
    ForgotPasswordResponse,
    LoginRequest,
    OrganizationResponse,
    SignupRequest,
    TokenResponse,
    UpdateOrganizationRequest,
    UpdateUserRequest,
    UserResponse,
)
from schemas.common import PaginatedResponse, PaginationParams

settings = get_settings()


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or "org"


def _unique_slug(db: Session, base: str) -> str:
    slug = _slugify(base)
    candidate = slug
    counter = 1
    while db.scalar(select(Organization.id).where(Organization.slug == candidate)):
        candidate = f"{slug}-{counter}"
        counter += 1
    return candidate


def _issue_tokens(user: User) -> TokenResponse:
    access = create_access_token(
        user_id=user.id,
        organization_id=user.organization_id,
        role=user.role.value,
        email=user.email,
    )
    refresh, jti, ttl = create_refresh_token(user_id=user.id)
    redis_client.store_refresh_token(jti=jti, user_id=str(user.id), ttl_seconds=ttl)
    return TokenResponse(access_token=access, refresh_token=refresh)


def _auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        user=UserResponse.model_validate(user),
        tokens=_issue_tokens(user),
    )


def _get_org_or_404(db: Session, organization_id: UUID) -> Organization:
    organization = db.scalar(
        select(Organization).where(Organization.id == organization_id)
    )
    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    return organization


def _get_user_in_org_or_404(
    db: Session,
    *,
    user_id: UUID,
    organization_id: UUID,
) -> User:
    user = db.scalar(
        select(User).where(
            User.id == user_id,
            User.organization_id == organization_id,
        )
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


def _count_admins(db: Session, organization_id: UUID) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(User)
            .where(
                User.organization_id == organization_id,
                User.role == UserRole.ADMIN,
            )
        )
        or 0
    )


def signup(db: Session, payload: SignupRequest) -> AuthResponse:
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered",
        )

    organization = Organization(
        id=uuid.uuid4(),
        name=payload.organization_name.strip(),
        slug=_unique_slug(db, payload.organization_name),
    )
    user = User(
        id=uuid.uuid4(),
        organization_id=organization.id,
        name=payload.name.strip(),
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=UserRole.ADMIN,
    )
    db.add(organization)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _auth_response(user)


def login(db: Session, payload: LoginRequest) -> AuthResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    return _auth_response(user)


def logout(refresh_token: str) -> None:
    try:
        payload = safe_decode(refresh_token)
        require_token_type(payload, "refresh")
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    jti = payload.get("jti")
    if not jti or not redis_client.revoke_refresh_token(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or already revoked",
        )


def refresh_tokens(db: Session, refresh_token: str) -> AuthResponse:
    try:
        payload = safe_decode(refresh_token)
        require_token_type(payload, "refresh")
        user_id = UUID(payload["sub"])
        jti = payload["jti"]
    except (TokenError, KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        ) from exc

    if not redis_client.is_refresh_token_active(jti, str(user_id)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or revoked",
        )

    user = db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Rotate refresh token.
    redis_client.revoke_refresh_token(jti)
    return _auth_response(user)


def forgot_password(db: Session, email: str) -> ForgotPasswordResponse:
    message = "If that email is registered, a reset link has been sent."
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user is None:
        return ForgotPasswordResponse(message=message)

    token = create_password_reset_token()
    store_password_reset_token(token=token, user_id=str(user.id))

    # No email provider yet — expose token in development for practice flows.
    reset_token = token if settings.debug or settings.app_env == "development" else None
    return ForgotPasswordResponse(message=message, reset_token=reset_token)


def reset_password(db: Session, *, token: str, new_password: str) -> None:
    user_id = consume_password_reset_token(token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    user = db.scalar(select(User).where(User.id == UUID(user_id)))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    user.password_hash = hash_password(new_password)
    db.commit()


def create_user_for_org(
    db: Session,
    *,
    actor: User,
    payload: CreateUserRequest,
) -> UserResponse:
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered",
        )

    user = User(
        id=uuid.uuid4(),
        organization_id=actor.organization_id,
        name=payload.name.strip(),
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


def list_users_for_org(
    db: Session,
    *,
    actor: User,
    params: PaginationParams,
) -> PaginatedResponse[UserResponse]:
    query = select(User).where(User.organization_id == actor.organization_id)
    return paginate(
        db,
        query,
        params=params,
        model=User,
        allowed_sort={"created_at", "name", "email", "role", "updated_at"},
        serialize=lambda row: UserResponse.model_validate(row),
    )


def update_user(
    db: Session,
    *,
    actor: User,
    user_id: UUID,
    payload: UpdateUserRequest,
) -> UserResponse:
    target = _get_user_in_org_or_404(
        db,
        user_id=user_id,
        organization_id=actor.organization_id,
    )

    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    if "role" in data and data["role"] != target.role:
        if (
            target.role == UserRole.ADMIN
            and data["role"] != UserRole.ADMIN
            and _count_admins(db, actor.organization_id) <= 1
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the last admin in the organization",
            )
        target.role = data["role"]

    if "email" in data and data["email"] is not None:
        new_email = str(data["email"]).lower()
        if new_email != target.email:
            clash = db.scalar(select(User).where(User.email == new_email))
            if clash:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email is already registered",
                )
            target.email = new_email

    if "name" in data and data["name"] is not None:
        target.name = data["name"].strip()

    if "password" in data and data["password"] is not None:
        target.password_hash = hash_password(data["password"])

    db.commit()
    db.refresh(target)
    return UserResponse.model_validate(target)


def delete_user(db: Session, *, actor: User, user_id: UUID) -> None:
    if actor.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account",
        )

    target = _get_user_in_org_or_404(
        db,
        user_id=user_id,
        organization_id=actor.organization_id,
    )

    if target.role == UserRole.ADMIN and _count_admins(db, actor.organization_id) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the last admin in the organization",
        )

    db.delete(target)
    db.commit()


def list_organizations(db: Session, *, actor: User) -> list[OrganizationResponse]:
    organization = _get_org_or_404(db, actor.organization_id)
    return [OrganizationResponse.model_validate(organization)]


def create_organization(
    db: Session,
    *,
    actor: User,
    payload: CreateOrganizationRequest,
) -> OrganizationResponse:
    """Create a new organization and move the actor into it as admin."""
    organization = Organization(
        id=uuid.uuid4(),
        name=payload.name.strip(),
        slug=_unique_slug(db, payload.name),
        storage_limit=payload.storage_limit
        if payload.storage_limit is not None
        else 10 * 1024 * 1024 * 1024,
    )
    db.add(organization)
    actor.organization_id = organization.id
    actor.role = UserRole.ADMIN
    db.commit()
    db.refresh(organization)
    return OrganizationResponse.model_validate(organization)


def update_organization(
    db: Session,
    *,
    actor: User,
    organization_id: UUID,
    payload: UpdateOrganizationRequest,
) -> OrganizationResponse:
    if actor.organization_id != organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own organization",
        )

    organization = _get_org_or_404(db, organization_id)
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    if "name" in data and data["name"] is not None:
        organization.name = data["name"].strip()
    if "storage_limit" in data and data["storage_limit"] is not None:
        organization.storage_limit = data["storage_limit"]

    db.commit()
    db.refresh(organization)
    return OrganizationResponse.model_validate(organization)
