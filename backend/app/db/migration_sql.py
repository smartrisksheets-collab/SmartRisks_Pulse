# app/db/migration_sql.py
"""Run a hand-written .sql migration file through Alembic.

The same file is pasted into the Supabase SQL editor, so both environments
run identical SQL. asyncpg rejects several statements in one execute, so the
file is split into single statements, and BEGIN/COMMIT are dropped because
Alembic already wraps the migration in a transaction.
"""

from pathlib import Path

SQL_DIR = Path(__file__).resolve().parents[2] / "alembic" / "versions" / "sql"

_TX_WORDS = {"BEGIN", "COMMIT", "START TRANSACTION", "END"}


def split_sql(sql: str) -> list[str]:
    """Split SQL text on semicolons outside quotes, dollar-quoted bodies and comments."""
    statements: list[str] = []
    buf: list[str] = []
    i = 0
    n = len(sql)
    in_single = False
    dollar_tag: str | None = None
    while i < n:
        ch = sql[i]
        if dollar_tag is not None:
            if sql.startswith(dollar_tag, i):
                buf.append(dollar_tag)
                i += len(dollar_tag)
                dollar_tag = None
                continue
            buf.append(ch)
            i += 1
            continue
        if in_single:
            buf.append(ch)
            if ch == "'":
                in_single = False
            i += 1
            continue
        if sql.startswith("--", i):
            end = sql.find("\n", i)
            i = n if end == -1 else end
            continue
        if ch == "'":
            in_single = True
            buf.append(ch)
            i += 1
            continue
        if ch == "$":
            end = sql.find("$", i + 1)
            tag = sql[i:end + 1] if end != -1 else ""
            if tag and all(c.isalnum() or c == "_" for c in tag[1:-1]):
                dollar_tag = tag
                buf.append(tag)
                i += len(tag)
                continue
        if ch == ";":
            statements.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    statements.append("".join(buf))
    cleaned = [s.strip() for s in statements]
    return [s for s in cleaned if s and s.upper() not in _TX_WORDS]


def run_sql_file(name: str) -> None:
    """Execute every statement of alembic/versions/sql/<name> in order."""
    from alembic import op

    sql = (SQL_DIR / name).read_text(encoding="utf-8")
    for statement in split_sql(sql):
        op.execute(statement)
