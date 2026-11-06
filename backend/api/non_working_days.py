"""Endpoints del calendario laboral: dias no laborables con su alcance."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query, Response, status

from ..schemas import NonWorkingDayCreate, NonWorkingDayOut
from ..security import SessionDep, require_manager
from ..services.work_calendar import (
    create_non_working_day,
    delete_non_working_day,
    department_names,
    list_non_working_days,
)

router = APIRouter(prefix="/non-working-days", tags=["calendar"])


@router.get("", response_model=list[NonWorkingDayOut])
async def list_days(
    session: SessionDep,
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    department_id: int | None = Query(default=None),
) -> list[NonWorkingDayOut]:
    """Dias no laborables del calendario, con su alcance."""
    days = await list_non_working_days(
        session,
        from_date=from_date,
        to_date=to_date,
        department_id=department_id,
    )
    names = await department_names(session)
    return [
        NonWorkingDayOut(
            id=day.id,
            date=day.date,
            name=day.name,
            scope=day.scope,
            department_id=day.department_id,
            department_name=names.get(day.department_id) if day.department_id else None,
            half_day=day.half_day,
        )
        for day in days
    ]


@router.post("", response_model=NonWorkingDayOut, status_code=status.HTTP_201_CREATED)
async def add_day(
    payload: NonWorkingDayCreate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> NonWorkingDayOut:
    """Anade un dia no laborable al calendario."""
    day = await create_non_working_day(
        session,
        date_=payload.date,
        name=payload.name,
        scope=payload.scope,
        department_id=payload.department_id,
        half_day=payload.half_day,
    )
    names = await department_names(session)
    return NonWorkingDayOut(
        id=day.id,
        date=day.date,
        name=day.name,
        scope=day.scope,
        department_id=day.department_id,
        department_name=names.get(day.department_id) if day.department_id else None,
        half_day=day.half_day,
    )


@router.delete("/{day_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_day(
    day_id: int,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> Response:
    """Quita un dia no laborable del calendario."""
    await delete_non_working_day(session, day_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
