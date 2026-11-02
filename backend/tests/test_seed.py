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
from backend.models import Base, Project, Task, User
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
        "jorge@example.com",
    }


async def test_el_seed_crea_el_proyecto_de_pasteurizadora(seeded_session):
    project = (await seeded_session.execute(select(Project))).scalar_one()

    assert project.name == "Linea Pasteurizadora SIVE"


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
    scada = next(t for t in tasks if t.title == "Programacion SCADA WinCC")

    # De jueves a miercoles: el fin de semana queda en medio.
    assert scada.start_date == date(2026, 11, 5)
    assert scada.end_date == date(2026, 11, 11)
    assert scada.start_date.weekday() == 3
    assert scada.end_date.weekday() == 2
    assert scada.estimated_hours == 40


async def test_las_dos_tareas_de_scada_comparten_fechas(seeded_session):
    tasks = (await seeded_session.execute(select(Task))).scalars().all()
    scada = next(t for t in tasks if t.title == "Programacion SCADA WinCC")
    scl = next(t for t in tasks if t.title == "Desarrollo de Bloques SCL")

    assert scl.start_date == scada.start_date
    assert scl.end_date == scada.end_date
    assert scl.estimated_hours == 20


async def test_el_seed_produce_la_sobrecarga_de_sebastian(seeded_session):
    project = (await seeded_session.execute(select(Project))).scalar_one()

    report = await load_project_capacity(seeded_session, project.id)

    sebastian = next(row for row in report.rows if row.name == "Sebastian")
    cells = {cell.week: cell for cell in sebastian.cells}
    assert cells["2026-W45"].hours == 24.0
    assert cells["2026-W46"].hours == 48.0
    assert cells["2026-W46"].is_overloaded is True
    assert cells["2026-W45"].is_overloaded is False


async def test_el_seed_no_sobrecarga_a_los_demas(seeded_session):
    project = (await seeded_session.execute(select(Project))).scalar_one()

    report = await load_project_capacity(seeded_session, project.id)

    for row in report.rows:
        if row.name == "Sebastian":
            continue
        assert row.has_overload is False, f"{row.name} aparece sobrecargado"
