"""Pruebas de los incidentes de capacidad.

Cubren la apertura por mutacion de tarea (misma transaccion, sin duplicados,
sin reabrir), el ambito de la lista por rol de empresa y la resolucion por
jefe de departamento o gerente.
"""

from __future__ import annotations

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
    User,
)

PASSWORD = "clave-de-prueba"

ROLE_PM = {
    "Project Manager": ["capacity.read", "gantt.read", "task.write", "member.manage"]
}

# Lunes de la 2026-W20: todo el trabajo de prueba pisa esa semana.
SEMANA = "2026-W20"
INICIO = "2026-05-11"
FIN = "2026-05-15"


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
    dep_a = Department(name="Linea A")
    dep_b = Department(name="Linea B")
    session.add_all([dep_a, dep_b])
    await session.flush()

    role = Role(name="Project Manager", permissions_json=ROLE_PM["Project Manager"])
    session.add(role)
    await session.flush()

    gerente = User(
        name="Gerente",
        email="gerente@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role="gerente",
    )
    jefe_a = User(
        name="Jefe A",
        email="jefe-a@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role="jefe_departamento",
        department_id=dep_a.id,
    )
    jefe_b = User(
        name="Jefe B",
        email="jefe-b@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role="jefe_departamento",
        department_id=dep_b.id,
    )
    tec_a = User(
        name="Tecnico A",
        email="tec-a@example.com",
        hashed_password=hash_password(PASSWORD),
        department_id=dep_a.id,
    )
    tec_b = User(
        name="Tecnico B",
        email="tec-b@example.com",
        hashed_password=hash_password(PASSWORD),
        department_id=dep_b.id,
    )
    project = Project(name="Linea 1", status="active")
    session.add_all([gerente, jefe_a, jefe_b, tec_a, tec_b, project])
    await session.flush()

    for user in (gerente, jefe_a, jefe_b, tec_a, tec_b):
        session.add(
            ProjectMember(
                user_id=user.id, project_id=project.id, role_id=role.id
            )
        )
    # La politica de la persona manda: tec_a necesita aprobacion al 100 %.
    session.add(
        CapacityPolicy(
            scope_type="persona",
            scope_id=tec_a.id,
            warn_percent=80,
            requires_approval_percent=100,
        )
    )
    await session.flush()

    ids.update(
        project=project.id,
        gerente=gerente.id,
        jefe_a=jefe_a.id,
        jefe_b=jefe_b.id,
        tec_a=tec_a.id,
        tec_b=tec_b.id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _crear_tarea(
    client: AsyncClient,
    auth: dict[str, str],
    project_id: int,
    assigned_to: int,
    hours: str,
    start: str = INICIO,
    end: str = FIN,
) -> dict:
    response = await client.post(
        f"/api/projects/{project_id}/tasks",
        headers=auth,
        json={
            "title": "Trabajo",
            "assigned_to": assigned_to,
            "start_date": start,
            "end_date": end,
            "estimated_hours": hours,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _editar_tarea(
    client: AsyncClient, auth: dict[str, str], task_id: int, **cambios: object
) -> dict:
    response = await client.patch(
        f"/api/tasks/{task_id}", headers=auth, json=cambios
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _borrar_tarea(client: AsyncClient, auth: dict[str, str], task_id: int) -> None:
    response = await client.delete(f"/api/tasks/{task_id}", headers=auth)
    assert response.status_code == 204, response.text


async def _listar(client: AsyncClient, auth: dict[str, str]) -> list[dict]:
    response = await client.get("/api/capacity-incidents", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


async def _resolver(
    client: AsyncClient,
    auth: dict[str, str],
    incident_id: int,
    decision: str = "aprobada",
    note: str | None = None,
):
    return await client.post(
        f"/api/capacity-incidents/{incident_id}/resolve",
        headers=auth,
        json={"decision": decision, "note": note},
    )


async def test_crear_tarea_por_encima_del_umbral_abre_incidente(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")

    items = await _listar(client, auth)
    assert len(items) == 1
    item = items[0]
    assert item["user_id"] == ids["tec_a"]
    assert item["week"] == SEMANA
    assert item["state"] == "pendiente"
    assert item["hours"] == 40
    assert item["capacity"] == 40
    assert item["requires_approval_percent"] == 100


async def test_carga_por_encima_del_aviso_no_abre_incidente(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    # 32 h: al 80 % de la capacidad, en aviso, sin llegar a aprobacion.
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "32.00")

    assert await _listar(client, auth) == []


async def test_otra_mutacion_en_la_misma_semana_no_duplica(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    tarea = await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")
    await _editar_tarea(client, auth, tarea["id"], estimated_hours="30.00")
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "10.00")

    items = await _listar(client, auth)
    assert len(items) == 1
    # La carga que se ve es la actual: 30 + 10.
    assert items[0]["hours"] == 40


async def test_otra_persona_con_politica_abre_su_incidente(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")

    items = await _listar(client, auth)
    assert len(items) == 1
    assert items[0]["user_id"] == ids["tec_a"]


async def test_resuelto_no_se_reabre(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    auth_jefe = await _auth(client, "jefe-a@example.com")
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")
    items = await _listar(client, auth)
    incident = items[0]

    response = await _resolver(client, auth_jefe, incident["id"])
    assert response.status_code == 200, response.text
    assert response.json()["state"] == "aprobada"

    # La carga vuelve a superar el umbral y no se abre otro incidente.
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")
    items = await _listar(client, auth)
    assert len(items) == 1
    assert items[0]["state"] == "aprobada"
    assert items[0]["hours"] == 80


async def test_el_jefe_puede_resolver(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    auth_jefe = await _auth(client, "jefe-a@example.com")
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")
    incident = (await _listar(client, auth))[0]

    response = await _resolver(
        client, auth_jefe, incident["id"], decision="rechazada", note="Replanificar"
    )
    assert response.status_code == 200, response.text
    item = response.json()
    assert item["state"] == "rechazada"
    assert item["note"] == "Replanificar"
    assert item["resolved_by"] == "Jefe A"
    assert item["resolved_at"] is not None


async def test_el_gerente_puede_resolver(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")
    incident = (await _listar(client, auth))[0]

    response = await _resolver(client, auth, incident["id"])
    assert response.status_code == 200, response.text
    assert response.json()["resolved_by"] == "Gerente"


async def test_un_technico_no_puede_resolver(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    auth_tec = await _auth(client, "tec-b@example.com")
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")
    incident = (await _listar(client, auth))[0]

    response = await _resolver(client, auth_tec, incident["id"])
    assert response.status_code == 403


async def test_un_jefe_de_otro_departamento_no_puede_resolver(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    auth_jefe_b = await _auth(client, "jefe-b@example.com")
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")
    incident = (await _listar(client, auth))[0]

    response = await _resolver(client, auth_jefe_b, incident["id"])
    assert response.status_code == 403


async def test_resolver_inexistente_responde_404(client):
    auth = await _auth(client, "gerente@example.com")
    response = await _resolver(client, auth, 999999)
    assert response.status_code == 404


async def test_decision_invalida_responde_422(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")
    incident = (await _listar(client, auth))[0]

    response = await _resolver(client, auth, incident["id"], decision="otra-cosa")
    assert response.status_code == 422


async def test_resolver_de_nuevo_responde_422(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")
    incident = (await _listar(client, auth))[0]

    first = await _resolver(client, auth, incident["id"])
    assert first.status_code == 200
    second = await _resolver(client, auth, incident["id"])
    assert second.status_code == 422


async def test_el_technico_ve_solo_los_suyos(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    auth_tec_a = await _auth(client, "tec-a@example.com")
    auth_tec_b = await _auth(client, "tec-b@example.com")
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")

    items_a = await _listar(client, auth_tec_a)
    assert [item["user_id"] for item in items_a] == [ids["tec_a"]]
    assert await _listar(client, auth_tec_b) == []


async def test_el_jefe_ve_los_de_su_departamento(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    auth_jefe_a = await _auth(client, "jefe-a@example.com")
    auth_jefe_b = await _auth(client, "jefe-b@example.com")
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")

    items_a = await _listar(client, auth_jefe_a)
    assert [item["user_id"] for item in items_a] == [ids["tec_a"]]
    assert await _listar(client, auth_jefe_b) == []


async def test_el_gerente_ve_todos(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")

    items = await _listar(client, auth)
    assert len(items) == 1
    assert items[0]["user_name"] == "Tecnico A"


async def test_editar_tarea_por_encima_del_umbral_abre_incidente(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    tarea = await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "20.00")
    assert await _listar(client, auth) == []

    await _editar_tarea(client, auth, tarea["id"], estimated_hours="45.00")

    items = await _listar(client, auth)
    assert len(items) == 1
    assert items[0]["hours"] == 45


async def test_reasignar_abre_incidente_para_el_nuevo(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    tarea = await _crear_tarea(client, auth, ids["project"], ids["tec_b"], "40.00")
    assert await _listar(client, auth) == []

    await _editar_tarea(client, auth, tarea["id"], assigned_to=ids["tec_a"])

    items = await _listar(client, auth)
    assert len(items) == 1
    assert items[0]["user_id"] == ids["tec_a"]


async def test_borrar_tarea_no_abre_ni_cierra(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")
    tarea = await _crear_tarea(client, auth, ids["project"], ids["tec_a"], "40.00")
    assert (await _listar(client, auth))[0]["state"] == "pendiente"

    await _borrar_tarea(client, auth, tarea["id"])

    items = await _listar(client, auth)
    assert len(items) == 1
    # El incidente sigue abierto: la carga actual es cero, pero no se cierra
    # solo; quien lo resuelve ve esa carga y decide.
    assert items[0]["state"] == "pendiente"
    assert items[0]["hours"] == 0


async def test_mutacion_que_falla_no_deja_incidente(client):
    ids = client.ids
    auth = await _auth(client, "gerente@example.com")

    # Rango invertido: la validacion responde 422 antes de tocar la base.
    response = await client.post(
        f"/api/projects/{ids['project']}/tasks",
        headers=auth,
        json={
            "title": "Trabajo",
            "assigned_to": ids["tec_a"],
            "start_date": "2026-05-15",
            "end_date": "2026-05-11",
            "estimated_hours": "40.00",
        },
    )
    assert response.status_code == 422
    assert await _listar(client, auth) == []
