"""Pruebas del ambito por rol de empresa.

El rol de empresa y el departamento deciden que proyectos ve cada persona. El
rol dentro del proyecto decide que puede hacer en el. Las dos cosas van
probadas por separado, porque en un fallo no se sabe de que lado esta el
problema.
"""

from __future__ import annotations

from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.auth import decode_access_token, hash_password
from backend.database import create_engine, get_db
from backend.main import app
from backend.models import (
    Base,
    CompanyRole,
    Department,
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

TASK = {
    "title": "Tarea nueva",
    "start_date": "2026-11-02",
    "end_date": "2026-11-04",
    "estimated_hours": 8,
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
        company_role=CompanyRole.GERENTE.value,
    )
    ana = User(
        name="Ana",
        email="ana@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role=CompanyRole.JEFE_DEPARTAMENTO.value,
    )
    jorge = User(
        name="Jorge",
        email="jorge@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role=CompanyRole.JEFE_DEPARTAMENTO.value,
    )
    sebastian = User(
        name="Sebastian",
        email="sebastian@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role=CompanyRole.TECNICO.value,
    )
    lucia = User(
        name="Lucia",
        email="lucia@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role=CompanyRole.TECNICO.value,
    )
    session.add_all([gerente, ana, jorge, sebastian, lucia])
    await session.flush()

    automatizacion = Department(name="Automatizacion", manager_id=ana.id)
    oficina = Department(name="Oficina Tecnica", manager_id=jorge.id)
    session.add_all([automatizacion, oficina])
    await session.flush()

    ana.department_id = automatizacion.id
    jorge.department_id = oficina.id
    sebastian.department_id = automatizacion.id
    lucia.department_id = automatizacion.id

    linea = Project(
        name="Linea Pasteurizadora",
        status="active",
        department_id=automatizacion.id,
        owner_id=ana.id,
    )
    sigma = Project(
        name="Sigma", status="active", department_id=automatizacion.id
    )
    tuberias = Project(
        name="Red de tuberias",
        status="active",
        department_id=oficina.id,
        owner_id=jorge.id,
    )
    session.add_all([linea, sigma, tuberias])
    await session.flush()

    session.add_all(
        [
            ProjectMember(
                user_id=ana.id,
                project_id=linea.id,
                role_id=roles["Project Manager"].id,
            ),
            ProjectMember(
                user_id=sebastian.id,
                project_id=linea.id,
                role_id=roles["Ingeniero"].id,
            ),
            ProjectMember(
                user_id=lucia.id,
                project_id=sigma.id,
                role_id=roles["Ingeniero"].id,
            ),
            ProjectMember(
                user_id=jorge.id,
                project_id=tuberias.id,
                role_id=roles["Project Manager"].id,
            ),
            ProjectMember(
                user_id=ana.id,
                project_id=tuberias.id,
                role_id=roles["Lector"].id,
            ),
        ]
    )

    session.add_all(
        [
            Task(
                project_id=linea.id,
                assigned_to=sebastian.id,
                title="Programacion SCADA",
                status=TaskStatus.IN_PROGRESS.value,
                start_date=date(2026, 11, 2),
                end_date=date(2026, 11, 4),
                estimated_hours=8,
            ),
            # Tarea de Sebastian en un proyecto del que no es miembro.
            Task(
                project_id=tuberias.id,
                assigned_to=sebastian.id,
                title="Cableado de campo",
                status=TaskStatus.BACKLOG.value,
                start_date=date(2026, 11, 2),
                end_date=date(2026, 11, 4),
                estimated_hours=6,
            ),
        ]
    )
    await session.flush()

    ids.update(
        linea=linea.id,
        sigma=sigma.id,
        tuberias=tuberias.id,
        automatizacion=automatizacion.id,
        oficina=oficina.id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _project_ids(client: AsyncClient, email: str) -> set[int]:
    headers = await _auth(client, email)
    response = await client.get("/api/projects", headers=headers)
    assert response.status_code == 200, response.text
    return {project["id"] for project in response.json()}


async def test_gerente_ve_todos_los_proyectos(client: AsyncClient):
    visibles = await _project_ids(client, "gerente@example.com")
    assert visibles == {
        client.ids["linea"],
        client.ids["sigma"],
        client.ids["tuberias"],
    }


async def test_gerente_puede_crear_tareas_en_cualquier_proyecto(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    response = await client.post(
        f"/api/projects/{client.ids['tuberias']}/tasks", headers=headers, json=TASK
    )
    assert response.status_code == 201, response.text


async def test_jefe_ve_los_proyectos_de_su_area_sin_ser_miembro(client: AsyncClient):
    visibles = await _project_ids(client, "ana@example.com")
    # Sigma lo gestiona su departamento, pero Ana no es miembro.
    assert visibles == {
        client.ids["linea"],
        client.ids["sigma"],
        client.ids["tuberias"],
    }


async def test_jefe_no_ve_proyectos_de_otro_departamento(client: AsyncClient):
    visibles = await _project_ids(client, "jorge@example.com")
    assert visibles == {client.ids["tuberias"]}


async def test_jefe_puede_crear_tareas_en_los_proyectos_de_su_area(client: AsyncClient):
    headers = await _auth(client, "ana@example.com")
    response = await client.post(
        f"/api/projects/{client.ids['sigma']}/tasks", headers=headers, json=TASK
    )
    assert response.status_code == 201, response.text


async def test_tecnico_ve_sus_proyectos_y_los_que_tiene_tareas(client: AsyncClient):
    visibles = await _project_ids(client, "sebastian@example.com")
    # Es miembro de linea y tiene una tarea en tuberias. Sigma no se ve.
    assert visibles == {client.ids["linea"], client.ids["tuberias"]}


async def test_tecnico_consulta_el_proyecto_donde_tiene_tareas(client: AsyncClient):
    headers = await _auth(client, "sebastian@example.com")
    response = await client.get(
        f"/api/projects/{client.ids['tuberias']}/capacity", headers=headers
    )
    assert response.status_code == 200, response.text


async def test_tecnico_no_puede_crear_tareas_en_un_proyecto_ajeno(client: AsyncClient):
    headers = await _auth(client, "sebastian@example.com")
    response = await client.post(
        f"/api/projects/{client.ids['tuberias']}/tasks", headers=headers, json=TASK
    )
    assert response.status_code == 403, response.text


async def test_tecnico_no_ve_la_carga_de_companeros_sin_proyecto_compartido(
    client: AsyncClient,
):
    headers = await _auth(client, "sebastian@example.com")
    response = await client.get("/api/capacity", headers=headers)
    assert response.status_code == 200, response.text
    nombres = {row["name"] for row in response.json()["rows"]}
    # Lucia trabaja en sigma, que Sebastian no ve.
    assert "Lucia" not in nombres


async def test_scope_devuelve_rol_y_proyectos(client: AsyncClient):
    headers = await _auth(client, "ana@example.com")
    response = await client.get("/api/me", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["role_label"] == "Jefe de departamento"
    assert data["department_name"] == "Automatizacion"
    assert client.ids["sigma"] in data["visible_project_ids"]
    assert client.ids["sigma"] in data["editable_project_ids"]


async def test_scope_de_un_tecnico_no_le_da_edicion(client: AsyncClient):
    headers = await _auth(client, "sebastian@example.com")
    response = await client.get("/api/me", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["role_label"] == "Tecnico"
    assert client.ids["tuberias"] in data["visible_project_ids"]
    assert client.ids["tuberias"] not in data["editable_project_ids"]
    assert client.ids["linea"] in data["editable_project_ids"]


async def test_scope_requiere_token(client: AsyncClient):
    response = await client.get("/api/me")
    assert response.status_code == 401, response.text


async def test_el_token_lleva_el_rol_de_empresa(client: AsyncClient):
    response = await client.post(
        "/api/auth/login",
        json={"email": "ana@example.com", "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    payload = decode_access_token(response.json()["access_token"])
    assert payload.company_role == CompanyRole.JEFE_DEPARTAMENTO.value
    assert payload.department_id == client.ids["automatizacion"]
