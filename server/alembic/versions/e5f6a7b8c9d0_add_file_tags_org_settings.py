"""add file tags, org settings, move_file audit

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-23 09:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "files",
        sa.Column(
            "tags",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "settings",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )

    # Extend audit_action enum for MOVE_FILE / UPDATE_FILE.
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'MOVE_FILE'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'UPDATE_FILE'")


def downgrade() -> None:
    op.drop_column("organizations", "settings")
    op.drop_column("files", "tags")
    # PostgreSQL cannot easily remove enum values; leave audit_action values in place.
