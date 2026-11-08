"""Alta, modificacion y borrado de tareas.

Las validaciones viven aqui para que los endpoints sean thin y las mismas
reglas sirvan al resto de la aplicacion.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ProjectMember, Task, TaskStatus, User
from ..schemas import TaskCreate, TaskUpdate
from ..services.capacity import business_days, iso_week_key
from ..services.schedule import week_start_from_key


async def get_task_or_404(session: AsyncSession, task_id: int) -> Task:
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada"
        )
    return task


async def is_project_member(
    session: AsyncSession, project_id: int, user_id: int
) -> bool:
    result = await session.execute(
        select(ProjectMember.user_id).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def _require_member(
    session: AsyncSession, project_id: int, user_id: int
) -> User:
    """Comprueba que la persona es miembro del proyecto y la devuelve."""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado"
        )
    if not await is_project_member(session, project_id, user.id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{user.name} no es miembro del proyecto",
        )
    return user


def _validate_dates(start_date: date, end_date: date) -> None:
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="La fecha de fin no puede ser anterior a la de inicio",
        )
    if not business_days(start_date, end_date):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="El rango de fechas no contiene ningun dia laborable",
        )


async def create_task(
    session: AsyncSession,
    project_id: int,
    payload: TaskCreate,
) -> Task:
    """Crea una tarea en el proyecto."""
    _validate_dates(payload.start_date, payload.end_date)

    if payload.assigned_to is not None:
        await _require_member(session, project_id, payload.assigned_to)

    task = Task(
        project_id=project_id,
        title=payload.title,
        assigned_to=payload.assigned_to,
        start_date=payload.start_date,
        end_date=payload.end_date,
        estimated_hours=payload.estimated_hours,
        status=TaskStatus.BACKLOG.value,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


async def update_task(
    session: AsyncSession,
    task: Task,
    payload: TaskUpdate,
) -> Task:
    """Aplica los campos presentes de la peticion sobre la tarea."""
    changed = payload.changed_fields()

    start_date = payload.start_date if "start_date" in changed else task.start_date
    end_date = payload.end_date if "end_date" in changed else task.end_date

    if start_date is not None and end_date is not None:
        _validate_dates(start_date, end_date)

    if "title" in changed and payload.title is not None:
        task.title = payload.title
    if "status" in changed and payload.status is not None:
        task.status = payload.status.value
    if "start_date" in changed and payload.start_date is not None:
        task.start_date = payload.start_date
    if "end_date" in changed and payload.end_date is not None:
        task.end_date = payload.end_date
    if "estimated_hours" in changed and payload.estimated_hours is not None:
        task.estimated_hours = payload.estimated_hours
    if "assigned_to" in changed:
        if payload.assigned_to is not None:
            await _require_member(session, task.project_id, payload.assigned_to)
        task.assigned_to = payload.assigned_to

    await session.commit()
    await session.refresh(task)
    return task


async def delete_task(session: AsyncSession, task: Task) -> None:
    await session.delete(task)
    await session.commit()


def _task_in_week(task: Task, week: str) -> bool:
    """Indica si la tarea toca la semana ISO indicada."""
    if task.start_date is None or task.end_date is None:
        return False
    return any(
        iso_week_key(day) == week
        for day in business_days(task.start_date, task.end_date)
    )


def _task_in_dates(task: Task, from_date: date, to_date: date) -> bool:
    """Indica si la tarea toca alguno de los dias del rango."""
    if task.start_date is None or task.end_date is None:
        return False
    return any(
        from_date <= day <= to_date
        for day in business_days(task.start_date, task.end_date)
    )


async def list_tasks_for_projects(
    session: AsyncSession,
    project_ids: Sequence[int],
    assigned_to: int | None = None,
    week: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[Task]:
    """Tareas de un conjunto de proyectos, con filtro por persona y periodo.

    El periodo se puede acotar por semana ISO o por rango de fechas. La semana
    manda si vienen las dos cosas.

    El filtro de periodo va en SQL: la base de datos devuelve solo las tareas
    que solapan con el rango, en vez de traerlas todas y descartar despues.
    Encima se hace el mismo ajuste de siempre, que deja fuera las tareas cuyo
    rango solo pisa sabados y domingos. El resultado es identico al de filtrar
    todo en Python, pero sin traer el resto de las tareas.
    """
    if not project_ids:
        return []

    stmt = select(Task).where(Task.project_id.in_(set(project_ids)))
    if assigned_to is not None:
        stmt = stmt.where(Task.assigned_to == assigned_to)

    if week is not None:
        try:
            monday = week_start_from_key(week)
        except ValueError:
            # Una semana que no existe no es un error: no hay tareas que
            # coincidan con ella, que es lo que pasaba al filtrar en Python.
            return []
        sunday = monday + timedelta(days=6)
        stmt = stmt.where(
            Task.start_date.is_not(None),
            Task.end_date.is_not(None),
            Task.start_date <= sunday,
            Task.end_date >= monday,
        )
    elif from_date is not None and to_date is not None:
        stmt = stmt.where(
            Task.start_date.is_not(None),
            Task.end_date.is_not(None),
            Task.start_date <= to_date,
            Task.end_date >= from_date,
        )
    elif from_date is not None:
        stmt = stmt.where(Task.end_date >= from_date)
    elif to_date is not None:
        stmt = stmt.where(Task.start_date <= to_date)

    stmt = stmt.order_by(Task.start_date, Task.id)
    tasks = list((await session.execute(stmt)).scalars().all())

    # El ajuste final deja fuera las tareas cuyo rango solo pisa sabados y
    # domingos, que no se pueden expresar en una consulta.
    if week is not None:
        return [task for task in tasks if _task_in_week(task, week)]
    if from_date is not None and to_date is not None:
        return [task for task in tasks if _task_in_dates(task, from_date, to_date)]
    return tasks


async def list_project_tasks(
    session: AsyncSession,
    project_id: int,
    assigned_to: int | None = None,
    week: str | None = None,
) -> list[Task]:
    """Tareas del proyecto, con filtro opcional por persona y semana."""
    return await list_tasks_for_projects(session, [project_id], assigned_to, week)
