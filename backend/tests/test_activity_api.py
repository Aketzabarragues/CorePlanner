"""Pruebas de la bitacora de cambios.

La bitacora registra lo que muta: alta, edicion y movimiento de tareas, alta y
baja de miembros y cambios en los ajustes del proyecto. No registra lecturas.
Quien no ve un proyecto no ve su bitacora: ni sus entradas ni siquiera el
proyecto en si.
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

    gerente = User(
        name="Gerente",
        email="gerente@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role="gerente",
    )
    manager = User(
        name="Manager",
        email="manager@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    engineer = User(
        name="Ingeniero",
        email="engineer@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    reader = User(
        name="Lector",
        email="reader@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    outsider = User(
        name="Ajeno",
        email="outsider@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    primera = Project(name="Linea 1", status="active")
    segunda = Project(name="Linea 2", status="active")
    session.add_all([gerente, manager, engineer, reader, outsider, primera, segunda])
    await session.flush()

    session.add_all(
        [
            ProjectMember(
                user_id=manager.id,
                project_id=primera.id,
                role_id=roles["Project Manager"].id,
            ),
            ProjectMember(
                user_id=engineer.id,
                project_id=primera.id,
                role_id=roles["Ingeniero"].id,
            ),
            ProjectMember(
                user_id=reader.id,
                project_id=primera.id,
                role_id=roles["Lector"].id,
            ),
        ]
    )

    task = Task(
        project_id=primera.id,
        assigned_to=engineer.id,
        title="Programacion",
        status=TaskStatus.BACKLOG.value,
        start_date=date(2026, 3, 5),
        end_date=date(2026, 3, 11),
        estimated_hours=40,
    )
    session.add(task)
    await session.flush()

    ids.update(
        primera=primera.id,
        segunda=segunda.id,
        gerente=gerente.id,
        manager=manager.id,
        engineer=engineer.id,
        reader=reader.id,
        outsider=outsider.id,
        task=task.id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _entradas(client: AsyncClient, email: str, **params) -> list[dict]:
    headers = await _auth(client, email)
    response = await client.get("/api/activity", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["items"]


NEW_TASK = {
    "title": "Puesta en marcha",
    "start_date": "2026-03-09",
    "end_date": "2026-03-11",
    "estimated_hours": "12.00",
}


async def test_crear_una_tarea_deja_entrada_en_la_bitacora(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    await client.post(
        "/api/projects/1/tasks",
        json={**NEW_TASK, "assigned_to": client.ids["engineer"]},
        headers=headers,
    )

    entradas = await _entradas(client, "manager@example.com")
    assert len(entradas) == 1
    entrada = entradas[0]
    assert entrada["action"] == "task.created"
    assert entrada["entity_type"] == "task"
    assert entrada["actor_name"] == "Manager"
    assert entrada["project_id"] == client.ids["primera"]
    assert entrada["payload"]["title"] == "Puesta en marcha"


async def test_mover_una_tarea_deja_el_movimiento(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    await client.patch(
        f"/api/tasks/{client.ids['task']}",
        json={"status": "in_progress"},
        headers=headers,
    )

    entradas = await _entradas(client, "manager@example.com")
    assert len(entradas) == 1
    assert entradas[0]["action"] == "task.moved"
    assert entradas[0]["payload"]["from"] == "backlog"
    assert entradas[0]["payload"]["to"] == "in_progress"


async def test_editar_una_tarea_deja_el_cambio(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    await client.patch(
        f"/api/tasks/{client.ids['task']}",
        json={"title": "Programacion del PLC"},
        headers=headers,
    )

    entradas = await _entradas(client, "manager@example.com")
    assert len(entradas) == 1
    assert entradas[0]["action"] == "task.updated"
    cambios = entradas[0]["payload"]["changes"]
    assert cambios["title"]["from"] == "Programacion"
    assert cambios["title"]["to"] == "Programacion del PLC"


async def test_alta_y_baja_de_miembro_quedan_registradas(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    await client.post(
        "/api/projects/1/members",
        json={"user_id": client.ids["outsider"], "role_id": 2},
        headers=headers,
    )
    await client.delete(
        f"/api/projects/1/members/{client.ids['outsider']}",
        headers=headers,
    )

    entradas = await _entradas(client, "gerente@example.com")
    acciones = [entrada["action"] for entrada in entradas]
    assert acciones == ["member.removed", "member.added"]
    assert entradas[0]["payload"]["name"] == "Ajeno"


async def test_los_cambios_del_proyecto_quedan_registrados(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    await client.patch(
        f"/api/projects/{client.ids['primera']}",
        json={"status": "on_hold"},
        headers=headers,
    )

    entradas = await _entradas(client, "gerente@example.com")
    assert len(entradas) == 1
    assert entradas[0]["action"] == "project.updated"
    assert entradas[0]["payload"]["changes"]["status"] == {
        "from": "active",
        "to": "on_hold",
    }


async def test_leer_no_registra_nada(client: AsyncClient):
    await _entradas(client, "manager@example.com")

    headers = await _auth(client, "manager@example.com")
    await client.get("/api/projects/1/tasks", headers=headers)
    await client.get("/api/capacity", headers=headers)
    await client.get("/api/projects/1/kanban", headers=headers)

    assert await _entradas(client, "manager@example.com") == []


async def test_quien_no_ve_el_proyecto_no_ve_su_bitacora(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")
    await client.post(
        "/api/projects/1/tasks",
        json=NEW_TASK,
        headers=headers,
    )

    entradas = await _entradas(client, "outsider@example.com")
    assert entradas == []

    headers = await _auth(client, "outsider@example.com")
    response = await client.get(
        "/api/activity", params={"project_id": client.ids["primera"]}, headers=headers
    )
    assert response.status_code == 404
    assert "no esta entre los que puedes ver" in response.json()["detail"]


async def test_la_bitacora_global_trae_los_proyectos_visibles(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    await client.post(
        "/api/projects/1/tasks",
        json=NEW_TASK,
        headers=headers,
    )
    await client.post(
        "/api/projects/2/tasks",
        json=NEW_TASK,
        headers=headers,
    )

    entradas = await _entradas(client, "gerente@example.com")
    assert {entrada["project_id"] for entrada in entradas} == {
        client.ids["primera"],
        client.ids["segunda"],
    }

    # El tecnico solo ve el proyecto del que es miembro.
    entradas = await _entradas(client, "engineer@example.com")
    assert {entrada["project_id"] for entrada in entradas} == {client.ids["primera"]}


async def test_el_filtro_de_proyecto_acota_la_bitacora(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    await client.post(
        "/api/projects/1/tasks",
        json=NEW_TASK,
        headers=headers,
    )
    await client.post(
        "/api/projects/2/tasks",
        json=NEW_TASK,
        headers=headers,
    )

    entradas = await _entradas(
        client, "gerente@example.com", project_id=client.ids["primera"]
    )
    assert len(entradas) == 1
    assert entradas[0]["project_id"] == client.ids["primera"]


async def test_las_entradas_van_de_la_mas_nueva_a_la_mas_vieja(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")
    await client.post(
        "/api/projects/1/tasks",
        json={**NEW_TASK, "title": "Primera"},
        headers=headers,
    )
    await client.patch(
        f"/api/tasks/{client.ids['task']}",
        json={"status": "in_progress"},
        headers=headers,
    )
    await client.patch(
        f"/api/tasks/{client.ids['task']}",
        json={"status": "done"},
        headers=headers,
    )

    entradas = await _entradas(client, "manager@example.com")
    assert [entrada["action"] for entrada in entradas] == [
        "task.moved",
        "task.moved",
        "task.created",
    ]


async def test_la_paginacion_devuelve_el_total(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")
    await client.post(
        "/api/projects/1/tasks",
        json={**NEW_TASK, "title": "Primera"},
        headers=headers,
    )
    await client.patch(
        f"/api/tasks/{client.ids['task']}",
        json={"status": "in_progress"},
        headers=headers,
    )

    headers = await _auth(client, "manager@example.com")
    response = await client.get(
        "/api/activity", params={"limit": 1, "offset": 0}, headers=headers
    )
    assert response.status_code == 200, response.text
    pagina = response.json()
    assert pagina["total"] == 2
    assert pagina["limit"] == 1
    assert pagina["offset"] == 0
    assert len(pagina["items"]) == 1

    response = await client.get(
        "/api/activity", params={"limit": 1, "offset": 1}, headers=headers
    )
    assert len(response.json()["items"]) == 1
    assert response.json()["items"][0]["id"] != pagina["items"][0]["id"]


async def test_la_bitacora_exige_sesion(client: AsyncClient):
    response = await client.get("/api/activity")

    assert response.status_code == 401
