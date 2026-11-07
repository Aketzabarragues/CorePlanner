"""Endpoint del calendario laboral.

Une los dias no laborables del rango con su efecto sobre el trabajo: a quien
afectan, cuantas tareas cruzan cada dia y cuanta capacidad se quitan de cada
semana.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from ..schemas import CapacityImpactOut, LaborCalendarOut, LaborDayOut
from ..security import CurrentUser, SessionDep
from ..services.calendar_report import build_labor_calendar
from ..services.scope import resolve_scope

router = APIRouter(prefix="/work-calendar", tags=["calendar"])


@router.get("", response_model=LaborCalendarOut)
async def get_work_calendar(
    session: SessionDep,
    user: CurrentUser,
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
) -> LaborCalendarOut:
    """Dias no laborables del rango y su impacto en la capacidad semanal."""
    scope = await resolve_scope(session, user)
    report = await build_labor_calendar(
        session,
        scope,
        from_date or date.today(),
        to_date or date.today(),
    )
    return LaborCalendarOut(
        days=[
            LaborDayOut(
                id=day.id,
                date=day.date,
                name=day.name,
                scope=day.scope,
                department_id=day.department_id,
                department_name=day.department_name,
                user_id=day.user_id,
                user_name=day.user_name,
                half_day=day.half_day,
                affected_task_count=day.affected_task_count,
            )
            for day in report.days
        ],
        impact=[
            CapacityImpactOut(
                user_id=row.user_id,
                user_name=row.user_name,
                week=row.week,
                capacity_without=row.capacity_without,
                capacity_effective=row.capacity_effective,
                difference=row.difference,
                reasons=list(row.reasons),
            )
            for row in report.impact
        ],
    )
