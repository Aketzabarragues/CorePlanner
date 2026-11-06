"""Pruebas del panel global.

El panel resume la organizacion sin reglas nuevas: todo sale de la matriz de
capacidad y del listado de tareas. El foco es que las cifras cuadren con la
matriz y que la semana de referencia sea la del periodo con actividad.
"""

from __future__ import annotations

from datetime import timedelta

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
from backend.services.schedule import current_week_key, week_start_from_key

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
            http.week = current_week_key()
            yield http
    finally:
        app.dependency_overrides.pop(get_db, None)
    await engine.dispose()


async def _seed(session) -> dict[str, int]:
    ids: dict[str, int] = {}

    rol = Role(name="Ingeniero", permissions_json=["capacity.read", "gantt.read"])
    session.add(rol)
    await session.flush()

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
        weekly_base_hours=40,
    )
    jorge = User(
        name="Jorge",
        email="jorge@example.com",
        hashed_password=hash_password(PASSWORD),
        weekly_base_hours=40,
    )
    marta = User(
        name="Marta",
        email="marta@example.com",
        hashed_password=hash_password(PASSWORD),
        weekly_base_hours=40,
    )
    session.add_all([admin, ana, jorge, marta])
    await session.flush()

    linea = Project(name="Linea Pasteurizadora", status="active")
    tuberias = Project(name="Red de tuberias", status="planning")
    session.add_all([linea, tuberias])
    await session.flush()

    session.add_all(
        [
            ProjectMember(user_id=ana.id, project_id=linea.id, role_id=rol.id),
            ProjectMember(user_id=jorge.id, project_id=linea.id, role_id=rol.id),
        ]
    )

    lunes = week_start_from_key(current_week_key())
    tarea_ana = Task(
        project_id=linea.id,
        assigned_to=ana.id,
        title="Programacion SCADA",
        status=TaskStatus.IN_PROGRESS.value,
        start_date=lunes,
        end_date=lunes + timedelta(days=4),
        estimated_hours=50,
    )
    tarea_jorge = Task(
        project_id=linea.id,
        assigned_to=jorge.id,
        title="Planos de tuberias",
        status=TaskStatus.BACKLOG.value,
        start_date=lunes,
        end_date=lunes + timedelta(days=4),
        estimated_hours=20,
    )
    tarea_otro_proyecto = Task(
        project_id=tuberias.id,
        assigned_to=ana.id,
        title="Cuadros de fuerza",
        status=TaskStatus.BACKLOG.value,
        start_date=lunes + timedelta(days=7),
        end_date=lunes + timedelta(days=8),
        estimated_hours=8,
    )
    session.add_all([tarea_ana, tarea_jorge, tarea_otro_proyecto])
    await session.flush()

    ids.update(
        linea=linea.id,
        tuberias=tuberias.id,
        ana=ana.id,
        jorge=jorge.id,
        marta=marta.id,
        tarea_ana=tarea_ana.id,
        tarea_jorge=tarea_jorge.id,
        tarea_otro_proyecto=tarea_otro_proyecto.id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_el_panel_exige_token(client: AsyncClient):
    response = await client.get("/api/panel")

    assert response.status_code == 401, response.text


async def test_el_panel_resume_la_semana_de_referencia(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/panel", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["week"] == client.week
    assert data["is_current_week"] is True
    # 50 h de Ana y 20 h de Jorge frente a 40 h de capacidad de cada uno.
    assert data["planned_hours"] == 70
    assert data["capacity_hours"] == 80
    assert data["utilization"] == 88


async def test_el_panel_lista_a_quien_supera_su_capacidad(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/panel", headers=headers)

    assert response.status_code == 200, response.text
    sobrecargados = response.json()["overloaded"]
    assert len(sobrecargados) == 1
    assert sobrecargados[0]["name"] == "Ana"
    assert sobrecargados[0]["week"] == client.week
    assert sobrecargados[0]["hours"] == 50
    assert sobrecargados[0]["capacity"] == 40
    assert sobrecargados[0]["excess_hours"] == 10


async def test_el_panel_cuenta_proyectos_y_tareas_por_estado(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/panel", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["projects_by_status"] == {"active": 1, "planning": 1}
    assert data["tasks_by_status"] == {"in_progress": 1, "backlog": 2}
    assert data["total_tasks"] == 3
    assert data["total_people"] == 2


async def test_el_panel_ordena_los_proyectos_por_carga(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/panel", headers=headers)

    assert response.status_code == 200, response.text
    proyectos = response.json()["projects"]
    assert [proyecto["name"] for proyecto in proyectos] == [
        "Linea Pasteurizadora",
        "Red de tuberias",
    ]
    assert proyectos[0]["estimated_hours"] == 70
    assert proyectos[0]["task_count"] == 2
    assert proyectos[0]["people_count"] == 2
    assert proyectos[1]["estimated_hours"] == 8
    assert proyectos[1]["people_count"] == 1


async def test_el_panel_de_una_persona_sin_proyectos_no_inventa_datos(
    client: AsyncClient,
):
    headers = await _auth(client, "marta@example.com")

    response = await client.get("/api/panel", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["week"] is None
    assert data["utilization"] is None
    assert data["overloaded"] == []
    assert data["projects"] == []
    assert data["total_tasks"] == 0
