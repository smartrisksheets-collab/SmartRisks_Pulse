"""submission indexes

Revision ID: 039
Revises: 038
Create Date: 2026-08-28
"""
from alembic import op

revision = '039'
down_revision = '038'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE INDEX idx_submission_tokens_workspace_id ON submission_tokens(workspace_id)")
    op.execute("CREATE INDEX idx_submission_tokens_token ON submission_tokens(token)")
    op.execute("CREATE INDEX idx_risk_submissions_workspace_id ON risk_submissions(workspace_id)")
    op.execute("CREATE INDEX idx_risk_submissions_token_id ON risk_submissions(token_id)")
    op.execute("CREATE INDEX idx_risk_submissions_status ON risk_submissions(status)")
    op.execute(
        "CREATE INDEX idx_risks_source_submission_id ON risks(source_submission_id) "
        "WHERE source_submission_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_submission_tokens_workspace_id")
    op.execute("DROP INDEX IF EXISTS idx_submission_tokens_token")
    op.execute("DROP INDEX IF EXISTS idx_risk_submissions_workspace_id")
    op.execute("DROP INDEX IF EXISTS idx_risk_submissions_token_id")
    op.execute("DROP INDEX IF EXISTS idx_risk_submissions_status")
    op.execute("DROP INDEX IF EXISTS idx_risks_source_submission_id")