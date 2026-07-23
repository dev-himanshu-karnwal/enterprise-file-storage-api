from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from core.security import validate_password_strength
from models.user import UserRole


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    organization_name: str = Field(min_length=1, max_length=255)

    @field_validator("password")
    @classmethod
    def password_must_be_strong(cls, value: str) -> str:
        validate_password_strength(value)
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class LogoutRequest(BaseModel):
    refresh_token: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_must_be_strong(cls, value: str) -> str:
        validate_password_strength(value)
        return value


class CreateUserRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.MEMBER

    @field_validator("password")
    @classmethod
    def password_must_be_strong(cls, value: str) -> str:
        validate_password_strength(value)
        return value


class UpdateUserRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    role: UserRole | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_must_be_strong(cls, value: str | None) -> str | None:
        if value is not None:
            validate_password_strength(value)
        return value


class CreateOrganizationRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    storage_limit: int | None = Field(default=None, gt=0)
    settings: dict[str, Any] | None = None


class UpdateOrganizationRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    storage_limit: int | None = Field(default=None, gt=0)
    settings: dict[str, Any] | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    email: EmailStr
    role: UserRole
    created_at: datetime
    updated_at: datetime


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    storage_limit: int
    storage_used: int = 0
    settings: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class AuthResponse(BaseModel):
    user: UserResponse
    tokens: TokenResponse


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: str | None = None
