import re
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from core import redis_client
from core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    hash_password,
    require_token_type,
    safe_decode,
    verify_password,
)
from models import Organization, User, UserRole
from schemas.auth import (
    AuthResponse,
    CreateUserRequest,
    LoginRequest,
    SignupRequest,
    TokenResponse,
    UserResponse,
)


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


def create_user_for_org(
    db: Session,
    *,
    actor: User,
    payload: CreateUserRequest,
) -> UserResponse:
    if payload.role == UserRole.ADMIN and actor.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create admin users",
        )

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


def list_users_for_org(db: Session, *, actor: User) -> list[UserResponse]:
    users = db.scalars(
        select(User)
        .where(User.organization_id == actor.organization_id)
        .order_by(User.created_at.asc())
    ).all()
    return [UserResponse.model_validate(user) for user in users]
