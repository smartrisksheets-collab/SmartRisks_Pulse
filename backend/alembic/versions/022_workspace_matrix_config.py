"""workspace_matrix_config

Revision ID: 022
Revises: 021
Create Date: 2026-08-07
"""

from alembic import op

revision = '022'
down_revision = '021'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS workspace_matrix_config (
          id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          likelihood_scale  INT  NOT NULL DEFAULT 5,
          impact_scale      INT  NOT NULL DEFAULT 5,
          band_low_min      INT  NOT NULL DEFAULT 1,
          band_low_max      INT  NOT NULL DEFAULT 4,
          band_medium_min   INT  NOT NULL DEFAULT 5,
          band_medium_max   INT  NOT NULL DEFAULT 9,
          band_high_min     INT  NOT NULL DEFAULT 10,
          band_high_max     INT  NOT NULL DEFAULT 16,
          band_critical_min INT  NOT NULL DEFAULT 17,
          band_critical_max INT  NOT NULL DEFAULT 25,
          created_at        TIMESTAMPTZ DEFAULT now(),
          updated_at        TIMESTAMPTZ DEFAULT now(),
          UNIQUE (tenant_id)
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_matrix_config_tenant
        ON workspace_matrix_config (tenant_id)
    """)

    op.execute("""
        INSERT INTO workspace_matrix_config (tenant_id)
        SELECT id FROM tenants
        ON CONFLICT (tenant_id) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS workspace_matrix_config")