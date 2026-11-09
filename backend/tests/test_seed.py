"""Pruebas del script de datos semilla.

Comprueban que el seed produce el reparto de carga y los limites de ambito
esperados, de modo que un cambio en los datos no rompa la demostracion en
silencio.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.auth import verify_password
from backend.database import create_engine
from backend.models import (
    Base,
    Department,
    NonWorkingDay,
    PersonSkill,
    Project,
    ProjectMember,
    Role,
    Skill,
    Task,
    User,
    WorkingSchedule,
)
from backend.seed import DEFAULT_PASSWORD, populate
from backend.services.capacity_repository import (
    load_capacity_for_projects,
    load_project_capacity,
)

EMAILS = {
    "ivan@example.com",
    "ana@example.com",
    "aketza@example.com",
    "hector@example.com",
    "carlos@example.com",
    "jorge@example.com",
    "juan@example.com",
    "nerea@example.com",
    "natalia@example.com",
    "sebastian@example.com",
    "emilio@example.com",
    "alejandro@example.com",
}


@pytest.fixture
async def seeded_session():
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await populate(session)
        yield session
    await engine.dispose()


async def _informe_global(seeded_session):
    """Matriz de capacidad de todos los proyectos del seed."""
    ids = (await seeded_session.execute(select(Project.id))).scalars().all()
    return await load_capacity_for_projects(seeded_session, ids)


async def _fila(seeded_session, nombre: str):
    report = await _informe_global(seeded_session)
    return next(row for row in report.rows if row.name == nombre)


async def test_el_seed_crea_el_equipo(seeded_session):
    emails = set((await seeded_session.execute(select(User.email))).scalars())

    assert emails == EMAILS


async def test_el_seed_crea_tres_departamentos_con_su_responsable(seeded_session):
    rows = (
        await seeded_session.execute(
            select(Department.name, User.name)
            .join(User, Department.manager_id == User.id)
            .order_by(Department.id)
        )
    ).all()

    assert rows == [
        ("Alimentación", "Ana"),
        ("Energía", "Jorge"),
        ("Medio Ambiente", "Sebastián"),
    ]


async def test_el_seed_crea_los_proyectos_de_cada_departamento(seeded_session):
    rows = (
        await seeded_session.execute(
            select(Project.name, Department.name)
            .join(Department, Project.department_id == Department.id)
            .order_by(Project.id)
        )
    ).all()

    assert rows == [
        ("26009 - FLUID SYSTEM - Pasteurizador", "Alimentación"),
        ("26010 - FLUID SYSTEM - Planta quesos", "Alimentación"),
        ("26025 - HORGAS - Levaduras", "Alimentación"),
        ("26035 - FLUID SYSTEM - Ultrafiltración", "Alimentación"),
        ("26037 - FLUID SYSTEM - Planta leche", "Alimentación"),
        ("26012 - CMEX - Planta noruega", "Energía"),
        ("26014 - CMEX - Planta México", "Energía"),
        ("26075 - TOTT - RTO", "Energía"),
        ("26012 - TEC - Parking automático", "Medio Ambiente"),
        ("26014 - TEC - Disoluciones", "Medio Ambiente"),
        ("26075 - LICON - Almacén automatizado", "Medio Ambiente"),
    ]


async def test_cada_departamento_numera_sus_proyectos_por_separado(seeded_session):
    """Los numeros se repiten entre departamentos, y es a proposito."""
    rows = (
        await seeded_session.execute(
            select(Project.name).join(
                Department, Project.department_id == Department.id
            )
        )
    ).scalars().all()
    numeros = [name.split(" - ")[0] for name in rows]

    repetidos = {numero for numero in numeros if numeros.count(numero) > 1}

    assert repetidos == {"26012", "26014", "26075"}


async def test_el_responsable_dirige_los_proyectos_de_su_departamento(seeded_session):
    rows = (
        await seeded_session.execute(
            select(Project.name, Role.name)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .join(Role, ProjectMember.role_id == Role.id)
            .join(User, ProjectMember.user_id == User.id)
            .where(User.email == "ana@example.com")
            .order_by(Project.id)
        )
    ).all()

    assert rows == [
        ("26009 - FLUID SYSTEM - Pasteurizador", "Project Manager"),
        ("26010 - FLUID SYSTEM - Planta quesos", "Project Manager"),
        ("26025 - HORGAS - Levaduras", "Project Manager"),
        ("26035 - FLUID SYSTEM - Ultrafiltración", "Project Manager"),
        ("26037 - FLUID SYSTEM - Planta leche", "Project Manager"),
    ]


async def test_las_personas_con_trabajo_entran_como_ingeniero(seeded_session):
    rows = (
        await seeded_session.execute(
            select(Project.name, Role.name)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .join(Role, ProjectMember.role_id == Role.id)
            .join(User, ProjectMember.user_id == User.id)
            .where(User.email == "aketza@example.com")
            .order_by(Project.id)
        )
    ).all()

    assert rows == [
        ("26009 - FLUID SYSTEM - Pasteurizador", "Ingeniero"),
        ("26025 - HORGAS - Levaduras", "Ingeniero"),
        ("26035 - FLUID SYSTEM - Ultrafiltración", "Ingeniero"),
    ]


async def test_nadie_entra_solo_por_tener_una_tarea(seeded_session):
    """Todo el mundo con tareas es miembro del proyecto donde trabaja."""
    rows = (
        await seeded_session.execute(
            select(Task.title, Project.name, Role.name)
            .join(Project, Task.project_id == Project.id)
            .join(User, Task.assigned_to == User.id)
            .join(
                ProjectMember,
                (ProjectMember.user_id == User.id)
                & (ProjectMember.project_id == Project.id),
            )
            .join(Role, ProjectMember.role_id == Role.id)
        )
    ).all()

    assert len(rows) == 23
    assert all(role in ("Project Manager", "Ingeniero") for _, _, role in rows)


async def test_el_gerente_es_admin_y_no_tiene_departamento(seeded_session):
    ivan = (
        await seeded_session.execute(
            select(User).where(User.email == "ivan@example.com")
        )
    ).scalar_one()

    assert ivan.is_global_admin is True
    assert ivan.company_role == "gerente"
    assert ivan.department_id is None


async def test_el_seed_deja_la_contrasena_conocida(seeded_session):
    user = (
        await seeded_session.execute(
            select(User).where(User.email == "carlos@example.com")
        )
    ).scalar_one()

    assert verify_password(DEFAULT_PASSWORD, user.hashed_password)


async def test_el_seed_crea_los_horarios_versionados(seeded_session):
    aketza = (
        await seeded_session.execute(
            select(User).where(User.email == "aketza@example.com")
        )
    ).scalar_one()

    schedules = (
        await seeded_session.execute(
            select(WorkingSchedule)
            .where(WorkingSchedule.user_id == aketza.id)
            .order_by(WorkingSchedule.valid_from)
        )
    ).scalars().all()

    assert len(schedules) == 2
    assert schedules[0].valid_from == date(2025, 9, 1)
    assert schedules[0].monday == 750
    assert schedules[1].valid_from == date(2026, 1, 5)
    assert schedules[1].monday == 800


async def test_quien_no_tiene_horario_tiene_capacidad_desconocida(seeded_session):
    nerea = (
        await seeded_session.execute(
            select(User).where(User.email == "nerea@example.com")
        )
    ).scalar_one()

    schedules = (
        await seeded_session.execute(
            select(WorkingSchedule).where(WorkingSchedule.user_id == nerea.id)
        )
    ).scalars().all()

    assert schedules == []

    fila = await _fila(seeded_session, "Nerea")
    assert all(cell.capacity is None for cell in fila.cells)


async def test_la_jornada_parcial_reduce_la_capacidad(seeded_session):
    fila = await _fila(seeded_session, "Carlos")
    celdas = {cell.week: cell for cell in fila.cells}

    assert celdas["2026-W45"].capacity == Decimal("32.00")
    assert celdas["2026-W45"].hours == Decimal("32.00")
    assert celdas["2026-W45"].is_overloaded is False


async def test_el_seed_crea_los_dias_no_laborables_con_su_alcance(seeded_session):
    days = (await seeded_session.execute(select(NonWorkingDay))).scalars().all()

    global_days = [day for day in days if day.scope == "global"]
    department_days = [day for day in days if day.scope == "department"]
    person_days = [day for day in days if day.scope == "person"]
    assert len(global_days) == 5
    assert len(department_days) == 2
    assert len(person_days) == 1
    assert any(day.half_day for day in days)


async def test_el_seed_crea_el_catalogo_de_competencias(seeded_session):
    skills = (await seeded_session.execute(select(Skill))).scalars().all()
    links = (await seeded_session.execute(select(PersonSkill))).scalars().all()

    assert len(skills) == 10
    assert len(links) == 27
    assert all(1 <= link.level <= 3 for link in links)


async def test_el_seed_crea_las_tareas_de_cada_proyecto(seeded_session):
    rows = (
        await seeded_session.execute(
            select(Task.title, User.name, Task.estimated_hours, Task.status)
            .join(User, Task.assigned_to == User.id)
            .order_by(Task.id)
        )
    ).all()

    assert rows == [
        ("Programación PLC del pasteurizador", "Aketza", Decimal("40.00"), "in_progress"),
        ("Pruebas FAT de la línea", "Héctor", Decimal("24.00"), "backlog"),
        ("Diseño SCADA planta de quesos", "Carlos", Decimal("32.00"), "done"),
        ("Puesta en marcha planta de quesos", "Ana", Decimal("16.00"), "backlog"),
        ("Automatización de fermentadores", "Aketza", Decimal("48.00"), "in_progress"),
        ("Documentación técnica de levaduras", "Carlos", Decimal("12.00"), "backlog"),
        ("Ingeniería básica de ultrafiltración", "Héctor", Decimal("32.00"), "in_progress"),
        ("Pruebas SAT de ultrafiltración", "Aketza", Decimal("20.00"), "backlog"),
        ("Revisión de instrumentación", "Ana", Decimal("12.00"), "done"),
        ("Programación HMI planta leche", "Héctor", Decimal("40.00"), "backlog"),
        ("Esquemas eléctricos planta Noruega", "Juan", Decimal("40.00"), "in_progress"),
        ("Revisión normativa IEC", "Jorge", Decimal("12.00"), "backlog"),
        ("Cableado de cuadros eléctricos", "Nerea", Decimal("32.00"), "done"),
        ("Puesta en marcha planta México", "Natalia", Decimal("24.00"), "backlog"),
        ("Programación de control del RTO", "Natalia", Decimal("44.00"), "in_progress"),
        ("Pruebas FAT del RTO", "Juan", Decimal("16.00"), "backlog"),
        ("Documentación as-built", "Nerea", Decimal("8.00"), "backlog"),
        ("Programación PLC parking automático", "Emilio", Decimal("40.00"), "in_progress"),
        ("Pruebas de maniobras", "Alejandro", Decimal("20.00"), "backlog"),
        ("Automatización de dosificación", "Alejandro", Decimal("32.00"), "in_progress"),
        ("Revisión de seguridad", "Sebastián", Decimal("8.00"), "backlog"),
        ("Programación del transelevador", "Emilio", Decimal("48.00"), "in_progress"),
        ("Puesta en marcha", "Alejandro", Decimal("40.00"), "backlog"),
    ]


async def test_una_tarea_cruza_el_fin_de_semana(seeded_session):
    tasks = (await seeded_session.execute(select(Task))).scalars().all()
    pasteurizador = next(
        t for t in tasks if t.title == "Programación PLC del pasteurizador"
    )

    # De lunes a viernes de la semana siguiente: el fin de semana queda en medio.
    assert pasteurizador.start_date == date(2026, 11, 2)
    assert pasteurizador.end_date == date(2026, 11, 13)
    assert pasteurizador.start_date.weekday() == 0
    assert pasteurizador.end_date.weekday() == 4
    assert pasteurizador.estimated_hours == 40


async def test_el_seed_produce_la_sobrecarga_de_aketza(seeded_session):
    fila = await _fila(seeded_session, "Aketza")
    celdas = {cell.week: cell for cell in fila.cells}

    # Dos tareas suyas se solapan la semana del 9 de noviembre.
    assert celdas["2026-W46"].hours == Decimal("45.28")
    assert celdas["2026-W46"].capacity == Decimal("40.00")
    assert celdas["2026-W46"].is_overloaded is True
    assert celdas["2026-W45"].hours == Decimal("20.00")
    assert celdas["2026-W45"].is_overloaded is False


async def test_el_seed_produce_la_sobrecarga_de_emilio(seeded_session):
    fila = await _fila(seeded_session, "Emilio")
    celdas = {cell.week: cell for cell in fila.cells}

    assert celdas["2026-W46"].hours == Decimal("44.00")
    assert celdas["2026-W46"].is_overloaded is True
    assert celdas["2026-W47"].hours == Decimal("24.00")
    assert celdas["2026-W47"].is_overloaded is False


async def test_el_seed_no_sobrecarga_a_los_demas(seeded_session):
    report = await _informe_global(seeded_session)

    sobrecargados = {row.name for row in report.rows if row.has_overload}

    assert sobrecargados == {"Aketza", "Emilio"}


async def test_cada_proyecto_solo_carga_a_su_equipo(seeded_session):
    project = (
        await seeded_session.execute(
            select(Project).where(Project.name == "26075 - TOTT - RTO")
        )
    ).scalar_one()

    report = await load_project_capacity(seeded_session, project.id)

    assert {row.name for row in report.rows} == {"Jorge", "Juan", "Nerea", "Natalia"}
    assert all(row.has_overload is False for row in report.rows)
