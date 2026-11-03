"""Consulta del diagrama de Gantt desde la base de datos.

Mantiene separado el mapeo puro (backend/services/gantt.py) del acceso a
datos, de modo que el formato de las barras se pueda probar sin base de
datos.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ProjectMember, Task, User
from .gantt import GanttFeed, build_gantt_feed


async def load_project_gantt(session: AsyncSession, project_id: int) -> GanttFeed:
    """Diagrama de Gantt de un proyecto.

    Incluye como personas a los miembros del proyecto y a quienes tengan
    tareas en el, aunque no sean miembros, para que ninguna barra quede sin
    color.
    """
    member_ids = (
        await session.execute(
            select(ProjectMember.user_id).where(
                ProjectMember.project_id == project_id
            )
        )
    ).scalars().all()

    tasks = (
        await session.execute(select(Task).where(Task.project_id == project_id))
    ).scalars().all()

    assignee_ids = {task.assigned_to for task in tasks if task.assigned_to is not None}
    wanted_ids = set(member_ids) | assignee_ids

    users = (
        await session.execute(select(User).where(User.id.in_(wanted_ids)))
    ).scalars().all()

    ordered = sorted(users, key=lambda user: (user.name.lower(), user.id))
    return build_gantt_feed(ordered, tasks)
