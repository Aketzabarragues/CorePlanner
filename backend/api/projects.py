"""Endpoints de proyecto: listado y matriz de capacidad."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select

from ..models import Project, User
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
from .params import week_range_or_422

router = APIRouter(prefix="/projects", tags=["projects"])


async def _project_out(session: SessionDep, projects: list[Project]) -> list[ProjectOut]:
    """Proyectos con el nombre de su responsable.

    El nombre del responsable se resuelve aqui, en una sola consulta, para que
    la cabecera del proyecto no tenga que ir a buscarlo.
    """
    owner_ids = {project.owner_id for project in projects if project.owner_id is not None}
    names: dict[int, str] = {}
    if owner_ids:
        rows = (
            await session.execute(select(User.id, User.name).where(User.id.in_(owner_ids)))
        ).all()
        names = {row.id: row.name for row in rows}
    return [
        ProjectOut(
            id=project.id,
            name=project.name,
            status=project.status,
            parent_id=project.parent_id,
            department_id=project.department_id,
            owner_id=project.owner_id,
            owner_name=names.get(project.owner_id) if project.owner_id else None,
        )
        for project in projects
    ]


@router.get("", response_model=list[ProjectOut])
async def list_projects(user: CurrentUser, session: SessionDep) -> list[ProjectOut]:
    """Proyectos a los que tiene acceso el usuario."""
    projects = await list_accessible_projects(session, user)
    return await _project_out(session, projects)


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
    user: CurrentUser,
    _manager=Depends(require_manager()),
) -> ProjectOut:
    """Modifica los campos indicados de un proyecto."""
    project = await update_project(session, project_id, payload, user)
    return ProjectOut.model_validate(project)


@router.get("/{project_id}/capacity")
async def project_capacity(
    project_id: int,
    session: SessionDep,
    from_week: str | None = Query(
        default=None, alias="from", description="Semana ISO inicial del rango"
    ),
    to_week: str | None = Query(
        default=None, alias="to", description="Semana ISO final del rango"
    ),
    skill_id: int | None = Query(
        default=None, description="Limita las filas a quien tenga la competencia"
    ),
    min_level: int | None = Query(
        default=None, ge=1, le=3, description="Nivel minimo de la competencia"
    ),
    _project=Depends(require_project_permission("capacity.read")),
) -> dict:
    """Matriz de ocupacion del proyecto.

    Cada celda lleva las horas de la semana y la marca de sobrecarga frente
    a las horas base de la persona. El rango de semanas (from y to) acota el
    eje: sin rango, el informe sale con las semanas que tienen actividad.
    Con skill_id salen unicamente las personas que tienen esa competencia.
    """
    report = await load_project_capacity(
        session,
        project_id,
        weeks=week_range_or_422(from_week, to_week),
        skill_id=skill_id,
        min_level=min_level,
    )
    return report.to_dict()
