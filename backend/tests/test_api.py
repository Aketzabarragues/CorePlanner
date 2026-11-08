"""Pruebas de los endpoints de la API.

Se prueba el flujo completo con una base de datos en memoria: login, control
de acceso por proyecto y devolucion de la matriz de capacidad.
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
            await _seed(session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as http:
            yield http
    finally:
        app.dependency_overrides.pop(get_db, None)
    await engine.dispose()


async def _seed(session) -> None:
    admin = User(
        name="Admin",
        email="admin@example.com",
        hashed_password=hash_password(PASSWORD),
        is_global_admin=True,
    )
    ana = User(
        name="Ana",
        email="ana@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    forastero = User(
        name="Forastero",
        email="forastero@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    project = Project(name="Linea 1", status="active")
    role = Role(name="Lector", permissions_json=["capacity.read"])
    session.add_all([admin, ana, forastero, project, role])
    await session.flush()

    session.add(ProjectMember(user_id=ana.id, project_id=project.id, role_id=role.id))
    session.add(
        Task(
            project_id=project.id,
            assigned_to=ana.id,
            title="Programacion",
            status=TaskStatus.BACKLOG.value,
            start_date=date(2026, 3, 5),
            end_date=date(2026, 3, 11),
            estimated_hours=40,
        )
    )
    await session.commit()


async def _token(client: AsyncClient, email: str) -> str:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def test_login_devuelve_token_y_usuario(client: AsyncClient):
    response = await client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": PASSWORD},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["user"]["email"] == "admin@example.com"
    assert data["user"]["is_global_admin"] is True


async def test_login_con_contrasena_incorrecta(client: AsyncClient):
    response = await client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "mala"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciales inválidas"


async def test_login_con_usuario_inexistente(client: AsyncClient):
    response = await client.post(
        "/api/auth/login",
        json={"email": "nadie@example.com", "password": PASSWORD},
    )

    assert response.status_code == 401


async def test_login_exige_email_valido(client: AsyncClient):
    response = await client.post(
        "/api/auth/login", json={"email": "no-es-un-email", "password": PASSWORD}
    )

    assert response.status_code == 422


async def test_capacity_sin_token_responde_401(client: AsyncClient):
    response = await client.get("/api/projects/1/capacity")

    assert response.status_code == 401


async def test_capacity_con_token_invalido_responde_401(client: AsyncClient):
    response = await client.get(
        "/api/projects/1/capacity", headers={"Authorization": "Bearer no-es-un-token"}
    )

    assert response.status_code == 401


async def test_el_administrador_global_accede_a_la_matriz(client: AsyncClient):
    token = await _token(client, "admin@example.com")

    response = await client.get(
        "/api/projects/1/capacity", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["weeks"] == ["2026-W10", "2026-W11"]
    ana = next(row for row in data["rows"] if row["name"] == "Ana")
    assert ana["total_hours"] == 40.0


async def test_un_miembro_con_permiso_accede_a_la_matriz(client: AsyncClient):
    token = await _token(client, "ana@example.com")

    response = await client.get(
        "/api/projects/1/capacity", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200


async def test_un_usuario_sin_membership_recibe_403(client: AsyncClient):
    token = await _token(client, "forastero@example.com")

    response = await client.get(
        "/api/projects/1/capacity", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 403
    assert "capacity.read" in response.json()["detail"]


async def test_proyecto_inexistente_responde_404(client: AsyncClient):
    token = await _token(client, "admin@example.com")

    response = await client.get(
        "/api/projects/999/capacity", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 404


async def test_la_matriz_marca_la_semana_sobrecargada(client: AsyncClient):
    token = await _token(client, "admin@example.com")

    response = await client.get(
        "/api/projects/1/capacity", headers={"Authorization": f"Bearer {token}"}
    )

    ana = next(row for row in response.json()["rows"] if row["name"] == "Ana")
    cells = {cell["week"]: cell for cell in ana["cells"]}
    assert cells["2026-W10"]["hours"] == 16.0
    assert cells["2026-W11"]["hours"] == 24.0
    assert cells["2026-W10"]["is_overloaded"] is False
    assert cells["2026-W11"]["is_overloaded"] is False


async def test_listado_de_proyectos_filtra_por_membership(client: AsyncClient):
    token_admin = await _token(client, "admin@example.com")
    token_ana = await _token(client, "ana@example.com")
    token_forastero = await _token(client, "forastero@example.com")

    admin = await client.get(
        "/api/projects", headers={"Authorization": f"Bearer {token_admin}"}
    )
    ana = await client.get(
        "/api/projects", headers={"Authorization": f"Bearer {token_ana}"}
    )
    forastero = await client.get(
        "/api/projects", headers={"Authorization": f"Bearer {token_forastero}"}
    )

    assert len(admin.json()) == 1
    assert len(ana.json()) == 1
    assert forastero.json() == []
