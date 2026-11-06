"""Pruebas de la configuracion de la organizacion.

La configuracion es del gerente: el resto de roles la ven pero no la pueden
tocar. Las pruebas cubren ese limite y las reglas de cada bloque.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.auth import hash_password
from backend.database import create_engine, get_db
from backend.main import app
from backend.models import (
    Base,
    CompanyRole,
    Department,
    Project,
    ProjectMember,
    Role,
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
    sebastian = User(
        name="Sebastian",
        email="sebastian@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role=CompanyRole.TECNICO.value,
    )
    session.add_all([gerente, ana, sebastian])
    await session.flush()

    automatizacion = Department(name="Automatizacion", manager_id=ana.id)
    session.add(automatizacion)
    await session.flush()
    ana.department_id = automatizacion.id
    sebastian.department_id = automatizacion.id

    proyecto = Project(
        name="Linea Pasteurizadora",
        status="active",
        department_id=automatizacion.id,
        owner_id=ana.id,
    )
    session.add(proyecto)
    await session.flush()

    session.add(
        ProjectMember(
            user_id=ana.id,
            project_id=proyecto.id,
            role_id=roles["Project Manager"].id,
        )
    )

    ids.update(
        proyecto=proyecto.id,
        automatizacion=automatizacion.id,
        gerente=gerente.id,
        ana=ana.id,
        sebastian=sebastian.id,
        rol_lector=roles["Lector"].id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_el_gerente_lista_las_personas(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.get("/api/users", headers=headers)

    assert response.status_code == 200, response.text
    personas = {persona["email"]: persona for persona in response.json()}
    assert "ana@example.com" in personas
    assert personas["ana@example.com"]["company_role_label"] == "Jefe de departamento"
    assert personas["ana@example.com"]["department_name"] == "Automatizacion"


async def test_un_tecnico_no_lista_las_personas(client: AsyncClient):
    headers = await _auth(client, "sebastian@example.com")

    response = await client.get("/api/users", headers=headers)

    assert response.status_code == 403, response.text


async def test_un_jefe_no_puede_crear_personas(client: AsyncClient):
    headers = await _auth(client, "ana@example.com")

    response = await client.post(
        "/api/users",
        headers=headers,
        json={
            "name": "Nueva persona",
            "email": "nueva@example.com",
            "password": "contrasena-larga",
        },
    )

    assert response.status_code == 403, response.text


async def test_el_gerente_crea_una_persona(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.post(
        "/api/users",
        headers=headers,
        json={
            "name": "Lucia",
            "email": "lucia@example.com",
            "password": "contrasena-larga",
            "company_role": CompanyRole.TECNICO.value,
            "department_id": client.ids["automatizacion"],
            "weekly_base_hours": "32.00",
        },
    )

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["company_role_label"] == "Tecnico"
    assert data["department_name"] == "Automatizacion"
    assert data["weekly_base_hours"] == 32.0


async def test_la_persona_creada_puede_entrar(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    await client.post(
        "/api/users",
        headers=headers,
        json={
            "name": "Lucia",
            "email": "lucia@example.com",
            "password": "contrasena-larga",
        },
    )

    response = await client.post(
        "/api/auth/login",
        json={"email": "lucia@example.com", "password": "contrasena-larga"},
    )

    assert response.status_code == 200, response.text


async def test_no_se_repiten_correos(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.post(
        "/api/users",
        headers=headers,
        json={
            "name": "Duplicada",
            "email": "ana@example.com",
            "password": "contrasena-larga",
        },
    )

    assert response.status_code == 409, response.text


async def test_el_gerente_modifica_una_persona(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.patch(
        f"/api/users/{client.ids['sebastian']}",
        headers=headers,
        json={"company_role": CompanyRole.JEFE_DEPARTAMENTO.value},
    )

    assert response.status_code == 200, response.text
    assert response.json()["company_role_label"] == "Jefe de departamento"


async def test_no_se_cambia_lo_que_no_viene_en_la_peticion(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    await client.patch(
        f"/api/users/{client.ids['sebastian']}",
        headers=headers,
        json={"company_role": CompanyRole.JEFE_DEPARTAMENTO.value},
    )
    response = await client.patch(
        f"/api/users/{client.ids['sebastian']}",
        headers=headers,
        json={"name": "Sebastian Apellido"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["company_role_label"] == "Jefe de departamento"


async def test_el_gerente_crea_un_departamento_con_responsable(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.post(
        "/api/departments",
        headers=headers,
        json={"name": "Oficina Tecnica", "manager_id": client.ids["sebastian"]},
    )

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["name"] == "Oficina Tecnica"
    assert data["manager_name"] == "Sebastian"

    # El responsable pasa a pertenecer al departamento que dirige.
    personas = await client.get("/api/users", headers=headers)
    sebastian = next(
        persona for persona in personas.json() if persona["id"] == client.ids["sebastian"]
    )
    assert sebastian["department_name"] == "Oficina Tecnica"


async def test_no_se_repiten_departamentos(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.post(
        "/api/departments", headers=headers, json={"name": "Automatizacion"}
    )

    assert response.status_code == 409, response.text


async def test_el_gerente_cambia_el_responsable(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.patch(
        f"/api/departments/{client.ids['automatizacion']}",
        headers=headers,
        json={"manager_id": client.ids["sebastian"]},
    )

    assert response.status_code == 200, response.text
    assert response.json()["manager_name"] == "Sebastian"


async def test_el_gerente_crea_un_proyecto(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "Red de tuberias",
            "status": "active",
            "department_id": client.ids["automatizacion"],
            "owner_id": client.ids["ana"],
        },
    )

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["name"] == "Red de tuberias"
    assert data["department_id"] == client.ids["automatizacion"]
    assert data["owner_id"] == client.ids["ana"]


async def test_el_gerente_modifica_un_proyecto(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.patch(
        f"/api/projects/{client.ids['proyecto']}",
        headers=headers,
        json={"status": "on_hold", "owner_id": client.ids["sebastian"]},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "on_hold"
    assert data["owner_id"] == client.ids["sebastian"]


async def test_un_tecnico_no_crea_proyectos(client: AsyncClient):
    headers = await _auth(client, "sebastian@example.com")

    response = await client.post(
        "/api/projects", headers=headers, json={"name": "Intruso"}
    )

    assert response.status_code == 403, response.text


async def test_el_catalogo_de_roles_de_empresa(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.get("/api/roles", headers=headers)

    assert response.status_code == 200, response.text
    roles = {role["value"]: role for role in response.json()}
    assert set(roles) == {
        CompanyRole.GERENTE.value,
        CompanyRole.JEFE_DEPARTAMENTO.value,
        CompanyRole.TECNICO.value,
    }
    assert roles["gerente"]["label"] == "Gerente"
    assert roles["gerente"]["scope"]


async def test_los_roles_de_proyecto_traen_sus_permisos(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.get("/api/roles/project", headers=headers)

    assert response.status_code == 200, response.text
    roles = {role["name"]: role for role in response.json()}
    assert set(roles) == set(ROLES)
    assert "task.write" in roles["Project Manager"]["permissions"]
    assert "task.write" not in roles["Lector"]["permissions"]


async def test_el_gerente_mete_y_saca_personas_de_un_proyecto(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    alta = await client.post(
        f"/api/projects/{client.ids['proyecto']}/members",
        headers=headers,
        json={"user_id": client.ids["sebastian"], "role_id": client.ids["rol_lector"]},
    )
    assert alta.status_code == 201, alta.text

    miembros = await client.get(
        f"/api/projects/{client.ids['proyecto']}/members", headers=headers
    )
    assert miembros.status_code == 200, miembros.text
    assert client.ids["sebastian"] in {m["user_id"] for m in miembros.json()}

    baja = await client.delete(
        f"/api/projects/{client.ids['proyecto']}/members/{client.ids['sebastian']}",
        headers=headers,
    )
    assert baja.status_code == 204, baja.text

    miembros = await client.get(
        f"/api/projects/{client.ids['proyecto']}/members", headers=headers
    )
    assert client.ids["sebastian"] not in {m["user_id"] for m in miembros.json()}


async def test_no_se_mete_dos_veces_a_la_misma_persona(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.post(
        f"/api/projects/{client.ids['proyecto']}/members",
        headers=headers,
        json={"user_id": client.ids["ana"], "role_id": client.ids["rol_lector"]},
    )

    assert response.status_code == 409, response.text


async def test_sacar_a_quien_no_es_miembro(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.delete(
        f"/api/projects/{client.ids['proyecto']}/members/{client.ids['sebastian']}",
        headers=headers,
    )

    assert response.status_code == 404, response.text
