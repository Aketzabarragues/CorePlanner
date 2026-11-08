"""Pruebas del detalle de una tarea: descripcion, comentarios y checklist.

Lo que se puede hacer con una tarea lo marca el permiso de escritura en su
proyecto: quien puede editarla puede comentar y tocar su lista de
comprobacion. Quien solo puede leer, lee.
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

ROLES = {
    "Project Manager": ["capacity.read", "gantt.read", "task.write", "member.manage"],
    "Ingeniero": ["capacity.read", "gantt.read", "task.write"],
    "Lector": ["capacity.read", "gantt.read"],
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

    gerente = User(
        name="Gerente",
        email="gerente@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role="gerente",
    )
    manager = User(
        name="Manager",
        email="manager@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    engineer = User(
        name="Ingeniero",
        email="engineer@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    reader = User(
        name="Lector",
        email="reader@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    outsider = User(
        name="Ajeno",
        email="outsider@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    primera = Project(name="Linea 1", status="active")
    segunda = Project(name="Linea 2", status="active")
    session.add_all([gerente, manager, engineer, reader, outsider, primera, segunda])
    await session.flush()

    session.add_all(
        [
            ProjectMember(
                user_id=manager.id,
                project_id=primera.id,
                role_id=roles["Project Manager"].id,
            ),
            ProjectMember(
                user_id=engineer.id,
                project_id=primera.id,
                role_id=roles["Ingeniero"].id,
            ),
            ProjectMember(
                user_id=reader.id,
                project_id=primera.id,
                role_id=roles["Lector"].id,
            ),
        ]
    )

    task = Task(
        project_id=primera.id,
        assigned_to=engineer.id,
        title="Programacion",
        status=TaskStatus.BACKLOG.value,
        start_date=date(2026, 3, 5),
        end_date=date(2026, 3, 11),
        estimated_hours=40,
    )
    otra = Task(
        project_id=primera.id,
        title="Otra tarea",
        status=TaskStatus.BACKLOG.value,
        start_date=date(2026, 3, 5),
        end_date=date(2026, 3, 11),
        estimated_hours=8,
    )
    session.add_all([task, otra])
    await session.flush()

    ids.update(
        primera=primera.id,
        segunda=segunda.id,
        gerente=gerente.id,
        manager=manager.id,
        engineer=engineer.id,
        reader=reader.id,
        outsider=outsider.id,
        task=task.id,
        otra=otra.id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _entradas(client: AsyncClient, email: str, **params) -> list[dict]:
    headers = await _auth(client, email)
    response = await client.get("/api/activity", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["items"]


async def test_leer_la_tarea_trae_la_descripcion(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.get(f"/api/tasks/{client.ids['task']}", headers=headers)

    assert response.status_code == 200, response.text
    assert response.json()["title"] == "Programacion"
    assert response.json()["description"] is None


async def test_actualizar_la_descripcion_la_guarda(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.patch(
        f"/api/tasks/{client.ids['task']}",
        json={"description": "Revisar los bloques SCL antes de compilar."},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["description"] == "Revisar los bloques SCL antes de compilar."


async def test_el_cambio_de_descripcion_queda_registrado(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    await client.patch(
        f"/api/tasks/{client.ids['task']}",
        json={"description": "Revisar los bloques SCL antes de compilar."},
        headers=headers,
    )

    entradas = await _entradas(client, "manager@example.com")
    assert len(entradas) == 1
    assert entradas[0]["action"] == "task.updated"
    cambios = entradas[0]["payload"]["changes"]
    assert cambios["description"]["from"] is None
    assert cambios["description"]["to"] == "Revisar los bloques SCL antes de compilar."


async def test_poner_un_comentario_lo_devuelve_con_su_autor(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.post(
        f"/api/tasks/{client.ids['task']}/comments",
        json={"body": "Empezamos por el PLC."},
        headers=headers,
    )

    assert response.status_code == 201, response.text
    comentario = response.json()
    assert comentario["body"] == "Empezamos por el PLC."
    assert comentario["author_name"] == "Manager"
    assert comentario["task_id"] == client.ids["task"]


async def test_leer_los_comentarios_de_la_tarea(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")
    await client.post(
        f"/api/tasks/{client.ids['task']}/comments",
        json={"body": "Primero el PLC."},
        headers=headers,
    )
    await client.post(
        f"/api/tasks/{client.ids['task']}/comments",
        json={"body": "Despues el SCADA."},
        headers=headers,
    )

    response = await client.get(
        f"/api/tasks/{client.ids['task']}/comments", headers=headers
    )

    assert response.status_code == 200, response.text
    cuerpos = [comentario["body"] for comentario in response.json()]
    assert cuerpos == ["Primero el PLC.", "Despues el SCADA."]


async def test_un_comentario_vacio_no_se_acepta(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.post(
        f"/api/tasks/{client.ids['task']}/comments",
        json={"body": "   "},
        headers=headers,
    )

    assert response.status_code == 422


async def test_las_fechas_vienen_con_zona(client: AsyncClient):
    """Sin zona, el navegador leeria la hora de UTC como si fuera local."""
    headers = await _auth(client, "manager@example.com")

    comentario = await client.post(
        f"/api/tasks/{client.ids['task']}/comments",
        json={"body": "Con fecha."},
        headers=headers,
    )
    punto = await client.post(
        f"/api/tasks/{client.ids['task']}/checklist",
        json={"label": "Con fecha"},
        headers=headers,
    )

    assert comentario.json()["created_at"].endswith("Z")
    assert punto.json()["created_at"].endswith("Z")


async def test_el_comentario_queda_registrado(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    await client.post(
        f"/api/tasks/{client.ids['task']}/comments",
        json={"body": "Empezamos por el PLC."},
        headers=headers,
    )

    entradas = await _entradas(client, "manager@example.com")
    assert len(entradas) == 1
    assert entradas[0]["action"] == "task.commented"
    assert entradas[0]["entity_type"] == "task"
    assert entradas[0]["entity_id"] == client.ids["task"]
    assert entradas[0]["payload"]["title"] == "Programacion"
    assert entradas[0]["payload"]["body"] == "Empezamos por el PLC."


async def test_quien_solo_lee_no_puede_comentar(client: AsyncClient):
    headers = await _auth(client, "reader@example.com")

    response = await client.post(
        f"/api/tasks/{client.ids['task']}/comments",
        json={"body": "No me deja."},
        headers=headers,
    )

    assert response.status_code == 403


async def test_quien_solo_lee_si_puede_leer_los_comentarios(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")
    await client.post(
        f"/api/tasks/{client.ids['task']}/comments",
        json={"body": "Empezamos por el PLC."},
        headers=headers,
    )

    headers = await _auth(client, "reader@example.com")
    response = await client.get(
        f"/api/tasks/{client.ids['task']}/comments", headers=headers
    )

    assert response.status_code == 200, response.text
    assert len(response.json()) == 1


async def test_anadir_un_punto_al_checklist(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")

    response = await client.post(
        f"/api/tasks/{client.ids['task']}/checklist",
        json={"label": "Revisar el programa del PLC"},
        headers=headers,
    )

    assert response.status_code == 201, response.text
    punto = response.json()
    assert punto["label"] == "Revisar el programa del PLC"
    assert punto["done"] is False
    assert punto["position"] == 1


async def test_los_puntos_del_checklist_van_en_orden(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")
    for label in ("Primero", "Segundo", "Tercero"):
        await client.post(
            f"/api/tasks/{client.ids['task']}/checklist",
            json={"label": label},
            headers=headers,
        )

    response = await client.get(f"/api/tasks/{client.ids['task']}/checklist", headers=headers)

    assert response.status_code == 200, response.text
    puntos = response.json()
    assert [punto["label"] for punto in puntos] == ["Primero", "Segundo", "Tercero"]
    assert [punto["position"] for punto in puntos] == [1, 2, 3]


async def test_marcar_y_desmarcar_un_punto(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")
    creado = await client.post(
        f"/api/tasks/{client.ids['task']}/checklist",
        json={"label": "Revisar el programa del PLC"},
        headers=headers,
    )
    item_id = creado.json()["id"]

    response = await client.patch(
        f"/api/tasks/{client.ids['task']}/checklist/{item_id}",
        json={"done": True},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["done"] is True

    response = await client.patch(
        f"/api/tasks/{client.ids['task']}/checklist/{item_id}",
        json={"done": False},
        headers=headers,
    )

    assert response.json()["done"] is False


async def test_cambiar_el_texto_de_un_punto(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")
    creado = await client.post(
        f"/api/tasks/{client.ids['task']}/checklist",
        json={"label": "Revisar el programa del PLC"},
        headers=headers,
    )
    item_id = creado.json()["id"]

    response = await client.patch(
        f"/api/tasks/{client.ids['task']}/checklist/{item_id}",
        json={"label": "Revisar el programa del HMI"},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["label"] == "Revisar el programa del HMI"


async def test_quitar_un_punto_del_checklist(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")
    creado = await client.post(
        f"/api/tasks/{client.ids['task']}/checklist",
        json={"label": "Revisar el programa del PLC"},
        headers=headers,
    )
    item_id = creado.json()["id"]

    response = await client.delete(
        f"/api/tasks/{client.ids['task']}/checklist/{item_id}", headers=headers
    )

    assert response.status_code == 204, response.text
    response = await client.get(f"/api/tasks/{client.ids['task']}/checklist", headers=headers)
    assert response.json() == []


async def test_un_punto_de_otra_tarea_no_se_toca(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")
    creado = await client.post(
        f"/api/tasks/{client.ids['task']}/checklist",
        json={"label": "Revisar el programa del PLC"},
        headers=headers,
    )
    item_id = creado.json()["id"]

    response = await client.patch(
        f"/api/tasks/{client.ids['otra']}/checklist/{item_id}",
        json={"done": True},
        headers=headers,
    )

    assert response.status_code == 404


async def test_quien_solo_lee_no_puede_tocar_el_checklist(client: AsyncClient):
    headers = await _auth(client, "reader@example.com")

    response = await client.post(
        f"/api/tasks/{client.ids['task']}/checklist",
        json={"label": "No me deja"},
        headers=headers,
    )

    assert response.status_code == 403


async def test_los_cambios_del_checklist_quedan_registrados(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")
    creado = await client.post(
        f"/api/tasks/{client.ids['task']}/checklist",
        json={"label": "Revisar el programa del PLC"},
        headers=headers,
    )
    item_id = creado.json()["id"]
    await client.patch(
        f"/api/tasks/{client.ids['task']}/checklist/{item_id}",
        json={"done": True},
        headers=headers,
    )

    entradas = await _entradas(client, "manager@example.com")
    acciones = [entrada["action"] for entrada in entradas]
    assert acciones == ["task.checklist_item_done", "task.checklist_item_added"]
    assert entradas[0]["payload"]["label"] == "Revisar el programa del PLC"
    assert entradas[0]["payload"]["done"] is True
    assert entradas[1]["payload"]["label"] == "Revisar el programa del PLC"


async def test_la_bitacora_de_una_tarea_trae_solo_lo_suyo(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")
    await client.post(
        f"/api/tasks/{client.ids['task']}/comments",
        json={"body": "Solo de esta tarea."},
        headers=headers,
    )
    await client.patch(
        f"/api/tasks/{client.ids['otra']}",
        json={"status": "in_progress"},
        headers=headers,
    )

    entradas = await _entradas(
        client,
        "manager@example.com",
        entity_type="task",
        entity_id=client.ids["task"],
    )

    assert len(entradas) == 1
    assert entradas[0]["action"] == "task.commented"
    assert entradas[0]["entity_id"] == client.ids["task"]


async def test_quien_no_ve_la_tarea_no_ve_su_historial(client: AsyncClient):
    headers = await _auth(client, "manager@example.com")
    await client.post(
        f"/api/tasks/{client.ids['task']}/comments",
        json={"body": "No lo vas a ver."},
        headers=headers,
    )

    headers = await _auth(client, "outsider@example.com")
    response = await client.get(
        "/api/activity",
        params={"entity_type": "task", "entity_id": client.ids["task"]},
        headers=headers,
    )

    assert response.status_code == 404
    assert "no esta entre las que puedes ver" in response.json()["detail"]


async def test_borrar_una_tarea_borra_sus_comentarios_y_su_checklist(
    client: AsyncClient,
):
    headers = await _auth(client, "manager@example.com")
    await client.post(
        f"/api/tasks/{client.ids['task']}/comments",
        json={"body": "Se va con la tarea."},
        headers=headers,
    )
    await client.post(
        f"/api/tasks/{client.ids['task']}/checklist",
        json={"label": "Tambien se va"},
        headers=headers,
    )

    response = await client.delete(f"/api/tasks/{client.ids['task']}", headers=headers)

    assert response.status_code == 204, response.text
    response = await client.get(f"/api/tasks/{client.ids['task']}", headers=headers)
    assert response.status_code == 404


async def test_los_comentarios_exigen_sesion(client: AsyncClient):
    response = await client.get(f"/api/tasks/{client.ids['task']}/comments")

    assert response.status_code == 401
