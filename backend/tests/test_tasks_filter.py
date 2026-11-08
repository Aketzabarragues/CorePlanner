"""Pruebas del filtro de tareas por periodo.

El filtro va en la consulta: la base de datos devuelve solo las tareas que
solapan con el rango, en vez de traerlas todas y descartarlas despues. Encima
queda el ajuste de siempre, que deja fuera las tareas cuyo rango solo pisa
sabados y domingos.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.database import create_engine
from backend.models import Base, Project, Task, TaskStatus
from backend.services.tasks import list_tasks_for_projects


@pytest.fixture
async def session():
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        yield db
    await engine.dispose()


async def _seed(session) -> Project:
    """Proyecto con una tarea dentro de la semana, otra fuera y una de fin de semana.

    La semana 2026-W46 va del lunes 9 al domingo 15 de noviembre de 2026.
    """
    project = Project(name="Linea 1")
    session.add(project)
    await session.flush()
    session.add_all(
        [
            Task(
                project_id=project.id,
                title="Dentro",
                status=TaskStatus.BACKLOG.value,
                start_date=date(2026, 11, 9),
                end_date=date(2026, 11, 10),
                estimated_hours=8,
            ),
            Task(
                project_id=project.id,
                title="Fuera",
                status=TaskStatus.BACKLOG.value,
                start_date=date(2026, 11, 16),
                end_date=date(2026, 11, 17),
                estimated_hours=8,
            ),
            Task(
                project_id=project.id,
                title="Solo fin de semana",
                status=TaskStatus.BACKLOG.value,
                start_date=date(2026, 11, 14),
                end_date=date(2026, 11, 15),
                estimated_hours=8,
            ),
        ]
    )
    await session.commit()
    return project


def _escuchar_consultas(session) -> tuple[list[str], object, object]:
    """Registra las sentencias que se ejecutan."""
    statements: list[str] = []

    def guardar(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    engine = session.sync_session.get_bind()
    event.listen(engine, "before_cursor_execute", guardar)
    return statements, engine, guardar


async def test_el_filtro_de_semana_va_en_la_consulta(session):
    project = await _seed(session)
    statements, engine, guardar = _escuchar_consultas(session)
    try:
        tareas = await list_tasks_for_projects(session, [project.id], week="2026-W46")
    finally:
        event.remove(engine, "before_cursor_execute", guardar)

    consulta = statements[-1]
    assert "tasks.start_date <= ?" in consulta
    assert "tasks.end_date >= ?" in consulta
    # El resultado es el de siempre: solo la tarea con dias laborables.
    assert [task.title for task in tareas] == ["Dentro"]


async def test_el_filtro_de_rango_va_en_la_consulta(session):
    project = await _seed(session)
    statements, engine, guardar = _escuchar_consultas(session)
    try:
        tareas = await list_tasks_for_projects(
            session,
            [project.id],
            from_date=date(2026, 11, 9),
            to_date=date(2026, 11, 15),
        )
    finally:
        event.remove(engine, "before_cursor_execute", guardar)

    consulta = statements[-1]
    assert "tasks.start_date <= ?" in consulta
    assert "tasks.end_date >= ?" in consulta
    assert [task.title for task in tareas] == ["Dentro"]


async def test_una_semana_invalida_no_devuelve_tareas(session):
    project = await _seed(session)

    tareas = await list_tasks_for_projects(session, [project.id], week="no-es-una-semana")

    assert tareas == []
