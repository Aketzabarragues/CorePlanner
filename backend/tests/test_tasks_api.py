"""Pruebas del CRUD de tareas y del listado de miembros.

El foco es el control de acceso: un rol de solo lectura no puede crear,
modificar ni borrar tareas, y las validaciones de datos se aplican siempre.
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
    manager = User(
        name="Manager",
        email="manager@example.com",
        hashed_password=hash_password(PASSWORD),
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
    session.add_all([admin, manager, engineer, reader, outsider, project])
    await session.flush()

    session.add_all(
        [
            ProjectMember(
                user_id=manager.id, project_id=project.id, role_id=roles["Project Manager"].id
            ),
            ProjectMember(
                user_id=engineer.id, project_id=project.id, role_id=roles["Ingeniero"].id
            ),
            ProjectMember(
                user_id=reader.id, project_id=project.id, role_id=roles["Lector"].id
            ),
        ]
    )

    task = Task(
        project_id=project.id,
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
        project=project.id,
        admin=admin.id,
        manager=manager.id,
        engineer=engineer.id,
        reader=reader.id,
        outsider=outsider.id,
        task=task.id,
    )
    await session.commit()
    return ids


async def _token(client: AsyncClient, email: str) -> str:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    token = await _token(client, email)
    return {"Authorization": f"Bearer {token}"}


NEW_TASK = {
    "title": "Puesta en marcha",
    "start_date": "2026-03-09",
    "end_date": "2026-03-11",
    "estimated_hours": "12.00",
}


async def test_crear_tarea_con_permiso(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.post(
        "/api/projects/1/tasks",
        json={**NEW_TASK, "assigned_to": client.ids["engineer"]},
        headers=headers,
    )

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["title"] == "Puesta en marcha"
    assert data["assigned_to"] == client.ids["engineer"]
    assert data["estimated_hours"] == 12.0
    assert data["status"] == "backlog"


async def test_crear_tarea_sin_permiso_responde_403(client: AsyncClient):
    headers = await _auth(client, "reader@example.com")

    response = await client.post("/api/projects/1/tasks", json=NEW_TASK, headers=headers)

    assert response.status_code == 403
    assert "task.write" in response.json()["detail"]


async def test_crear_tarea_sin_token_responde_401(client: AsyncClient):
    response = await client.post("/api/projects/1/tasks", json=NEW_TASK)

    assert response.status_code == 401


async def test_no_miembro_no_crea_tareas(client: AsyncClient):
    headers = await _auth(client, "outsider@example.com")

    response = await client.post("/api/projects/1/tasks", json=NEW_TASK, headers=headers)

    assert response.status_code == 403


async def test_no_se_puede_asignar_a_quien_no_es_miembro(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.post(
        "/api/projects/1/tasks",
        json={**NEW_TASK, "assigned_to": client.ids["outsider"]},
        headers=headers,
    )

    assert response.status_code == 422
    assert "no es miembro" in response.json()["detail"]


async def test_no_se_puede_crear_una_tarea_solo_de_fin_de_semana(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.post(
        "/api/projects/1/tasks",
        json={**NEW_TASK, "start_date": "2026-03-07", "end_date": "2026-03-08"},
        headers=headers,
    )

    assert response.status_code == 422
    assert "dia laborable" in response.json()["detail"]


async def test_no_se_puede_crear_una_tarea_con_fechas_invertidas(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.post(
        "/api/projects/1/tasks",
        json={**NEW_TASK, "start_date": "2026-03-11", "end_date": "2026-03-09"},
        headers=headers,
    )

    assert response.status_code == 422


async def test_no_se_pueden_crear_horas_negativas(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.post(
        "/api/projects/1/tasks",
        json={**NEW_TASK, "estimated_hours": "-1"},
        headers=headers,
    )

    assert response.status_code == 422


async def test_modificar_horas_de_una_tarea(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await client.patch(
        "/api/tasks/1", json={"estimated_hours": "12.00"}, headers=headers
    )

    assert response.status_code == 200, response.text
    assert response.json()["estimated_hours"] == 12.0


async def test_modificar_titulo_y_fechas(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await client.patch(
        "/api/tasks/1",
        json={
            "title": "SCADA revisada",
            "start_date": "2026-03-09",
            "end_date": "2026-03-13",
        },
        headers=headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "SCADA revisada"
    assert data["start_date"] == "2026-03-09"
    assert data["end_date"] == "2026-03-13"


async def test_reasignar_una_tarea_a_otra_persona_del_proyecto(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.patch(
        "/api/tasks/1",
        json={"assigned_to": client.ids["manager"]},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["assigned_to"] == client.ids["manager"]


async def test_no_se_puede_reasignar_a_quien_no_es_miembro(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.patch(
        "/api/tasks/1",
        json={"assigned_to": client.ids["outsider"]},
        headers=headers,
    )

    assert response.status_code == 422


async def test_modificar_tarea_sin_permiso_responde_403(client: AsyncClient):
    headers = await _auth(client, "reader@example.com")

    response = await client.patch(
        "/api/tasks/1", json={"estimated_hours": "1.00"}, headers=headers
    )

    assert response.status_code == 403


async def test_modificar_tarea_inexistente_responde_404(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.patch(
        "/api/tasks/999", json={"estimated_hours": "1.00"}, headers=headers
    )

    assert response.status_code == 404


async def test_el_patch_solo_toca_los_campos_enviados(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await client.patch(
        "/api/tasks/1", json={"estimated_hours": "20.00"}, headers=headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Programacion"
    assert data["start_date"] == "2026-03-05"
    assert data["end_date"] == "2026-03-11"
    assert data["assigned_to"] == client.ids["engineer"]


async def test_borrar_una_tarea(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.delete("/api/tasks/1", headers=headers)

    assert response.status_code == 204

    listado = await client.get("/api/projects/1/tasks", headers=headers)
    assert listado.json() == []


async def test_borrar_tarea_sin_permiso_responde_403(client: AsyncClient):
    headers = await _auth(client, "reader@example.com")

    response = await client.delete("/api/tasks/1", headers=headers)

    assert response.status_code == 403


async def test_listar_miembros_del_proyecto(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.get("/api/projects/1/members", headers=headers)

    assert response.status_code == 200
    members = response.json()
    assert len(members) == 3
    assert {m["name"] for m in members} == {"Manager", "Engineer", "Reader"}
    roles = {m["name"]: m["role_name"] for m in members}
    assert roles["Engineer"] == "Ingeniero"
    assert roles["Reader"] == "Lector"


async def test_listar_miembros_sin_permiso_responde_403(client: AsyncClient):
    headers = await _auth(client, "outsider@example.com")

    response = await client.get("/api/projects/1/members", headers=headers)

    assert response.status_code == 403


async def test_listar_tareas_del_proyecto(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.get("/api/projects/1/tasks", headers=headers)

    assert response.status_code == 200
    tasks = response.json()
    assert len(tasks) == 1
    assert tasks[0]["title"] == "Programacion"


async def test_listar_tareas_filtradas_por_semana(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    dentro = await client.get(
        "/api/projects/1/tasks", params={"week": "2026-W10"}, headers=headers
    )
    fuera = await client.get(
        "/api/projects/1/tasks", params={"week": "2026-W20"}, headers=headers
    )

    assert len(dentro.json()) == 1
    assert fuera.json() == []


async def test_listar_tareas_filtradas_por_persona(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.get(
        "/api/projects/1/tasks",
        params={"assigned_to": client.ids["engineer"]},
        headers=headers,
    )

    assert len(response.json()) == 1


async def test_listar_tareas_filtradas_por_rango_de_fechas(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    dentro = await client.get(
        "/api/tasks",
        params={"from": "2026-03-01", "to": "2026-03-31"},
        headers=headers,
    )
    fuera = await client.get(
        "/api/tasks",
        params={"from": "2026-04-01", "to": "2026-04-30"},
        headers=headers,
    )

    assert len(dentro.json()) == 1
    assert fuera.json() == []


async def test_la_semana_manda_sobre_el_rango(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.get(
        "/api/tasks",
        params={
            "week": "2026-W10",
            "from": "2026-03-01",
            "to": "2026-03-31",
        },
        headers=headers,
    )

    assert len(response.json()) == 1


async def test_crear_tarea_cambia_el_informe_de_capacidad(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    antes = await client.get("/api/projects/1/capacity", headers=headers)
    await client.post(
        "/api/projects/1/tasks",
        json={
            **NEW_TASK,
            "assigned_to": client.ids["engineer"],
            "estimated_hours": "60.00",
        },
        headers=headers,
    )
    despues = await client.get("/api/projects/1/capacity", headers=headers)

    engineer_antes = next(r for r in antes.json()["rows"] if r["name"] == "Engineer")
    engineer_despues = next(r for r in despues.json()["rows"] if r["name"] == "Engineer")
    assert engineer_antes["total_hours"] < engineer_despues["total_hours"]
