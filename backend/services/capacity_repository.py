"""Consulta de la matriz de capacidad desde la base de datos.

Mantiene separado el calculo puro (backend/services/capacity.py) del acceso
a datos, de modo que el motor se pueda probar sin base de datos.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ProjectMember, Task, User
from .capacity import CapacityReport, build_capacity_report


async def load_project_capacity(
    session: AsyncSession,
    project_id: int,
    *,
    include_unassigned: bool = True,
) -> CapacityReport:
    """Matriz de ocupacion de las personas asignadas a un proyecto.

    Las personas asignadas sin tareas aparecen con filas a cero. Con
    include_unassigned se incorporan ademas las personas que tienen tareas en
    el proyecto aunque no sean miembros de el.
    """
    members = (
        await session.execute(
            select(ProjectMember.user_id).where(
                ProjectMember.project_id == project_id
            )
        )
    ).scalars().all()

    member_ids = set(members)
    tasks = (
        await session.execute(select(Task).where(Task.project_id == project_id))
    ).scalars().all()

    assignee_ids = {task.assigned_to for task in tasks if task.assigned_to is not None}
    wanted_ids = member_ids | (assignee_ids if include_unassigned else set())

    users = (
        await session.execute(select(User).where(User.id.in_(wanted_ids)))
    ).scalars().all()

    ordered = sorted(users, key=lambda user: (user.name.lower(), user.id))
    return build_capacity_report(ordered, tasks)
