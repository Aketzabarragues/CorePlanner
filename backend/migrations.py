"""Ajustes de esquema para bases de datos ya creadas.

`create_all` crea las tablas que faltan, pero no anade columnas a las que ya
existen. Este modulo anade las columnas nuevas sin tocar los datos.

Las claves foraneas no se pueden anadir en SQLite con ALTER TABLE, de modo que
las columnas anadidas aqui quedan sin integridad referencial en las bases
existentes. Las bases nuevas si las tienen, porque las crea el esquema.
"""

from __future__ import annotations

from collections import Counter

from sqlalchemy import MetaData, inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

from .models import Base, NonWorkingDay
from .palette import least_used_color

COLUMN_ADDITIONS = (
    ("users", "company_role", "VARCHAR(32) NOT NULL DEFAULT 'tecnico'"),
    ("users", "job_title", "VARCHAR(120) NULL"),
    ("users", "seniority", "VARCHAR(32) NULL"),
    ("users", "employment_type", "VARCHAR(32) NOT NULL DEFAULT 'objetivo'"),
    ("projects", "owner_id", "INTEGER NULL"),
    ("tasks", "description", "TEXT NULL"),
    ("departments", "color", "VARCHAR(7) NULL"),
    ("projects", "color", "VARCHAR(7) NULL"),
)

COLOR_TABLES = ("departments", "projects")
"""Tablas cuyo color se reparte al migrar."""

NON_WORKING_DAYS_COLUMNS = ("id", "date", "name", "scope", "department_id", "user_id", "half_day")


def _migrate_non_working_days(sync_conn, tables: set[str], inspector) -> None:
    """Recrea la tabla de dias no laborables con el alcance por persona.

    El alcance por persona anade la columna `user_id` y cambia las
    restricciones de comprobacion del alcance. SQLite no permite alterar una
    tabla, asi que se crea la nueva con el esquema del modelo, se copian los
    dias y se le cambia el nombre. Las bases nuevas no pasan por aqui: las
    crea `create_all` con el esquema al dia.

    La comprobacion es si la columna `user_id` ya existe: si existe, la
    migracion ya se aplico. Se pregunta al inspector de SQLAlchemy y no al
    catalogo de SQLite, que en PostgreSQL no existe y hacia fallar el
    arranque. El resto de la migracion es SQL estandar: funciona en los dos
    motores.
    """
    if "non_working_days" not in tables:
        return
    columnas = {item["name"] for item in inspector.get_columns("non_working_days")}
    if "user_id" in columnas:
        return

    # La tabla nueva lleva claves foraneas a users y departments: hay que
    # copiarlas al metadata para que SQLAlchemy pueda generar su DDL.
    destino = MetaData()
    for nombre in ("departments", "users"):
        Base.metadata.tables[nombre].to_metadata(destino)
    nueva = NonWorkingDay.__table__.to_metadata(destino, name="non_working_days_new")
    nueva.create(bind=sync_conn)
    columnas = ", ".join(NON_WORKING_DAYS_COLUMNS)
    sync_conn.execute(
        text(
            f"INSERT INTO non_working_days_new ({columnas}) "
            f"SELECT id, date, name, scope, department_id, NULL, half_day "
            f"FROM non_working_days"
        )
    )
    sync_conn.execute(text("DROP TABLE non_working_days"))
    sync_conn.execute(text("ALTER TABLE non_working_days_new RENAME TO non_working_days"))
    for columna in ("date", "department_id", "user_id"):
        sync_conn.execute(text(f"DROP INDEX IF EXISTS ix_non_working_days_new_{columna}"))
        sync_conn.execute(
            text(f"CREATE INDEX ix_non_working_days_{columna} ON non_working_days ({columna})")
        )


def _backfill_colors(sync_conn, table: str) -> None:
    """Reparte la paleta entre las filas de `table` que aun no tienen color.

    Las filas se recorren por id y cada color asignado cuenta para las
    siguientes, de modo que mientras queden colores libres las filas reciben
    colores distintos. La operacion es idempotente: las filas que ya tienen
    color no se tocan.
    """
    rows = sync_conn.execute(text(f"SELECT id, color FROM {table} ORDER BY id")).all()
    counts = Counter(color for _, color in rows if color)

    for row_id, color in rows:
        if color:
            continue
        elegido = least_used_color(counts)
        counts[elegido] += 1
        sync_conn.execute(
            text(f"UPDATE {table} SET color = :color WHERE id = :id"),
            {"color": elegido, "id": row_id},
        )


async def apply_migrations(engine: AsyncEngine) -> None:
    """Anade a las tablas existentes las columnas que les falten."""

    def _migrate(sync_conn) -> None:
        inspector = inspect(sync_conn)
        tables = set(inspector.get_table_names())
        columnas = {
            table: {item["name"] for item in inspector.get_columns(table)}
            for table in tables
        }
        for table, column, definition in COLUMN_ADDITIONS:
            if table not in tables:
                continue
            if column in columnas[table]:
                continue
            sync_conn.execute(
                text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
            )
            columnas[table].add(column)
        for table in COLOR_TABLES:
            if table in tables and "color" in columnas[table]:
                _backfill_colors(sync_conn, table)
        _migrate_non_working_days(sync_conn, tables, inspector)

    async with engine.begin() as conn:
        await conn.run_sync(_migrate)
