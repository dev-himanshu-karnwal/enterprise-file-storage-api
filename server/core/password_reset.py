import uuid

from config import get_settings
from core import redis_client

settings = get_settings()


def store_password_reset_token(*, token: str, user_id: str) -> None:
    ttl = settings.password_reset_expire_minutes * 60
    redis_client.get_redis().setex(f"reset:{token}", ttl, user_id)


def consume_password_reset_token(token: str) -> str | None:
    """Return user_id and delete the token (one-time use)."""
    key = f"reset:{token}"
    client = redis_client.get_redis()
    user_id = client.get(key)
    if user_id:
        client.delete(key)
    return user_id


def create_password_reset_token() -> str:
    return str(uuid.uuid4())
