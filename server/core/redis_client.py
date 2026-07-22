import json

import redis

from config import get_settings

_settings = get_settings()
_client: redis.Redis | None = None

# Concurrent /auth/refresh calls (React Strict Mode, multi-tab) can race after
# rotation. Keep the rotated response briefly so a reused old jti gets the same
# new tokens instead of a hard logout.
REFRESH_REUSE_GRACE_SECONDS = 30


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(_settings.redis_url, decode_responses=True)
    return _client


def store_refresh_token(*, jti: str, user_id: str, ttl_seconds: int) -> None:
    get_redis().setex(f"refresh:{jti}", ttl_seconds, user_id)


def is_refresh_token_active(jti: str, user_id: str) -> bool:
    stored = get_redis().get(f"refresh:{jti}")
    return stored is not None and stored == user_id


def revoke_refresh_token(jti: str) -> bool:
    return bool(get_redis().delete(f"refresh:{jti}"))


def claim_refresh_token(jti: str, user_id: str) -> bool:
    """Atomically consume a refresh jti. Returns True if this caller claimed it."""
    key = f"refresh:{jti}"
    client = get_redis()
    try:
        stored = client.getdel(key)
    except redis.RedisError:
        stored = client.get(key)
        if stored is not None:
            client.delete(key)
    return stored is not None and stored == user_id


def cache_rotated_refresh(jti: str, payload: dict) -> None:
    get_redis().setex(
        f"refresh-grace:{jti}",
        REFRESH_REUSE_GRACE_SECONDS,
        json.dumps(payload),
    )


def get_rotated_refresh(jti: str) -> dict | None:
    raw = get_redis().get(f"refresh-grace:{jti}")
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def store_pending_upload(*, upload_id: str, payload: str, ttl_seconds: int) -> None:
    get_redis().setex(f"upload:{upload_id}", ttl_seconds, payload)


def get_pending_upload(upload_id: str) -> str | None:
    return get_redis().get(f"upload:{upload_id}")


def pop_pending_upload(upload_id: str) -> str | None:
    key = f"upload:{upload_id}"
    client = get_redis()
    raw = client.get(key)
    if raw:
        client.delete(key)
    return raw
