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


def test_toda_hija_de_tasks_esta_registrada_en_la_migracion():
    """Toda clave foranea que apunte a `tasks.id` tiene su tabla en `TASK_CHILD_TABLES`.

    La migracion que recrea `tasks` solo captura las tablas registradas: si una
    hija nueva con cascada no esta en la lista, el `DROP TABLE` de la recreacion
    le borra las filas sin error.
    """
    hijas: set[str] = set()
    for tabla in Base.metadata.tables.values():
        for clave_foranea in tabla.foreign_keys:
            if (
                clave_foranea.column.table.name == "tasks"
                and clave_foranea.column.name == "id"
            ):
                hijas.add(tabla.name)

    faltantes = sorted(hijas - set(migrations.TASK_CHILD_TABLES))

    assert not faltantes, (
        "Hay hijas nuevas de `tasks` (FK a `tasks.id`) no registradas en "
        f"migrations.TASK_CHILD_TABLES: {', '.join(faltantes)}. Añádelas antes "
        "de la siguiente recreacion de `tasks`, que las cascadearia en silencio."
    )


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


async def _crear_tasks(engine, con_position: bool) -> None:
    """Crea la tabla de tareas, con o sin la columna de posicion."""
    extra = ", position INTEGER NULL" if con_position else ""

    def _crear(sync_conn):
        sync_conn.execute(
            text(
                "CREATE TABLE tasks (id INTEGER PRIMARY KEY, "
                f"project_id INTEGER NOT NULL, status VARCHAR(32) NOT NULL,"
                f" start_date DATE NULL{extra})"
            )
        )

    async with engine.begin() as conn:
        await conn.run_sync(_crear)


def _fila_tarea(
    id_: int, project_id: int, estado: str, fecha: str, position: int | None
):
    return {"id": id_, "pid": project_id, "status": estado, "fecha": fecha, "position": position}


async def _insertar_tasks(engine, filas: list[dict], con_position: bool) -> None:
    """Inserta las filas; sin `con_position` la tabla no tiene la columna."""
    if con_position:
        sql = (
            "INSERT INTO tasks "
            "(id, project_id, status, start_date, position) "
            "VALUES (:id, :pid, :status, :fecha, :position)"
        )
    else:
        sql = "INSERT INTO tasks (id, project_id, status, start_date) "
        sql += "VALUES (:id, :pid, :status, :fecha)"

    def _insertar(sync_conn):
        for fila in filas:
            sync_conn.execute(text(sql), fila)

    async with engine.begin() as conn:
        await conn.run_sync(_insertar)


async def _posiciones(engine) -> dict[int, int | None]:
    async with engine.begin() as conn:
        filas = (await conn.execute(text("SELECT id, position FROM tasks ORDER BY id"))).all()
    return {fila.id: fila.position for fila in filas}


async def test_la_migracion_anade_la_columna_de_posicion_y_la_rellena_por_columna(tmp_path):
    """Una base sin `position` la recibe y cada columna se rellena desde 0
    en el orden (start_date, id), sin tocar las demas columnas."""
    engine = create_engine(f"sqlite+aiosqlite:///{tmp_path / 'vieja.sqlite'}")
    await _crear_tasks(engine, con_position=False)
    await _insertar_tasks(
        engine,
        [
            _fila_tarea(1, 1, "backlog", "2026-03-05", None),
            _fila_tarea(2, 1, "backlog", "2026-03-02", None),
            _fila_tarea(3, 1, "done", "2026-03-01", None),
            _fila_tarea(4, 2, "backlog", "2026-03-09", None),
        ],
        con_position=False,
    )

    await apply_migrations(engine)

    assert await _posiciones(engine) == {
        # En el proyecto 1, backlog, manda start_date: la 2 va antes que la 1.
        2: 0,
        1: 1,
        # Cada columna cuenta desde 0, de modo que done empieza de nuevo.
        3: 0,
        # El otro proyecto no ve las columnas de este.
        4: 0,
    }
    await engine.dispose()


async def test_el_backfill_de_posicion_continua_desde_el_maximo_existente(tmp_path):
    """Una columna que ya tiene posiciones recibe las nuevas tras su maximo,
    y la fila ya posicionada no se toca."""
    engine = create_engine(f"sqlite+aiosqlite:///{tmp_path / 'vieja.sqlite'}")
    await _crear_tasks(engine, con_position=True)
    await _insertar_tasks(
        engine,
        [
            _fila_tarea(1, 1, "backlog", "2026-03-01", 5),
            _fila_tarea(2, 1, "backlog", "2026-03-02", 7),
            _fila_tarea(3, 1, "backlog", "2026-03-03", None),
            _fila_tarea(4, 1, "backlog", "2026-03-04", None),
        ],
        con_position=True,
    )

    await apply_migrations(engine)

    assert await _posiciones(engine) == {1: 5, 2: 7, 3: 8, 4: 9}
    await engine.dispose()


async def test_el_backfill_de_posicion_es_idempotente(tmp_path):
    """Aplicar la migracion dos veces no cambia ni reordena las posiciones."""
    engine = create_engine(f"sqlite+aiosqlite:///{tmp_path / 'vieja.sqlite'}")
    await _crear_tasks(engine, con_position=False)
    await _insertar_tasks(
        engine,
        [
            _fila_tarea(1, 1, "backlog", "2026-03-05", None),
            _fila_tarea(2, 1, "backlog", "2026-03-02", None),
            _fila_tarea(3, 1, "done", "2026-03-01", None),
        ],
        con_position=False,
    )

    await apply_migrations(engine)
    primera = await _posiciones(engine)
    await apply_migrations(engine)
    segunda = await _posiciones(engine)

    assert primera == {2: 0, 1: 1, 3: 0}
    assert primera == segunda
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


async def _columna_is_provisional(engine) -> bool:
    """Si la tabla de proyectos tiene la columna is_provisional."""
    async with engine.begin() as conn:
        filas = (await conn.execute(text("PRAGMA table_info('projects')"))).all()
    return any(fila[1] == "is_provisional" for fila in filas)


async def _provisional(engine) -> dict[int, bool]:
    async with engine.begin() as conn:
        filas = (
            await conn.execute(
                text("SELECT id, is_provisional FROM projects ORDER BY id")
            )
        ).all()
    return {fila.id: bool(fila.is_provisional) for fila in filas}


async def test_la_migracion_anade_is_provisional_y_lo_rellena_en_falso(tmp_path):
    """Una base sin la columna la recibe y sus filas quedan no provisionales."""
    engine = create_engine(f"sqlite+aiosqlite:///{tmp_path / 'vieja.sqlite'}")
    await _crear_tablas(engine, con_color=False)
    await _insertar(
        engine, "projects", [(1, "Linea 1", None), (2, "Linea 2", None)], con_color=False
    )

    await apply_migrations(engine)

    assert await _columna_is_provisional(engine) is True
    assert await _provisional(engine) == {1: False, 2: False}
    # Aplicarla otra vez no toca la columna ni los valores.
    await apply_migrations(engine)
    assert await _columna_is_provisional(engine) is True
    assert await _provisional(engine) == {1: False, 2: False}
    await engine.dispose()
