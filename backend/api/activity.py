"""Endpoint de la bitacora de cambios.

Es la vista global de la actividad: sin filtro devuelve lo de todos los
proyectos que la persona puede ver y con filtro, lo de uno solo. El permiso es
el mismo que el de la capacidad: se ve lo de los proyectos visibles.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

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
    limit: int = Query(default=PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
) -> ActivityPageOut:
    """Bitacora de cambios de los proyectos visibles.

    Sin project_id sale todo lo de los proyectos que la persona puede ver; con
    el, solo lo de ese proyecto. Un proyecto que no se ve no se distingue del
    que no existe: los dos responden 404.
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
    entries = await list_activity(session, project_ids, limit=limit, offset=offset)
    total = await count_activity(session, project_ids)
    items = await activity_items(session, entries)
    return ActivityPageOut(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )
