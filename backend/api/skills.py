"""Endpoints del catalogo de competencias."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status

from ..schemas import SkillCreate, SkillOut, SkillUpdate
from ..security import SessionDep, require_manager
from ..services.people import (
    create_skill,
    delete_skill,
    list_skills,
    rename_skill,
    skill_usage,
)

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=list[SkillOut])
async def list_skill_catalog(session: SessionDep) -> list[SkillOut]:
    """Catalogo de competencias de la empresa."""
    rows = await list_skills(session)
    usage = await skill_usage(session)
    return [
        SkillOut(id=row.id, name=row.name, person_count=usage.get(row.id, 0))
        for row in rows
    ]


@router.post("", response_model=SkillOut, status_code=status.HTTP_201_CREATED)
async def add_skill(
    payload: SkillCreate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> SkillOut:
    """Anade una competencia al catalogo."""
    row = await create_skill(session, payload.name)
    return SkillOut(id=row.id, name=row.name, person_count=0)


@router.patch("/{skill_id}", response_model=SkillOut)
async def edit_skill(
    skill_id: int,
    payload: SkillUpdate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> SkillOut:
    """Cambia el nombre de una competencia del catalogo."""
    row = await rename_skill(session, skill_id, payload.name)
    usage = await skill_usage(session)
    return SkillOut(id=row.id, name=row.name, person_count=usage.get(row.id, 0))


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_skill(
    skill_id: int,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> Response:
    """Quita una competencia del catalogo.

    No se puede quitar una competencia que alguien tiene asignada.
    """
    await delete_skill(session, skill_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
