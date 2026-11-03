"""Endpoint del tablero Kanban."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..schemas import KanbanOut
from ..security import SessionDep, require_project_permission
from ..services.kanban_repository import load_project_kanban

router = APIRouter(prefix="/projects", tags=["kanban"])


@router.get("/{project_id}/kanban", response_model=KanbanOut)
async def project_kanban(
    project_id: int,
    session: SessionDep,
    _project=Depends(require_project_permission("capacity.read")),
) -> KanbanOut:
    """Tablero del proyecto con las tareas agrupadas por estado.

    Las cuatro columnas estan siempre presentes, aunque no haya tareas en
    alguna de ellas.
    """
    columns = await load_project_kanban(session, project_id)
    return KanbanOut.model_validate(
        {"columns": [column.to_dict() for column in columns]}
    )
