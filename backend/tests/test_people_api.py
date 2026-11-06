"""Pruebas de la API de personas, horarios, competencias y calendario laboral.

El directorio es global pero con alcance: el gerente ve todas las personas con
su carga, el jefe ve las de su departamento y el tecnico tambien, pero sin la
carga de los demas.
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
    CompanyRole,
    Department,
    NonWorkingDay,
    PersonSkill,
    Project,
    Role,
    Skill,
    Task,
    User,
    WorkingSchedule,
)

PASSWORD = "clave-de-prueba"
SEMANA = "2026-W46"
"""Lunes 2026-11-09 a domingo 2026-11-15."""

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
        company_role=CompanyRole.GERENTE.value,
    )
    ana = User(
        name="Ana",
        email="ana@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role=CompanyRole.JEFE_DEPARTAMENTO.value,
    )
    sebastian = User(
        name="Sebastian",
        email="sebastian@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role=CompanyRole.TECNICO.value,
    )
    lucia = User(
        name="Lucia",
        email="lucia@example.com",
        hashed_password=hash_password(PASSWORD),
        company_role=CompanyRole.TECNICO.value,
    )
    session.add_all([gerente, ana, sebastian, lucia])
    await session.flush()

    automatizacion = Department(name="Automatizacion", manager_id=ana.id)
    oficina = Department(name="Oficina", manager_id=lucia.id)
    session.add_all([automatizacion, oficina])
    await session.flush()

    ana.department_id = automatizacion.id
    sebastian.department_id = automatizacion.id
    lucia.department_id = oficina.id

    proyecto = Project(
        name="Linea Pasteurizadora",
        status="active",
        department_id=automatizacion.id,
        owner_id=ana.id,
    )
    session.add(proyecto)
    await session.flush()

    rol = Role(name="Ingeniero", permissions_json=["capacity.read", "gantt.read"])
    session.add(rol)
    await session.flush()

    # Ana trabaja de lunes a viernes, 8 h, al 100 %.
    session.add(
        WorkingSchedule(
            user_id=ana.id,
            valid_from=date(2026, 1, 5),
            availability_factor=100,
            note="Jornada completa",
            **dict(
                zip(
                    (
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday",
                        "saturday",
                        "sunday",
                    ),
                    JORNADA,
                    strict=True,
                )
            ),
        )
    )

    # Sebastiano trabaja al 80 % desde julio.
    session.add(
        WorkingSchedule(
            user_id=sebastian.id,
            valid_from=date(2026, 7, 1),
            availability_factor=80,
            note="Jornada parcial",
            **dict(
                zip(
                    (
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday",
                        "saturday",
                        "sunday",
                    ),
                    JORNADA,
                    strict=True,
                )
            ),
        )
    )

    # Lucia no tiene horario: su capacidad sale de las horas base.
    session.add(
        Task(
            project_id=proyecto.id,
            assigned_to=ana.id,
            title="Programacion SCADA",
            status="in_progress",
            start_date=date(2026, 11, 9),
            end_date=date(2026, 11, 13),
            estimated_hours=36,
        )
    )

    session.add(
        NonWorkingDay(
            date=date(2026, 11, 9),
            name="Dia de la Comunidad",
            scope="department",
            department_id=oficina.id,
        )
    )

    tia = Skill(name="TIA Portal")
    session.add(tia)
    await session.flush()
    session.add(PersonSkill(user_id=ana.id, skill_id=tia.id, level=3))

    ids.update(
        proyecto=proyecto.id,
        automatizacion=automatizacion.id,
        oficina=oficina.id,
        gerente=gerente.id,
        ana=ana.id,
        sebastian=sebastian.id,
        lucia=lucia.id,
        tia=tia.id,
    )
    await session.commit()
    return ids


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_el_gerente_ve_el_directorio_completo(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.get(f"/api/people?week={SEMANA}", headers=headers)

    assert response.status_code == 200, response.text
    personas = {persona["name"]: persona for persona in response.json()}
    assert set(personas) == {"Ana", "Gerente", "Lucia", "Sebastian"}


async def test_el_directorio_muestra_el_horario_vigente(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.get(f"/api/people?week={SEMANA}", headers=headers)

    ana = next(p for p in response.json() if p["name"] == "Ana")
    assert ana["schedule"]["days"] == list(JORNADA)
    assert ana["schedule"]["availability_factor"] == 100
    assert ana["capacity"] == 40.0
    assert ana["hours"] == 36.0
    assert ana["is_overloaded"] is False


async def test_la_capacidad_sale_del_horario_y_no_de_las_horas_base(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.get(f"/api/people?week={SEMANA}", headers=headers)

    sebastian = next(p for p in response.json() if p["name"] == "Sebastian")
    assert sebastian["weekly_base_hours"] == 40.0
    assert sebastian["capacity"] == 32.0


async def test_sin_horario_la_capacidad_sale_de_las_horas_base(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.get(f"/api/people?week={SEMANA}", headers=headers)

    lucia = next(p for p in response.json() if p["name"] == "Lucia")
    assert lucia["schedule"] is None
    assert lucia["capacity"] == 40.0


async def test_el_jefe_ve_su_departamento_con_la_carga(client: AsyncClient):
    headers = await _auth(client, "ana@example.com")

    response = await client.get(f"/api/people?week={SEMANA}", headers=headers)

    assert response.status_code == 200, response.text
    nombres = {persona["name"] for persona in response.json()}
    assert nombres == {"Ana", "Sebastian"}
    ana = next(p for p in response.json() if p["name"] == "Ana")
    assert ana["hours"] == 36.0


async def test_el_tecnico_ve_su_departamento_sin_la_carga(client: AsyncClient):
    headers = await _auth(client, "sebastian@example.com")

    response = await client.get(f"/api/people?week={SEMANA}", headers=headers)

    assert response.status_code == 200, response.text
    nombres = {persona["name"] for persona in response.json()}
    assert nombres == {"Ana", "Sebastian"}
    ana = next(p for p in response.json() if p["name"] == "Ana")
    assert ana["hours"] is None
    assert ana["is_overloaded"] is None


async def test_la_ficha_trae_el_historial_de_horarios(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    ana_id = client.ids["ana"]

    response = await client.get(f"/api/people/{ana_id}?week={SEMANA}", headers=headers)

    assert response.status_code == 200, response.text
    ficha = response.json()
    assert len(ficha["schedule_history"]) == 1
    assert ficha["schedule_history"][0]["valid_from"] == "2026-01-05"


async def test_la_ficha_de_una_persona_fuera_del_ambito_es_404(client: AsyncClient):
    headers = await _auth(client, "sebastian@example.com")
    lucia_id = client.ids["lucia"]

    response = await client.get(f"/api/people/{lucia_id}", headers=headers)

    assert response.status_code == 404, response.text


async def test_sem_token_no_hay_directorio(client: AsyncClient):
    response = await client.get("/api/people")

    assert response.status_code == 401, response.text


async def test_una_semana_invalida_es_error(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.get("/api/people?week=2026-46", headers=headers)

    assert response.status_code == 400, response.text


async def test_el_gerente_anade_una_version_de_horario(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    ana_id = client.ids["ana"]

    response = await client.post(
        f"/api/people/{ana_id}/schedules",
        headers=headers,
        json={
            "valid_from": "2026-12-01",
            "days": [600, 600, 600, 600, 600, 0, 0],
            "availability_factor": 100,
            "note": "Jornada de 6 h",
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["days"] == [600, 600, 600, 600, 600, 0, 0]
    assert response.json()["hours"][0] == 6.0


async def test_la_version_nueva_no_pisa_la_anterior(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    ana_id = client.ids["ana"]

    await client.post(
        f"/api/people/{ana_id}/schedules",
        headers=headers,
        json={
            "valid_from": "2026-12-01",
            "days": [600, 600, 600, 600, 600, 0, 0],
            "availability_factor": 100,
        },
    )

    response = await client.get(f"/api/people/{ana_id}", headers=headers)

    historial = response.json()["schedule_history"]
    assert len(historial) == 2
    assert historial[0]["valid_from"] == "2026-01-05"
    assert historial[1]["valid_from"] == "2026-12-01"


async def test_un_horario_con_la_misma_fecha_es_conflicto(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    ana_id = client.ids["ana"]

    response = await client.post(
        f"/api/people/{ana_id}/schedules",
        headers=headers,
        json={
            "valid_from": "2026-01-05",
            "days": [600, 600, 600, 600, 600, 0, 0],
            "availability_factor": 100,
        },
    )

    assert response.status_code == 409, response.text


async def test_un_jefe_no_puede_anadir_horarios(client: AsyncClient):
    headers = await _auth(client, "ana@example.com")
    ana_id = client.ids["ana"]

    response = await client.post(
        f"/api/people/{ana_id}/schedules",
        headers=headers,
        json={
            "valid_from": "2026-12-01",
            "days": [600, 600, 600, 600, 600, 0, 0],
            "availability_factor": 100,
        },
    )

    assert response.status_code == 403, response.text


async def test_un_horario_con_mas_de_siete_dias_es_error(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    ana_id = client.ids["ana"]

    response = await client.post(
        f"/api/people/{ana_id}/schedules",
        headers=headers,
        json={"valid_from": "2026-12-01", "days": [600, 600, 600]},
    )

    assert response.status_code == 422, response.text


async def test_el_gerente_crea_una_competencia(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.post(
        "/api/skills", headers=headers, json={"name": "SCADA"}
    )

    assert response.status_code == 201, response.text
    assert response.json()["name"] == "SCADA"


async def test_una_competencia_duplicada_es_conflicto(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.post(
        "/api/skills", headers=headers, json={"name": "TIA Portal"}
    )

    assert response.status_code == 409, response.text


async def test_un_tecnico_no_crea_competencias(client: AsyncClient):
    headers = await _auth(client, "sebastian@example.com")

    response = await client.post("/api/skills", headers=headers, json={"name": "SCADA"})

    assert response.status_code == 403, response.text


async def test_el_gerente_fija_las_competencias_de_una_persona(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    ana_id = client.ids["ana"]
    tia_id = client.ids["tia"]

    response = await client.put(
        f"/api/people/{ana_id}/skills",
        headers=headers,
        json={"skills": [{"skill_id": tia_id, "level": 2}]},
    )

    assert response.status_code == 200, response.text
    assert response.json() == [
        {"skill_id": tia_id, "name": "TIA Portal", "level": 2}
    ]


async def test_fijar_competencias_reemplaza_el_conjunto(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    ana_id = client.ids["ana"]

    await client.put(
        f"/api/people/{ana_id}/skills",
        headers=headers,
        json={"skills": []},
    )

    response = await client.get(f"/api/people/{ana_id}", headers=headers)

    assert response.json()["skills"] == []


async def test_competencias_de_una_persona_desconocida_es_404(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    ana_id = client.ids["ana"]

    response = await client.put(
        f"/api/people/{ana_id}/skills",
        headers=headers,
        json={"skills": [{"skill_id": 9999, "level": 1}]},
    )

    assert response.status_code == 404, response.text


async def test_un_nivel_fuera_de_rango_es_error(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    ana_id = client.ids["ana"]
    tia_id = client.ids["tia"]

    response = await client.put(
        f"/api/people/{ana_id}/skills",
        headers=headers,
        json={"skills": [{"skill_id": tia_id, "level": 5}]},
    )

    assert response.status_code == 422, response.text

async def test_los_dias_no_laborables_se_listan(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.get("/api/non-working-days", headers=headers)

    assert response.status_code == 200, response.text
    dias = response.json()
    assert len(dias) == 1
    assert dias[0]["scope"] == "department"
    assert dias[0]["department_name"] == "Oficina"


async def test_el_gerente_crea_un_dia_no_laborable_global(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.post(
        "/api/non-working-days",
        headers=headers,
        json={"date": "2026-11-16", "name": "Todos los Santos"},
    )

    assert response.status_code == 201, response.text
    assert response.json()["scope"] == "global"


async def test_un_dia_no_laborable_repetido_es_conflicto(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.post(
        "/api/non-working-days",
        headers=headers,
        json={
            "date": "2026-11-09",
            "name": "Dia de la Comunidad",
            "scope": "department",
            "department_id": client.ids["oficina"],
        },
    )

    assert response.status_code == 409, response.text


async def test_el_mismo_dia_con_otro_alcance_no_es_conflicto(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.post(
        "/api/non-working-days",
        headers=headers,
        json={"date": "2026-11-09", "name": "Todos los Santos"},
    )

    assert response.status_code == 201, response.text


async def test_un_dia_de_departamento_necesita_departamento(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    response = await client.post(
        "/api/non-working-days",
        headers=headers,
        json={"date": "2026-11-17", "name": "Fiesta", "scope": "department"},
    )

    assert response.status_code == 422, response.text


async def test_un_tecnico_no_crea_dias_no_laborables(client: AsyncClient):
    headers = await _auth(client, "sebastian@example.com")

    response = await client.post(
        "/api/non-working-days",
        headers=headers,
        json={"date": "2026-11-16", "name": "Todos los Santos"},
    )

    assert response.status_code == 403, response.text


async def test_el_gerente_quita_un_dia_no_laborable(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    listado = await client.get("/api/non-working-days", headers=headers)
    day_id = listado.json()[0]["id"]

    response = await client.delete(f"/api/non-working-days/{day_id}", headers=headers)

    assert response.status_code == 204, response.text
    assert (await client.get("/api/non-working-days", headers=headers)).json() == []


async def test_el_gerente_renombra_una_competencia(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    tia_id = client.ids["tia"]

    response = await client.patch(
        f"/api/skills/{tia_id}", headers=headers, json={"name": "TIA Portal V18"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["name"] == "TIA Portal V18"


async def test_renombrar_a_un_nombre_que_ya_existe_es_conflicto(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    tia_id = client.ids["tia"]
    await client.post("/api/skills", headers=headers, json={"name": "SCADA"})

    response = await client.patch(
        f"/api/skills/{tia_id}", headers=headers, json={"name": "SCADA"}
    )

    assert response.status_code == 409, response.text


async def test_no_se_puede_quitar_una_competencia_que_alguien_tiene(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    tia_id = client.ids["tia"]

    response = await client.delete(f"/api/skills/{tia_id}", headers=headers)

    assert response.status_code == 409, response.text


async def test_el_gerente_quita_una_competencia_sin_uso(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")

    creada = await client.post("/api/skills", headers=headers, json={"name": "Robotica"})
    skill_id = creada.json()["id"]

    response = await client.delete(f"/api/skills/{skill_id}", headers=headers)

    assert response.status_code == 204, response.text
    nombres = [item["name"] for item in (await client.get("/api/skills", headers=headers)).json()]
    assert "Robotica" not in nombres


async def test_un_tecnico_no_renombra_competencias(client: AsyncClient):
    headers = await _auth(client, "sebastian@example.com")
    tia_id = client.ids["tia"]

    response = await client.patch(
        f"/api/skills/{tia_id}", headers=headers, json={"name": "Otra"}
    )

    assert response.status_code == 403, response.text


async def test_el_gerente_corrige_una_version_de_horario(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    ana_id = client.ids["ana"]

    response = await client.patch(
        f"/api/people/{ana_id}/schedules/1",
        headers=headers,
        json={
            "days": [700, 700, 700, 700, 700, 0, 0],
            "availability_factor": 90,
            "note": "Jornada de 7 h",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["days"] == [700, 700, 700, 700, 700, 0, 0]
    assert response.json()["hours"][0] == 7.0
    assert response.json()["availability_factor"] == 90


async def test_corregir_el_horario_de_otra_persona_es_404(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    lucia_id = client.ids["lucia"]

    response = await client.patch(
        f"/api/people/{lucia_id}/schedules/1",
        headers=headers,
        json={"days": [0, 0, 0, 0, 0, 0, 0], "availability_factor": 0},
    )

    assert response.status_code == 404, response.text


async def test_el_gerente_quita_una_version_de_horario(client: AsyncClient):
    headers = await _auth(client, "gerente@example.com")
    ana_id = client.ids["ana"]

    response = await client.delete(
        f"/api/people/{ana_id}/schedules/1", headers=headers
    )

    assert response.status_code == 204, response.text
    ficha = await client.get(f"/api/people/{ana_id}", headers=headers)
    assert ficha.json()["schedule_history"] == []
