"""Endpoints de tareas: alta, modificacion, borrado y listado."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from ..models import Task
from ..schemas import TaskCreate, TaskOut, TaskUpdate
from ..security import (
    CurrentUser,
    SessionDep,
    list_accessible_projects,
    require_project_permission,
    require_task_permission,
)
from ..services.tasks import (
    create_task,
    delete_task,
    list_project_tasks,
    list_tasks_for_projects,
    update_task,
)

router = APIRouter(tags=["tasks"])


@router.get("/tasks", response_model=list[TaskOut])
async def list_visible_tasks(
    session: SessionDep,
    user: CurrentUser,
    assigned_to: int | None = Query(default=None),
    week: str | None = Query(default=None, description="Semana ISO, por ejemplo 2026-W46"),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
) -> list[Task]:
    """Tareas de todos los proyectos visibles, con filtro opcional.

    Es el listado que usa el desglose de una celda de la matriz global, donde
    no hay un proyecto concreto de partida. El rango de fechas acota el
    periodo: la semana manda si vienen las dos cosas.
    """
    projects = await list_accessible_projects(session, user)
    return await list_tasks_for_projects(
        session,
        [project.id for project in projects],
        assigned_to,
        week,
        from_date,
        to_date,
    )


@router.get("/projects/{project_id}/tasks", response_model=list[TaskOut])
async def list_tasks(
    project_id: int,
    session: SessionDep,
    assigned_to: int | None = Query(default=None),
    week: str | None = Query(default=None, description="Semana ISO, por ejemplo 2026-W46"),
    _project=Depends(require_project_permission("capacity.read")),
) -> list[Task]:
    """Tareas del proyecto, con filtro opcional por persona y por semana."""
    return await list_project_tasks(session, project_id, assigned_to, week)


@router.post("/projects/{project_id}/tasks", response_model=TaskOut, status_code=201)
async def add_task(
    project_id: int,
    payload: TaskCreate,
    session: SessionDep,
    _project=Depends(require_project_permission("task.write")),
) -> Task:
    """Crea una tarea en el proyecto."""
    return await create_task(session, project_id, payload)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def edit_task(
    task_id: int,
    payload: TaskUpdate,
    session: SessionDep,
    task: Task = Depends(require_task_permission("task.write")),
) -> Task:
    """Modifica los campos indicados de una tarea."""
    return await update_task(session, task, payload)


@router.delete("/tasks/{task_id}", status_code=204)
async def remove_task(
    task_id: int,
    session: SessionDep,
    task: Task = Depends(require_task_permission("task.write")),
) -> None:
    """Elimina una tarea."""
    await delete_task(session, task)
