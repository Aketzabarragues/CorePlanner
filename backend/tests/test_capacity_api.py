"""Pruebas de la API de politicas de capacidad.

El veredicto de cada celda sale ya serializado en los informes de capacidad:
los endpoints no cambian, la celda lleva `policy_verdict` y `policy`.
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
    CapacityPolicy,
    Department,
    Project,
    ProjectMember,
    Role,
    Task,
    TaskStatus,
    User,
)

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
    gerente = User(
        name="Gerente",
        email="gerente@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role="gerente",
        is_global_admin=True,
    )
    tecnico = User(
        name="Tecnico",
        email="tecnico@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role="tecnico",
    )
    ana = User(
        name="Ana",
        email="ana@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role="tecnico",
        weekly_base_hours=40,
    )
    luis = User(
        name="Luis",
        email="luis@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role="tecnico",
        weekly_base_hours=40,
    )
    department = Department(name="Alfa", manager_id=gerente.id)
    session.add_all([gerente, tecnico, ana, luis, department])
    await session.flush()
    tecnico.department_id = department.id

    project = Project(name="Linea 1")
    role = Role(name="Ingeniero", permissions_json=["capacity.read", "task.write"])
    session.add_all([project, role])
    await session.flush()
    session.add_all(
        [
            ProjectMember(user_id=ana.id, project_id=project.id, role_id=role.id),
            ProjectMember(user_id=luis.id, project_id=project.id, role_id=role.id),
        ]
    )
    session.add(
        Task(
            project_id=project.id,
            assigned_to=ana.id,
            title="Montaje",
            status=TaskStatus.BACKLOG.value,
            start_date=date(2026, 3, 2),
            end_date=date(2026, 3, 6),
            estimated_hours=40,
        )
    )
    session.add(
        CapacityPolicy(
            scope_type="persona",
            scope_id=ana.id,
            warn_percent=80,
            requires_approval_percent=100,
        )
    )
    await session.commit()
    return {
        "gerente": gerente.id,
        "tecnico": tecnico.id,
        "ana": ana.id,
        "luis": luis.id,
        "departamento": department.id,
        "proyecto": project.id,
    }


async def _entrar(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_el_gerente_puede_listar_politicas(client):
    headers = await _entrar(client, "gerente@example.com")
    response = await client.get("/api/capacity-policies", headers=headers)
    assert response.status_code == 200
    politicas = response.json()
    assert [p["scope_type"] for p in politicas] == ["persona"]
    assert politicas[0]["scope_id"] == client.ids["ana"]
    assert politicas[0]["warn_percent"] == 80
    assert politicas[0]["requires_approval_percent"] == 100
    assert politicas[0]["active"] is True


async def test_un_tecnico_no_puede_listar_politicas(client):
    headers = await _entrar(client, "tecnico@example.com")
    response = await client.get("/api/capacity-policies", headers=headers)
    assert response.status_code == 403


async def test_sin_token_no_puede_listar_politicas(client):
    response = await client.get("/api/capacity-policies")
    assert response.status_code == 401


async def test_el_gerente_puede_crear_politicas(client):
    headers = await _entrar(client, "gerente@example.com")
    response = await client.post(
        "/api/capacity-policies",
        headers=headers,
        json={
            "scope_type": "departamento",
            "scope_id": client.ids["departamento"],
            "warn_percent": 90,
            "requires_approval_percent": 100,
        },
    )
    assert response.status_code == 201, response.text
    cuerpo = response.json()
    assert cuerpo["scope_type"] == "departamento"
    assert cuerpo["scope_id"] == client.ids["departamento"]
    assert cuerpo["warn_percent"] == 90
    assert cuerpo["requires_approval_percent"] == 100
    assert cuerpo["active"] is True
    assert "id" in cuerpo and "created_at" in cuerpo


async def test_un_tecnico_no_puede_crear_politicas(client):
    headers = await _entrar(client, "tecnico@example.com")
    response = await client.post(
        "/api/capacity-policies",
        headers=headers,
        json={"scope_type": "persona", "scope_id": client.ids["ana"]},
    )
    assert response.status_code == 403


async def test_el_gerente_puede_modificar_politicas(client):
    headers = await _entrar(client, "gerente@example.com")
    listado = (await client.get("/api/capacity-policies", headers=headers)).json()
    policy = listado[0]

    response = await client.patch(
        f"/api/capacity-policies/{policy['id']}",
        headers=headers,
        json={"warn_percent": 70, "active": False},
    )
    assert response.status_code == 200, response.text
    cuerpo = response.json()
    assert cuerpo["warn_percent"] == 70
    assert cuerpo["requires_approval_percent"] == 100
    assert cuerpo["active"] is False
    assert cuerpo["scope_type"] == "persona"


async def test_el_gerente_puede_borrar_politicas(client):
    headers = await _entrar(client, "gerente@example.com")
    listado = (await client.get("/api/capacity-policies", headers=headers)).json()
    policy = listado[0]

    response = await client.delete(
        f"/api/capacity-policies/{policy['id']}", headers=headers
    )
    assert response.status_code == 204

    response = await client.get("/api/capacity-policies", headers=headers)
    assert response.status_code == 200
    assert response.json() == []


async def test_modificar_una_politica_que_no_existe_da_404(client):
    headers = await _entrar(client, "gerente@example.com")
    response = await client.patch(
        "/api/capacity-policies/9999", headers=headers, json={"active": False}
    )
    assert response.status_code == 404


async def test_borrar_una_politica_que_no_existe_da_404(client):
    headers = await _entrar(client, "gerente@example.com")
    response = await client.delete("/api/capacity-policies/9999", headers=headers)
    assert response.status_code == 404


@pytest.mark.parametrize(
    ("cuerpo", "motivo"),
    [
        ({"scope_type": "proyecto", "scope_id": 1}, "scope_type invalido"),
        ({"scope_type": "persona", "scope_id": 9999}, "persona inexistente"),
        ({"scope_type": "departamento", "scope_id": 9999}, "departamento inexistente"),
        (
            {"scope_type": "persona", "scope_id": 1, "warn_percent": 0},
            "aviso fuera de rango",
        ),
        (
            {"scope_type": "persona", "scope_id": 1, "warn_percent": 101},
            "aviso fuera de rango",
        ),
        (
            {"scope_type": "persona", "scope_id": 1, "requires_approval_percent": 0},
            "aprobacion fuera de rango",
        ),
        (
            {
                "scope_type": "persona",
                "scope_id": 1,
                "warn_percent": 90,
                "requires_approval_percent": 80,
            },
            "aprobacion por debajo del aviso",
        ),
    ],
)
async def test_las_validaciones_rechazan_la_alta(client, cuerpo, motivo):
    headers = await _entrar(client, "gerente@example.com")
    response = await client.post("/api/capacity-policies", headers=headers, json=cuerpo)
    assert response.status_code == 422


async def test_modificar_con_aprobacion_por_debajo_del_aviso_da_422(client):
    headers = await _entrar(client, "gerente@example.com")
    listado = (await client.get("/api/capacity-policies", headers=headers)).json()
    policy = listado[0]
    response = await client.patch(
        f"/api/capacity-policies/{policy['id']}",
        headers=headers,
        json={"warn_percent": 90, "requires_approval_percent": 80},
    )
    assert response.status_code == 422


async def test_el_informe_lleva_el_veredicto_de_la_politica(client):
    headers = await _entrar(client, "gerente@example.com")
    politica = (await client.get("/api/capacity-policies", headers=headers)).json()[0]
    response = await client.get(
        f"/api/projects/{client.ids['proyecto']}/capacity", headers=headers
    )
    assert response.status_code == 200, response.text
    data = response.json()
    filas = {row["user_id"]: row for row in data["rows"]}

    ana = filas[client.ids["ana"]]
    celda = next(c for c in ana["cells"] if c["week"] == "2026-W10")
    assert celda["hours"] == 40.0
    # 40,00 h contra 40,00 h de capacidad: toca los dos umbrales.
    assert celda["policy_verdict"] == "aprobacion"
    assert celda["policy"] == {
        "id": politica["id"],
        "scope_type": "persona",
        "scope_id": client.ids["ana"],
        "warn_percent": 80,
        "requires_approval_percent": 100,
        "active": True,
    }

    # Luis no tiene politica: su celda no lleva veredicto ni politica.
    luis = filas[client.ids["luis"]]
    assert all(c["policy_verdict"] is None for c in luis["cells"])
    assert all(c["policy"] is None for c in luis["cells"])


async def test_con_politica_inactiva_no_hay_veredicto(client):
    headers = await _entrar(client, "gerente@example.com")
    listado = (await client.get("/api/capacity-policies", headers=headers)).json()
    policy = listado[0]
    response = await client.patch(
        f"/api/capacity-policies/{policy['id']}",
        headers=headers,
        json={"active": False},
    )
    assert response.status_code == 200

    data = (
        await client.get(
            f"/api/projects/{client.ids['proyecto']}/capacity", headers=headers
        )
    ).json()
    ana = next(row for row in data["rows"] if row["user_id"] == client.ids["ana"])
    celda = next(c for c in ana["cells"] if c["week"] == "2026-W10")
    assert celda["policy_verdict"] is None
    assert celda["policy"] is None
