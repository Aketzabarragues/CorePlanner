"""Pruebas de la lectura de capacidad desde la base de datos.

Comprueban que el motor puro recibe los mismos datos que devolveria la
base de datos y que el informe refleja el estado real del proyecto.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.database import create_engine
from backend.models import Base, Project, ProjectMember, Role, Task, TaskStatus, User
from backend.services.capacity_repository import load_project_capacity


@pytest.fixture
async def session():
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        yield db
    await engine.dispose()


async def _seed(session):
    ana = User(name="Ana", email="ana@example.com", hashed_password="x")
    luis = User(name="Luis", email="luis@example.com", hashed_password="x")
    project = Project(name="Linea 1")
    role = Role(name="Ingeniero", permissions_json=["task.read"])
    session.add_all([ana, luis, project, role])
    await session.flush()

    session.add(ProjectMember(user_id=ana.id, project_id=project.id, role_id=role.id))
    session.add(ProjectMember(user_id=luis.id, project_id=project.id, role_id=role.id))
    session.add(
        Task(
            project_id=project.id,
            assigned_to=ana.id,
            title="Montaje",
            status=TaskStatus.BACKLOG.value,
            start_date=date(2026, 3, 5),
            end_date=date(2026, 3, 11),
            estimated_hours=40,
        )
    )
    session.add(
        Task(
            project_id=project.id,
            assigned_to=ana.id,
            title="Revision",
            status=TaskStatus.BACKLOG.value,
            start_date=date(2026, 3, 2),
            end_date=date(2026, 3, 6),
            estimated_hours=50,
        )
    )
    await session.commit()
    return ana, luis, project


async def test_el_informe_desde_la_base_de_datos_reparte_igual_que_el_motor(session):
    from backend.services.capacity import compute_task_week_load

    ana, _luis, project = await _seed(session)

    report = await load_project_capacity(session, project.id)

    row = next(r for r in report.rows if r.user_id == ana.id)
    assert row.name == "Ana"
    # Revision (50 h en W10) + Montaje (40 h: 16 en W10, 24 en W11).
    cells = {cell.week: cell for cell in row.cells}
    assert cells["2026-W10"].hours == Decimal("50.00") + Decimal("16.00")
    assert cells["2026-W11"].hours == Decimal("24.00")
    assert cells["2026-W10"].is_overloaded is True
    assert cells["2026-W11"].is_overloaded is False

    directo = compute_task_week_load(date(2026, 3, 5), date(2026, 3, 11), 40)
    assert directo == {"2026-W10": 16.0, "2026-W11": 24.0}


async def test_los_miembros_sin_tareas_aparecen_con_filas_a_cero(session):
    _ana, luis, project = await _seed(session)

    report = await load_project_capacity(session, project.id)

    row = next(r for r in report.rows if r.user_id == luis.id)
    assert row.total_hours == 0.0
    assert row.has_overload is False


async def test_el_informe_no_incluye_tareas_de_otros_proyectos(session):
    _ana, _luis, project = await _seed(session)
    otro = Project(name="Linea 2")
    session.add(otro)
    await session.flush()
    session.add(
        Task(
            project_id=otro.id,
            assigned_to=None,
            title="De otro proyecto",
            status=TaskStatus.BACKLOG.value,
            start_date=date(2026, 3, 2),
            end_date=date(2026, 3, 6),
            estimated_hours=100,
        )
    )
    await session.commit()

    report = await load_project_capacity(session, project.id)

    assert report.unassigned_task_ids == ()
    assert report.rows[0].total_hours < 100.0


async def test_el_informe_serializa_a_diccionario_desde_la_base_de_datos(session):
    ana, _luis, project = await _seed(session)

    data = (await load_project_capacity(session, project.id)).to_dict()

    assert data["weeks"] == ["2026-W10", "2026-W11"]
    assert any(row["user_id"] == ana.id for row in data["rows"])
    assert "is_overloaded" in data["rows"][0]["cells"][0]
