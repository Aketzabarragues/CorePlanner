"""Endpoints de la vista global: capacidad y Gantt de toda la organizacion.

La vista global no pertenece a ningun proyecto: reúne las tareas de todos
los proyectos a los que tiene acceso la persona que entra.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..models import Project
from ..schemas import GanttOut, PanelOut
from ..security import CurrentUser, SessionDep, list_accessible_projects
from ..services.capacity_repository import load_capacity_for_projects
from ..services.gantt_repository import load_gantt_for_projects
from ..services.panel import load_panel

router = APIRouter(tags=["overview"])


def _by_department(
    projects: list[Project], department_id: int | None
) -> list[Project]:
    """Filtra los proyectos por su departamento gestor."""
    if department_id is None:
        return projects
    return [
        project for project in projects if project.department_id == department_id
    ]


@router.get("/capacity")
async def global_capacity(
    session: SessionDep,
    user: CurrentUser,
    department_id: int | None = Query(
        default=None, description="Filtra por el departamento gestor del proyecto"
    ),
) -> dict:
    """Matriz de ocupacion de todos los proyectos visibles.

    Las horas de cada persona se suman entre proyectos. Con department_id se
    limita a los proyectos que gestiona ese departamento.
    """
    projects = await list_accessible_projects(session, user)
    selected = _by_department(projects, department_id)
    report = await load_capacity_for_projects(
        session, [project.id for project in selected]
    )
    return report.to_dict()


@router.get("/panel", response_model=PanelOut)
async def global_panel(session: SessionDep, user: CurrentUser) -> PanelOut:
    """Resumen de la organizacion: utilizacion, sobrecargas, proyectos y tareas.

    Todo sale de la matriz de capacidad y del listado de tareas de los
    proyectos visibles, de modo que el panel no puede discrepar de la matriz.
    """
    projects = await list_accessible_projects(session, user)
    panel = await load_panel(session, projects)
    return PanelOut.model_validate(panel.to_dict())


@router.get("/gantt", response_model=GanttOut)
async def global_gantt(session: SessionDep, user: CurrentUser) -> GanttOut:
    """Diagrama de Gantt con las barras de todos los proyectos visibles.

    Cada barra lleva el proyecto al que pertenece, de modo que el frontend
    puede agruparlas.
    """
    projects = await list_accessible_projects(session, user)
    feed = await load_gantt_for_projects(session, projects)
    return GanttOut.model_validate(feed.to_dict())
