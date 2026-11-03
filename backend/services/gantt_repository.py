"""Consulta del diagrama de Gantt desde la base de datos.

Mantiene separado el mapeo puro (backend/services/gantt.py) del acceso a
datos, de modo que el formato de las barras se pueda probar sin base de
datos.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Project, ProjectMember, Task, User
from .gantt import GanttFeed, build_gantt_feed


async def load_gantt_for_projects(
    session: AsyncSession,
    projects: Sequence[Project],
) -> GanttFeed:
    """Diagrama de Gantt de un conjunto de proyectos.

    Incluye como personas a los miembros de los proyectos y a quienes tengan
    tareas en ellos, aunque no sean miembros, para que ninguna barra quede sin
    color. Las barras salen agrupadas por proyecto y, dentro de cada uno, por
    fecha de inicio.
    """
    ids = {project.id for project in projects}
    names = {project.id: project.name for project in projects}
    if not ids:
        return build_gantt_feed([], [], names)

    member_ids = (
        await session.execute(
            select(ProjectMember.user_id).where(ProjectMember.project_id.in_(ids))
        )
    ).scalars().all()

    tasks = (
        await session.execute(select(Task).where(Task.project_id.in_(ids)))
    ).scalars().all()

    assignee_ids = {task.assigned_to for task in tasks if task.assigned_to is not None}
    wanted_ids = set(member_ids) | assignee_ids

    users = (
        await session.execute(select(User).where(User.id.in_(wanted_ids)))
    ).scalars().all()

    ordered = sorted(users, key=lambda user: (user.name.lower(), user.id))
    ordered_tasks = sorted(
        tasks,
        key=lambda task: (
            names.get(task.project_id, ""),
            task.start_date or date.min,
            task.id,
        ),
    )
    return build_gantt_feed(ordered, ordered_tasks, names)


async def load_project_gantt(session: AsyncSession, project: Project) -> GanttFeed:
    """Diagrama de Gantt de un proyecto."""
    return await load_gantt_for_projects(session, [project])
