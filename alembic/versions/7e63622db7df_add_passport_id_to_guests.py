"""add_passport_id_to_guests

Revision ID: 7e63622db7df
Revises: 35383d688092
Create Date: 2026-06-06 00:36:38.733534

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7e63622db7df'
down_revision: Union[str, Sequence[str], None] = '35383d688092'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

