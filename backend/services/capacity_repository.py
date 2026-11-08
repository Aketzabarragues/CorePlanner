"""Consulta de la matriz de capacidad desde la base de datos.

Mantiene separado el calculo puro (backend/services/capacity.py) del acceso
a datos, de modo que el motor se pueda probar sin base de datos.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    NonWorkingDay,
    NonWorkingDayScope,
    PersonSkill,
    ProjectMember,
    Task,
    User,
    WorkingSchedule,
)
from .capacity import (
    CapacityReport,
    Holiday,
    PersonCapacity,
    build_capacity_report,
    compute_task_week_units,
)
from .schedule import (
    ScheduleVersion,
    holiday_weight,
    merge_holidays,
    schedule_version,
    week_start_from_key,
)


async def load_holidays(
    session: AsyncSession,
) -> tuple[dict[tuple[str, int | None], dict[date, int]], list[Holiday]]:
    """Dias no laborables por alcance, y los globales con su nombre.

    La clave del mapa es el alcance y su destinatario: ("global", None) para
    todos, ("department", id) para un departamento y ("person", id) para una
    persona. El valor es el peso del dia en medios dias.
    La lista son los dias de alcance global con su nombre: son los unicos que
    se pueden marcar en la cabecera de una semana.
    """
    days = (await session.execute(select(NonWorkingDay))).scalars().all()
    weights: dict[tuple[str, int | None], dict[date, int]] = {}
    global_days: list[Holiday] = []
    for day in days:
        if day.scope == NonWorkingDayScope.GLOBAL.value:
            key = (NonWorkingDayScope.GLOBAL.value, None)
        elif day.scope == NonWorkingDayScope.PERSON.value:
            key = (NonWorkingDayScope.PERSON.value, day.user_id)
        else:
            key = (NonWorkingDayScope.DEPARTMENT.value, day.department_id)
        weights.setdefault(key, {})[day.date] = holiday_weight(day.half_day)
        if day.scope == NonWorkingDayScope.GLOBAL.value:
            global_days.append(
                Holiday(
                    date=day.date,
                    name=day.name,
                    scope=day.scope,
                    half_day=day.half_day,
                )
            )
    return weights, global_days


async def load_person_capacities(
    session: AsyncSession,
    users: Sequence[User],
    project_ids_by_user: Mapping[int, Sequence[int]] | None = None,
    holidays_by_scope: Mapping[tuple[str, int | None], Mapping[date, int]] | None = None,
) -> list[PersonCapacity]:
    """Perfil de capacidad de cada persona.

    Reune el horario versionado de cada una y los dias no laborables que le
    aplican: los de alcance global, los del departamento al que pertenece y
    los que son solo suyos. Con project_ids_by_user se anaden los proyectos de
    los que es miembro, para que el frontend no los tenga que pedir aparte.
    Con holidays_by_scope se reutilizan los dias ya leidos.
    """
    if not users:
        return []

    schedules = (
        await session.execute(
            select(WorkingSchedule).where(
                WorkingSchedule.user_id.in_([user.id for user in users])
            )
        )
    ).scalars().all()

    if holidays_by_scope is None:
        holidays_by_scope, _ = await load_holidays(session)

    versions: dict[int, list[ScheduleVersion]] = {}
    for row in schedules:
        versions.setdefault(row.user_id, []).append(
            schedule_version(
                valid_from=row.valid_from,
                days=(
                    row.monday,
                    row.tuesday,
                    row.wednesday,
                    row.thursday,
                    row.friday,
                    row.saturday,
                    row.sunday,
                ),
                availability_factor=row.availability_factor,
            )
        )

    people: list[PersonCapacity] = []
    for user in users:
        holidays = merge_holidays(
            holidays_by_scope.get((NonWorkingDayScope.GLOBAL.value, None), {}),
            holidays_by_scope.get(
                (NonWorkingDayScope.DEPARTMENT.value, user.department_id), {}
            )
            if user.department_id is not None
            else {},
        )
        holidays = merge_holidays(
            holidays,
            holidays_by_scope.get((NonWorkingDayScope.PERSON.value, user.id), {}),
        )
        people.append(
            PersonCapacity(
                user_id=user.id,
                name=user.name,
                weekly_base_hours=user.weekly_base_hours,
                schedules=tuple(
                    sorted(versions.get(user.id, []), key=lambda item: item.valid_from)
                ),
                holidays=holidays,
                department_id=user.department_id,
                job_title=user.job_title,
                project_ids=tuple(
                    sorted(project_ids_by_user.get(user.id, ())) if project_ids_by_user else ()
                ),
            )
        )
    return people


async def load_week_hours(
    session: AsyncSession,
    user_ids: Sequence[int],
    week: str,
) -> dict[int, int]:
    """Horas planificadas de cada persona en una semana, en centimas.

    Solo entran las tareas cuyo rango toca la semana.
    """
    ids = [int(user_id) for user_id in user_ids]
    if not ids:
        return {}

    monday = week_start_from_key(week)
    sunday = monday + timedelta(days=6)

    tasks = (
        await session.execute(
            select(Task).where(
                Task.assigned_to.in_(ids),
                Task.start_date.is_not(None),
                Task.end_date.is_not(None),
                Task.start_date <= sunday,
                Task.end_date >= monday,
            )
        )
    ).scalars().all()

    users = (
        await session.execute(select(User).where(User.id.in_(ids)))
    ).scalars().all()
    people = await load_person_capacities(session, users)
    by_id = {person.user_id: person for person in people}

    totals: dict[int, int] = {}
    for task in tasks:
        person = by_id.get(task.assigned_to)
        holidays = person.holidays if person is not None else {}
        units = compute_task_week_units(
            task.start_date, task.end_date, task.estimated_hours, holidays
        )
        totals[task.assigned_to] = totals.get(task.assigned_to, 0) + units.get(week, 0)
    return totals


async def load_users_with_skill(
    session: AsyncSession,
    skill_id: int,
    min_level: int,
) -> set[int]:
    """Personas que tienen la competencia con ese nivel o mas."""
    rows = (
        await session.execute(
            select(PersonSkill.user_id).where(
                PersonSkill.skill_id == skill_id,
                PersonSkill.level >= min_level,
            )
        )
    ).scalars().all()
    return set(rows)


async def load_capacity_for_projects(
    session: AsyncSession,
    project_ids: Sequence[int],
    *,
    include_unassigned: bool = True,
    weeks: Sequence[str] | None = None,
    skill_id: int | None = None,
    min_level: int | None = None,
) -> CapacityReport:
    """Matriz de ocupacion de un conjunto de proyectos.

    Se incluyen las personas que son miembros de alguno de los proyectos, con
    filas a cero si no tienen tareas. Con include_unassigned se incorporan
    ademas las personas que tienen tareas en ellos aunque no sean miembros.
    Las horas de cada persona se suman entre proyectos.
    Con weeks el eje es esa lista de semanas, completa aunque no haya
    actividad. Con skill_id solo salen las personas que tienen esa competencia
    con ese nivel o mas.
    """
    ids = {int(project_id) for project_id in project_ids}
    if not ids:
        return build_capacity_report([], [], weeks=weeks)

    memberships = (
        await session.execute(
            select(ProjectMember.user_id, ProjectMember.project_id).where(
                ProjectMember.project_id.in_(ids)
            )
        )
    ).all()
    members = {user_id for user_id, _ in memberships}

    projects_by_user: dict[int, list[int]] = {}
    for user_id, project_id in memberships:
        projects_by_user.setdefault(user_id, []).append(project_id)

    tasks = (
        await session.execute(select(Task).where(Task.project_id.in_(ids)))
    ).scalars().all()

    assignee_ids = {task.assigned_to for task in tasks if task.assigned_to is not None}
    wanted_ids = set(members) | (assignee_ids if include_unassigned else set())

    if skill_id is not None:
        skilled = await load_users_with_skill(session, skill_id, min_level or 1)
        wanted_ids &= skilled

    users = (
        await session.execute(select(User).where(User.id.in_(wanted_ids)))
    ).scalars().all()

    ordered = sorted(users, key=lambda user: (user.name.lower(), user.id))
    holidays_by_scope, global_days = await load_holidays(session)
    people = await load_person_capacities(
        session, ordered, projects_by_user, holidays_by_scope
    )
    return build_capacity_report(people, tasks, weeks=weeks, holidays=global_days)


async def load_project_capacity(
    session: AsyncSession,
    project_id: int,
    *,
    include_unassigned: bool = True,
    weeks: Sequence[str] | None = None,
    skill_id: int | None = None,
    min_level: int | None = None,
) -> CapacityReport:
    """Matriz de ocupacion de las personas asignadas a un proyecto."""
    return await load_capacity_for_projects(
        session,
        [project_id],
        include_unassigned=include_unassigned,
        weeks=weeks,
        skill_id=skill_id,
        min_level=min_level,
    )
