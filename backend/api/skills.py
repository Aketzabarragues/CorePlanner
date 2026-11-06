"""Endpoints del catalogo de competencias."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from ..schemas import SkillCreate, SkillOut
from ..security import SessionDep, require_manager
from ..services.people import create_skill, list_skills

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=list[SkillOut])
async def list_skill_catalog(session: SessionDep) -> list[SkillOut]:
    """Catalogo de competencias de la empresa."""
    rows = await list_skills(session)
    return [SkillOut(id=row.id, name=row.name) for row in rows]


@router.post("", response_model=SkillOut, status_code=status.HTTP_201_CREATED)
async def add_skill(
    payload: SkillCreate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> SkillOut:
    """Anade una competencia al catalogo."""
    row = await create_skill(session, payload.name)
    return SkillOut(id=row.id, name=row.name)
