from collections.abc import Callable

from fastapi import HTTPException, Request, status

from core.redis_client import get_redis
from services.audit_service import get_client_ip


def rate_limit(*, name: str, limit: int, window_seconds: int) -> Callable[[Request], None]:
    """Simple fixed-window rate limiter keyed by client IP."""

    def dependency(request: Request) -> None:
        ip = get_client_ip(request) or "unknown"
        key = f"rl:{name}:{ip}"
        try:
            client = get_redis()
            count = client.incr(key)
            if count == 1:
                client.expire(key, window_seconds)
            if count > limit:
                ttl = client.ttl(key)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded for {name}. Try again in {max(ttl, 1)}s.",
                    headers={"Retry-After": str(max(ttl, 1))},
                )
        except HTTPException:
            raise
        except Exception:
            # Fail open if Redis is temporarily unavailable.
            return

    return dependency
