"""Pruebas de las migraciones de esquema.

La migracion que anade el alcance por persona recrea la tabla de dias no
laborables. Tiene que valer para cualquier motor: el catalogo de SQLite no
existe en PostgreSQL, y consultarlo hacia fallar el arranque de la aplicacion.
"""

from __future__ import annotations

import inspect

from sqlalchemy import MetaData
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from backend import migrations
from backend.models import Base, NonWorkingDay


def test_la_migracion_no_consulta_el_catalogo_de_sqlite():
    """`sqlite_master` solo existe en SQLite: consultarlo rompe PostgreSQL."""
    fuente = inspect.getsource(migrations)

    assert "sqlite_master" not in fuente
    assert "PRAGMA" not in fuente


def test_el_ddl_de_la_tabla_nueva_compila_en_postgresql():
    """La tabla que crea la migracion es valida en PostgreSQL."""
    destino = MetaData()
    for nombre in ("departments", "users"):
        Base.metadata.tables[nombre].to_metadata(destino)
    nueva = NonWorkingDay.__table__.to_metadata(destino, name="non_working_days_new")

    ddl = str(CreateTable(nueva).compile(dialect=postgresql.dialect()))

    assert "user_id" in ddl
    assert "person" in ddl
    assert "FOREIGN KEY" in ddl


def test_la_comprobacion_de_la_migracion_usa_el_inspector():
    """La decision de migrar se toma con el inspector, no con el DDL crudo."""
    fuente = inspect.getsource(migrations._migrate_non_working_days)

    assert "inspector.get_columns" in fuente
    assert "user_id" in fuente
