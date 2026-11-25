"""Pruebas de los estados de tarea configurables por proyecto.

Cada proyecto tiene sus propios estados: el tablero, el Gantt y el resumen
los leen por su cuenta. La clave es inmutable y la migracion quita la
comprobacion de la tabla vieja para que las claves propias queden guardadas.
"""

from __future__ import annotations

import re
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.auth import hash_password
from backend.database import create_engine, get_db
from backend.main import app
from backend.migrations import apply_migrations
from backend.models import (
    Base,
    Project,
    ProjectMember,
    ProjectTaskStatus,
    Role,
    Task,
    User,
)

PASSWORD = "clave-de-prueba"

ESTADOS_POR_DEFECTO = [
    {"key": "backlog", "label": "Backlog", "color": "#57606a", "progress": 0},
    {
        "key": "in_progress",
        "label": "En Desarrollo",
        "color": "#1f6feb",
        "progress": 50,
    },
    {
        "key": "testing",
        "label": "Pruebas (FAT/SAT)",
        "color": "#bf8700",
        "progress": 75,
    },
    {"key": "done", "label": "Completado", "color": "#1a7f37", "progress": 100},
]


@pytest.fixture
async def client():
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with factory() as session:
            ids = await _seed(session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as http:
            http.ids = ids
            http.factory = factory
            yield http
    finally:
        app.dependency_overrides.pop(get_db, None)
    await engine.dispose()


async def _seed(session) -> dict[str, int]:
    ids: dict[str, int] = {}
    rol = Role(name="Lector", permissions_json=["capacity.read", "gantt.read"])
    session.add(rol)

    admin = User(
        name="Admin",
        email="admin@example.com",
        hashed_password=hash_password(PASSWORD),
        is_global_admin=True,
    )
    ingeniero = User(
        name="Ingeniero",
        email="ingeniero@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    lector = User(
        name="Lector",
        email="lector@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    ajeno = User(name="Ajeno", email="ajeno@example.com", hashed_password=hash_password(PASSWORD))
    proyecto = Project(name="Linea 1", status="active")
    otro = Project(name="Linea 2", status="active")
    session.add_all([rol, admin, ingeniero, lector, ajeno, proyecto, otro])
    await session.flush()

    session.add_all(
        [
            ProjectMember(
                user_id=ingeniero.id,
                project_id=proyecto.id,
                role_id=rol.id,
            ),
            ProjectMember(
                user_id=lector.id,
                project_id=proyecto.id,
                role_id=rol.id,
            ),
        ]
    )

    def _tarea(project_id: int, titulo: str, estado: str) -> Task:
        return Task(
            project_id=project_id,
            title=titulo,
            status=estado,
            start_date=date(2026, 3, 2),
            end_date=date(2026, 3, 6),
            estimated_hours=8,
        )

    tareas = {
        "tarea_a_backlog": _tarea(proyecto.id, "A: en la lista", "backlog"),
        "tarea_a_en_curso": _tarea(proyecto.id, "A: en desarrollo", "in_progress"),
        "tarea_a_pruebas": _tarea(proyecto.id, "A: en pruebas", "testing"),
        "tarea_a_hecha": _tarea(proyecto.id, "A: completada", "done"),
        "tarea_b_hecha": _tarea(otro.id, "B: completada", "done"),
    }
    session.add_all(tareas.values())
    await session.flush()

    ids.update(
        proyecto=proyecto.id,
        otro=otro.id,
        admin=admin.id,
        ingeniero=ingeniero.id,
        lector=lector.id,
        ajeno=ajeno.id,
    )
    ids.update({nombre: tarea.id for nombre, tarea in tareas.items()})
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _estados(payload: list[dict]) -> list[tuple[str, str, int]]:
    return [
        (estado["key"], estado["label"], estado["progress"]) for estado in payload
    ]


def _columnas(payload: dict) -> dict[str, list[dict]]:
    return {columna["status"]: columna["tasks"] for columna in payload["columns"]}


async def _estado(client: AsyncClient, headers, project_id: int, clave: str):
    filas = await client.get(f"/api/projects/{project_id}/task-statuses", headers=headers)
    assert filas.status_code == 200, filas.text
    return next(
        estado for estado in filas.json() if estado["key"] == clave
    )


async def test_un_nuevo_proyecto_recibe_los_cuatro_estados_por_defecto(client: AsyncClient):
    async with client.factory() as session:
        proyecto = Project(name="Recien creado", status="active")
        session.add(proyecto)
        await session.commit()
        filas = (
            (
                await session.execute(
                    select(ProjectTaskStatus)
                    .where(ProjectTaskStatus.project_id == proyecto.id)
                    .order_by(ProjectTaskStatus.order_index)
                )
            )
            .scalars()
            .all()
        )
    assert _estados(
        [
            {
                "key": fila.key,
                "label": fila.label,
                "color": fila.color,
                "progress": fila.progress,
            }
            for fila in filas
        ]
    ) == _estados(ESTADOS_POR_DEFECTO)


async def test_el_tablero_se_dibuja_con_los_estados_del_propio_proyecto(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")
    project_id = client.ids["proyecto"]
    response = await client.post(
        f"/api/projects/{project_id}/task-statuses",
        json={"label": "Revision", "progress": 90},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    assert response.json()["key"] == "revision"
    assert response.json()["order_index"] == 4

    tablero = await client.get(
        f"/api/projects/{project_id}/kanban", headers=headers
    )
    assert tablero.status_code == 200, tablero.text
    claves = [columna["status"] for columna in tablero.json()["columns"]]
    assert claves == ["backlog", "in_progress", "testing", "done", "revision"]

    # El otro proyecto se queda con sus cuatro por defecto.
    tablero_b = await client.get(
        f"/api/projects/{client.ids['otro']}/kanban", headers=headers
    )
    claves_b = [columna["status"] for columna in tablero_b.json()["columns"]]
    assert claves_b == ["backlog", "in_progress", "testing", "done"]


async def test_el_gantt_usa_el_avance_del_estado_de_su_proyecto(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    # En el proyecto 1, "done" pasa a significar "a punto de cerrar".
    done_a = await _estado(client, headers, client.ids["proyecto"], "done")
    response = await client.patch(
        f"/api/projects/{client.ids['proyecto']}/task-statuses/{done_a['id']}",
        json={"progress": 40},
        headers=headers,
    )
    assert response.status_code == 200, response.text

    gantt_a = await client.get(
        f"/api/projects/{client.ids['proyecto']}/gantt", headers=headers
    )
    assert gantt_a.status_code == 200, gantt_a.text
    barra_a = next(
        barra
        for barra in gantt_a.json()["tasks"]
        if barra["id"] == client.ids["tarea_a_hecha"]
    )
    assert barra_a["progress"] == 40

    gantt_b = await client.get(
        f"/api/projects/{client.ids['otro']}/gantt", headers=headers
    )
    barra_b = next(
        barra
        for barra in gantt_b.json()["tasks"]
        if barra["id"] == client.ids["tarea_b_hecha"]
    )
    assert barra_b["progress"] == 100


async def test_el_resumen_cuenta_completadas_por_el_avance_de_su_proyecto(
    client: AsyncClient,
):
    headers = await _auth(client, "admin@example.com")

    done_a = await _estado(client, headers, client.ids["proyecto"], "done")
    response = await client.patch(
        f"/api/projects/{client.ids['proyecto']}/task-statuses/{done_a['id']}",
        json={"progress": 100},
        headers=headers,
    )
    assert response.status_code == 200, response.text

    resumen = await client.get("/api/projects/summary", headers=headers)
    assert resumen.status_code == 200, resumen.text
    por_id = {item["id"]: item for item in resumen.json()}
    assert por_id[client.ids["proyecto"]]["tasks_done"] == 1
    assert por_id[client.ids["proyecto"]]["tasks_total"] == 4
    assert por_id[client.ids["otro"]]["tasks_done"] == 1

    # El avance vuelve al cien: la cuenta no cambia, pero el cambio del
    # avance si cuenta: con 99, la tarea ya no es "completada".
    response = await client.patch(
        f"/api/projects/{client.ids['proyecto']}/task-statuses/{done_a['id']}",
        json={"progress": 99},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    resumen = await client.get("/api/projects/summary", headers=headers)
    por_id = {item["id"]: item for item in resumen.json()}
    assert por_id[client.ids["proyecto"]]["tasks_done"] == 0


async def test_el_estado_con_clave_propia_queda_guardado(client: AsyncClient):
    """Sin la comprobacion vieja, una clave que no esta en la lista cerrada
    se guarda y se sirve en el tablero."""
    headers = await _auth(client, "admin@example.com")
    project_id = client.ids["proyecto"]

    response = await client.post(
        f"/api/projects/{project_id}/task-statuses",
        json={"label": "Puesta en marcha", "progress": 80},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    assert response.json()["key"] == "puesta_en_marcha"

    # El estado no esta en los valores por defecto: la tabla antigua lo
    # hacia fallar.
    async with client.factory() as session:
        filas = (
            await session.execute(
                text(
                    "SELECT key FROM task_statuses WHERE project_id = :pid "
                    "AND key = :clave"
                ),
                {"pid": project_id, "clave": "puesta_en_marcha"},
            )
        ).all()
        assert len(filas) == 1

    tarea = await client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Tarea con clave propia",
            "start_date": "2026-03-02",
            "end_date": "2026-03-06",
            "estimated_hours": "8",
        },
        headers=headers,
    )
    assert tarea.status_code == 201, tarea.text

    order = await client.put(
        f"/api/projects/{project_id}/tasks/order",
        json={
            "task_id": tarea.json()["id"],
            "status": "puesta_en_marcha",
            "task_ids": [tarea.json()["id"]],
        },
        headers=headers,
    )
    assert order.status_code == 200, order.text
    tablero = await client.get(f"/api/projects/{project_id}/kanban", headers=headers)
    columnas = _columnas(tablero.json())
    assert "puesta_en_marcha" in columnas
    assert any(t["id"] == tarea.json()["id"] for t in columnas["puesta_en_marcha"])


async def test_un_estado_desconocido_responde_422(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")
    project_id = client.ids["proyecto"]
    tarea_id = client.ids["tarea_a_backlog"]

    patch = await client.patch(
        f"/api/tasks/{tarea_id}",
        json={"status": "no_existe"},
        headers=headers,
    )
    assert patch.status_code == 422, patch.text

    order = await client.put(
        f"/api/projects/{project_id}/tasks/order",
        json={"task_id": tarea_id, "status": "no_existe", "task_ids": [tarea_id]},
        headers=headers,
    )
    assert order.status_code == 422, order.text


async def test_borrar_un_estado_con_tareas_exige_reasignacion(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")
    project_id = client.ids["proyecto"]
    estado = await _estado(client, headers, project_id, "testing")

    respuesta = await client.delete(
        f"/api/projects/{project_id}/task-statuses/{estado['id']}", headers=headers
    )
    assert respuesta.status_code == 409, respuesta.text
    assert "1" in respuesta.json()["detail"]


async def test_reasignar_mueve_las_tareas_y_recompone_la_columna(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")
    project_id = client.ids["proyecto"]

    # En "done" hay dos tareas: la propia y una mas, con posicion explicita.
    otra = await client.post(
        f"/api/projects/{project_id}/tasks",
        json={
            "title": "Otra completada",
            "start_date": "2026-03-02",
            "end_date": "2026-03-06",
            "estimated_hours": "2",
        },
        headers=headers,
    )
    assert otra.status_code == 201, otra.text
    await client.put(
        f"/api/projects/{project_id}/tasks/order",
        json={
            "task_id": otra.json()["id"],
            "status": "done",
            "task_ids": [otra.json()["id"], client.ids["tarea_a_hecha"]],
        },
        headers=headers,
    )

    testing = await _estado(client, headers, project_id, "testing")
    respuesta = await client.delete(
        f"/api/projects/{project_id}/task-statuses/{testing['id']}",
        params={"reassign_to": "done"},
        headers=headers,
    )
    assert respuesta.status_code == 204, respuesta.text

    tablero = await client.get(f"/api/projects/{project_id}/kanban", headers=headers)
    columnas = _columnas(tablero.json())
    done = columnas["done"]
    # Las tres tareas: la que estaba primero en done, la que llego tras ella,
    # y la que venia de testing al final.
    assert [t["id"] for t in done] == [
        otra.json()["id"],
        client.ids["tarea_a_hecha"],
        client.ids["tarea_a_pruebas"],
    ]
    assert [t["position"] for t in done] == [0, 1, 2]
    assert "testing" not in columnas


async def test_borrar_el_ultimo_estado_responde_409(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")
    project_id = client.ids["proyecto"]

    async with client.factory() as session:
        filas = (
            await session.execute(
                text("SELECT id FROM task_statuses WHERE project_id = :pid"),
                {"pid": project_id},
            )
        ).scalars().all()
        await session.execute(
            text("DELETE FROM task_statuses WHERE project_id = :pid AND id != :id"),
            {"pid": project_id, "id": filas[0]},
        )
        await session.commit()

    ultimo = await _estado(client, headers, project_id, "backlog")
    respuesta = await client.delete(
        f"/api/projects/{project_id}/task-statuses/{ultimo['id']}", headers=headers
    )
    assert respuesta.status_code == 409, respuesta.text


async def test_reasignar_a_si_mismo_o_a_una_clave_inexistente_responde_422(
    client: AsyncClient,
):
    headers = await _auth(client, "admin@example.com")
    project_id = client.ids["proyecto"]
    estado = await _estado(client, headers, project_id, "testing")

    mismo = await client.delete(
        f"/api/projects/{project_id}/task-statuses/{estado['id']}",
        params={"reassign_to": "testing"},
        headers=headers,
    )
    assert mismo.status_code == 422, mismo.text

    inexistente = await client.delete(
        f"/api/projects/{project_id}/task-statuses/{estado['id']}",
        params={"reassign_to": "no_existe"},
        headers=headers,
    )
    assert inexistente.status_code == 422, inexistente.text


async def test_solo_un_gestor_puede_configurar(client: AsyncClient):
    headers = await _auth(client, "ingeniero@example.com")
    project_id = client.ids["proyecto"]

    alta = await client.post(
        f"/api/projects/{project_id}/task-statuses",
        json={"label": "Nueva"},
        headers=headers,
    )
    assert alta.status_code == 403, alta.text

    estado = await _estado(client, headers, project_id, "backlog")
    edicion = await client.patch(
        f"/api/projects/{project_id}/task-statuses/{estado['id']}",
        json={"label": "Lista"},
        headers=headers,
    )
    assert edicion.status_code == 403, edicion.text

    orden = await client.put(
        f"/api/projects/{project_id}/task-statuses/order",
        json={"ids": [estado["id"]]},
        headers=headers,
    )
    assert orden.status_code == 403, orden.text

    borrado = await client.delete(
        f"/api/projects/{project_id}/task-statuses/{estado['id']}", headers=headers
    )
    assert borrado.status_code == 403, borrado.text


async def test_el_estado_de_otro_proyecto_responde_404(client: AsyncClient):
    """El identificador de un estado de otro proyecto no se edita por aqui."""
    headers = await _auth(client, "admin@example.com")
    estado = await _estado(client, headers, client.ids["proyecto"], "backlog")

    respuesta = await client.patch(
        f"/api/projects/{client.ids['otro']}/task-statuses/{estado['id']}",
        json={"label": "Ajen"},
        headers=headers,
    )
    assert respuesta.status_code == 404, respuesta.text


async def test_proyecto_inexistente_responde_404_en_los_cambios(client: AsyncClient):
    """Los endpoints de escritura responden 404 si el proyecto no existe, sin
    tocar nada: ni alta ni edicion ni orden ni borrado."""
    headers = await _auth(client, "admin@example.com")
    id_inexistente = 999999

    alta = await client.post(
        f"/api/projects/{id_inexistente}/task-statuses",
        json={"label": "Nueva"},
        headers=headers,
    )
    assert alta.status_code == 404, alta.text
    assert alta.json()["detail"] == "Proyecto no encontrado"

    edicion = await client.patch(
        f"/api/projects/{id_inexistente}/task-statuses/1",
        json={"label": "Lista"},
        headers=headers,
    )
    assert edicion.status_code == 404, edicion.text
    assert edicion.json()["detail"] == "Proyecto no encontrado"

    orden = await client.put(
        f"/api/projects/{id_inexistente}/task-statuses/order",
        json={"ids": [1, 2]},
        headers=headers,
    )
    assert orden.status_code == 404, orden.text
    assert orden.json()["detail"] == "Proyecto no encontrado"

    borrado = await client.delete(
        f"/api/projects/{id_inexistente}/task-statuses/1", headers=headers
    )
    assert borrado.status_code == 404, borrado.text
    assert borrado.json()["detail"] == "Proyecto no encontrado"


async def test_sin_token_no_hay_estados(client: AsyncClient):
    project_id = client.ids["proyecto"]
    respuesta = await client.get(f"/api/projects/{project_id}/task-statuses")
    assert respuesta.status_code == 401, respuesta.text
    respuesta = await client.get("/api/task-statuses")
    assert respuesta.status_code == 401, respuesta.text


async def test_un_ajeno_sin_participacion_no_lee(client: AsyncClient):
    headers = await _auth(client, "ajeno@example.com")
    project_id = client.ids["proyecto"]

    respuesta = await client.get(f"/api/projects/{project_id}/task-statuses", headers=headers)
    assert respuesta.status_code == 403, respuesta.text

    respuesta = await client.get("/api/task-statuses", headers=headers)
    assert respuesta.status_code == 200, respuesta.text
    assert str(project_id) not in respuesta.json()


async def test_el_reordenado_de_estados_cambia_el_tablero(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")
    project_id = client.ids["proyecto"]

    filas = await client.get(f"/api/projects/{project_id}/task-statuses", headers=headers)
    assert filas.status_code == 200, filas.text
    estados = filas.json()
    ids = [estado["id"] for estado in estados]
    respuesta = await client.put(
        f"/api/projects/{project_id}/task-statuses/order",
        json={"ids": [ids[-1]] + ids[:-1]},
        headers=headers,
    )
    assert respuesta.status_code == 204, respuesta.text

    tablero = await client.get(f"/api/projects/{project_id}/kanban", headers=headers)
    claves = [columna["status"] for columna in tablero.json()["columns"]]
    assert claves == ["done", "backlog", "in_progress", "testing"]


# --- Migracion: la tabla vieja lleva la comprobacion del estado. ---


def _viejo_ddl(check_estado: bool, con_position: bool = True) -> str:
    check = (
        ", CHECK (status IN ('backlog', 'in_progress', 'testing', 'done'))"
        if check_estado
        else ""
    )
    position = "position INTEGER NULL, " if con_position else ""
    return (
        "CREATE TABLE tasks (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, "
        "assigned_to INTEGER NULL, title VARCHAR(255) NOT NULL, "
        "status VARCHAR(32) NOT NULL, description TEXT NULL, start_date DATE NULL, "
        "end_date DATE NULL, estimated_hours NUMERIC(12, 2) NOT NULL, "
        f"{position}created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
        "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
        f"{check})"
    )


def _fila_vieja(id_: int, project_id: int, estado: str, position: int):
    return {
        "id": id_,
        "pid": project_id,
        "estado": estado,
        "position": position,
        "fecha": "2026-03-02",
    }


async def _base_vieja(engine, check_estado: bool, con_position: bool = True) -> None:
    def _crear(sync_conn):
        sync_conn.execute(
            text(
                "CREATE TABLE projects (id INTEGER PRIMARY KEY, "
                "name VARCHAR(255) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'active')"
            )
        )
        sync_conn.execute(
            text(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, "
                "email VARCHAR(255) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL)"
            )
        )
        sync_conn.execute(text(_viejo_ddl(check_estado, con_position)))
        sync_conn.execute(
            text(
                "CREATE TABLE task_statuses (id INTEGER PRIMARY KEY, "
                "project_id INTEGER NOT NULL, key VARCHAR(32) NOT NULL, "
                "label VARCHAR(60) NOT NULL, color VARCHAR(7) NULL, "
                "progress INTEGER NOT NULL, order_index INTEGER NOT NULL)"
            )
        )
        for tabla, columnas in (
            (
                "task_comments",
                "id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL "
                "REFERENCES tasks(id) ON DELETE CASCADE, author_id INTEGER NOT NULL, "
                "body TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
            ),
            (
                "task_checklist_items",
                "id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL "
                "REFERENCES tasks(id) ON DELETE CASCADE, label VARCHAR(255) NOT NULL, "
                "done BOOLEAN NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0, "
                "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
            ),
            (
                "time_entries",
                "id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL "
                "REFERENCES tasks(id) ON DELETE CASCADE, user_id INTEGER NOT NULL, "
                "work_date DATE NOT NULL, hours NUMERIC(12, 2) NOT NULL DEFAULT 0, "
                "note TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
            ),
            (
                "task_dependencies",
                "id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL "
                "REFERENCES tasks(id) ON DELETE CASCADE, depends_on_id INTEGER NOT NULL, "
                "type VARCHAR(16) NOT NULL, "
                "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
            ),
        ):
            sync_conn.execute(text(f"CREATE TABLE {tabla} ({columnas})"))
        for project_id in (1, 2):
            sync_conn.execute(
                text("INSERT INTO projects (id, name) VALUES (:id, :name)"),
                {"id": project_id, "name": f"Linea {project_id}"},
            )
        for id_, project_id, estado, position in (
            (1, 1, "backlog", 0),
            (2, 1, "done", 0),
            (3, 2, "testing", None),
        ):
            if con_position:
                sync_conn.execute(
                    text(
                        "INSERT INTO tasks "
                        "(id, project_id, assigned_to, title, status, description, "
                        "start_date, end_date, estimated_hours, position) "
                        "VALUES (:id, :pid, NULL, 'Tarea', :estado, NULL, :fecha, NULL, "
                        "8, :position)"
                    ),
                    _fila_vieja(id_, project_id, estado, position),
                )
            else:
                sync_conn.execute(
                    text(
                        "INSERT INTO tasks "
                        "(id, project_id, assigned_to, title, status, description, "
                        "start_date, end_date, estimated_hours) "
                        "VALUES (:id, :pid, NULL, 'Tarea', :estado, NULL, :fecha, NULL, 8)"
                    ),
                    {"id": id_, "pid": project_id, "estado": estado, "fecha": "2026-03-02"},
                )
        sync_conn.execute(
            text("INSERT INTO task_comments (task_id, author_id, body) VALUES (1, 1, 'Nota')")
        )

    async with engine.begin() as conn:
        await conn.run_sync(_crear)


async def _checks_estado(engine) -> list[str]:
    """Comprobaciones de la tabla `tasks` que restringen la columna `status`."""
    consulta = "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'"
    async with engine.begin() as conn:
        filas = (await conn.execute(text(consulta))).all()
    return [
        fila.sql
        for fila in filas
        if re.search(r"CHECK\s*\(\s*status\b", fila.sql or "", re.IGNORECASE)
    ]


async def test_la_migracion_quita_la_comprobacion_y_siembra_los_estados(
    tmp_path,
):
    """La tabla vieja con CHECK se recrea sin ella, las filas hijas sobreviven,
    los proyectos quedan sembrados y reejecutar no duplica nada."""
    engine = create_engine(f"sqlite+aiosqlite:///{tmp_path / 'vieja.sqlite'}")
    await _base_vieja(engine, check_estado=True)

    await apply_migrations(engine)
    await apply_migrations(engine)

    async with engine.begin() as conn:
        tareas = (
            await conn.execute(
                text(
                    "SELECT id, project_id, status, position FROM tasks ORDER BY id"
                )
            )
        ).all()
        comentarios = (await conn.execute(text("SELECT COUNT(*) FROM task_comments"))).scalar_one()
        estados = (
            await conn.execute(
                text(
                    "SELECT project_id, key, progress, order_index FROM task_statuses "
                    "ORDER BY project_id, order_index"
                )
            )
        ).all()

    assert [(fila.id, fila.project_id, fila.status, fila.position) for fila in tareas] == [
        (1, 1, "backlog", 0),
        (2, 1, "done", 0),
        (3, 2, "testing", 0),
    ]
    assert comentarios == 1
    assert not await _checks_estado(engine)
    assert [
        (fila.project_id, fila.key, fila.progress, fila.order_index)
        for fila in estados
    ] == [
        (1, "backlog", 0, 0),
        (1, "in_progress", 50, 1),
        (1, "testing", 75, 2),
        (1, "done", 100, 3),
        (2, "backlog", 0, 0),
        (2, "in_progress", 50, 1),
        (2, "testing", 75, 2),
        (2, "done", 100, 3),
    ]
    await engine.dispose()


async def test_la_migracion_no_toca_los_estados_que_ya_existien(tmp_path):
    """Un proyecto que ya tiene sus estados no recibe siembra: los suyos
    se quedan y no hay duplicados."""
    engine = create_engine(f"sqlite+aiosqlite:///{tmp_path / 'vieja.sqlite'}")
    await _base_vieja(engine, check_estado=True)
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO task_statuses "
                "(project_id, key, label, color, progress, order_index) "
                "VALUES (1, 'archivado', 'Archivado', NULL, 100, 4)"
            )
        )

    await apply_migrations(engine)

    async with engine.begin() as conn:
        claves = (
            await conn.execute(
                text(
                    "SELECT key FROM task_statuses WHERE project_id = 1 "
                    "ORDER BY order_index"
                )
            )
        ).scalars().all()
    assert list(claves) == ["archivado"]
    await engine.dispose()


async def test_la_recreacion_no_pierde_columna_que_falta_en_la_tabla_vieja(tmp_path):
    """Una columna que el modelo tiene y la tabla vieja no (position) se anade
    por la migracion, se rellena y la recreacion la copia sin reviente ni
    perder datos."""
    engine = create_engine(f"sqlite+aiosqlite:///{tmp_path / 'vieja.sqlite'}")
    await _base_vieja(engine, check_estado=True, con_position=False)

    await apply_migrations(engine)

    async with engine.begin() as conn:
        tareas = (
            await conn.execute(
                text(
                    "SELECT id, project_id, status, position FROM tasks "
                    "ORDER BY id"
                )
            )
        ).all()
        comentarios = (
            await conn.execute(text("SELECT COUNT(*) FROM task_comments"))
        ).scalar_one()

    assert [(fila.id, fila.project_id, fila.status, fila.position) for fila in tareas] == [
        (1, 1, "backlog", 0),
        (2, 1, "done", 0),
        (3, 2, "testing", 0),
    ]
    assert comentarios == 1
    assert not await _checks_estado(engine)
    await engine.dispose()
