"""create tenants table

Revision ID: 002
Revises: 001
Create Date: 2026-07-26
"""

from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE tenants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            industry TEXT,
            plan TEXT NOT NULL DEFAULT 'TRIAL',
            trial_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
            payment_active BOOLEAN NOT NULL DEFAULT false,
            payment_date DATE,
            plan_expires_at DATE,
            max_risks INT NOT NULL DEFAULT 1000,
            max_users INT NOT NULL DEFAULT 25,
            modules TEXT[] NOT NULL DEFAULT ARRAY['risk'],
            currency_symbol TEXT NOT NULL DEFAULT '₦',
            logo_url TEXT,
            report_settings JSONB,
            workspace_settings JSONB,
            pin_hash TEXT,
            created_by UUID NOT NULL REFERENCES accounts(id),
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tenants;")
