"""Informe del calendario laboral.

Une los dias no laborables con su efecto sobre el trabajo: a quien afectan,
cuantas tareas cruzan ese dia y cuanta capacidad se quitan de cada semana.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Department, NonWorkingDay, NonWorkingDayScope, Task, User
from .capacity import iso_week_key
from .capacity_repository import load_person_capacities
from .people import Scope, list_visible_users
from .schedule import capacity_units_for_week, week_start
from .units import from_units


@dataclass(frozen=True, slots=True)
class LaborDay:
    """Dia no laborable con su alcance y las tareas a las que afecta."""

    id: int
    date: date
    name: str
    scope: str
    department_id: int | None
    department_name: str | None
    user_id: int | None
    user_name: str | None
    half_day: bool
    affected_task_count: int


@dataclass(frozen=True, slots=True)
class CapacityImpact:
    """Efecto de los dias no laborables en la capacidad de una semana."""

    user_id: int
    user_name: str
    week: str
    capacity_without: Decimal
    capacity_effective: Decimal
    difference: Decimal
    reasons: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class LaborCalendar:
    """Calendario laboral de un rango de fechas."""

    days: tuple[LaborDay, ...]
    impact: tuple[CapacityImpact, ...]


def day_applies_to(day: NonWorkingDay, user: User) -> bool:
    """True si el dia no laborable le aplica a esa persona.

    Los de alcance global le aplican a todo el mundo, los de departamento solo
    a quien pertenece a ese departamento y los de persona solo a esa persona.
    """
    if day.scope == NonWorkingDayScope.GLOBAL.value:
        return True
    if day.scope == NonWorkingDayScope.PERSON.value:
        return day.user_id == user.id
    return user.department_id is not None and day.department_id == user.department_id


def weeks_in_range(from_date: date, to_date: date) -> list[str]:
    """Claves ISO de las semanas que tocan el rango."""
    weeks: list[str] = []
    current = week_start(from_date)
    last = week_start(to_date)
    while current <= last:
        weeks.append(iso_week_key(current))
        current += timedelta(days=7)
    return weeks


def week_bounds(week: str) -> tuple[date, date]:
    """Lunes y domingo de la semana con esa clave."""
    monday = date.fromisocalendar(int(week[:4]), int(week[6:]), 1)
    return monday, monday + timedelta(days=6)


async def build_labor_calendar(
    session: AsyncSession,
    scope: Scope,
    from_date: date,
    to_date: date,
) -> LaborCalendar:
    """Calendario laboral del rango: dias no laborables y su impacto."""
    users = await list_visible_users(session, scope)
    days = list(
        (
            await session.execute(
                select(NonWorkingDay)
                .where(NonWorkingDay.date >= from_date, NonWorkingDay.date <= to_date)
                .order_by(NonWorkingDay.date)
            )
        ).scalars().all()
    )

    departments = {
        row.id: row.name
        for row in (await session.execute(select(Department))).scalars().all()
    }
    names = {user.id: user.name for user in users}

    tasks = list(
        (
            await session.execute(
                select(Task).where(
                    Task.assigned_to.is_not(None),
                    Task.start_date.is_not(None),
                    Task.end_date.is_not(None),
                    Task.start_date <= to_date,
                    Task.end_date >= from_date,
                )
            )
        ).scalars().all()
    )

    labor_days = []
    for day in days:
        afectados = {user.id for user in users if day_applies_to(day, user)}
        count = sum(
            1
            for task in tasks
            if task.assigned_to in afectados
            and task.start_date is not None
            and task.end_date is not None
            and task.start_date <= day.date <= task.end_date
        )
        labor_days.append(
            LaborDay(
                id=day.id,
                date=day.date,
                name=day.name,
                scope=day.scope,
                department_id=day.department_id,
                department_name=(
                    departments.get(day.department_id) if day.department_id else None
                ),
                user_id=day.user_id,
                user_name=names.get(day.user_id) if day.user_id else None,
                half_day=day.half_day,
                affected_task_count=count,
            )
        )

    impact = await _capacity_impact(session, users, days, weeks_in_range(from_date, to_date))

    return LaborCalendar(days=tuple(labor_days), impact=impact)


async def _capacity_impact(
    session: AsyncSession,
    users: list[User],
    days: list[NonWorkingDay],
    weeks: list[str],
) -> tuple[CapacityImpact, ...]:
    """Filas de persona y semana en las que los dias no laborables quitan horas."""
    people = await load_person_capacities(session, users)
    rows: list[CapacityImpact] = []
    for person in people:
        user = next((item for item in users if item.id == person.user_id), None)
        if user is None:
            continue
        propios = {
            day.date: day
            for day in days
            if day_applies_to(day, user)
        }
        for week in weeks:
            monday, sunday = week_bounds(week)
            reasons = tuple(
                day.name if not day.half_day else f"{day.name} (media jornada)"
                for day in sorted(propios.values(), key=lambda item: item.date)
                if monday <= day.date <= sunday
            )
            without = capacity_units_for_week(
                person.schedules, person.weekly_base_hours, week, {}
            )
            if without is None:
                continue
            effective = capacity_units_for_week(
                person.schedules, person.weekly_base_hours, week, person.holidays
            )
            if effective is None:
                effective = 0
            difference = without - effective
            if difference <= 0:
                continue
            rows.append(
                CapacityImpact(
                    user_id=person.user_id,
                    user_name=person.name,
                    week=week,
                    capacity_without=from_units(without),
                    capacity_effective=from_units(effective),
                    difference=from_units(difference),
                    reasons=reasons,
                )
            )
    rows.sort(key=lambda row: (row.user_name, row.week))
    return tuple(rows)
