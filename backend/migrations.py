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

from .models import DEFAULT_TASK_STATUSES, Base, NonWorkingDay, Task
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
    ("projects", "is_provisional", "BOOLEAN NOT NULL DEFAULT 0"),
    ("tasks", "position", "INTEGER NULL"),
)

COLOR_TABLES = ("departments", "projects")
"""Tablas cuyo color se reparte al migrar."""

NON_WORKING_DAYS_COLUMNS = ("id", "date", "name", "scope", "department_id", "user_id", "half_day")

TASK_CHILD_TABLES = {
    "task_comments": ("id", "task_id", "author_id", "body", "created_at"),
    "task_checklist_items": ("id", "task_id", "label", "done", "position", "created_at"),
    "time_entries": ("id", "task_id", "user_id", "work_date", "hours", "note", "created_at"),
    "task_dependencies": ("id", "task_id", "depends_on_id", "type", "created_at"),
}
"""Hijas de `tasks`, con sus columnas. Borrar la tabla padre las cascadea con la
integridad referencial activa, de modo que la recreacion las captura antes y
las restituye despues, en la misma transaccion."""


def _capturar_hijos_de_tasks(sync_conn, inspector) -> dict[str, list[tuple]]:
    """Filas de las hijas de `tasks`, por tabla, para restituir tras el borrado.

    Solo captura las tablas que existan en la base: `create_all` las crea antes
    de migrar, pero la migracion no depende de eso y no revienta si falta una.
    """
    existentes = set(inspector.get_table_names())
    capturados: dict[str, list[tuple]] = {}
    for tabla, columnas in TASK_CHILD_TABLES.items():
        if tabla not in existentes:
            continue
        filas = sync_conn.execute(text(f"SELECT {', '.join(columnas)} FROM {tabla}")).fetchall()
        capturados[tabla] = [tuple(fila) for fila in filas]
    return capturados


def _restaurar_hijos_de_tasks(sync_conn, capturados: dict[str, list[tuple]]) -> None:
    """Reescribe las filas capturadas de las hijas de `tasks`."""
    for tabla, columnas in TASK_CHILD_TABLES.items():
        filas = capturados.get(tabla, [])
        if not filas:
            continue
        marcadores = ", ".join(f":{columna}" for columna in columnas)
        for fila in filas:
            sync_conn.execute(
                text(
                    f"INSERT INTO {tabla} ({', '.join(columnas)}) "
                    f"VALUES ({marcadores})"
                ),
                dict(zip(columnas, fila, strict=True)),
            )


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


def _sembrar_estados_por_defecto(sync_conn) -> None:
    """Siembra los estados por defecto de los proyectos que no los tienen.

    Los proyectos creados antes de que los estados fueran configurables no
    tienen filas en `task_statuses`. Se les rellenan los cuatro por defecto,
    en su orden. Es idempotente: los proyectos que ya tienen estados no se
    tocan, de modo que reejecutar la migracion no duplica nada.
    """
    ids = [
        fila.id
        for fila in sync_conn.execute(
            text(
                "SELECT p.id FROM projects p "
                "WHERE NOT EXISTS ("
                "SELECT 1 FROM task_statuses t WHERE t.project_id = p.id)"
            )
        )
    ]
    for project_id in ids:
        for index, estado in enumerate(DEFAULT_TASK_STATUSES):
            sync_conn.execute(
                text(
                    "INSERT INTO task_statuses "
                    "(project_id, key, label, color, progress, order_index) "
                    "VALUES (:pid, :key, :label, :color, :progress, :order)"
                ),
                {
                    "pid": project_id,
                    "key": estado.key,
                    "label": estado.label,
                    "color": estado.color,
                    "progress": estado.progress,
                    "order": index,
                },
            )


def _recrear_tasks_sin_check_estado(sync_conn, inspector) -> None:
    """Recrea la tabla de tareas sin la comprobacion del estado.

    El estado de la tarea ahora es una clave por proyecto, no una lista
    cerrada, de modo que la comprobacion que lo restringia a los cuatro
    valores por defecto ya no vale. SQLite no permite quitar una comprobacion
    de una tabla existente, asi que se crea la nueva con el esquema del
    modelo, se copian las filas y se le cambia el nombre, como en la migracion
    de los dias no laborables.

    La decision se toma con el inspector: solo se recrea si alguna
    comprobacion de la tabla menciona la columna `status`. Las bases nuevas no
    pasan por aqui: las crea `create_all` con el esquema al dia.
    """
    checks = inspector.get_check_constraints("tasks")
    if not any("status" in (check.get("sqltext") or "") for check in checks):
        return

    # Borrar la tabla padre cascadea a las hijas con la integridad referencial
    # activa, de modo que se capturan antes del borrado y se restituyen al
    # final, en la misma transaccion.
    capturados = _capturar_hijos_de_tasks(sync_conn, inspector)

    # El indice `ix_tasks_project_assignee` lleva un nombre explicito en el
    # modelo, de modo que al crear la tabla nueva chocaria con el de la
    # antigua: en SQLite los nombres de indice son globales, no por tabla. Se
    # libera antes; la tabla nueva lo vuelve a llevar por el esquema del
    # modelo y el renombrado lo conserva sobre `tasks`.
    sync_conn.execute(text("DROP INDEX IF EXISTS ix_tasks_project_assignee"))

    destino = MetaData()
    for nombre in ("projects", "users"):
        Base.metadata.tables[nombre].to_metadata(destino)
    nueva = Task.__table__.to_metadata(destino, name="tasks_new")
    nueva.create(bind=sync_conn)

    # La copia lleva la interseccion de columnas, en el orden de la tabla
    # nueva: si el modelo gana una columna y la tabla vieja no la tiene, no se
    # copia y queda con su valor por defecto; si la tabla vieja lleva algo que
    # el modelo ya no, se descarta sin perder nada del modelo. La lista de
    # columnas se refleja de nuevo (no con el inspector de antes del ALTER):
    # `ConnectionInspector` cachea la reflecion y no veria la columna que la
    # alta de columnas acabo de anadir.
    viejas = {item["name"] for item in inspect(sync_conn).get_columns("tasks")}
    columnas = [col.name for col in nueva.columns if col.name in viejas]
    lista = ", ".join(columnas)
    sync_conn.execute(text(f"INSERT INTO tasks_new ({lista}) SELECT {lista} FROM tasks"))
    sync_conn.execute(text("DROP TABLE tasks"))
    sync_conn.execute(text("ALTER TABLE tasks_new RENAME TO tasks"))
    _restaurar_hijos_de_tasks(sync_conn, capturados)

    # Los indices por convencion salen con el sufijo `_new`; se devuelven a su
    # nombre. El explicito `ix_tasks_project_assignee` viaja con la tabla: al
    # crear `tasks_new` con el esquema del modelo ya lo lleva y el renombrado
    # lo conserva sobre `tasks`.
    sync_conn.execute(text("DROP INDEX IF EXISTS ix_tasks_new_project_id"))
    sync_conn.execute(text("CREATE INDEX ix_tasks_project_id ON tasks (project_id)"))
    sync_conn.execute(text("DROP INDEX IF EXISTS ix_tasks_new_assigned_to"))
    sync_conn.execute(text("CREATE INDEX ix_tasks_assigned_to ON tasks (assigned_to)"))


def _backfill_task_positions(sync_conn) -> None:
    """Rellena `tasks.position` solo en las filas que no la tienen.

    A cada columna de tablero (proyecto + estado) se le asignan los indices
    libres, continuando desde el maximo que ya tiene, y las filas se visitan
    en el orden (start_date, id). La operacion es idempotente: las filas que
    ya tienen posicion no se tocan ni se reordenan, de modo que reejecutar la
    migracion no mueve nada.
    """
    rows = sync_conn.execute(
        text(
            "SELECT id, project_id, status, position, start_date FROM tasks "
            "ORDER BY project_id, status, start_date, id"
        )
    ).all()

    proximo = {}
    for row in rows:
        if row.position is None:
            continue
        columna = (row.project_id, row.status)
        proximo[columna] = max(proximo.get(columna, -1), row.position) + 1

    for row in rows:
        if row.position is not None:
            continue
        columna = (row.project_id, row.status)
        indice = proximo.get(columna, 0)
        proximo[columna] = indice + 1
        sync_conn.execute(
            text("UPDATE tasks SET position = :position WHERE id = :id"),
            {"position": indice, "id": row.id},
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
        if "tasks" in tables and "position" in columnas["tasks"]:
            _backfill_task_positions(sync_conn)
        _migrate_non_working_days(sync_conn, tables, inspector)
        # La recreacion de `tasks` copia todas sus columnas, asi que va tras
        # las altas de columnas y el relleno de posiciones.
        if "tasks" in tables:
            _recrear_tasks_sin_check_estado(sync_conn, inspector)
        if "task_statuses" in tables and "projects" in tables:
            _sembrar_estados_por_defecto(sync_conn)

    async with engine.begin() as conn:
        await conn.run_sync(_migrate)
