"""add_passport_id_to_guests

Revision ID: b7f745a3546f
Revises: 7e63622db7df
Create Date: 2026-06-06 17:06:47.158017

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7f745a3546f'
down_revision: Union[str, Sequence[str], None] = '7e63622db7df'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

