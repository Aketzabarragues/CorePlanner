"""Pruebas del modelo de departamentos.

Comprueban que las claves foraneas existen en SQLite, que al borrar un
departamento o su responsable no se rompe nada y que una tarea puede
llevarla alguien de otro departamento.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.database import create_engine
from backend.models import Base, Department, Project, Task, TaskStatus, User


@pytest.fixture
async def session():
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        yield db
    await engine.dispose()


async def _departamentos(session):
    ana = User(name="Ana", email="ana@example.com", hashed_password="x")
    jorge = User(name="Jorge", email="jorge@example.com", hashed_password="x")
    session.add_all([ana, jorge])
    await session.flush()

    automatizacion = Department(name="Automatización & SCADA", manager_id=ana.id)
    oficina = Department(name="Oficina Técnica / EPLAN", manager_id=jorge.id)
    session.add_all([automatizacion, oficina])
    await session.flush()

    ana.department_id = automatizacion.id
    jorge.department_id = oficina.id
    await session.commit()
    return ana, jorge, automatizacion, oficina


async def test_las_claves_foraneas_de_departamentos_existen_en_sqlite(session):
    async with session.bind.connect() as conn:
        claves = await conn.run_sync(
            lambda c: {
                "departments": inspect(c).get_foreign_keys("departments"),
                "users": inspect(c).get_foreign_keys("users"),
                "projects": inspect(c).get_foreign_keys("projects"),
            }
        )

    departments = {fk["referred_table"]: fk for fk in claves["departments"]}
    users = {fk["referred_table"]: fk for fk in claves["users"]}
    projects = {fk["referred_table"]: fk for fk in claves["projects"]}

    assert departments["users"]["referred_columns"] == ["id"]
    assert departments["users"]["options"]["ondelete"] == "SET NULL"
    assert users["departments"]["options"]["ondelete"] == "SET NULL"
    assert projects["departments"]["options"]["ondelete"] == "SET NULL"


async def test_las_personas_y_el_proyecto_cuelgan_de_su_departamento(session):
    ana, jorge, automatizacion, oficina = await _departamentos(session)

    project = Project(name="Linea 1", department_id=automatizacion.id)
    session.add(project)
    await session.commit()

    await session.refresh(ana)
    await session.refresh(jorge)
    assert ana.department_id == automatizacion.id
    assert ana.department.name == "Automatización & SCADA"
    assert jorge.department.name == "Oficina Técnica / EPLAN"
    assert project.department_id == automatizacion.id


async def test_al_borrar_un_departamento_quedan_sin_departamento(session):
    ana, jorge, automatizacion, _oficina = await _departamentos(session)
    project = Project(name="Linea 1", department_id=automatizacion.id)
    session.add(project)
    await session.commit()

    await session.delete(automatizacion)
    await session.commit()

    await session.refresh(ana)
    await session.refresh(project)
    assert ana.department_id is None
    assert project.department_id is None


async def test_al_borrar_el_responsable_el_departamento_no_rompe(session):
    ana, _jorge, automatizacion, _oficina = await _departamentos(session)

    await session.delete(ana)
    await session.commit()

    await session.refresh(automatizacion)
    assert automatizacion.manager_id is None


async def test_al_borrar_el_departamento_en_sql_la_persona_sobrevive(session):
    """El borrado directo en SQL respeta el ON DELETE SET NULL de la base de datos.

    El ORM anula la clave foranea por su cuenta al borrar el departamento, de
    modo que el borrado desde Python no demuestra nada sobre la base de datos.
    """
    ana, _jorge, automatizacion, _oficina = await _departamentos(session)

    await session.execute(
        text("DELETE FROM departments WHERE id = :id"), {"id": automatizacion.id}
    )
    await session.commit()

    await session.refresh(ana)
    assert ana.department_id is None


async def test_una_tarea_puede_llevarla_alguien_de_otro_departamento(session):
    ana, jorge, automatizacion, _oficina = await _departamentos(session)
    project = Project(name="Linea 1", department_id=automatizacion.id)
    session.add(project)
    await session.flush()

    # Jorge es de Oficina Tecnica y trabaja en el proyecto de Automatizacion.
    task = Task(
        project_id=project.id,
        assigned_to=jorge.id,
        title="Revision transversal",
        status=TaskStatus.BACKLOG.value,
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 4),
        estimated_hours=8,
    )
    session.add(task)
    await session.commit()

    await session.refresh(task)
    assert task.assigned_to == jorge.id
    assert task.assigned_to != ana.id
