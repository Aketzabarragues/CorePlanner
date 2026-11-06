"""Endpoint de la pantalla de Mi trabajo.

Devuelve las tareas propias y la carga por semana de la persona que entra.
Cada quien ve lo suyo, asi que el endpoint no necesita ningun permiso de
proyecto: el alcance lo dan las tareas que ya tiene asignadas.
"""

from __future__ import annotations

from fastapi import APIRouter

from ..schemas import MyWorkOut
from ..security import CurrentUser, SessionDep, list_accessible_projects
from ..services.my_work import load_my_work

router = APIRouter(tags=["my-work"])


@router.get("/my-work", response_model=MyWorkOut)
async def my_work(session: SessionDep, user: CurrentUser) -> MyWorkOut:
    """Tareas propias y carga por semana en el periodo de planificacion."""
    projects = await list_accessible_projects(session, user)
    report = await load_my_work(session, user, projects)
    return MyWorkOut.model_validate(report.to_dict())
