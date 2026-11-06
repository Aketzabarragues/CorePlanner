"""Endpoints de proyecto: listado y matriz de capacidad."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from ..schemas import ProjectCreate, ProjectOut, ProjectUpdate
from ..security import (
    CurrentUser,
    SessionDep,
    list_accessible_projects,
    require_manager,
    require_project_permission,
)
from ..services.capacity_repository import load_project_capacity
from ..services.configuration import create_project, update_project

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_projects(user: CurrentUser, session: SessionDep) -> list[ProjectOut]:
    """Proyectos a los que tiene acceso el usuario."""
    projects = await list_accessible_projects(session, user)
    return [ProjectOut.model_validate(project) for project in projects]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def add_project(
    payload: ProjectCreate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> ProjectOut:
    """Crea un proyecto."""
    project = await create_project(session, payload)
    return ProjectOut.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectOut)
async def edit_project(
    project_id: int,
    payload: ProjectUpdate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> ProjectOut:
    """Modifica los campos indicados de un proyecto."""
    project = await update_project(session, project_id, payload)
    return ProjectOut.model_validate(project)


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
