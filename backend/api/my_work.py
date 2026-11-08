"""Endpoint de la pantalla de Mi trabajo.

Devuelve las tareas propias y la carga por semana de la persona que entra.
Cada quien ve lo suyo, asi que el endpoint no necesita ningun permiso de
proyecto: el alcance lo dan las tareas que ya tiene asignadas.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..schemas import MyWorkOut
from ..security import CurrentUser, SessionDep, list_accessible_projects
from ..services.my_work import load_my_work
from .params import week_range_or_422

router = APIRouter(tags=["my-work"])


@router.get("/my-work", response_model=MyWorkOut)
async def my_work(
    session: SessionDep,
    user: CurrentUser,
    from_week: str | None = Query(
        default=None, alias="from", description="Semana ISO inicial del rango"
    ),
    to_week: str | None = Query(
        default=None, alias="to", description="Semana ISO final del rango"
    ),
) -> MyWorkOut:
    """Tareas propias y carga por semana en el periodo de planificacion.

    Sin rango, el periodo es la ventana por defecto: la semana actual y las
    ocho siguientes.
    """
    projects = await list_accessible_projects(session, user)
    report = await load_my_work(
        session, user, projects, weeks=week_range_or_422(from_week, to_week)
    )
    return MyWorkOut.model_validate(report.to_dict())
