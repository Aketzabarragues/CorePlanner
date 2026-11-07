"""Dias no laborables del calendario laboral.

Un dia no laborable tiene alcance: global, que se aplica a todo el mundo, de
departamento, que se aplica solo a quien pertenece a ese departamento, o de
persona, que se aplica solo a esa persona.
"""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Department, NonWorkingDay, NonWorkingDayScope, User


async def list_non_working_days(
    session: AsyncSession,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    department_id: int | None = None,
) -> list[NonWorkingDay]:
    """Dias no laborables, ordenados por fecha."""
    stmt = select(NonWorkingDay).order_by(NonWorkingDay.date, NonWorkingDay.id)
    if from_date is not None:
        stmt = stmt.where(NonWorkingDay.date >= from_date)
    if to_date is not None:
        stmt = stmt.where(NonWorkingDay.date <= to_date)
    if department_id is not None:
        stmt = stmt.where(
            (NonWorkingDay.scope == NonWorkingDayScope.GLOBAL.value)
            | (NonWorkingDay.department_id == department_id)
        )
    rows = (await session.execute(stmt)).scalars().all()
    return list(rows)


async def department_names(session: AsyncSession) -> dict[int, str]:
    """Nombre de cada departamento, para labelling de los dias con alcance."""
    rows = (await session.execute(select(Department))).scalars().all()
    return {row.id: row.name for row in rows}


async def person_names(session: AsyncSession) -> dict[int, str]:
    """Nombre de cada persona, para labelling de los dias de alcance individual."""
    rows = (await session.execute(select(User))).scalars().all()
    return {row.id: row.name for row in rows}


async def create_non_working_day(
    session: AsyncSession,
    *,
    date_: date,
    name: str,
    scope: str,
    department_id: int | None,
    user_id: int | None,
    half_day: bool,
) -> NonWorkingDay:
    """Anade un dia no laborable al calendario."""
    if scope == NonWorkingDayScope.DEPARTMENT.value:
        department = await session.get(Department, department_id)
        if department is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Departamento no encontrado",
            )
    if scope == NonWorkingDayScope.PERSON.value:
        person = await session.get(User, user_id)
        if person is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Persona no encontrada",
            )

    existing = (
        await session.execute(
            select(NonWorkingDay).where(
                NonWorkingDay.date == date_,
                NonWorkingDay.scope == scope,
                NonWorkingDay.department_id.is_(None)
                if department_id is None
                else NonWorkingDay.department_id == department_id,
                NonWorkingDay.user_id.is_(None)
                if user_id is None
                else NonWorkingDay.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya hay un dia no laborable con esa fecha y ese alcance",
        )

    day = NonWorkingDay(
        date=date_,
        name=name,
        scope=scope,
        department_id=department_id,
        user_id=user_id,
        half_day=half_day,
    )
    session.add(day)
    await session.commit()
    return day


async def delete_non_working_day(session: AsyncSession, day_id: int) -> None:
    """Quita un dia no laborable del calendario."""
    day = await session.get(NonWorkingDay, day_id)
    if day is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dia no laborable no encontrado",
        )
    await session.delete(day)
    await session.commit()
