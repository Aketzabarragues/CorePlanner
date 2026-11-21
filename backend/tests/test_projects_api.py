"""Pruebas del endpoint de calendario iCal del proyecto.

El foco es la entrega del fichero: tipo de contenido, nombre de descarga,
que solo entran las tareas con fechas, y el control de acceso por proyecto.
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
    role = Role(name="Lector", permissions_json=ROLES["Lector"])
    session.add(role)
    await session.flush()

    admin = User(
        name="Admin",
        email="admin@example.com",
        hashed_password=hash_password(PASSWORD),
        is_global_admin=True,
    )
    member = User(
        name="Miembro",
        email="miembro@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    outsider = User(
        name="Forastero",
        email="forastero@example.com",
        hashed_password=hash_password(PASSWORD),
    )
    session.add_all([admin, member, outsider])
    await session.flush()
    proyecto = Project(name="Linea 1", status="active", owner_id=admin.id)
    proyecto_vacio = Project(name="Linea 2", status="active", owner_id=admin.id)
    session.add_all([proyecto, proyecto_vacio])
    await session.flush()

    session.add(
        ProjectMember(
            user_id=member.id,
            project_id=proyecto.id,
            role_id=role.id,
        )
    )

    con_fecha = Task(
        project_id=proyecto.id,
        assigned_to=member.id,
        title="Programacion",
        status=TaskStatus.IN_PROGRESS.value,
        start_date=date(2026, 3, 5),
        end_date=date(2026, 3, 11),
        estimated_hours=40,
    )
    sin_fecha = Task(
        project_id=proyecto.id,
        assigned_to=member.id,
        title="Sin fechas",
        status=TaskStatus.BACKLOG.value,
        start_date=None,
        end_date=None,
        estimated_hours=8,
    )
    tarea_vacia = Task(
        project_id=proyecto_vacio.id,
        assigned_to=member.id,
        title="Tambien sin fechas",
        status=TaskStatus.BACKLOG.value,
        start_date=None,
        end_date=None,
        estimated_hours=4,
    )
    session.add_all([con_fecha, sin_fecha, tarea_vacia])
    await session.flush()

    ids.update(
        proyecto=proyecto.id,
        proyecto_vacio=proyecto_vacio.id,
        admin=admin.id,
        member=member.id,
        outsider=outsider.id,
        con_fecha=con_fecha.id,
        sin_fecha=sin_fecha.id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_el_calendario_exige_token(client: AsyncClient):
    response = await client.get(f"/api/projects/{client.ids['proyecto']}/calendar.ics")
    assert response.status_code == 401, response.text


async def test_el_calendario_exige_permiso_en_el_proyecto(client: AsyncClient):
    headers = await _auth(client, "forastero@example.com")

    response = await client.get(
        f"/api/projects/{client.ids['proyecto']}/calendar.ics", headers=headers
    )
    assert response.status_code == 403, response.text


async def test_el_calendario_de_un_proyecto_inexistente_responde_404(client: AsyncClient):
    headers = await _auth(client, "admin@example.com")

    response = await client.get("/api/projects/9999/calendar.ics", headers=headers)
    assert response.status_code == 404, response.text


async def test_el_calendario_lleva_tipo_y_nombre_de_descarga(client: AsyncClient):
    headers = await _auth(client, "miembro@example.com")

    response = await client.get(
        f"/api/projects/{client.ids['proyecto']}/calendar.ics", headers=headers
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/calendar")
    assert "coreplanner-{}.ics".format(client.ids["proyecto"]) in response.headers[
        "content-disposition"
    ]


async def test_el_calendario_incluye_la_tarea_con_fecha_y_excluye_la_sin(
    client: AsyncClient,
):
    headers = await _auth(client, "miembro@example.com")

    response = await client.get(
        f"/api/projects/{client.ids['proyecto']}/calendar.ics", headers=headers
    )
    assert response.status_code == 200, response.text
    texto = response.text
    # La tarea con fecha entra; la sin fecha, no.
    assert "SUMMARY:Programacion" in texto
    assert "SUMMARY:Sin fechas" not in texto
    # DTEND exclusiva: el fin es el 11, el exclusivo, el 12.
    assert "DTSTART;VALUE=DATE:20260305" in texto
    assert "DTEND;VALUE=DATE:20260312" in texto
    # El responsable del proyecto va como organizer.
    assert "ORGANIZER;CN=Admin:mailto:admin@example.com" in texto


async def test_el_proyecto_sin_tareas_con_fecha_devuelve_calendario_vacio(
    client: AsyncClient,
):
    headers = await _auth(client, "admin@example.com")

    response = await client.get(
        f"/api/projects/{client.ids['proyecto_vacio']}/calendar.ics", headers=headers
    )
    assert response.status_code == 200, response.text
    lineas = response.text.split("\r\n")
    assert lineas[0] == "BEGIN:VCALENDAR"
    assert "BEGIN:VEVENT" not in lineas
    assert lineas[-2] == "END:VCALENDAR"
