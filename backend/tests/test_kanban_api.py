"""Pruebas del endpoint del tablero Kanban.

El foco es el control de acceso y el reparto en columnas: mover una tarea de
estado se hace con un PATCH y la tarjeta cambia de columna.
"""

from __future__ import annotations

from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.auth import hash_password
from backend.database import create_engine, get_db
from backend.main import app
from backend.models import (
    Base,
    Project,
    ProjectMember,
    Role,
    Task,
    TaskStatus,
    User,
)

PASSWORD = "clave-de-prueba"

ROLES = {
    "Project Manager": ["capacity.read", "gantt.read", "task.write", "member.manage"],
    "Ingeniero": ["capacity.read", "gantt.read", "task.write"],
    "Lector": ["capacity.read", "gantt.read"],
}


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
    roles: dict[str, Role] = {}
    for name, permissions in ROLES.items():
        role = Role(name=name, permissions_json=permissions)
        session.add(role)
        roles[name] = role

    admin = User(
        name="Admin",
        email="admin@example.com",
        hashed_password=hash_password(PASSWORD),
        is_global_admin=True,
    )
    engineer = User(
        name="Engineer",
        email="engineer@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    outsider = User(
        name="Outsider",
        email="outsider@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    reader = User(
        name="Reader",
        email="reader@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    project = Project(name="Linea 1", status="active")
    otro = Project(name="Linea 2", status="active")
    session.add_all([admin, engineer, outsider, reader, project, otro])
    await session.flush()

    session.add_all(
        [
            ProjectMember(
                user_id=engineer.id,
                project_id=project.id,
                role_id=roles["Ingeniero"].id,
            ),
            ProjectMember(
                user_id=reader.id,
                project_id=project.id,
                role_id=roles["Lector"].id,
            ),
        ]
    )

    session.add_all(
        [
            Task(
                project_id=project.id,
                assigned_to=engineer.id,
                title="Pendiente",
                status=TaskStatus.BACKLOG.value,
                start_date=date(2026, 3, 5),
                end_date=date(2026, 3, 6),
                estimated_hours=8,
            ),
            Task(
                project_id=project.id,
                assigned_to=engineer.id,
                title="En curso",
                status=TaskStatus.IN_PROGRESS.value,
                start_date=date(2026, 3, 5),
                end_date=date(2026, 3, 11),
                estimated_hours=40,
            ),
            Task(
                project_id=project.id,
                title="Sin persona",
                status=TaskStatus.TESTING.value,
                start_date=date(2026, 3, 5),
                end_date=date(2026, 3, 11),
                estimated_hours=4,
            ),
        ]
    )
    await session.flush()

    otra_tarea = Task(
        project_id=otro.id,
        title="Del otro proyecto",
        status=TaskStatus.BACKLOG.value,
        start_date=date(2026, 3, 5),
        end_date=date(2026, 3, 6),
        estimated_hours=2,
    )
    session.add(otra_tarea)
    await session.flush()

    ids.update(
        project=project.id,
        otro_project=otro.id,
        otra_tarea=otra_tarea.id,
        admin=admin.id,
        engineer=engineer.id,
        outsider=outsider.id,
        reader=reader.id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_el_tablero_exige_token(client: AsyncClient):
    response = await client.get(f"/api/projects/{client.ids['project']}/kanban")

    assert response.status_code == 401, response.text


async def test_el_tablero_exige_permiso_en_el_proyecto(client: AsyncClient):
    headers = await _auth(client, "outsider@example.com")

    response = await client.get(f"/api/projects/{client.ids['project']}/kanban", headers=headers)

    assert response.status_code == 403, response.text


async def test_el_tablero_de_un_proyecto_inexistente_responde_404(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/projects/9999/kanban", headers=headers)

    assert response.status_code == 404, response.text


async def test_el_tablero_tiene_las_cuatro_columnas(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await client.get(f"/api/projects/{client.ids['project']}/kanban", headers=headers)

    assert response.status_code == 200, response.text
    columnas = response.json()["columns"]
    assert [columna["status"] for columna in columnas] == [
        "backlog",
        "in_progress",
        "testing",
        "done",
    ]
    assert columnas[3]["tasks"] == []


async def test_cada_tarea_aparece_en_su_columna(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await client.get(f"/api/projects/{client.ids['project']}/kanban", headers=headers)

    columnas = {c["status"]: c["tasks"] for c in response.json()["columns"]}
    assert [t["title"] for t in columnas["backlog"]] == ["Pendiente"]
    assert [t["title"] for t in columnas["in_progress"]] == ["En curso"]
    assert [t["title"] for t in columnas["testing"]] == ["Sin persona"]


async def test_la_tarjeta_lleva_el_nombre_y_las_horas(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await client.get(f"/api/projects/{client.ids['project']}/kanban", headers=headers)

    columnas = {c["status"]: c["tasks"] for c in response.json()["columns"]}
    tarjeta = columnas["in_progress"][0]
    assert tarjeta["assigned_name"] == "Engineer"
    assert tarjeta["estimated_hours"] == 40
    assert tarjeta["start_date"] == "2026-03-05"
    assert tarjeta["end_date"] == "2026-03-11"


async def test_cambiar_el_estado_mueve_la_tarjeta_de_columna(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    tablero = await client.get(
        f"/api/projects/{client.ids['project']}/kanban", headers=headers
    )
    columnas = {c["status"]: c["tasks"] for c in tablero.json()["columns"]}
    tarea = columnas["backlog"][0]

    cambio = await client.patch(
        f"/api/tasks/{tarea['id']}", headers=headers, json={"status": "done"}
    )
    assert cambio.status_code == 200, cambio.text
    assert cambio.json()["status"] == "done"

    tablero = await client.get(
        f"/api/projects/{client.ids['project']}/kanban", headers=headers
    )
    columnas = {c["status"]: c["tasks"] for c in tablero.json()["columns"]}
    assert columnas["backlog"] == []
    assert [t["title"] for t in columnas["done"]] == ["Pendiente"]


async def test_un_estado_desconocido_responde_422(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    tablero = await client.get(
        f"/api/projects/{client.ids['project']}/kanban", headers=headers
    )
    columnas = {c["status"]: c["tasks"] for c in tablero.json()["columns"]}
    tarea = columnas["backlog"][0]

    response = await client.patch(
        f"/api/tasks/{tarea['id']}", headers=headers, json={"status": "inventado"}
    )

    assert response.status_code == 422, response.text


async def test_un_lector_ve_el_tablero_pero_no_mueve_tareas(client: AsyncClient):
    headers = await _auth(client, "reader@example.com")

    tablero = await client.get(
        f"/api/projects/{client.ids['project']}/kanban", headers=headers
    )
    assert tablero.status_code == 200, tablero.text
    columnas = {c["status"]: c["tasks"] for c in tablero.json()["columns"]}
    tarea = columnas["backlog"][0]

    response = await client.patch(
        f"/api/tasks/{tarea['id']}", headers=headers, json={"status": "done"}
    )

    assert response.status_code == 403, response.text


async def test_las_columnas_del_tablero_llevan_contador_y_horas_estimadas(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await client.get(f"/api/projects/{client.ids['project']}/kanban", headers=headers)

    assert response.status_code == 200, response.text
    por_columna = {c["status"]: c for c in response.json()["columns"]}
    assert por_columna["backlog"]["task_count"] == 1
    assert por_columna["backlog"]["estimated_hours"] == 8
    assert por_columna["in_progress"]["task_count"] == 1
    assert por_columna["in_progress"]["estimated_hours"] == 40
    assert por_columna["testing"]["task_count"] == 1
    assert por_columna["testing"]["estimated_hours"] == 4
    assert por_columna["done"]["task_count"] == 0
    assert por_columna["done"]["estimated_hours"] == 0


async def _columna(client: AsyncClient, headers: dict, estado: str) -> list[dict]:
    response = await client.get(
        f"/api/projects/{client.ids['project']}/kanban", headers=headers
    )
    assert response.status_code == 200, response.text
    por_columna = {c["status"]: c for c in response.json()["columns"]}
    return por_columna[estado]["tasks"]


async def test_ordenar_mueve_la_tarea_y_deja_la_columna_en_el_orden_pedido(
    client: AsyncClient,
):
    headers = await _auth(client, "engineer@example.com")

    backlog = await _columna(client, headers, "backlog")
    testing = await _columna(client, headers, "testing")
    en_curso = await _columna(client, headers, "in_progress")
    pendiente = backlog[0]
    sin_persona = testing[0]
    curso = en_curso[0]

    # Mover "Pendiente" a testing y ponerla entre "Sin persona" y el resto:
    # el orden pedido manda y la tarea movida toma su sitio.
    body = {
        "task_id": pendiente["id"],
        "status": "testing",
        "task_ids": [sin_persona["id"], pendiente["id"]],
    }
    response = await client.put(
        f"/api/projects/{client.ids['project']}/tasks/order",
        headers=headers,
        json=body,
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "testing"

    testing = await _columna(client, headers, "testing")
    assert [t["title"] for t in testing] == ["Sin persona", "Pendiente"]
    assert [t["position"] for t in testing] == [0, 1]
    assert await _columna(client, headers, "backlog") == []

    # La lista solo lleva la tarea movida: "Sin persona" queda detras, en su
    # orden actual, y la columna sigue con posiciones 0..n-1.
    response = await client.put(
        f"/api/projects/{client.ids['project']}/tasks/order",
        headers=headers,
        json={"task_id": pendiente["id"], "status": "testing", "task_ids": [pendiente["id"]]},
    )
    assert response.status_code == 200, response.text

    testing = await _columna(client, headers, "testing")
    assert [t["title"] for t in testing] == ["Pendiente", "Sin persona"]
    assert [t["position"] for t in testing] == [0, 1]

    # La tarea de otra columna no la han tocado las operaciones.
    assert [t["id"] for t in await _columna(client, headers, "in_progress")] == [
        curso["id"]
    ]


async def test_ordenar_pone_posiciones_continuas_en_toda_la_columna(client: AsyncClient):
    """Con la columna completa en la lista, las posiciones salen 0..n-1."""
    headers = await _auth(client, "engineer@example.com")

    testing = await _columna(client, headers, "testing")
    curso = (await _columna(client, headers, "in_progress"))[0]

    # "Sin persona" (testing) viaja a in_progress con su lista completa:
    # in_progress pasa a tener dos tarjetas con posiciones 0 y 1.
    body = {
        "task_id": testing[0]["id"],
        "status": "in_progress",
        "task_ids": [curso["id"], testing[0]["id"]],
    }
    response = await client.put(
        f"/api/projects/{client.ids['project']}/tasks/order",
        headers=headers,
        json=body,
    )
    assert response.status_code == 200, response.text

    in_progress = await _columna(client, headers, "in_progress")
    assert [t["title"] for t in in_progress] == ["En curso", "Sin persona"]
    assert [t["position"] for t in in_progress] == [0, 1]

    # La lista solo lleva "En curso": "Sin persona" queda detras, en su orden
    # actual, sin huecos ni repeticiones.
    response = await client.put(
        f"/api/projects/{client.ids['project']}/tasks/order",
        headers=headers,
        json={"task_id": curso["id"], "status": "in_progress", "task_ids": [curso["id"]]},
    )
    assert response.status_code == 200, response.text

    in_progress = await _columna(client, headers, "in_progress")
    assert [t["title"] for t in in_progress] == ["En curso", "Sin persona"]


async def test_ordenar_responde_422_con_identificadores_de_otro_proyecto(
    client: AsyncClient,
):
    headers = await _auth(client, "engineer@example.com")
    backlog = (await _columna(client, headers, "backlog"))[0]

    response = await client.put(
        f"/api/projects/{client.ids['project']}/tasks/order",
        headers=headers,
        json={
            "task_id": backlog["id"],
            "status": "backlog",
            "task_ids": [backlog["id"], client.ids["otra_tarea"]],
        },
    )

    assert response.status_code == 422, response.text


async def test_ordenar_responde_422_con_identificadores_repetidos(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")
    backlog = (await _columna(client, headers, "backlog"))[0]

    response = await client.put(
        f"/api/projects/{client.ids['project']}/tasks/order",
        headers=headers,
        json={"task_id": backlog["id"], "status": "backlog", "task_ids": [backlog["id"] * 2]},
    )

    assert response.status_code == 422, response.text


async def test_ordenar_responde_404_con_una_tarea_inexistente(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await client.put(
        f"/api/projects/{client.ids['project']}/tasks/order",
        headers=headers,
        json={"task_id": 9999, "status": "backlog", "task_ids": [9999]},
    )

    assert response.status_code == 404, response.text


async def test_ordenar_responde_404_con_una_tarea_de_otro_proyecto(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await client.put(
        f"/api/projects/{client.ids['project']}/tasks/order",
        headers=headers,
        json={
            "task_id": client.ids["otra_tarea"],
            "status": "backlog",
            "task_ids": [client.ids["otra_tarea"]],
        },
    )

    assert response.status_code == 404, response.text


async def test_ordenar_exige_permiso_de_escritura(client: AsyncClient):
    headers = await _auth(client, "reader@example.com")
    backlog = (await _columna(client, headers, "backlog"))[0]

    response = await client.put(
        f"/api/projects/{client.ids['project']}/tasks/order",
        headers=headers,
        json={"task_id": backlog["id"], "status": "backlog", "task_ids": [backlog["id"]]},
    )

    assert response.status_code == 403, response.text


async def test_ordenar_responde_404_si_el_proyecto_no_existe(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.put(
        "/api/projects/9999/tasks/order",
        headers=headers,
        json={"task_id": 1, "status": "backlog", "task_ids": [1]},
    )

    assert response.status_code == 404, response.text


async def test_ordenar_escribe_la_entrada_en_la_bitacora(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")
    backlog = (await _columna(client, headers, "backlog"))[0]

    response = await client.put(
        f"/api/projects/{client.ids['project']}/tasks/order",
        headers=headers,
        json={
            "task_id": backlog["id"],
            "status": "in_progress",
            "task_ids": [backlog["id"]],
        },
    )
    assert response.status_code == 200, response.text

    bitacora = await client.get(
        "/api/activity",
        params={"project_id": client.ids["project"]},
        headers=headers,
    )
    assert bitacora.status_code == 200, bitacora.text
    entradas = bitacora.json()["items"]
    entrada = next(
        (item for item in entradas if item["action"] == "task.ordered"), None
    )
    assert entrada is not None
    assert entrada["entity_id"] == backlog["id"]
    cambios = entrada["payload"]["changes"]
    assert cambios["status"] == {"from": "backlog", "to": "in_progress"}
    assert cambios["position"]["to"] == 0


async def test_el_tablero_ordena_por_position_y_deja_las_sin_position_al_final(
    client: AsyncClient,
):
    """Las tareas con posicion van primero, en su orden; las que no, al final
    por (start_date, id)."""
    project_id = client.ids["project"]
    async with client.factory() as session:
        session.add_all(
            [
                Task(
                    id=90,
                    project_id=project_id,
                    title="Sin position, fecha tardia",
                    status=TaskStatus.TESTING.value,
                    start_date=date(2026, 4, 1),
                    end_date=date(2026, 4, 2),
                    estimated_hours=1,
                ),
                Task(
                    id=91,
                    project_id=project_id,
                    title="Con position, va al final",
                    status=TaskStatus.TESTING.value,
                    start_date=date(2026, 4, 3),
                    end_date=date(2026, 4, 4),
                    estimated_hours=1,
                    position=9,
                ),
                Task(
                    id=92,
                    project_id=project_id,
                    title="Con position, va al principio",
                    status=TaskStatus.TESTING.value,
                    start_date=date(2026, 4, 5),
                    end_date=date(2026, 4, 6),
                    estimated_hours=1,
                    position=0,
                ),
                Task(
                    id=93,
                    project_id=project_id,
                    title="Sin position, id menor",
                    status=TaskStatus.TESTING.value,
                    start_date=date(2026, 4, 2),
                    end_date=date(2026, 4, 3),
                    estimated_hours=1,
                ),
            ]
        )
        await session.commit()

    headers = await _auth(client, "engineer@example.com")
    testing = await _columna(client, headers, "testing")

    # Grupo con position primero, en su orden; luego las que no la tienen,
    # por (start_date, id): "Sin persona" (id 3) entra antes que las de abril.
    assert [t["title"] for t in testing] == [
        "Con position, va al principio",
        "Con position, va al final",
        "Sin persona",
        "Sin position, fecha tardia",
        "Sin position, id menor",
    ]
    assert [t["position"] for t in testing] == [0, 9, None, None, None]
