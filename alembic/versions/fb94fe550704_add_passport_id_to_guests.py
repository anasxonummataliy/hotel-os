"""add_passport_id_to_guests

Revision ID: fb94fe550704
Revises: b7f745a3546f
Create Date: 2026-06-08 11:05:45.469607

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fb94fe550704'
down_revision: Union[str, Sequence[str], None] = 'b7f745a3546f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

