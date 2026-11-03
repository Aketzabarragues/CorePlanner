"""Pruebas del endpoint de Gantt.

El foco es el control de acceso: el diagrama exige el permiso gantt.read
del proyecto, y un usuario de fuera del proyecto no lo ve.
"""

from __future__ import annotations

from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.auth import hash_password
from backend.database import create_engine, get_db
from backend.main import app
from backend.models import Base, Project, ProjectMember, Role, Task, TaskStatus, User

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
    reader = User(
        name="Reader",
        email="reader@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    outsider = User(
        name="Outsider",
        email="outsider@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    project = Project(name="Linea 1", status="active")
    session.add_all([admin, engineer, reader, outsider, project])
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

    task = Task(
        project_id=project.id,
        assigned_to=engineer.id,
        title="Programacion",
        status=TaskStatus.IN_PROGRESS.value,
        start_date=date(2026, 3, 5),
        end_date=date(2026, 3, 11),
        estimated_hours=40,
    )
    undated = Task(
        project_id=project.id,
        assigned_to=engineer.id,
        title="Sin fechas",
        status=TaskStatus.BACKLOG.value,
        start_date=None,
        end_date=None,
        estimated_hours=8,
    )
    session.add_all([task, undated])
    await session.flush()

    ids.update(
        project=project.id,
        admin=admin.id,
        engineer=engineer.id,
        reader=reader.id,
        outsider=outsider.id,
        task=task.id,
        undated=undated.id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_el_gantt_exige_token(client: AsyncClient):
    response = await client.get(f"/api/projects/{client.ids['project']}/gantt")

    assert response.status_code == 401, response.text


async def test_el_gantt_exige_permiso_en_el_proyecto(client: AsyncClient):
    headers = await _auth(client, "outsider@example.com")

    response = await client.get(f"/api/projects/{client.ids['project']}/gantt", headers=headers)

    assert response.status_code == 403, response.text


async def test_el_gantt_de_un_proyecto_inexistente_responde_404(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/projects/9999/gantt", headers=headers)

    assert response.status_code == 404, response.text


async def test_un_rol_de_solo_lectura_puede_ver_el_gantt(client: AsyncClient):
    headers = await _auth(client, "reader@example.com")

    response = await client.get(f"/api/projects/{client.ids['project']}/gantt", headers=headers)

    assert response.status_code == 200, response.text


async def test_el_gantt_devuelve_las_barras_del_proyecto(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await client.get(f"/api/projects/{client.ids['project']}/gantt", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    barras = data["tasks"]
    assert len(barras) == 1
    barra = barras[0]
    assert barra["id"] == client.ids["task"]
    assert barra["start"] == "2026-03-05"
    assert barra["end"] == "2026-03-11"
    assert barra["progress"] == 50
    assert barra["dependencies"] == ""
    assert "Engineer" in barra["name"]
    assert barra["custom_class"].startswith("persona-")


async def test_el_gantt_avisa_de_las_tareas_sin_fechas(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await client.get(f"/api/projects/{client.ids['project']}/gantt", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["undated_task_ids"] == [client.ids["undated"]]
    assert all(barra["id"] != client.ids["undated"] for barra in data["tasks"])


async def test_el_gantt_incluye_el_color_de_cada_persona(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await client.get(f"/api/projects/{client.ids['project']}/gantt", headers=headers)

    assert response.status_code == 200, response.text
    miembros = response.json()["members"]
    assert {m["user_id"] for m in miembros} == {
        client.ids["engineer"],
        client.ids["reader"],
    }
    assert all(m["css_class"].startswith("persona-") for m in miembros)
