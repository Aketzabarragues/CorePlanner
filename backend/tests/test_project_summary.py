"""Pruebas del resumen de proyectos del listado global.

El resumen tiene que contar lo mismo que cuenta el panel: el equipo del
proyecto, el avance de sus tareas y la carga de la semana frente a la
capacidad de quien trabaja en el. Y no puede enseñar nada que quien entra no
viera de antes.
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
from backend.services.capacity import iso_week_key
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
            lunes = week_start_from_key(http.week)
            http.next_week = iso_week_key(lunes + timedelta(days=7))
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
    mantenimiento = Project(name="Plan de mantenimiento", status="active")
    session.add_all([linea, tuberias, mantenimiento])
    await session.flush()

    session.add_all(
        [
            ProjectMember(user_id=ana.id, project_id=linea.id, role_id=rol.id),
            ProjectMember(user_id=jorge.id, project_id=linea.id, role_id=rol.id),
            ProjectMember(user_id=ana.id, project_id=tuberias.id, role_id=rol.id),
            ProjectMember(user_id=ana.id, project_id=mantenimiento.id, role_id=rol.id),
        ]
    )

    lunes = week_start_from_key(current_week_key())
    session.add_all(
        [
            Task(
                project_id=linea.id,
                assigned_to=ana.id,
                title="Programacion SCADA",
                status=TaskStatus.IN_PROGRESS.value,
                start_date=lunes,
                end_date=lunes + timedelta(days=4),
                estimated_hours=50,
            ),
            Task(
                project_id=linea.id,
                assigned_to=jorge.id,
                title="Planos de tuberias",
                status=TaskStatus.DONE.value,
                start_date=lunes,
                end_date=lunes + timedelta(days=4),
                estimated_hours=20,
            ),
            Task(
                project_id=linea.id,
                assigned_to=None,
                title="Montaje de cuadros",
                status=TaskStatus.BACKLOG.value,
                start_date=lunes,
                end_date=lunes + timedelta(days=2),
                estimated_hours=8,
            ),
            Task(
                project_id=tuberias.id,
                assigned_to=ana.id,
                title="Cuadros de fuerza",
                status=TaskStatus.BACKLOG.value,
                start_date=lunes + timedelta(days=7),
                end_date=lunes + timedelta(days=8),
                estimated_hours=8,
            ),
            Task(
                project_id=mantenimiento.id,
                assigned_to=ana.id,
                title="Parada programada",
                status=TaskStatus.BACKLOG.value,
                start_date=lunes,
                end_date=lunes + timedelta(days=4),
                estimated_hours=50,
            ),
        ]
    )
    await session.flush()

    ids.update(
        linea=linea.id,
        tuberias=tuberias.id,
        mantenimiento=mantenimiento.id,
        ana=ana.id,
        jorge=jorge.id,
        marta=marta.id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _por_id(data: list[dict], project_id: int) -> dict:
    for item in data:
        if item["id"] == project_id:
            return item
    raise AssertionError(f"El proyecto {project_id} no esta en el resumen")


async def test_el_resumen_exige_token(client: AsyncClient):
    response = await client.get("/api/projects/summary")

    assert response.status_code == 401, response.text


async def test_el_resumen_lista_el_equipo_del_proyecto(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/projects/summary", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    linea = _por_id(data, client.ids["linea"])
    assert [member["name"] for member in linea["members"]] == ["Ana", "Jorge"]
    assert all(member["user_id"] for member in linea["members"])


async def test_el_resumen_cuenta_las_tareas_completadas(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/projects/summary", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    linea = _por_id(data, client.ids["linea"])
    # Tres tareas: una hecha, una en curso y una sin persona asignada.
    assert linea["tasks_total"] == 3
    assert linea["tasks_done"] == 1
    # La tarea sin fechas no entra: no hay avance que contar de ella.
    tuberias = _por_id(data, client.ids["tuberias"])
    assert tuberias["tasks_total"] == 1
    assert tuberias["tasks_done"] == 0


async def test_el_resumen_publica_la_carga_de_la_semana(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/projects/summary", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    linea = _por_id(data, client.ids["linea"])
    # 50 h de Ana y 20 h de Jorge frente a 40 h de capacidad de cada uno.
    assert linea["load"]["week"] == client.week
    assert linea["load"]["planned_hours"] == 70
    assert linea["load"]["capacity_hours"] == 80
    assert linea["load"]["utilization"] == 88
    assert linea["load"]["overloaded"] is False


async def test_el_resumen_avisa_cuando_el_proyecto_supera_la_capacidad(
    client: AsyncClient,
):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/projects/summary", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    mantenimiento = _por_id(data, client.ids["mantenimiento"])
    assert mantenimiento["load"]["planned_hours"] == 50
    assert mantenimiento["load"]["capacity_hours"] == 40
    assert mantenimiento["load"]["utilization"] == 125
    assert mantenimiento["load"]["overloaded"] is True


async def test_el_resumen_admite_otra_semana(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get(
        "/api/projects/summary",
        headers=headers,
        params={"week": client.next_week},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    linea = _por_id(data, client.ids["linea"])
    assert linea["load"]["week"] == client.next_week
    assert linea["load"]["planned_hours"] == 0
    assert linea["load"]["utilization"] is None
    assert linea["load"]["overloaded"] is False
    tuberias = _por_id(data, client.ids["tuberias"])
    assert tuberias["load"]["planned_hours"] == 8
    assert tuberias["load"]["capacity_hours"] == 40


async def test_el_resumen_rechaza_una_semana_que_no_existe(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get(
        "/api/projects/summary", headers=headers, params={"week": "no-es-una-semana"}
    )

    assert response.status_code == 422, response.text


async def test_el_resumen_no_amplia_el_ambito(client: AsyncClient):
    headers = await _auth(client, "marta@example.com")

    response = await client.get("/api/projects/summary", headers=headers)

    assert response.status_code == 200, response.text
    assert response.json() == []
