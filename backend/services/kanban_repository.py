"""Consulta del tablero Kanban desde la base de datos.

Mantiene separado el agrupado puro (backend/services/kanban.py) del acceso
a datos.
"""

from __future__ import annotations

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ProjectTaskStatus, Task, User
from .kanban import KanbanColumn, build_kanban


def _orden_lectura():
    """Orden del tablero: primero las que tienen posicion, en su orden; las
    que no, al final.

    El desempate dentro de cada grupo es (start_date, id). Se monta con `case`
    porque el orden de los nulos no es portable entre SQLite y PostgreSQL:
    aqui el nulo va explicitamente al final.
    """
    return case(
        (Task.position.is_(None), 1),
        else_=0,
    ), Task.position, Task.start_date, Task.id


async def load_project_kanban(
    session: AsyncSession, project_id: int
) -> list[KanbanColumn]:
    """Tablero de un proyecto: sus tareas agrupadas por estado."""
    tasks = (
        await session.execute(
            select(Task)
            .where(Task.project_id == project_id)
            .order_by(*_orden_lectura())
        )
    ).scalars().all()

    assignee_ids = {task.assigned_to for task in tasks if task.assigned_to is not None}
    users = (
        await session.execute(select(User).where(User.id.in_(assignee_ids)))
    ).scalars().all()

    claves = (
        await session.execute(
            select(ProjectTaskStatus.key)
            .where(ProjectTaskStatus.project_id == project_id)
            .order_by(ProjectTaskStatus.order_index, ProjectTaskStatus.id)
        )
    ).scalars().all()

    return build_kanban(list(tasks), list(users), list(claves))
