"""Pruebas del calendario laboral: dias no laborables y su impacto.

El 9 de noviembre de 2026 es lunes de la semana ISO 2026-W46.
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
    Department,
    NonWorkingDay,
    NonWorkingDayScope,
    Project,
    Task,
    User,
    WorkingSchedule,
)
from backend.services.people import DAY_FIELDS

PASSWORD = "clave-de-prueba"
JORNADA = (800, 800, 800, 800, 800, 0, 0)


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
    gerente = User(
        name="Gerente",
        email="gerente@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role="gerente",
        is_global_admin=True,
    )
    oficina = Department(name="Oficina")
    session.add_all([gerente, oficina])
    await session.flush()

    ana = User(
        name="Ana",
        email="ana@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role="tecnico",
        department_id=oficina.id,
        weekly_base_hours=40,
    )
    luis = User(
        name="Luis",
        email="luis@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role="tecnico",
    )
    session.add_all([ana, luis])
    await session.flush()

    proyecto = Project(name="Proyecto", status="active", department_id=oficina.id)
    session.add(proyecto)
    await session.flush()

    session.add(
        WorkingSchedule(
            user_id=ana.id,
            valid_from=date(2026, 1, 5),
            **dict(zip(DAY_FIELDS, JORNADA, strict=True)),
        )
    )
    session.add(
        NonWorkingDay(
            date=date(2026, 11, 9),
            name="Dia de la Comunidad",
            scope=NonWorkingDayScope.GLOBAL.value,
        )
    )
    session.add(
        NonWorkingDay(
            date=date(2026, 11, 16),
            name="Permiso individual",
            scope=NonWorkingDayScope.PERSON.value,
            user_id=ana.id,
        )
    )
    session.add(
        Task(
            project_id=proyecto.id,
            title="Programacion SCADA",
            status="in_progress",
            start_date=date(2026, 11, 9),
            end_date=date(2026, 11, 13),
            estimated_hours=16,
            assigned_to=ana.id,
        )
    )
    await session.commit()

    ids.update(gerente=gerente.id, ana=ana.id, luis=luis.id)
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_el_calendario_laboral_dice_a_quien_afecta_y_a_cuantas_tareas(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.get(
        "/api/work-calendar",
        headers=headers,
        params={"from": "2026-11-01", "to": "2026-11-30"},
    )

    assert response.status_code == 200, response.text
    dias = response.json()["days"]
    assert [dia["name"] for dia in dias] == [
        "Dia de la Comunidad",
        "Permiso individual",
    ]

    festivo = dias[0]
    assert festivo["scope"] == "global"
    assert festivo["affected_task_count"] == 1

    permiso = dias[1]
    assert permiso["scope"] == "person"
    assert permiso["user_name"] == "Ana"
    # El permiso no cubre la tarea, que va del 9 al 13.
    assert permiso["affected_task_count"] == 0


async def test_el_calendario_laboral_muestra_el_impacto_en_la_capacidad(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.get(
        "/api/work-calendar",
        headers=headers,
        params={"from": "2026-11-09", "to": "2026-11-15"},
    )

    assert response.status_code == 200, response.text
    impacto = response.json()["impact"]

    assert len(impacto) == 1
    fila = impacto[0]
    assert fila["user_name"] == "Ana"
    assert fila["week"] == "2026-W46"
    assert fila["capacity_without"] == 40.0
    assert fila["capacity_effective"] == 32.0
    assert fila["difference"] == 8.0
    assert fila["reasons"] == ["Dia de la Comunidad"]
