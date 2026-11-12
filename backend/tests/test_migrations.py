"""Pruebas de las migraciones de esquema.

La migracion que anade el alcance por persona recrea la tabla de dias no
laborables. Tiene que valer para cualquier motor: el catalogo de SQLite no
existe en PostgreSQL, y consultarlo hacia fallar el arranque de la aplicacion.

La migracion del color propio anade la columna a las tablas que ya existian y
reparte la paleta entre las filas que aun no la tienen, sin tocar las que ya
estan coloreadas.
"""

from __future__ import annotations

import inspect

from sqlalchemy import MetaData, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from backend import migrations
from backend.database import create_engine
from backend.migrations import apply_migrations
from backend.models import Base, NonWorkingDay
from backend.palette import PALETTE_COLORS


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


async def _crear_tablas(engine, con_color: bool) -> None:
    """Crea a mano las tablas de departamentos y proyectos.

    Sin `con_color` reproducen una base anterior a la columna del color; con
    ella, una base que ya la tiene y en la que hay filas coloreadas.
    """
    extra = ", color VARCHAR(7) NULL" if con_color else ""

    def _crear(sync_conn):
        for tabla, nombre in (("departments", "VARCHAR(100)"), ("projects", "VARCHAR(255)")):
            ddl = f"CREATE TABLE {tabla} (id INTEGER PRIMARY KEY, name {nombre} NOT NULL{extra})"
            sync_conn.execute(text(ddl))

    async with engine.begin() as conn:
        await conn.run_sync(_crear)


async def _insertar(
    engine, tabla: str, filas: list[tuple[int, str, str | None]], con_color: bool
) -> None:
    """Inserta filas con su id, su nombre y su color (nulo si no lo tienen).

    `con_color` dice si la tabla tiene la columna: en una base anterior al
    cambio de esquema, esa columna todavia no existe.
    """

    def _insertar(sync_conn):
        for id_, nombre, color in filas:
            if con_color:
                sync_conn.execute(
                    text(f"INSERT INTO {tabla} (id, name, color) VALUES (:id, :name, :color)"),
                    {"id": id_, "name": nombre, "color": color},
                )
            else:
                sync_conn.execute(
                    text(f"INSERT INTO {tabla} (id, name) VALUES (:id, :name)"),
                    {"id": id_, "name": nombre},
                )

    async with engine.begin() as conn:
        await conn.run_sync(_insertar)


async def _colores(engine, tabla: str) -> dict[int, str | None]:
    """Color de cada fila de la tabla, indexado por id."""
    async with engine.begin() as conn:
        filas = (await conn.execute(text(f"SELECT id, color FROM {tabla} ORDER BY id"))).all()
    return {fila.id: fila.color for fila in filas}


async def test_la_migracion_añade_la_columna_de_color_y_la_rellena(tmp_path):
    """Una base sin la columna la recibe y todas sus filas quedan coloreadas."""
    engine = create_engine(f"sqlite+aiosqlite:///{tmp_path / 'vieja.sqlite'}")
    await _crear_tablas(engine, con_color=False)
    await _insertar(engine, "departments", [(1, "Alimentacion", None)], con_color=False)
    await _insertar(engine, "projects", [(1, "Linea 1", None)], con_color=False)

    await apply_migrations(engine)

    for tabla in ("departments", "projects"):
        colores = await _colores(engine, tabla)
        assert set(colores) == {1}
        assert colores[1] in PALETTE_COLORS
    await engine.dispose()


async def test_el_backfill_reparte_colores_distintos_entre_las_filas(tmp_path):
    """Mientras queden colores libres, las filas reciben colores distintos."""
    engine = create_engine(f"sqlite+aiosqlite:///{tmp_path / 'vieja.sqlite'}")
    await _crear_tablas(engine, con_color=False)
    await _insertar(
        engine,
        "departments",
        [(1, "Alimentacion", None), (2, "Energia", None), (3, "Medio Ambiente", None)],
        con_color=False,
    )

    await apply_migrations(engine)

    colores = await _colores(engine, "departments")
    assert len(set(colores.values())) == 3
    assert set(colores.values()) <= PALETTE_COLORS
    await engine.dispose()


async def test_el_backfill_no_toca_las_filas_que_ya_tienen_color(tmp_path):
    """Las filas que ya estan coloreadas se quedan con su color."""
    engine = create_engine(f"sqlite+aiosqlite:///{tmp_path / 'vieja.sqlite'}")
    await _crear_tablas(engine, con_color=True)
    await _insertar(
        engine,
        "departments",
        [(1, "Alimentacion", "#1f6feb"), (2, "Energia", None)],
        con_color=True,
    )

    await apply_migrations(engine)

    colores = await _colores(engine, "departments")
    assert colores[1] == "#1f6feb"
    assert colores[2] in PALETTE_COLORS
    await engine.dispose()


async def test_la_migracion_de_color_es_idempotente(tmp_path):
    """Aplicarla dos veces no cambia los colores ya repartidos."""
    engine = create_engine(f"sqlite+aiosqlite:///{tmp_path / 'vieja.sqlite'}")
    await _crear_tablas(engine, con_color=False)
    await _insertar(
        engine, "projects", [(1, "Linea 1", None), (2, "Linea 2", None)], con_color=False
    )

    await apply_migrations(engine)
    primera = await _colores(engine, "projects")
    await apply_migrations(engine)
    segunda = await _colores(engine, "projects")

    assert primera == segunda
    assert all(color in PALETTE_COLORS for color in segunda.values())
    await engine.dispose()
