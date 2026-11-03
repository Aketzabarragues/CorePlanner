"""Endpoint del diagrama de Gantt."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..schemas import GanttOut
from ..security import SessionDep, require_project_permission
from ..services.gantt_repository import load_project_gantt

router = APIRouter(prefix="/projects", tags=["gantt"])


@router.get("/{project_id}/gantt", response_model=GanttOut)
async def project_gantt(
    project_id: int,
    session: SessionDep,
    _project=Depends(require_project_permission("gantt.read")),
) -> GanttOut:
    """Barras del diagrama de Gantt del proyecto.

    Cada barra lleva las fechas de la tarea, su avance y la persona
    asignada, que aparece en la etiqueta y en el color de la barra.
    """
    feed = await load_project_gantt(session, project_id)
    return GanttOut.model_validate(feed.to_dict())
