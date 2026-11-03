"""Consulta del tablero Kanban desde la base de datos.

Mantiene separado el agrupado puro (backend/services/kanban.py) del acceso
a datos.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Task, User
from .kanban import KanbanColumn, build_kanban


async def load_project_kanban(
    session: AsyncSession, project_id: int
) -> list[KanbanColumn]:
    """Tablero de un proyecto: sus tareas agrupadas por estado."""
    tasks = (
        await session.execute(
            select(Task)
            .where(Task.project_id == project_id)
            .order_by(Task.start_date, Task.id)
        )
    ).scalars().all()

    assignee_ids = {task.assigned_to for task in tasks if task.assigned_to is not None}
    users = (
        await session.execute(select(User).where(User.id.in_(assignee_ids)))
    ).scalars().all()

    return build_kanban(list(tasks), list(users))
