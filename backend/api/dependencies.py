"""Endpoints de dependencias entre tareas: alta, baja, lectura y cascada.

Un vinculo es del proyecto de sus tareas: las dos tareas tienen que ser del
mismo proyecto, y el permiso se resuelve sobre ese proyecto. El alta rechaza
los cuatro errores de dominio (par repetido, tareas de otro proyecto, ciclo y
auto-dependencia) con 422.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from ..models import Task, TaskDependency
from ..schemas import (
    TaskCascadeOut,
    TaskDependencyCreate,
    TaskDependencyLinkOut,
    TaskDependencyProjectLinkOut,
    TaskDependencyProjectOut,
    TaskTaskDependenciesOut,
)
from ..security import (
    CurrentUser,
    SessionDep,
    require_project_permission,
    require_task_permission,
)
from ..services.activity import log_activity
from ..services.task_dependencies import detect_cycle, propose_cascade

router = APIRouter(tags=["task-dependencies"])


async def _tareas_del_proyecto(session: SessionDep, project_id: int) -> dict[int, Task]:
    """Las tareas del proyecto, por identificador."""
    filas = (
        await session.execute(select(Task).where(Task.project_id == project_id))
    ).scalars().all()
    return {task.id: task for task in filas}


async def _vinculos_del_proyecto(
    session: SessionDep, project_id: int
) -> list[TaskDependency]:
    """Los vinculos entre tareas del proyecto, para el chequeo de ciclos."""
    filas = (
        await session.execute(
            select(TaskDependency).where(
                TaskDependency.task_id.in_(
                    select(Task.id).where(Task.project_id == project_id)
                )
            )
        )
    ).scalars().all()
    return list(filas)


def _par_o_422(vinculo: TaskDependencyCreate) -> tuple[int, int, str]:
    """El par de tareas del alta, o 422 si se depende de si misma."""
    if vinculo.task_id == vinculo.depends_on_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Una tarea no puede depender de si misma",
        )
    return vinculo.task_id, vinculo.depends_on_id, vinculo.type


@router.get(
    "/projects/{project_id}/dependencies",
    response_model=TaskDependencyProjectOut,
)
async def list_project_dependencies(
    project_id: int,
    session: SessionDep,
    _project=Depends(require_project_permission("capacity.read")),
) -> TaskDependencyProjectOut:
    """Vinculos del proyecto, con los titulos de las dos tareas."""
    tareas = await _tareas_del_proyecto(session, project_id)
    filas = (
        await session.execute(
            select(TaskDependency)
            .where(
                TaskDependency.task_id.in_(
                    select(Task.id).where(Task.project_id == project_id)
                )
            )
            .order_by(TaskDependency.id)
        )
    ).scalars().all()
    enlaces = []
    for fila in filas:
        dependiente = tareas.get(fila.task_id)
        requisito = tareas.get(fila.depends_on_id)
        enlaces.append(
            TaskDependencyProjectLinkOut(
                id=fila.id,
                task_id=fila.task_id,
                depends_on_id=fila.depends_on_id,
                type=fila.type,
                task_title=dependiente.title if dependiente is not None else "",
                depends_on_title=requisito.title if requisito is not None else "",
            )
        )
    return TaskDependencyProjectOut(dependencies=enlaces)


@router.post(
    "/projects/{project_id}/dependencies",
    response_model=TaskDependencyLinkOut,
    status_code=201,
)
async def add_dependency(
    project_id: int,
    payload: TaskDependencyCreate,
    session: SessionDep,
    user: CurrentUser,
    _project=Depends(require_project_permission("task.write")),
) -> TaskDependency:
    """Crea un vinculo entre dos tareas del proyecto."""
    task_id, depends_on_id, tipo = _par_o_422(payload)

    dependiente = await session.get(Task, task_id)
    requisito = await session.get(Task, depends_on_id)
    if (
        dependiente is None
        or requisito is None
        or dependiente.project_id != project_id
        or requisito.project_id != project_id
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Las dos tareas tienen que ser del mismo proyecto",
        )

    existente = (
        await session.execute(
            select(TaskDependency).where(
                TaskDependency.task_id == task_id,
                TaskDependency.depends_on_id == depends_on_id,
            )
        )
    ).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="El vinculo ya existe",
        )

    # El chequeo de ciclos se hace sobre el grafo completo del proyecto, no
    # solo sobre el par nuevo: el ciclo puede estar a varios saltos.
    existentes = await _vinculos_del_proyecto(session, project_id)
    edges = [(fila.task_id, fila.depends_on_id, fila.type) for fila in existentes]
    if detect_cycle(edges, (task_id, depends_on_id, tipo)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="El vinculo cerraria un ciclo en las dependencias",
        )

    vinculo = TaskDependency(task_id=task_id, depends_on_id=depends_on_id, type=tipo)
    session.add(vinculo)
    await session.flush()
    await log_activity(
        session,
        user,
        "dependency.created",
        "task_dependency",
        vinculo.id,
        project_id,
        {"task_id": task_id, "depends_on_id": depends_on_id, "type": tipo},
    )
    await session.commit()
    await session.refresh(vinculo)
    return vinculo


@router.delete(
    "/tasks/{task_id}/dependencies/{depends_on_id}",
    status_code=204,
)
async def remove_dependency(
    task_id: int,
    depends_on_id: int,
    session: SessionDep,
    user: CurrentUser,
    task: Task = Depends(require_task_permission("task.write")),
) -> None:
    """Borra el vinculo entre dos tareas, por el par."""
    vinculo = (
        await session.execute(
            select(TaskDependency).where(
                TaskDependency.task_id == task_id,
                TaskDependency.depends_on_id == depends_on_id,
            )
        )
    ).scalar_one_or_none()
    if vinculo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="El vinculo no existe"
        )
    await log_activity(
        session,
        user,
        "dependency.deleted",
        "task_dependency",
        vinculo.id,
        task.project_id,
        {"task_id": task_id, "depends_on_id": depends_on_id, "type": vinculo.type},
    )
    await session.delete(vinculo)
    await session.commit()


@router.get(
    "/tasks/{task_id}/dependencies",
    response_model=TaskTaskDependenciesOut,
)
async def task_dependencies(
    task_id: int,
    session: SessionDep,
    task: Task = Depends(require_task_permission("capacity.read")),
) -> dict:
    """Requisitos y dependientes de una tarea."""
    requisitos = (
        await session.execute(
            select(TaskDependency).where(TaskDependency.task_id == task_id)
        )
    ).scalars().all()
    dependientes = (
        await session.execute(
            select(TaskDependency).where(TaskDependency.depends_on_id == task_id)
        )
    ).scalars().all()
    return {
        "requirements": [
            {
                "id": fila.id,
                "task_id": fila.task_id,
                "depends_on_id": fila.depends_on_id,
                "type": fila.type,
            }
            for fila in requisitos
        ],
        "dependents": [
            {
                "id": fila.id,
                "task_id": fila.task_id,
                "depends_on_id": fila.depends_on_id,
                "type": fila.type,
            }
            for fila in dependientes
        ],
    }


@router.get("/tasks/{task_id}/cascade", response_model=TaskCascadeOut)
async def cascade_proposal(
    task_id: int,
    session: SessionDep,
    delta_days: int = Query(0),
    task: Task = Depends(require_task_permission("capacity.read")),
) -> dict:
    """Propuesta de cascada si la tarea se moviera delta_days dias.

    No modifica nada: devuelve las tareas que habria que mover y con que
    fechas.
    """
    tareas = await _tareas_del_proyecto(session, task.project_id)
    filas = (
        await session.execute(
            select(TaskDependency).where(
                TaskDependency.task_id.in_(tareas.keys())
            )
        )
    ).scalars().all()
    edges = [(fila.task_id, fila.depends_on_id, fila.type) for fila in filas]
    propuestas = propose_cascade(tareas, edges, task_id, delta_days)
    return {
        "task_id": task_id,
        "delta_days": delta_days,
        "moves": [
            {
                "task_id": mov.task_id,
                "start_date": mov.start_date,
                "end_date": mov.end_date,
            }
            for mov in propuestas
        ],
    }
