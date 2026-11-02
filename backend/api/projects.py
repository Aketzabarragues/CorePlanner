"""Endpoints de proyecto: listado y matriz de capacidad."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..schemas import ProjectOut
from ..security import (
    CurrentUser,
    SessionDep,
    list_accessible_projects,
    require_project_permission,
)
from ..services.capacity_repository import load_project_capacity

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_projects(user: CurrentUser, session: SessionDep) -> list[ProjectOut]:
    """Proyectos a los que tiene acceso el usuario."""
    projects = await list_accessible_projects(session, user)
    return [ProjectOut.model_validate(project) for project in projects]


@router.get("/{project_id}/capacity")
async def project_capacity(
    project_id: int,
    session: SessionDep,
    _project=Depends(require_project_permission("capacity.read")),
) -> dict:
    """Matriz de ocupacion del proyecto.

    Cada celda lleva las horas de la semana y la marca de sobrecarga frente
    a las horas base de la persona.
    """
    report = await load_project_capacity(session, project_id)
    return report.to_dict()
