"""Endpoints de las personas: directorio, horarios y competencias."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from ..models import (
    COMPANY_ROLE_LABELS,
    EMPLOYMENT_TYPE_LABELS,
    SENIORITY_LABELS,
    WorkingSchedule,
)
from ..schemas import (
    PersonProfileOut,
    PersonSkillOut,
    PersonSkillsIn,
    PersonSummaryOut,
    ScheduleCreate,
    ScheduleOut,
    ScheduleUpdate,
)
from ..security import CurrentUser, SessionDep, require_manager
from ..services.people import (
    PersonView,
    create_schedule,
    delete_schedule,
    get_schedule_history,
    list_person_skills,
    list_visible_users,
    load_people_views,
    person_or_404,
    schedule_days,
    sees_load,
    set_person_skills,
    update_schedule,
)
from ..services.schedule import current_week_key, week_start_from_key
from ..services.scope import resolve_scope
from ..services.units import from_units

router = APIRouter(prefix="/people", tags=["people"])


def _week_or_400(week: str | None) -> str:
    """Semana pedida o la semana en curso, comprobando el formato."""
    key = week or current_week_key()
    try:
        week_start_from_key(key)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Semana no válida: {key}",
        ) from error
    return key


def _schedule_out(row: WorkingSchedule | None) -> ScheduleOut | None:
    """Version de horario en el formato de la API."""
    if row is None:
        return None
    days = list(schedule_days(row))
    return ScheduleOut(
        id=row.id,
        valid_from=row.valid_from,
        days=days,
        hours=[from_units(day) for day in days],
        availability_factor=row.availability_factor,
        note=row.note,
    )


def _summary(view: PersonView, week: str, include_load: bool) -> PersonSummaryOut:
    """Persona del directorio en el formato de la API."""
    user = view.user
    overloaded: bool | None = None
    if include_load and view.capacity_units is not None:
        overloaded = view.hours_units > view.capacity_units
    return PersonSummaryOut(
        id=user.id,
        name=user.name,
        email=user.email,
        company_role=user.company_role,
        company_role_label=COMPANY_ROLE_LABELS.get(user.company_role, user.company_role),
        job_title=user.job_title,
        seniority=user.seniority,
        seniority_label=SENIORITY_LABELS.get(user.seniority) if user.seniority else None,
        employment_type=user.employment_type,
        employment_type_label=EMPLOYMENT_TYPE_LABELS.get(
            user.employment_type, user.employment_type
        ),
        department_id=user.department_id,
        department_name=view.department_name,
        weekly_base_hours=user.weekly_base_hours,
        schedule=_schedule_out(view.schedule),
        skills=[
            PersonSkillOut(skill_id=skill.skill_id, name=skill.name, level=skill.level)
            for skill in view.skills
        ],
        capacity=(
            from_units(view.capacity_units) if view.capacity_units is not None else None
        ),
        hours=from_units(view.hours_units) if include_load else None,
        is_overloaded=overloaded,
        week=week,
    )


@router.get("", response_model=list[PersonSummaryOut])
async def list_people(
    session: SessionDep,
    user: CurrentUser,
    week: str | None = Query(default=None, description="Semana ISO, por defecto la en curso"),
) -> list[PersonSummaryOut]:
    """Directorio de personas, con el horario vigente y la carga de la semana."""
    key = _week_or_400(week)
    scope = await resolve_scope(session, user)
    users = await list_visible_users(session, scope)
    views = await load_people_views(session, users, key, include_load=sees_load(scope))
    return [_summary(view, key, sees_load(scope)) for view in views]


@router.get("/{user_id}", response_model=PersonProfileOut)
async def get_person(
    user_id: int,
    session: SessionDep,
    user: CurrentUser,
    week: str | None = Query(default=None, description="Semana ISO, por defecto la en curso"),
) -> PersonProfileOut:
    """Ficha de una persona, con su historial de horarios."""
    key = _week_or_400(week)
    scope = await resolve_scope(session, user)
    users = await list_visible_users(session, scope)
    if not any(item.id == user_id for item in users):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Persona no encontrada",
        )

    person = await person_or_404(session, user_id)
    views = await load_people_views(session, [person], key, include_load=sees_load(scope))
    history = await get_schedule_history(session, user_id)
    summary = _summary(views[0], key, sees_load(scope))
    return PersonProfileOut(
        **summary.model_dump(),
        schedule_history=[
            _schedule_out(row).model_dump() for row in history if row is not None
        ],
    )


@router.post(
    "/{user_id}/schedules",
    response_model=ScheduleOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_schedule(
    user_id: int,
    payload: ScheduleCreate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> ScheduleOut:
    """Anade una version de horario a una persona.

    Las versiones anteriores se conservan: el historial dice como ha cambiado
    la capacidad con el tiempo.
    """
    row = await create_schedule(
        session,
        user_id,
        valid_from=payload.valid_from,
        days=payload.days,
        availability_factor=payload.availability_factor,
        note=payload.note,
    )
    return _schedule_out(row)


@router.patch("/{user_id}/schedules/{schedule_id}", response_model=ScheduleOut)
async def edit_schedule(
    user_id: int,
    schedule_id: int,
    payload: ScheduleUpdate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> ScheduleOut:
    """Corrige una version de horario ya creada."""
    row = await update_schedule(
        session,
        user_id,
        schedule_id,
        days=payload.days,
        availability_factor=payload.availability_factor,
        note=payload.note,
    )
    return _schedule_out(row)


@router.delete(
    "/{user_id}/schedules/{schedule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_schedule(
    user_id: int,
    schedule_id: int,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> Response:
    """Quita una version de horario de una persona."""
    await delete_schedule(session, user_id, schedule_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{user_id}/skills", response_model=list[PersonSkillOut])
async def edit_skills(
    user_id: int,
    payload: PersonSkillsIn,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> list[PersonSkillOut]:
    """Fija las competencias de una persona y sus niveles."""
    await set_person_skills(
        session, user_id, [(item.skill_id, item.level) for item in payload.skills]
    )
    skills = await list_person_skills(session, user_id)
    return [
        PersonSkillOut(skill_id=skill.skill_id, name=skill.name, level=skill.level)
        for skill in skills
    ]
