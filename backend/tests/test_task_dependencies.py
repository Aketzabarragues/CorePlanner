"""Pruebas de las dependencias entre tareas.

El modulo puro (backend/services/task_dependencies.py) se prueba sin base
de datos: ciclos, violaciones, orden topologico, cascada y ruta critica.
Los endpoints se prueban contra un cliente en memoria, con el mismo patron
que el resto de las pruebas de API.
"""

from __future__ import annotations

from dataclasses import dataclass
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
from backend.services.task_dependencies import (
    critical_path,
    detect_cycle,
    find_violations,
    propose_cascade,
    topological_order,
)

PASSWORD = "clave-de-prueba"

ROLES = {
    "Project Manager": ["capacity.read", "gantt.read", "task.write", "member.manage"],
    "Ingeniero": ["capacity.read", "gantt.read", "task.write"],
    "Lector": ["capacity.read", "gantt.read"],
}


# ---------------------------------------------------------------------------
# Modulo puro
# ---------------------------------------------------------------------------


@dataclass
class Tarea:
    """Tarea con el minimo que pide el grafo: id y fechas."""

    id: int
    start_date: date | None = None
    end_date: date | None = None


def test_detect_cycle_cierra_el_ciclo_con_tres_tareas():
    """A->B->C existe; anadir C->A cierra el ciclo."""
    edges = [(2, 1, "precedes"), (3, 2, "precedes")]

    assert detect_cycle(edges, (1, 3, "precedes")) is True
    # (1,2) cierra un ciclo de dos nodos: la 1 dependeria de la 2 y la 2 ya
    # depende de la 1 (arista (2,1)). Un detector correcto lo marca.
    assert detect_cycle(edges, (1, 2, "precedes")) is True


def test_detect_cycle_los_relates_no_cierran_ciclo():
    """Un vinculo de referencia no restringe: ni cierra ciclo ni se rompe."""
    edges = [(2, 1, "precedes"), (3, 2, "relates")]

    assert detect_cycle(edges, (1, 3, "precedes")) is False
    assert detect_cycle(edges, (1, 3, "relates")) is False


def test_detect_cycle_la_auto_dependencia_cierra_ciclo():
    assert detect_cycle([], (1, 1, "precedes")) is True
    assert detect_cycle([], (1, 1, "relates")) is False


def test_find_violations_el_mismo_dia_no_viola():
    """Empezar el dia en que termina el requisito no es violacion."""
    tareas = {
        1: Tarea(1, date(2026, 3, 2), date(2026, 3, 6)),
        2: Tarea(2, date(2026, 3, 6), date(2026, 3, 10)),
    }
    edges = [(2, 1, "precedes")]

    assert find_violations(tareas, edges) == {}


def test_find_violations_empezar_antes_del_requisito_viola():
    tareas = {
        1: Tarea(1, date(2026, 3, 2), date(2026, 3, 6)),
        2: Tarea(2, date(2026, 3, 5), date(2026, 3, 10)),
    }
    edges = [(2, 1, "precedes")]

    assert find_violations(tareas, edges) == {2: [1]}


def test_find_violations_los_relates_no_violan():
    tareas = {
        1: Tarea(1, date(2026, 3, 2), date(2026, 3, 6)),
        2: Tarea(2, date(2026, 3, 1), date(2026, 3, 10)),
    }
    edges = [(2, 1, "relates")]

    assert find_violations(tareas, edges) == {}


def test_find_violations_sin_fechas_no_viola():
    tareas = {
        1: Tarea(1, None, None),
        2: Tarea(2, date(2026, 3, 1), date(2026, 3, 10)),
    }
    edges = [(2, 1, "precedes")]

    assert find_violations(tareas, edges) == {}


def test_topological_order_requisitos_antes_que_dependientes():
    """Cadena 1->2->3: el requisito siempre va antes en la lista."""
    edges = [(3, 2, "precedes"), (2, 1, "precedes")]

    orden = topological_order(edges)

    assert orden.index(1) < orden.index(2) < orden.index(3)
    assert set(orden) == {1, 2, 3}


def test_topological_order_los_relates_no_restringen_el_orden():
    edges = [(2, 1, "relates")]

    assert sorted(topological_order(edges)) == [1, 2]


def test_propose_cascade_se_propaga_en_cadena_de_tres():
    """Mover la primera arrastra a la segunda y a la tercera."""
    tareas = {
        1: Tarea(1, date(2026, 3, 2), date(2026, 3, 3)),
        2: Tarea(2, date(2026, 3, 4), date(2026, 3, 5)),
        3: Tarea(3, date(2026, 3, 6), date(2026, 3, 7)),
    }
    edges = [(2, 1, "precedes"), (3, 2, "precedes")]

    propuestas = propose_cascade(tareas, edges, 1, 2)

    assert [(mov.task_id, mov.start_date, mov.end_date) for mov in propuestas] == [
        (1, date(2026, 3, 4), date(2026, 3, 5)),
        (2, date(2026, 3, 6), date(2026, 3, 7)),
        (3, date(2026, 3, 8), date(2026, 3, 9)),
    ]


def test_propose_cascade_no_propone_a_quien_no_viola():
    """Con hueco entre requisitos, la dependiente no necesita moverse."""
    tareas = {
        1: Tarea(1, date(2026, 3, 2), date(2026, 3, 3)),
        2: Tarea(2, date(2026, 3, 9), date(2026, 3, 10)),
    }
    edges = [(2, 1, "precedes")]

    propuestas = propose_cascade(tareas, edges, 1, 2)

    assert [mov.task_id for mov in propuestas] == [1]


def test_propose_cascade_delta_cero_no_propone_nada():
    tareas = {
        1: Tarea(1, date(2026, 3, 2), date(2026, 3, 3)),
        2: Tarea(2, date(2026, 3, 4), date(2026, 3, 5)),
    }
    edges = [(2, 1, "precedes")]

    assert propose_cascade(tareas, edges, 1, 0) == []


def test_critical_path_es_la_cadena_mas_larga_en_dias():
    tareas = {
        1: Tarea(1, date(2026, 3, 2), date(2026, 3, 6)),
        2: Tarea(2, date(2026, 3, 7), date(2026, 3, 9)),
        3: Tarea(3, date(2026, 3, 2), date(2026, 3, 3)),
        4: Tarea(4, date(2026, 3, 4), date(2026, 3, 5)),
    }
    edges = [
        (2, 1, "precedes"),
        (4, 3, "precedes"),
        (5, 2, "precedes"),
    ]
    tareas[5] = Tarea(5, date(2026, 3, 10), date(2026, 3, 15))

    # 1(5) -> 2(3) -> 5(6) = 14 dias; 3(2) -> 4(2) = 4 dias.
    assert critical_path(tareas, edges) == [1, 2, 5]


def test_critical_path_desempate_por_menor_identificador():
    """Dos cadenas de igual duracion: manda la que empieza por el menor id."""
    tareas = {
        1: Tarea(1, date(2026, 3, 2), date(2026, 3, 6)),
        2: Tarea(2, date(2026, 3, 7), date(2026, 3, 10)),
        3: Tarea(3, date(2026, 3, 2), date(2026, 3, 6)),
        4: Tarea(4, date(2026, 3, 7), date(2026, 3, 10)),
    }
    edges = [(2, 1, "precedes"), (4, 3, "precedes")]

    assert critical_path(tareas, edges) == [1, 2]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


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
    engineer = User(
        name="Engineer",
        email="engineer@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    reader = User(
        name="Reader",
        email="reader@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    outsider = User(
        name="Outsider",
        email="outsider@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    proyecto_a = Project(name="Linea 1", status="active")
    proyecto_b = Project(name="Linea 2", status="active")
    session.add_all([admin, engineer, reader, outsider, proyecto_a, proyecto_b])
    await session.flush()

    session.add_all(
        [
            ProjectMember(
                user_id=engineer.id,
                project_id=proyecto_a.id,
                role_id=roles["Ingeniero"].id,
            ),
            ProjectMember(
                user_id=reader.id,
                project_id=proyecto_a.id,
                role_id=roles["Lector"].id,
            ),
            ProjectMember(
                user_id=engineer.id,
                project_id=proyecto_b.id,
                role_id=roles["Ingeniero"].id,
            ),
        ]
    )

    tareas = [
        Task(
            project_id=proyecto_a.id,
            title="Fase 1",
            status=TaskStatus.DONE.value,
            start_date=date(2026, 3, 2),
            end_date=date(2026, 3, 6),
            estimated_hours=8,
        ),
        Task(
            project_id=proyecto_a.id,
            title="Fase 2",
            status=TaskStatus.BACKLOG.value,
            start_date=date(2026, 3, 5),
            end_date=date(2026, 3, 9),
            estimated_hours=8,
        ),
        Task(
            project_id=proyecto_a.id,
            title="Fase 3",
            status=TaskStatus.BACKLOG.value,
            start_date=date(2026, 3, 8),
            end_date=date(2026, 3, 12),
            estimated_hours=8,
        ),
    ]
    otra = Task(
        project_id=proyecto_b.id,
        title="De otra linea",
        status=TaskStatus.BACKLOG.value,
        start_date=date(2026, 3, 2),
        end_date=date(2026, 3, 6),
        estimated_hours=8,
    )
    session.add_all([*tareas, otra])
    await session.flush()

    ids.update(
        project_a=proyecto_a.id,
        project_b=proyecto_b.id,
        admin=admin.id,
        engineer=engineer.id,
        reader=reader.id,
        outsider=outsider.id,
        t1=tareas[0].id,
        t2=tareas[1].id,
        t3=tareas[2].id,
        t4=otra.id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _crear_vinculo(client: AsyncClient, headers, task_id, depends_on_id, tipo="precedes"):
    return await client.post(
        f"/api/projects/{client.ids['project_a']}/dependencies",
        json={"task_id": task_id, "depends_on_id": depends_on_id, "type": tipo},
        headers=headers,
    )


async def test_alta_de_vinculo_devuelve_201(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await _crear_vinculo(client, headers, client.ids["t2"], client.ids["t1"])

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["task_id"] == client.ids["t2"]
    assert data["depends_on_id"] == client.ids["t1"]
    assert data["type"] == "precedes"
    assert isinstance(data["id"], int)


async def test_alta_sin_permiso_responde_403(client: AsyncClient):
    headers = await _auth(client, "reader@example.com")

    response = await _crear_vinculo(client, headers, client.ids["t2"], client.ids["t1"])

    assert response.status_code == 403
    assert "task.write" in response.json()["detail"]


async def test_alta_de_vinculo_repetido_responde_422(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")
    primera = await _crear_vinculo(client, headers, client.ids["t2"], client.ids["t1"])
    assert primera.status_code == 201

    segunda = await _crear_vinculo(client, headers, client.ids["t2"], client.ids["t1"])

    assert segunda.status_code == 422
    assert "ya existe" in segunda.json()["detail"]


async def test_alta_con_tarea_de_otro_proyecto_responde_422(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await _crear_vinculo(client, headers, client.ids["t2"], client.ids["t4"])

    assert response.status_code == 422
    assert "mismo proyecto" in response.json()["detail"]


async def test_alta_con_tarea_inexistente_responde_422(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await _crear_vinculo(client, headers, client.ids["t2"], 9999)

    assert response.status_code == 422


async def test_alta_de_auto_dependencia_responde_422(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await _crear_vinculo(client, headers, client.ids["t1"], client.ids["t1"])

    assert response.status_code == 422
    assert "si misma" in response.json()["detail"]


async def test_alta_que_cierra_ciclo_responde_422(client: AsyncClient):
    """Fase1<-Fase2<-Fase3; anadir Fase3<-Fase1 cierra el ciclo."""
    headers = await _auth(client, "engineer@example.com")
    ids = client.ids

    for dependiente, requisito in ((ids["t2"], ids["t1"]), (ids["t3"], ids["t2"])):
        respuesta = await _crear_vinculo(client, headers, dependiente, requisito)
        assert respuesta.status_code == 201, respuesta.text

    respuesta = await _crear_vinculo(client, headers, ids["t1"], ids["t3"])

    assert respuesta.status_code == 422
    assert "ciclo" in respuesta.json()["detail"]


async def test_alta_con_tipo_invalido_responde_422(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await _crear_vinculo(
        client, headers, client.ids["t2"], client.ids["t1"], tipo="finicia"
    )

    assert response.status_code == 422


async def test_baja_de_vinculo_por_el_par(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")
    ids = client.ids
    alta = await _crear_vinculo(client, headers, ids["t2"], ids["t1"])
    assert alta.status_code == 201

    response = await client.delete(
        f"/api/tasks/{ids['t2']}/dependencies/{ids['t1']}", headers=headers
    )

    assert response.status_code == 204, response.text

    listado = await client.get(
        f"/api/projects/{ids['project_a']}/dependencies", headers=headers
    )
    assert listado.json()["dependencies"] == []


async def test_baja_de_vinculo_que_no_existe_responde_404(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")

    response = await client.delete(
        f"/api/tasks/{client.ids['t2']}/dependencies/{client.ids['t1']}",
        headers=headers,
    )

    assert response.status_code == 404


async def test_baja_sin_permiso_responde_403(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")
    alta = await _crear_vinculo(client, headers, client.ids["t2"], client.ids["t1"])
    assert alta.status_code == 201
    lector = await _auth(client, "reader@example.com")

    response = await client.delete(
        f"/api/tasks/{client.ids['t2']}/dependencies/{client.ids['t1']}",
        headers=lector,
    )

    assert response.status_code == 403


async def test_la_tarea_muestra_sus_requisitos_y_dependientes(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")
    ids = client.ids
    await _crear_vinculo(client, headers, ids["t2"], ids["t1"])
    await _crear_vinculo(client, headers, ids["t3"], ids["t2"])

    response = await client.get(f"/api/tasks/{ids['t2']}/dependencies", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert [r["depends_on_id"] for r in data["requirements"]] == [ids["t1"]]
    assert [r["task_id"] for r in data["dependents"]] == [ids["t3"]]


async def test_el_listado_del_proyecto_lleva_titulos(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")
    ids = client.ids
    await _crear_vinculo(client, headers, ids["t2"], ids["t1"])

    response = await client.get(
        f"/api/projects/{ids['project_a']}/dependencies", headers=headers
    )

    assert response.status_code == 200, response.text
    [fila] = response.json()["dependencies"]
    assert fila["task_id"] == ids["t2"]
    assert fila["depends_on_id"] == ids["t1"]
    assert fila["task_title"] == "Fase 2"
    assert fila["depends_on_title"] == "Fase 1"


async def test_el_listado_del_proyecto_exige_permiso(client: AsyncClient):
    headers = await _auth(client, "outsider@example.com")

    response = await client.get(
        f"/api/projects/{client.ids['project_a']}/dependencies", headers=headers
    )

    assert response.status_code == 403


async def test_cascada_es_propuesta_y_no_modifica(client: AsyncClient):
    """La cascada devuelve lo que habria que mover; nada se aplica."""
    headers = await _auth(client, "engineer@example.com")
    ids = client.ids
    await _crear_vinculo(client, headers, ids["t2"], ids["t1"])
    await _crear_vinculo(client, headers, ids["t3"], ids["t2"])

    response = await client.get(
        f"/api/tasks/{ids['t1']}/cascade?delta_days=2", headers=headers
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["task_id"] == ids["t1"]
    assert data["delta_days"] == 2
    assert [mov["task_id"] for mov in data["moves"]] == [ids["t1"], ids["t2"], ids["t3"]]
    assert data["moves"][0]["start_date"] == "2026-03-04"
    assert data["moves"][0]["end_date"] == "2026-03-08"
    assert data["moves"][1]["start_date"] == "2026-03-07"
    assert data["moves"][2]["end_date"] == "2026-03-14"

    tareas = await client.get(f"/api/projects/{ids['project_a']}/tasks", headers=headers)
    fechas = {t["id"]: (t["start_date"], t["end_date"]) for t in tareas.json()}
    assert fechas[ids["t1"]] == ("2026-03-02", "2026-03-06")
    assert fechas[ids["t2"]] == ("2026-03-05", "2026-03-09")
    assert fechas[ids["t3"]] == ("2026-03-08", "2026-03-12")


async def test_cascada_cero_no_propone(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")
    await _crear_vinculo(client, headers, client.ids["t2"], client.ids["t1"])

    response = await client.get(
        f"/api/tasks/{client.ids['t1']}/cascade?delta_days=0", headers=headers
    )

    assert response.status_code == 200, response.text
    assert response.json()["moves"] == []


# ---------------------------------------------------------------------------
# Feed del Gantt
# ---------------------------------------------------------------------------


async def test_el_gantt_lleva_los_vinculos_y_las_violaciones(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")
    ids = client.ids
    # Fase 2 empieza antes de que termine Fase 1: violacion.
    await _crear_vinculo(client, headers, ids["t2"], ids["t1"], tipo="relates")
    await client.post(
        f"/api/projects/{ids['project_a']}/tasks",
        json={
            "title": "Apretada",
            "start_date": "2026-03-05",
            "end_date": "2026-03-06",
            "estimated_hours": "2.00",
        },
        headers=headers,
    )
    respuesta = await client.get(
        f"/api/projects/{ids['project_a']}/tasks", headers=headers
    )
    apretada = next(
        t for t in respuesta.json() if t["title"] == "Apretada"
    )
    await _crear_vinculo(client, headers, apretada["id"], ids["t1"])

    response = await client.get(
        f"/api/projects/{ids['project_a']}/gantt", headers=headers
    )

    assert response.status_code == 200, response.text
    data = response.json()
    enlaces = {(e["task_id"], e["depends_on_id"], e["type"]) for e in data["dependencies"]}
    assert (apretada["id"], ids["t1"], "precedes") in enlaces
    assert (ids["t2"], ids["t1"], "relates") in enlaces
    barras = {barra["id"]: barra for barra in data["tasks"]}
    assert barras[apretada["id"]]["violations"] == [ids["t1"]]
    assert barras[ids["t1"]]["violations"] == []


async def test_el_gantt_marca_la_violacion_y_el_mismo_dia_no(client: AsyncClient):
    headers = await _auth(client, "engineer@example.com")
    ids = client.ids

    just_after = await client.post(
        f"/api/projects/{ids['project_a']}/tasks",
        json={
            "title": "Justo despues",
            "start_date": "2026-03-06",
            "end_date": "2026-03-08",
            "estimated_hours": "2.00",
        },
        headers=headers,
    )
    # Empieza el dia en que termina t1: no es violacion.
    await _crear_vinculo(client, headers, just_after.json()["id"], ids["t1"])

    temprana = await client.post(
        f"/api/projects/{ids['project_a']}/tasks",
        json={
            "title": "Antes de tiempo",
            "start_date": "2026-03-04",
            "end_date": "2026-03-05",
            "estimated_hours": "2.00",
        },
        headers=headers,
    )
    # Empieza antes de que termine t1: si lo es.
    await _crear_vinculo(client, headers, temprana.json()["id"], ids["t1"])

    response = await client.get(
        f"/api/projects/{ids['project_a']}/gantt", headers=headers
    )

    barras = {barra["id"]: barra for barra in response.json()["tasks"]}
    assert barras[just_after.json()["id"]]["violations"] == []
    assert barras[temprana.json()["id"]]["violations"] == [ids["t1"]]
