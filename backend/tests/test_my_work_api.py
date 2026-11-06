"""Pruebas de la pantalla de Mi trabajo.

La vista es personal: cada quien ve sus tareas y su carga. El foco es que no
se escape trabajo de otras personas y que las horas se repartan por semana
igual que en la matriz de capacidad.
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
    ids: dict[str, int] = {}

    rol = Role(name="Ingeniero", permissions_json=["capacity.read", "gantt.read", "task.write"])
    session.add(rol)
    await session.flush()

    ana = User(
        name="Ana",
        email="ana@example.com",
        hashed_password=hash_password(PASSWORD),
        weekly_base_hours=12,
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
    session.add_all([ana, jorge, marta])
    await session.flush()

    linea = Project(name="Linea Pasteurizadora", status="active")
    red = Project(name="Red de tuberias", status="active")
    session.add_all([linea, red])
    await session.flush()

    session.add_all(
        [
            ProjectMember(user_id=ana.id, project_id=linea.id, role_id=rol.id),
            ProjectMember(user_id=jorge.id, project_id=linea.id, role_id=rol.id),
            ProjectMember(user_id=marta.id, project_id=linea.id, role_id=rol.id),
        ]
    )

    tarea_semana = Task(
        project_id=linea.id,
        assigned_to=ana.id,
        title="Programacion SCADA",
        status=TaskStatus.IN_PROGRESS.value,
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 6),
        estimated_hours=10,
    )
    tarea_partida = Task(
        project_id=linea.id,
        assigned_to=ana.id,
        title="Revision de esquemas",
        status=TaskStatus.BACKLOG.value,
        start_date=date(2026, 11, 6),
        end_date=date(2026, 11, 10),
        estimated_hours=9,
    )
    tarea_otro_proyecto = Task(
        project_id=red.id,
        assigned_to=ana.id,
        title="Cuadros de fuerza",
        status=TaskStatus.BACKLOG.value,
        start_date=date(2026, 11, 9),
        end_date=date(2026, 11, 13),
        estimated_hours=5,
    )
    tarea_de_jorge = Task(
        project_id=linea.id,
        assigned_to=jorge.id,
        title="Planos de tuberias",
        status=TaskStatus.BACKLOG.value,
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 6),
        estimated_hours=8,
    )
    session.add_all(
        [tarea_semana, tarea_partida, tarea_otro_proyecto, tarea_de_jorge]
    )
    await session.flush()

    ids.update(
        linea=linea.id,
        red=red.id,
        ana=ana.id,
        jorge=jorge.id,
        marta=marta.id,
        tarea_semana=tarea_semana.id,
        tarea_partida=tarea_partida.id,
        tarea_otro_proyecto=tarea_otro_proyecto.id,
        tarea_de_jorge=tarea_de_jorge.id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _week(data: dict, week: str) -> dict:
    for cell in data["weeks"]:
        if cell["week"] == week:
            return cell
    raise AssertionError(f"la semana {week} no esta en el informe")


async def test_mi_trabajo_exige_token(client: AsyncClient):
    response = await client.get("/api/my-work")

    assert response.status_code == 401, response.text


async def test_mi_trabajo_devuelve_solo_las_tareas_propias(client: AsyncClient):
    headers = await _auth(client, "ana@example.com")

    response = await client.get("/api/my-work", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["tasks"]) == 3
    assert client.ids["tarea_de_jorge"] not in {tarea["id"] for tarea in data["tasks"]}


async def test_mi_trabajo_reparte_las_horas_por_semana(client: AsyncClient):
    headers = await _auth(client, "ana@example.com")

    response = await client.get("/api/my-work", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert [cell["week"] for cell in data["weeks"]] == ["2026-W45", "2026-W46"]
    # 10 h en cinco dias, mas el unico dia de la primera semana de la otra tarea.
    assert _week(data, "2026-W45")["hours"] == 13
    # Los dos dias de la segunda semana de la tarea partida, mas los cinco dias.
    assert _week(data, "2026-W46")["hours"] == 11
    assert data["total_hours"] == 24


async def test_mi_trabajo_marca_la_sobrecarga(client: AsyncClient):
    headers = await _auth(client, "ana@example.com")

    response = await client.get("/api/my-work", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    # Ana tiene 12 h base: la primera semana se pasa y la segunda no.
    assert _week(data, "2026-W45")["capacity"] == 12
    assert _week(data, "2026-W45")["is_overloaded"] is True
    assert _week(data, "2026-W46")["is_overloaded"] is False
    assert data["has_overload"] is True


async def test_mi_trabajo_de_una_persona_sin_tareas_no_muestra_trabajo_ajeno(
    client: AsyncClient,
):
    headers = await _auth(client, "marta@example.com")

    response = await client.get("/api/my-work", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["tasks"] == []
    assert data["total_hours"] == 0
    assert data["has_overload"] is False


async def test_mi_trabajo_devuelve_el_proyecto_de_cada_tarea(client: AsyncClient):
    headers = await _auth(client, "ana@example.com")

    response = await client.get("/api/my-work", headers=headers)

    assert response.status_code == 200, response.text
    tareas = {tarea["id"]: tarea for tarea in response.json()["tasks"]}
    assert tareas[client.ids["tarea_semana"]]["project_name"] == "Linea Pasteurizadora"
    assert tareas[client.ids["tarea_otro_proyecto"]]["project_name"] == "Red de tuberias"
    assert tareas[client.ids["tarea_semana"]]["status"] == "in_progress"
    assert tareas[client.ids["tarea_semana"]]["estimated_hours"] == 10
