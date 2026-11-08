"""Endpoints de tareas: alta, modificacion, borrado y listado.

Tambien los del detalle de una tarea: comentarios, lista de comprobacion y la
lectura de la tarea suelta, que es lo que necesita el panel de detalle.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from ..models import Task, TaskChecklistItem
from ..schemas import (
    ChecklistItemCreate,
    ChecklistItemOut,
    ChecklistItemUpdate,
    TaskCommentCreate,
    TaskCommentOut,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)
from ..security import (
    CurrentUser,
    SessionDep,
    list_accessible_projects,
    require_project_permission,
    require_task_permission,
)
from ..services.capacity_repository import load_task_week_hours
from ..services.dates import as_utc
from ..services.task_details import (
    add_checklist_item,
    assignee_names,
    add_comment,
    checklist_progress,
    list_checklist,
    list_comments,
    remove_checklist_item,
    update_checklist_item,
)
from ..services.tasks import (
    create_task,
    delete_task,
    list_project_tasks,
    list_tasks_for_projects,
    update_task,
)

router = APIRouter(tags=["tasks"])


async def _checklist_item_or_404(
    session: SessionDep, task_id: int, item_id: int
) -> TaskChecklistItem:
    """El punto de la lista, si pertenece a esa tarea.

    Un punto de otra tarea no se distingue del que no existe: los dos
    responden 404.
    """
    result = await session.execute(
        select(TaskChecklistItem).where(
            TaskChecklistItem.id == item_id,
            TaskChecklistItem.task_id == task_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Punto de la lista no encontrado",
        )
    return item


async def _with_details(
    session: SessionDep,
    tasks: list[Task],
    week: str | None,
) -> list[TaskOut]:
    """Enriquece las tareas con lo que necesita un listado.

    Aporta las horas que aportan en la semana filtrada, el nombre de quien las
    lleva y el progreso de su lista de comprobacion. Sin filtro por semana no
    hay horas que anadir: las estimadas siguen siendo las de la tarea entera.
    """
    if not tasks:
        return []

    outs = [TaskOut.model_validate(task) for task in tasks]

    if week is not None:
        hours = await load_task_week_hours(session, tasks, week)
        outs = [
            out.model_copy(update={"week_hours": hours.get(task.id)})
            for out, task in zip(outs, tasks)
        ]

    names = await assignee_names(
        session, [task.assigned_to for task in tasks if task.assigned_to is not None]
    )
    progress = await checklist_progress(session, [task.id for task in tasks])

    return [
        out.model_copy(
            update={
                "assigned_name": names.get(task.assigned_to) if task.assigned_to else None,
                "checklist_total": progress.get(task.id, {}).get("checklist_total", 0),
                "checklist_done": progress.get(task.id, {}).get("checklist_done", 0),
            }
        )
        for out, task in zip(outs, tasks)
    ]


@router.get("/tasks", response_model=list[TaskOut])
async def list_visible_tasks(
    session: SessionDep,
    user: CurrentUser,
    assigned_to: int | None = Query(default=None),
    week: str | None = Query(default=None, description="Semana ISO, por ejemplo 2026-W46"),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
) -> list[TaskOut]:
    """Tareas de todos los proyectos visibles, con filtro opcional.

    Es el listado que usa el desglose de una celda de la matriz global, donde
    no hay un proyecto concreto de partida. El rango de fechas acota el
    periodo: la semana manda si vienen las dos cosas.
    """
    projects = await list_accessible_projects(session, user)
    tasks = await list_tasks_for_projects(
        session,
        [project.id for project in projects],
        assigned_to,
        week,
        from_date,
        to_date,
    )
    return await _with_details(session, tasks, week)


@router.get("/projects/{project_id}/tasks", response_model=list[TaskOut])
async def list_tasks(
    project_id: int,
    session: SessionDep,
    assigned_to: int | None = Query(default=None),
    week: str | None = Query(default=None, description="Semana ISO, por ejemplo 2026-W46"),
    _project=Depends(require_project_permission("capacity.read")),
) -> list[TaskOut]:
    """Tareas del proyecto, con filtro opcional por persona y por semana."""
    tasks = await list_project_tasks(session, project_id, assigned_to, week)
    return await _with_details(session, tasks, week)


@router.post("/projects/{project_id}/tasks", response_model=TaskOut, status_code=201)
async def add_task(
    project_id: int,
    payload: TaskCreate,
    session: SessionDep,
    user: CurrentUser,
    _project=Depends(require_project_permission("task.write")),
) -> Task:
    """Crea una tarea en el proyecto."""
    return await create_task(session, project_id, payload, user)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def edit_task(
    task_id: int,
    payload: TaskUpdate,
    session: SessionDep,
    user: CurrentUser,
    task: Task = Depends(require_task_permission("task.write")),
) -> Task:
    """Modifica los campos indicados de una tarea."""
    return await update_task(session, task, payload, user)


@router.delete("/tasks/{task_id}", status_code=204)
async def remove_task(
    task_id: int,
    session: SessionDep,
    user: CurrentUser,
    task: Task = Depends(require_task_permission("task.write")),
) -> None:
    """Elimina una tarea."""
    await delete_task(session, task, user)


@router.get("/tasks/{task_id}", response_model=TaskOut)
async def read_task(
    task_id: int,
    task: Task = Depends(require_task_permission("capacity.read")),
) -> Task:
    """La tarea suelta, con su descripcion.

    La lee el panel de detalle, que la necesita entera y no solo lo que
    enseña el tablero.
    """
    return task


@router.get("/tasks/{task_id}/comments", response_model=list[TaskCommentOut])
async def read_comments(
    task_id: int,
    session: SessionDep,
    _task: Task = Depends(require_task_permission("capacity.read")),
) -> list[dict]:
    """Comentarios de la tarea, del mas antiguo al mas reciente."""
    return await list_comments(session, task_id)


@router.post("/tasks/{task_id}/comments", response_model=TaskCommentOut, status_code=201)
async def write_comment(
    task_id: int,
    payload: TaskCommentCreate,
    session: SessionDep,
    user: CurrentUser,
    task: Task = Depends(require_task_permission("task.write")),
) -> TaskCommentOut:
    """Pone un comentario en la tarea."""
    comment = await add_comment(session, task, user, payload.body)
    return TaskCommentOut(
        id=comment.id,
        task_id=comment.task_id,
        author_id=comment.author_id,
        author_name=user.name,
        body=comment.body,
        created_at=as_utc(comment.created_at),
    )


@router.get("/tasks/{task_id}/checklist", response_model=list[ChecklistItemOut])
async def read_checklist(
    task_id: int,
    session: SessionDep,
    _task: Task = Depends(require_task_permission("capacity.read")),
) -> list[dict]:
    """Puntos de la lista de comprobacion de la tarea, en su orden."""
    return await list_checklist(session, task_id)


@router.post("/tasks/{task_id}/checklist", response_model=ChecklistItemOut, status_code=201)
async def write_checklist_item(
    task_id: int,
    payload: ChecklistItemCreate,
    session: SessionDep,
    user: CurrentUser,
    task: Task = Depends(require_task_permission("task.write")),
) -> ChecklistItemOut:
    """Anade un punto a la lista de comprobacion de la tarea."""
    item = await add_checklist_item(session, task, user, payload.label)
    return ChecklistItemOut(
        id=item.id,
        task_id=item.task_id,
        label=item.label,
        done=item.done,
        position=item.position,
        created_at=as_utc(item.created_at),
    )


@router.patch("/tasks/{task_id}/checklist/{item_id}", response_model=ChecklistItemOut)
async def edit_checklist_item(
    task_id: int,
    item_id: int,
    payload: ChecklistItemUpdate,
    session: SessionDep,
    user: CurrentUser,
    task: Task = Depends(require_task_permission("task.write")),
) -> ChecklistItemOut:
    """Marca, desmarca o renombra un punto de la lista."""
    item = await _checklist_item_or_404(session, task_id, item_id)
    item = await update_checklist_item(session, task, item, user, payload)
    return ChecklistItemOut(
        id=item.id,
        task_id=item.task_id,
        label=item.label,
        done=item.done,
        position=item.position,
        created_at=as_utc(item.created_at),
    )


@router.delete("/tasks/{task_id}/checklist/{item_id}", status_code=204)
async def delete_checklist_item(
    task_id: int,
    item_id: int,
    session: SessionDep,
    user: CurrentUser,
    task: Task = Depends(require_task_permission("task.write")),
) -> None:
    """Quita un punto de la lista de comprobacion."""
    item = await _checklist_item_or_404(session, task_id, item_id)
    await remove_checklist_item(session, task, item, user)
