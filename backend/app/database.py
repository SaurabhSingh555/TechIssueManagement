"""Postgres connection pool (psycopg3) against Supabase PostgreSQL."""
from contextlib import contextmanager
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import settings

_pool: ConnectionPool | None = None

if settings.database_url:
    _pool = ConnectionPool(settings.database_url, min_size=1, max_size=5, kwargs={"row_factory": dict_row}, open=True)


@contextmanager
def get_conn():
    """Yield a pooled connection with dict rows."""
    if _pool is None:
        raise RuntimeError("DATABASE_URL is not configured. Copy backend/.env.example to backend/.env.")
    with _pool.connection() as conn:
        yield conn


def fetchall(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()


def fetchone(sql: str, params: tuple = ()) -> dict[str, Any] | None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()


def execute(sql: str, params: tuple = ()) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
        conn.commit()
