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

    ana.department_id = automatizacion.id
    jorge.department_id = oficina.id
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


async def _departamentos(client: AsyncClient, entrar) -> dict[str, int]:
    """Id de cada departamento, leidos con el gerente."""
    headers = await entrar("ivan@example.com")
    response = await client.get("/api/departments", headers=headers)
    assert response.status_code == 200, response.text
    return {item["name"]: item["id"] for item in response.json()}


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


async def test_la_capacidad_global_trae_el_departamento_de_cada_persona(
    client: AsyncClient,
):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/capacity", headers=headers)

    assert response.status_code == 200, response.text
    filas = {fila["user_id"]: fila for fila in response.json()["rows"]}
    assert filas[client.ids["ana"]]["department_name"] == "Automatizacion"
    assert filas[client.ids["jorge"]]["department_name"] == "Oficina Tecnica"


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
    assert [week["week"] for week in data["weeks"]] == ["2026-W45"]
    ana = _row(data, client.ids["ana"])
    assert ana["cells"][0]["hours"] == 12
    assert ana["cells"][0]["is_overloaded"] is False


async def test_la_capacidad_global_acepta_un_rango_de_semanas(client: AsyncClient):
    """Con rango, el eje sale completo aunque no haya actividad."""
    headers = await _auth(client, "admin@example.com")

    response = await client.get(
        "/api/capacity?from=2026-W45&to=2026-W47", headers=headers
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert [week["week"] for week in data["weeks"]] == [
        "2026-W45",
        "2026-W46",
        "2026-W47",
    ]
    ana = _row(data, client.ids["ana"])
    assert [cell["hours"] for cell in ana["cells"]] == [12, 0, 0]


async def test_un_rango_de_semanas_invalido_es_422(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get(
        "/api/capacity?from=2026-W99&to=2026-W99", headers=headers
    )

    assert response.status_code == 422, response.text


async def test_un_rango_a_medias_es_422(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/capacity?from=2026-W45", headers=headers)

    assert response.status_code == 422, response.text


async def test_la_capacidad_global_filtra_por_proyecto(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get(
        f"/api/capacity?project_id={client.ids['linea']}", headers=headers
    )

    assert response.status_code == 200, response.text
    data = response.json()
    # El filtro de proyecto acota las horas, no las filas: Ana tiene las 8 h de
    # la linea y Jorge sigue en el informe, con la celda vacia.
    assert _row(data, client.ids["ana"])["total_hours"] == 8
    jorge = _row(data, client.ids["jorge"])
    assert jorge is not None
    assert jorge["total_hours"] == 0


async def test_el_filtro_de_proyecto_no_amplia_el_ambito(client: AsyncClient):
    """Filtrar por un proyecto no saca a nadie de su alcance."""
    headers = await _auth(client, "jorge@example.com")

    response = await client.get(
        f"/api/capacity?project_id={client.ids['tuberias']}", headers=headers
    )

    assert response.status_code == 200, response.text
    data = response.json()
    # Jorge solo ve un proyecto: las 8 h de Ana en el otro no le salen, pero
    # Ana sigue en el informe porque tiene una tarea en el que si ve.
    assert _row(data, client.ids["ana"])["total_hours"] == 4
    assert _row(data, client.ids["jorge"])["total_hours"] == 10


async def test_un_proyecto_que_no_se_ve_es_404(client: AsyncClient):
    headers = await _auth(client, "jorge@example.com")

    response = await client.get(
        f"/api/capacity?project_id={client.ids['linea']}", headers=headers
    )

    assert response.status_code == 404, response.text


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


async def test_el_gantt_global_filtra_por_proyecto(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get(
        f"/api/gantt?project_id={client.ids['linea']}", headers=headers
    )

    assert response.status_code == 200, response.text
    barras = response.json()["tasks"]
    assert barras
    assert {barra["project_name"] for barra in barras} == {"Linea Pasteurizadora"}


async def test_el_gantt_global_oculta_un_proyecto_que_no_se_ve(client: AsyncClient):
    headers = await _auth(client, "jorge@example.com")

    response = await client.get(
        f"/api/gantt?project_id={client.ids['linea']}", headers=headers
    )

    assert response.status_code == 404, response.text


async def test_el_gantt_global_filtra_por_departamento(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get(
        f"/api/gantt?department_id={client.ids['automatizacion']}", headers=headers
    )

    assert response.status_code == 200, response.text
    barras = response.json()["tasks"]
    assert {barra["project_name"] for barra in barras} == {"Linea Pasteurizadora"}


async def test_el_gantt_global_filtra_por_persona(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get(
        f"/api/gantt?assigned_to={client.ids['ana']}", headers=headers
    )

    assert response.status_code == 200, response.text
    data = response.json()
    barras = data["tasks"]
    assert len(barras) == 2
    assert {barra["assigned_name"] for barra in barras} == {"Ana"}
    assert {miembro["name"] for miembro in data["members"]} == {"Ana"}


async def test_el_gantt_global_con_filtros_no_amplia_el_ambito(client: AsyncClient):
    """Filtrar no enseña trabajo de proyectos que no estan a la vista."""
    headers = await _auth(client, "jorge@example.com")

    response = await client.get(
        f"/api/gantt?assigned_to={client.ids['ana']}", headers=headers
    )

    assert response.status_code == 200, response.text
    barras = response.json()["tasks"]
    assert len(barras) == 1
    assert barras[0]["title"] == "Revision de esquemas"


async def test_el_gantt_global_no_muestra_un_departamento_que_no_se_ve(
    client: AsyncClient,
):
    headers = await _auth(client, "jorge@example.com")

    response = await client.get(
        f"/api/gantt?department_id={client.ids['automatizacion']}", headers=headers
    )

    assert response.status_code == 200, response.text
    assert response.json()["tasks"] == []


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


async def test_el_panel_de_un_jefe_de_area_no_se_sale_de_su_departamento(
    client_con_seed: AsyncClient,
    entrar,
):
    """Jorge pide el panel y solo le salen los proyectos de Energia.

    Es la prueba que fija el ambito del panel global: un jefe de area no ve
    los proyectos de los demas departamentos ni en el desglose.
    """
    headers = await entrar("jorge@example.com")

    response = await client_con_seed.get("/api/panel", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    departamentos = await _departamentos(client_con_seed, entrar)
    assert data["projects"]
    assert {p["department_id"] for p in data["projects"]} == {departamentos["Energía"]}
    assert [d["name"] for d in data["by_department"]] == ["Energía"]


async def test_el_panel_del_gerente_desglosa_los_tres_departamentos(
    client_con_seed: AsyncClient,
    entrar,
):
    headers = await entrar("ivan@example.com")

    response = await client_con_seed.get("/api/panel", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert [d["name"] for d in data["by_department"]] == [
        "Alimentación",
        "Energía",
        "Medio Ambiente",
    ]
    assert [d["active_projects"] for d in data["by_department"]] == [5, 3, 3]
    assert [d["overloaded_people"] for d in data["by_department"]] == [1, 0, 1]


async def test_el_desglose_por_departamento_cuadra_con_el_total(
    client_con_seed: AsyncClient,
    entrar,
):
    """Las horas de los departamentos suman las horas del panel."""
    headers = await entrar("ivan@example.com")

    response = await client_con_seed.get("/api/panel", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert sum(d["planned_hours"] for d in data["by_department"]) == pytest.approx(
        data["planned_hours"]
    )
    assert sum(d["capacity_hours"] for d in data["by_department"]) == pytest.approx(
        data["capacity_hours"]
    )


async def test_el_desglose_por_departamento_tiene_las_cifras_de_cada_equipo(
    client_con_seed: AsyncClient,
    entrar,
):
    """Cada departamento se mide con su equipo, en la semana pedida."""
    headers = await entrar("ivan@example.com")

    response = await client_con_seed.get(
        "/api/panel?from=2026-W46&to=2026-W46", headers=headers
    )

    assert response.status_code == 200, response.text
    data = response.json()
    esperado = {
        "Alimentación": {
            "active_projects": 5,
            "overloaded_people": 1,
            "utilization": 38,
            "planned_hours": 57.28,
            "capacity_hours": 152.0,
        },
        "Energía": {
            "active_projects": 3,
            "overloaded_people": 0,
            "utilization": 51,
            "planned_hours": 49.32,
            "capacity_hours": 96.0,
        },
        "Medio Ambiente": {
            "active_projects": 3,
            "overloaded_people": 1,
            "utilization": 53,
            "planned_hours": 64.0,
            "capacity_hours": 120.0,
        },
    }
    for departamento in data["by_department"]:
        valores = esperado[departamento["name"]]
        assert departamento["active_projects"] == valores["active_projects"]
        assert departamento["overloaded_people"] == valores["overloaded_people"]
        assert departamento["utilization"] == valores["utilization"]
        assert departamento["planned_hours"] == pytest.approx(valores["planned_hours"])
        assert departamento["capacity_hours"] == pytest.approx(valores["capacity_hours"])


async def test_un_tecnico_solo_desglosa_su_departamento(
    client_con_seed: AsyncClient, entrar
):
    """Aketza ve un solo departamento: el desglose de uno no aporta nada."""
    headers = await entrar("aketza@example.com")

    response = await client_con_seed.get("/api/panel", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert [d["name"] for d in data["by_department"]] == ["Alimentación"]


async def test_el_panel_exige_token(client_con_seed: AsyncClient):
    response = await client_con_seed.get("/api/panel")

    assert response.status_code == 401, response.text
