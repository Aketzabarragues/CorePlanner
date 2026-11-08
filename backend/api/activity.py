"""Endpoint de la bitacora de cambios.

Es la vista global de la actividad: sin filtro devuelve lo de todos los
proyectos que la persona puede ver y con filtro, lo de uno solo. El permiso es
el mismo que el de la capacidad: se ve lo de los proyectos visibles.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..models import Task
from ..schemas import ActivityPageOut
from ..security import CurrentUser, SessionDep, list_accessible_projects
from ..services.activity import (
    MAX_PAGE_SIZE,
    PAGE_SIZE,
    activity_items,
    count_activity,
    list_activity,
)

router = APIRouter(tags=["activity"])


@router.get("/activity", response_model=ActivityPageOut)
async def activity(
    session: SessionDep,
    user: CurrentUser,
    project_id: int | None = Query(
        default=None, description="Limita la bitacora a un proyecto visible"
    ),
    entity_type: str | None = Query(
        default=None, description="Limita la bitacora a un tipo de entidad"
    ),
    entity_id: int | None = Query(
        default=None, description="Limita la bitacora a una entidad concreta"
    ),
    limit: int = Query(default=PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
) -> ActivityPageOut:
    """Bitacora de cambios de los proyectos visibles.

    Sin project_id sale todo lo de los proyectos que la persona puede ver; con
    el, solo lo de ese proyecto. Un proyecto que no se ve no se distingue del
    que no existe: los dos responden 404.

    Con entity_type y entity_id sale solo el historico de una entidad, que es
    lo que necesita el detalle de una tarea. El permiso es el del proyecto de
    esa entidad: si no se ve, tampoco se ve su historico.
    """
    projects = await list_accessible_projects(session, user)
    if project_id is not None:
        projects = [project for project in projects if project.id == project_id]
        if not projects:
            raise HTTPException(
                status_code=404,
                detail="Ese proyecto no esta entre los que puedes ver",
            )

    project_ids = [project.id for project in projects]
    if entity_type == "task" and entity_id is not None:
        await _task_in_projects(session, entity_id, project_ids)

    entries = await list_activity(
        session,
        project_ids,
        limit=limit,
        offset=offset,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    total = await count_activity(
        session,
        project_ids,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    items = await activity_items(session, entries)
    return ActivityPageOut(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


async def _task_in_projects(
    session: AsyncSession, task_id: int, project_ids: list[int]
) -> Task:
    """La tarea, si su proyecto esta entre los visibles.

    Una tarea de un proyecto que no se ve no se distingue de la que no existe:
    las dos responden 404.
    """
    task = await session.get(Task, task_id)
    if task is None or task.project_id not in project_ids:
        raise HTTPException(
            status_code=404,
            detail="Esa tarea no esta entre las que puedes ver",
        )
    return task
