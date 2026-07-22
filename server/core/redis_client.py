import redis

from config import get_settings

_settings = get_settings()
_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(_settings.redis_url, decode_responses=True)
    return _client


def store_refresh_token(*, jti: str, user_id: str, ttl_seconds: int) -> None:
    get_redis().setex(f"refresh:{jti}", ttl_seconds, user_id)


def revoke_refresh_token(jti: str) -> bool:
    return bool(get_redis().delete(f"refresh:{jti}"))


def is_refresh_token_active(jti: str, user_id: str) -> bool:
    stored = get_redis().get(f"refresh:{jti}")
    return stored == user_id
