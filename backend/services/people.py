"""Personas de la organizacion: directorio, perfiles, horarios y competencias.

La persona es mas que un usuario: tiene puesto, nivel, tipo de contrato,
horario versionado y competencias. Este modulo reune esas piezas y decide quien
ve que:

- El gerente ve todas las personas, con su carga.
- El jefe de departamento ve las de su departamento, con su carga.
- El tecnico ve las de su departamento, pero no su carga.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CompanyRole, Department, PersonSkill, Skill, User, WorkingSchedule
from .capacity_repository import load_person_capacities, load_week_hours
from .schedule import (
    capacity_units_for_week,
    schedule_in_force,
    schedule_version,
    week_start_from_key,
)
from .scope import Scope

DAY_FIELDS = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)
"""Columnas del horario, de lunes a domingo."""


@dataclass(frozen=True)
class PersonSkillView:
    """Competencia de una persona, con su nivel."""

    skill_id: int
    name: str
    level: int


@dataclass(frozen=True)
class PersonView:
    """Persona del directorio, con su horario vigente y su carga."""

    user: User
    department_name: str | None
    schedule: WorkingSchedule | None
    skills: tuple[PersonSkillView, ...]
    capacity_units: int | None
    hours_units: int


def sees_load(scope: Scope) -> bool:
    """El tecnico ve el directorio de su departamento, pero no su carga."""
    return scope.all_projects or scope.company_role == CompanyRole.JEFE_DEPARTAMENTO.value


def schedule_days(row: WorkingSchedule) -> tuple[int, ...]:
    """Centimas de hora de cada dia del horario, de lunes a domingo."""
    return tuple(getattr(row, field) for field in DAY_FIELDS)


async def list_visible_users(session: AsyncSession, scope: Scope) -> list[User]:
    """Personas que puede ver quien entra.

    El gerente ve todas; el jefe de departamento y el tecnico, las de su
    departamento.
    """
    if scope.all_projects:
        result = await session.execute(select(User))
    elif scope.department_id is not None:
        result = await session.execute(
            select(User).where(User.department_id == scope.department_id)
        )
    else:
        return []
    users = result.scalars().all()
    return sorted(users, key=lambda user: (user.name.lower(), user.id))


async def _department_names(
    session: AsyncSession, users: list[User]
) -> dict[int | None, str]:
    """Nombre del departamento de cada persona."""
    ids = {user.department_id for user in users if user.department_id is not None}
    if not ids:
        return {}
    rows = (
        await session.execute(select(Department).where(Department.id.in_(ids)))
    ).scalars().all()
    return {row.id: row.name for row in rows}


async def _schedules_by_user(
    session: AsyncSession, user_ids: list[int]
) -> dict[int, list[WorkingSchedule]]:
    """Historial de horarios de cada persona, del mas antiguo al mas reciente."""
    if not user_ids:
        return {}
    rows = (
        await session.execute(
            select(WorkingSchedule)
            .where(WorkingSchedule.user_id.in_(user_ids))
            .order_by(WorkingSchedule.valid_from)
        )
    ).scalars().all()
    result: dict[int, list[WorkingSchedule]] = {}
    for row in rows:
        result.setdefault(row.user_id, []).append(row)
    return result


async def _skills_by_user(
    session: AsyncSession, user_ids: list[int]
) -> dict[int, list[PersonSkillView]]:
    """Competencias de cada persona, con su nivel."""
    if not user_ids:
        return {}
    rows = (
        await session.execute(
            select(PersonSkill, Skill)
            .join(Skill, Skill.id == PersonSkill.skill_id)
            .where(PersonSkill.user_id.in_(user_ids))
            .order_by(Skill.name)
        )
    ).all()
    result: dict[int, list[PersonSkillView]] = {}
    for link, skill in rows:
        result.setdefault(link.user_id, []).append(
            PersonSkillView(skill_id=skill.id, name=skill.name, level=link.level)
        )
    return result


async def load_people_views(
    session: AsyncSession,
    users: list[User],
    week: str,
    *,
    include_load: bool = True,
) -> list[PersonView]:
    """Vista de directorio de cada persona en la semana indicada."""
    if not users:
        return []

    user_ids = [user.id for user in users]
    department_names = await _department_names(session, users)
    schedules = await _schedules_by_user(session, user_ids)
    skills = await _skills_by_user(session, user_ids)
    people = await load_person_capacities(session, users)
    hours = (
        await load_week_hours(session, user_ids, week) if include_load else {}
    )
    capacities = {person.user_id: person for person in people}

    monday = week_start_from_key(week)
    views: list[PersonView] = []
    for user in users:
        profile = capacities[user.id]
        rows = schedules.get(user.id, [])
        version = schedule_in_force(
            [
                schedule_version(row.valid_from, schedule_days(row), row.availability_factor)
                for row in rows
            ],
            monday,
        )
        current = next(
            (row for row in rows if version and row.valid_from == version.valid_from),
            None,
        )
        views.append(
            PersonView(
                user=user,
                department_name=department_names.get(user.department_id),
                schedule=current,
                skills=tuple(skills.get(user.id, [])),
                capacity_units=capacity_units_for_week(
                    profile.schedules,
                    profile.weekly_base_hours,
                    week,
                    profile.holidays,
                ),
                hours_units=hours.get(user.id, 0),
            )
        )
    return views


async def get_schedule_history(
    session: AsyncSession, user_id: int
) -> list[WorkingSchedule]:
    """Historial completo de horarios de una persona, del mas antiguo al mas reciente."""
    rows = (
        await session.execute(
            select(WorkingSchedule)
            .where(WorkingSchedule.user_id == user_id)
            .order_by(WorkingSchedule.valid_from)
        )
    ).scalars().all()
    return list(rows)


async def person_or_404(session: AsyncSession, user_id: int) -> User:
    """Persona por su identificador, o error si no existe."""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Persona no encontrada"
        )
    return user


async def create_schedule(
    session: AsyncSession,
    user_id: int,
    *,
    valid_from: date,
    days: list[int],
    availability_factor: int,
    note: str | None,
) -> WorkingSchedule:
    """Anade una version de horario a una persona.

    Cada version entra en vigor en su fecha y las anteriores se conservan: el
    historial dice como ha cambiado la capacidad con el tiempo.
    """
    await person_or_404(session, user_id)

    existing = (
        await session.execute(
            select(WorkingSchedule).where(
                WorkingSchedule.user_id == user_id,
                WorkingSchedule.valid_from == valid_from,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esa persona ya tiene un horario con esa fecha de entrada en vigor",
        )

    row = WorkingSchedule(
        user_id=user_id,
        valid_from=valid_from,
        availability_factor=availability_factor,
        note=note,
        **dict(zip(DAY_FIELDS, days, strict=True)),
    )
    session.add(row)
    await session.commit()
    return row


async def list_person_skills(
    session: AsyncSession, user_id: int
) -> list[PersonSkillView]:
    """Competencias de una persona, con su nivel."""
    found = await _skills_by_user(session, [user_id])
    return found.get(user_id, [])


async def list_skills(session: AsyncSession) -> list[Skill]:
    """Catalogo de competencias de la empresa."""
    rows = (await session.execute(select(Skill).order_by(Skill.name))).scalars().all()
    return list(rows)


async def create_skill(session: AsyncSession, name: str) -> Skill:
    """Anade una competencia al catalogo."""
    existing = (
        await session.execute(select(Skill).where(Skill.name == name))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya hay una competencia con ese nombre",
        )
    skill = Skill(name=name)
    session.add(skill)
    await session.commit()
    return skill


async def set_person_skills(
    session: AsyncSession,
    user_id: int,
    entries: list[tuple[int, int]],
) -> list[PersonSkill]:
    """Fija las competencias de una persona y sus niveles.

    Las que no aparecen en la lista se quitan: el conjunto es el que hay.
    """
    await person_or_404(session, user_id)

    wanted_ids = {skill_id for skill_id, _ in entries}
    if wanted_ids:
        known = (
            await session.execute(select(Skill.id).where(Skill.id.in_(wanted_ids)))
        ).scalars().all()
        missing = wanted_ids - set(known)
        if missing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Competencia no encontrada: {sorted(missing)}",
            )

    await session.execute(
        delete(PersonSkill).where(PersonSkill.user_id == user_id)
    )
    rows = [
        PersonSkill(user_id=user_id, skill_id=skill_id, level=level)
        for skill_id, level in entries
    ]
    session.add_all(rows)
    await session.commit()
    return rows
