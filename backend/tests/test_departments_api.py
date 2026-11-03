"""Pruebas del endpoint de departamentos."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.auth import hash_password
from backend.database import create_engine, get_db
from backend.main import app
from backend.models import Base, Department, Project, User

PASSWORD = "clave-de-prueba"


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

    ana = User(
        name="Ana",
        email="ana@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    jorge = User(
        name="Jorge",
        email="jorge@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    admin = User(
        name="Admin",
        email="admin@example.com",
        hashed_password=hash_password(PASSWORD),
        is_global_admin=True,
    )
    session.add_all([ana, jorge, admin])
    await session.flush()

    automatizacion = Department(name="Automatización & SCADA", manager_id=ana.id)
    oficina = Department(name="Oficina Técnica / EPLAN", manager_id=jorge.id)
    sin_responsable = Department(name="Sin responsable")
    session.add_all([automatizacion, oficina, sin_responsable])
    await session.flush()

    ana.department_id = automatizacion.id
    jorge.department_id = oficina.id

    project = Project(name="Linea 1", department_id=automatizacion.id)
    session.add(project)
    await session.flush()

    ids.update(
        admin=admin.id,
        ana=ana.id,
        jorge=jorge.id,
        automatizacion=automatizacion.id,
        oficina=oficina.id,
        sin_responsable=sin_responsable.id,
        project=project.id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_los_departamentos_exigen_token(client: AsyncClient):
    response = await client.get("/api/departments")

    assert response.status_code == 401, response.text


async def test_se_listan_los_departamentos_con_su_responsable(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/departments", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data) == 3
    por_nombre = {d["name"]: d for d in data}
    automatizacion = por_nombre["Automatización & SCADA"]
    assert automatizacion["manager_id"] == client.ids["ana"]
    assert automatizacion["manager_name"] == "Ana"


async def test_un_departamento_sin_responsable_no_inventa_nombre(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/departments", headers=headers)

    por_nombre = {d["name"]: d for d in response.json()}
    sin_responsable = por_nombre["Sin responsable"]
    assert sin_responsable["manager_id"] is None
    assert sin_responsable["manager_name"] is None
