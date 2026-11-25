"""Endpoints de los estados de tarea configurables por proyecto."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status

from ..schemas import (
    TaskStatusCreate,
    TaskStatusOrder,
    TaskStatusOut,
    TaskStatusUpdate,
)
from ..security import (
    CurrentUser,
    SessionDep,
    get_project_or_404,
    list_accessible_projects,
    require_manager,
    require_project_permission,
)
from ..services import task_statuses
from ..services.task_statuses import TaskStatusView

router = APIRouter(tags=["task-statuses"])


def _out(estado: TaskStatusView) -> TaskStatusOut:
    return TaskStatusOut(
        id=estado.id,
        project_id=estado.project_id,
        key=estado.key,
        label=estado.label,
        color=estado.color,
        progress=estado.progress,
        order_index=estado.order_index,
        task_count=estado.task_count,
    )


@router.get("/task-statuses", response_model=dict[str, list[TaskStatusOut]])
async def list_all_statuses(
    session: SessionDep,
    user: CurrentUser,
) -> dict[str, list[TaskStatusOut]]:
    """Estados de todos los proyectos accesibles, para las vistas multiproyecto.

    El ambito es el del rol de empresa, el mismo que el resto de las vistas
    globales. La respuesta es un mapa de identificador de proyecto a lista de
    estados, de modo que una sola peticion alimenta el tablero y el Gantt
    globales.
    """
    projects = await list_accessible_projects(session, user)
    grouped = await task_statuses.statuses_by_project(
        session, [project.id for project in projects]
    )
    return {
        str(project_id): [_out(estado) for estado in estados]
        for project_id, estados in grouped.items()
    }


@router.get(
    "/projects/{project_id}/task-statuses", response_model=list[TaskStatusOut]
)
async def list_project_statuses(
    project_id: int,
    session: SessionDep,
    _project=Depends(require_project_permission("capacity.read")),
) -> list[TaskStatusOut]:
    """Estados del proyecto, con el numero de tareas que usan cada uno."""
    filas = await task_statuses.list_statuses(session, project_id)
    return [_out(estado) for estado in filas]


@router.post(
    "/projects/{project_id}/task-statuses",
    response_model=TaskStatusOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_status(
    project_id: int,
    payload: TaskStatusCreate,
    session: SessionDep,
    _project=Depends(require_manager()),
) -> TaskStatusOut:
    """Anade un estado al proyecto, al final de la lista de columnas."""
    await get_project_or_404(session, project_id)
    estado = await task_statuses.create_status(session, project_id, payload)
    filas = await task_statuses.list_statuses(session, project_id)
    return _out(next(item for item in filas if item.id == estado.id))


@router.patch(
    "/projects/{project_id}/task-statuses/{status_id}", response_model=TaskStatusOut
)
async def edit_status(
    project_id: int,
    status_id: int,
    payload: TaskStatusUpdate,
    session: SessionDep,
    _project=Depends(require_manager()),
) -> TaskStatusOut:
    """Cambia la etiqueta, el color o el avance del estado."""
    await get_project_or_404(session, project_id)
    estado = await task_statuses.update_status(session, project_id, status_id, payload)
    filas = await task_statuses.list_statuses(session, project_id)
    return _out(next(item for item in filas if item.id == estado.id))


@router.put(
    "/projects/{project_id}/task-statuses/order",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def order_statuses(
    project_id: int,
    payload: TaskStatusOrder,
    session: SessionDep,
    _project=Depends(require_manager()),
) -> Response:
    """Reordena los estados: la lista de identificadores es el orden nuevo."""
    await get_project_or_404(session, project_id)
    await task_statuses.reorder_statuses(session, project_id, payload.ids)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/projects/{project_id}/task-statuses/{status_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_status(
    project_id: int,
    status_id: int,
    session: SessionDep,
    reassign_to: str | None = Query(
        default=None,
        description="Estado al que pasan las tareas del estado que se borra",
    ),
    _project=Depends(require_manager()),
) -> Response:
    """Borra un estado del proyecto.

    Con reassign_to, las tareas del estado pasan al estado indicado y la
    columna destino queda recompuesta. Sin reassign_to y con tareas en uso,
    el borrado responde 409.
    """
    await get_project_or_404(session, project_id)
    await task_statuses.delete_status(session, project_id, status_id, reassign_to)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
