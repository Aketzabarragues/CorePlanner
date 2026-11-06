"""Ajustes de esquema para bases de datos ya creadas.

`create_all` crea las tablas que faltan, pero no anade columnas a las que ya
existen. Este modulo anade las columnas nuevas sin tocar los datos.

Las claves foraneas no se pueden anadir en SQLite con ALTER TABLE, de modo que
las columnas anadidas aqui quedan sin integridad referencial en las bases
existentes. Las bases nuevas si las tienen, porque las crea el esquema.
"""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

COLUMN_ADDITIONS = (
    ("users", "company_role", "VARCHAR(32) NOT NULL DEFAULT 'tecnico'"),
    ("projects", "owner_id", "INTEGER NULL"),
)


async def apply_migrations(engine: AsyncEngine) -> None:
    """Anade a las tablas existentes las columnas que les falten."""
    def _migrate(sync_conn) -> None:
        inspector = inspect(sync_conn)
        tables = set(inspector.get_table_names())
        for table, column, definition in COLUMN_ADDITIONS:
            if table not in tables:
                continue
            columns = {item["name"] for item in inspector.get_columns(table)}
            if column in columns:
                continue
            sync_conn.execute(
                text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
            )

    async with engine.begin() as conn:
        await conn.run_sync(_migrate)
