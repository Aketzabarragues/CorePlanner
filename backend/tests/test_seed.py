"""Pruebas del script de datos semilla.

Comprueban que el seed produce la sobrecarga esperada, de modo que un cambio
en las tareas no rompa la demostracion en silencio.
"""

from __future__ import annotations

from datetime import date

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
    Skill,
    Task,
    User,
    WorkingSchedule,
)
from backend.seed import DEFAULT_PASSWORD, populate
from backend.services.capacity_repository import load_project_capacity


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


async def test_el_seed_crea_los_usuarios_del_equipo(seeded_session):
    emails = set((await seeded_session.execute(select(User.email))).scalars())

    assert emails == {
        "admin@example.com",
        "ana@example.com",
        "sebastian@example.com",
        "marta@example.com",
        "diego@example.com",
        "hector@example.com",
        "jorge@example.com",
        "lucia@example.com",
        "ivan@example.com",
        "nuria@example.com",
    }


async def test_el_seed_crea_los_horarios_versionados(seeded_session):
    sebastian = (
        await seeded_session.execute(
            select(User).where(User.email == "sebastian@example.com")
        )
    ).scalar_one()

    schedules = (
        await seeded_session.execute(
            select(WorkingSchedule)
            .where(WorkingSchedule.user_id == sebastian.id)
            .order_by(WorkingSchedule.valid_from)
        )
    ).scalars().all()

    assert len(schedules) == 2
    assert schedules[0].valid_from == date(2025, 9, 1)
    assert schedules[0].monday == 750
    assert schedules[1].valid_from == date(2026, 1, 5)
    assert schedules[1].monday == 800


async def test_quien_no_tiene_horario_tiene_capacidad_desconocida(seeded_session):
    hector = (
        await seeded_session.execute(
            select(User).where(User.email == "hector@example.com")
        )
    ).scalar_one()

    schedules = (
        await seeded_session.execute(
            select(WorkingSchedule).where(WorkingSchedule.user_id == hector.id)
        )
    ).scalars().all()

    assert schedules == []


async def test_el_seed_crea_los_dias_no_laborables_con_su_alcance(seeded_session):
    days = (await seeded_session.execute(select(NonWorkingDay))).scalars().all()

    global_days = [day for day in days if day.scope == "global"]
    department_days = [day for day in days if day.scope == "department"]
    assert len(global_days) == 5
    assert len(department_days) == 2
    assert any(day.half_day for day in days)


async def test_el_seed_crea_el_catalogo_de_competencias(seeded_session):
    skills = (await seeded_session.execute(select(Skill))).scalars().all()
    links = (await seeded_session.execute(select(PersonSkill))).scalars().all()

    assert len(skills) == 13
    assert len(links) == 28
    assert all(1 <= link.level <= 3 for link in links)


async def test_el_seed_crea_el_proyecto_de_pasteurizadora(seeded_session):
    project = (
        await seeded_session.execute(
            select(Project).where(Project.name == "Línea Pasteurizadora SIVE")
        )
    ).scalar_one()

    assert project.name == "Línea Pasteurizadora SIVE"


async def test_el_seed_crea_un_segundo_proyecto_en_la_oficina_tecnica(
    seeded_session,
):
    projects = (
        await seeded_session.execute(
            select(Project, Department.name)
            .join(Department, Project.department_id == Department.id)
            .order_by(Project.id)
        )
    ).all()

    assert [(project.name, department) for project, department in projects] == [
        ("Línea Pasteurizadora SIVE", "Automatización & SCADA"),
        ("Red de tuberías línea 2", "Oficina Técnica / EPLAN"),
    ]


async def test_el_segundo_proyecto_reparte_gente_de_otro_departamento(
    seeded_session,
):
    """La pertenencia al departamento no restringe la asignacion de tareas."""
    office_project = (
        await seeded_session.execute(
            select(Project).where(Project.name == "Red de tuberías línea 2")
        )
    ).scalar_one()
    ana = (
        await seeded_session.execute(
            select(User).where(User.email == "ana@example.com")
        )
    ).scalar_one()
    automatizacion = (
        await seeded_session.execute(
            select(Department).where(Department.name == "Automatización & SCADA")
        )
    ).scalar_one()

    tasks = (
        await seeded_session.execute(
            select(Task).where(
                Task.project_id == office_project.id, Task.assigned_to == ana.id
            )
        )
    ).scalars().all()

    assert ana.department_id == automatizacion.id
    assert [task.title for task in tasks] == ["Definición de tags PLC"]


async def test_el_administrador_global_es_admin(seeded_session):
    admin = (
        await seeded_session.execute(
            select(User).where(User.email == "admin@example.com")
        )
    ).scalar_one()

    assert admin.is_global_admin is True


async def test_el_seed_deja_la_contrasena_conocida(seeded_session):
    user = (
        await seeded_session.execute(
            select(User).where(User.email == "sebastian@example.com")
        )
    ).scalar_one()

    assert verify_password(DEFAULT_PASSWORD, user.hashed_password)


async def test_la_tarea_de_scada_cruza_el_fin_de_semana(seeded_session):
    tasks = (await seeded_session.execute(select(Task))).scalars().all()
    scada = next(t for t in tasks if t.title == "Programación SCADA WinCC")

    # De jueves a miercoles: el fin de semana queda en medio.
    assert scada.start_date == date(2026, 11, 5)
    assert scada.end_date == date(2026, 11, 11)
    assert scada.start_date.weekday() == 3
    assert scada.end_date.weekday() == 2
    assert scada.estimated_hours == 40


async def test_las_dos_tareas_de_scada_comparten_fechas(seeded_session):
    tasks = (await seeded_session.execute(select(Task))).scalars().all()
    scada = next(t for t in tasks if t.title == "Programación SCADA WinCC")
    scl = next(t for t in tasks if t.title == "Desarrollo de Bloques SCL")

    assert scl.start_date == scada.start_date
    assert scl.end_date == scada.end_date
    assert scl.estimated_hours == 20


async def test_el_seed_produce_la_sobrecarga_de_sebastian(seeded_session):
    project = (
        await seeded_session.execute(
            select(Project).where(Project.name == "Línea Pasteurizadora SIVE")
        )
    ).scalar_one()

    report = await load_project_capacity(seeded_session, project.id)

    sebastian = next(row for row in report.rows if row.name == "Sebastián")
    cells = {cell.week: cell for cell in sebastian.cells}
    assert cells["2026-W45"].hours == 24.0
    assert cells["2026-W46"].hours == 48.0
    assert cells["2026-W46"].is_overloaded is True
    assert cells["2026-W45"].is_overloaded is False


async def test_el_seed_no_sobrecarga_a_los_demas(seeded_session):
    project = (
        await seeded_session.execute(
            select(Project).where(Project.name == "Línea Pasteurizadora SIVE")
        )
    ).scalar_one()

    report = await load_project_capacity(seeded_session, project.id)

    for row in report.rows:
        if row.name == "Sebastián":
            continue
        assert row.has_overload is False, f"{row.name} aparece sobrecargado"


async def test_el_segundo_proyecto_no_sobrecarga_a_nadie(seeded_session):
    project = (
        await seeded_session.execute(
            select(Project).where(Project.name == "Red de tuberías línea 2")
        )
    ).scalar_one()

    report = await load_project_capacity(seeded_session, project.id)

    assert {row.name for row in report.rows} == {"Ana", "Jorge", "Sebastián"}
    for row in report.rows:
        assert row.has_overload is False, f"{row.name} aparece sobrecargado"
