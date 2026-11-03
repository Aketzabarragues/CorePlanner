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
    session.add_all([admin, engineer, outsider, reader, project])
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

    ids.update(
        project=project.id,
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
