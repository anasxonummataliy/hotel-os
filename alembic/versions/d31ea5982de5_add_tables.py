"""add tables

Revision ID: d31ea5982de5
Revises: 59bf2859f6a3
Create Date: 2026-06-05 02:01:52.566968

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd31ea5982de5'
down_revision: Union[str, Sequence[str], None] = '59bf2859f6a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Safely add username to users
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username);")

    # Safely add passport_id to guests
    op.execute("ALTER TABLE guests ADD COLUMN IF NOT EXISTS passport_id VARCHAR(50);")
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_guests_passport_id'
            ) THEN
                ALTER TABLE guests ADD CONSTRAINT uq_guests_passport_id UNIQUE (passport_id);
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE guests DROP CONSTRAINT IF EXISTS uq_guests_passport_id;")
    op.execute("ALTER TABLE guests DROP COLUMN IF EXISTS passport_id;")
    op.execute("DROP INDEX IF EXISTS ix_users_username;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS username;")

