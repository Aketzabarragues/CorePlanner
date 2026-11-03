"""Consulta de la matriz de capacidad desde la base de datos.

Mantiene separado el calculo puro (backend/services/capacity.py) del acceso
a datos, de modo que el motor se pueda probar sin base de datos.
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ProjectMember, Task, User
from .capacity import CapacityReport, build_capacity_report


async def load_capacity_for_projects(
    session: AsyncSession,
    project_ids: Sequence[int],
    *,
    include_unassigned: bool = True,
) -> CapacityReport:
    """Matriz de ocupacion de un conjunto de proyectos.

    Se incluyen las personas que son miembros de alguno de los proyectos, con
    filas a cero si no tienen tareas. Con include_unassigned se incorporan
    ademas las personas que tienen tareas en ellos aunque no sean miembros.
    Las horas de cada persona se suman entre proyectos.
    """
    ids = {int(project_id) for project_id in project_ids}
    if not ids:
        return build_capacity_report([], [])

    members = (
        await session.execute(
            select(ProjectMember.user_id).where(ProjectMember.project_id.in_(ids))
        )
    ).scalars().all()

    tasks = (
        await session.execute(select(Task).where(Task.project_id.in_(ids)))
    ).scalars().all()

    assignee_ids = {task.assigned_to for task in tasks if task.assigned_to is not None}
    wanted_ids = set(members) | (assignee_ids if include_unassigned else set())

    users = (
        await session.execute(select(User).where(User.id.in_(wanted_ids)))
    ).scalars().all()

    ordered = sorted(users, key=lambda user: (user.name.lower(), user.id))
    return build_capacity_report(ordered, tasks)


async def load_project_capacity(
    session: AsyncSession,
    project_id: int,
    *,
    include_unassigned: bool = True,
) -> CapacityReport:
    """Matriz de ocupacion de las personas asignadas a un proyecto."""
    return await load_capacity_for_projects(
        session, [project_id], include_unassigned=include_unassigned
    )
