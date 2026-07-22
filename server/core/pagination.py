from collections.abc import Callable
from math import ceil
from typing import Any, TypeVar

from fastapi import Query
from sqlalchemy import Select, asc, desc, func, select
from sqlalchemy.orm import Session

from schemas.common import PaginatedResponse, PaginationParams

T = TypeVar("T")


def pagination_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str = Query("created_at"),
    order: str = Query("desc", pattern="^(?i)(asc|desc)$"),
) -> PaginationParams:
    return PaginationParams(page=page, page_size=page_size, sort=sort, order=order)


def paginate(
    db: Session,
    query: Select[Any],
    *,
    params: PaginationParams,
    model: Any,
    allowed_sort: set[str],
    serialize: Callable[[Any], T],
) -> PaginatedResponse[T]:
    sort_field = params.sort if params.sort in allowed_sort else "created_at"
    column = getattr(model, sort_field, None) or getattr(model, "created_at")
    ordered = query.order_by(desc(column) if params.is_desc else asc(column))

    total = db.scalar(select(func.count()).select_from(ordered.order_by(None).subquery())) or 0
    rows = db.scalars(ordered.offset(params.offset).limit(params.page_size)).all()
    total_pages = ceil(total / params.page_size) if total else 0

    return PaginatedResponse(
        items=[serialize(row) for row in rows],
        page=params.page,
        page_size=params.page_size,
        total=int(total),
        total_pages=total_pages,
    )
