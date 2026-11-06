"""Pruebas de los endpoints de la vista global.

La vista global no pertenece a un proyecto: reúne los proyectos a los que
tiene acceso la persona. El foco es ese alcance, para que la matriz y el
Gantt globales no enseñen trabajo de otros.
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
    session.add_all([admin, ana, jorge])
    await session.flush()

    automatizacion = Department(name="Automatizacion", manager_id=ana.id)
    oficina = Department(name="Oficina Tecnica", manager_id=jorge.id)
    session.add_all([automatizacion, oficina])
    await session.flush()

    linea = Project(
        name="Linea Pasteurizadora", status="active", department_id=automatizacion.id
    )
    tuberias = Project(
        name="Red de tuberias", status="active", department_id=oficina.id
    )
    session.add_all([linea, tuberias])
    await session.flush()

    session.add_all(
        [
            ProjectMember(
                user_id=ana.id,
                project_id=linea.id,
                role_id=roles["Project Manager"].id,
            ),
            ProjectMember(
                user_id=jorge.id,
                project_id=tuberias.id,
                role_id=roles["Ingeniero"].id,
            ),
        ]
    )

    tarea_linea = Task(
        project_id=linea.id,
        assigned_to=ana.id,
        title="Programacion SCADA",
        status=TaskStatus.IN_PROGRESS.value,
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 4),
        estimated_hours=8,
    )
    tarea_tuberias = Task(
        project_id=tuberias.id,
        assigned_to=jorge.id,
        title="Planos de tuberias",
        status=TaskStatus.BACKLOG.value,
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 4),
        estimated_hours=10,
    )
    tarea_cruzada = Task(
        project_id=tuberias.id,
        assigned_to=ana.id,
        title="Revision de esquemas",
        status=TaskStatus.BACKLOG.value,
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 4),
        estimated_hours=4,
    )
    session.add_all([tarea_linea, tarea_tuberias, tarea_cruzada])
    await session.flush()

    ids.update(
        linea=linea.id,
        tuberias=tuberias.id,
        automatizacion=automatizacion.id,
        oficina=oficina.id,
        admin=admin.id,
        ana=ana.id,
        jorge=jorge.id,
        tarea_linea=tarea_linea.id,
        tarea_tuberias=tarea_tuberias.id,
        tarea_cruzada=tarea_cruzada.id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _row(data: dict, user_id: int) -> dict | None:
    for row in data["rows"]:
        if row["user_id"] == user_id:
            return row
    return None


async def test_la_capacidad_global_exige_token(client: AsyncClient):
    response = await client.get("/api/capacity")

    assert response.status_code == 401, response.text


async def test_la_capacidad_global_suma_las_horas_de_todos_los_proyectos(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/capacity", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert _row(data, client.ids["ana"])["total_hours"] == 12
    assert _row(data, client.ids["jorge"])["total_hours"] == 10


async def test_una_tarea_asignada_da_visibilidad_del_proyecto(client: AsyncClient):
    """Tener una tarea en un proyecto abre ese proyecto entero."""
    headers = await _auth(client, "ana@example.com")

    response = await client.get("/api/capacity", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    # Ana ve los 8 h de su proyecto y los 4 h del proyecto donde tiene tarea.
    assert _row(data, client.ids["ana"])["total_hours"] == 12
    # Jorge es miembro de ese segundo proyecto, asi que tambien sale.
    assert _row(data, client.ids["jorge"])["total_hours"] == 10


async def test_la_capacidad_global_solo_muestra_los_proyectos_visibles(client: AsyncClient):
    headers = await _auth(client, "jorge@example.com")

    response = await client.get("/api/capacity", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    # Jorge solo ve un proyecto: las 8 h de Ana en el otro no le salen.
    assert _row(data, client.ids["ana"])["total_hours"] == 4


async def test_la_capacidad_global_filtra_por_departamento(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get(
        f"/api/capacity?department_id={client.ids['oficina']}", headers=headers
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert _row(data, client.ids["ana"])["total_hours"] == 4
    assert _row(data, client.ids["jorge"])["total_hours"] == 10


async def test_la_capacidad_global_marca_la_semana_de_cada_tarea(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/capacity", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["weeks"] == ["2026-W45"]
    ana = _row(data, client.ids["ana"])
    assert ana["cells"][0]["hours"] == 12
    assert ana["cells"][0]["is_overloaded"] is False


async def test_el_gantt_global_exige_token(client: AsyncClient):
    response = await client.get("/api/gantt")

    assert response.status_code == 401, response.text


async def test_el_gantt_global_devuelve_las_barras_de_todos_los_proyectos(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/gantt", headers=headers)

    assert response.status_code == 200, response.text
    barras = response.json()["tasks"]
    assert len(barras) == 3
    proyectos = {barra["project_name"] for barra in barras}
    assert proyectos == {"Linea Pasteurizadora", "Red de tuberias"}


async def test_el_gantt_global_agrupa_las_barras_por_proyecto(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/gantt", headers=headers)

    assert response.status_code == 200, response.text
    barras = response.json()["tasks"]
    nombres = [barra["project_name"] for barra in barras]
    assert nombres == sorted(nombres)


async def test_el_gantt_global_solo_muestra_los_proyectos_visibles(client: AsyncClient):
    headers = await _auth(client, "jorge@example.com")

    response = await client.get("/api/gantt", headers=headers)

    assert response.status_code == 200, response.text
    barras = response.json()["tasks"]
    assert {barra["project_name"] for barra in barras} == {"Red de tuberias"}


async def test_el_listado_global_de_tareas_reune_los_proyectos_visibles(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/tasks", headers=headers)

    assert response.status_code == 200, response.text
    tareas = response.json()
    assert len(tareas) == 3
    assert {tarea["project_id"] for tarea in tareas} == {
        client.ids["linea"],
        client.ids["tuberias"],
    }


async def test_el_listado_global_de_tareas_filtra_por_persona_y_semana(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get(
        f"/api/tasks?assigned_to={client.ids['ana']}&week=2026-W45", headers=headers
    )

    assert response.status_code == 200, response.text
    tareas = response.json()
    assert len(tareas) == 2
    assert all(tarea["assigned_to"] == client.ids["ana"] for tarea in tareas)


async def test_el_listado_global_de_tareas_exige_token(client: AsyncClient):
    response = await client.get("/api/tasks")

    assert response.status_code == 401, response.text
