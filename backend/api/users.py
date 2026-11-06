"""Endpoints de personas: listado, alta y modificacion.

El listado completo de la organizacion y su modificacion son del gerente: son
la configuracion de la empresa.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from ..schemas import PersonCreate, PersonOut, PersonUpdate
from ..security import SessionDep, require_manager
from ..services.configuration import create_person, list_people, update_person

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[PersonOut])
async def list_users(
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> list[PersonOut]:
    """Personas de la organizacion, con su rol de empresa y su departamento."""
    return await list_people(session)


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
async def add_user(
    payload: PersonCreate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> PersonOut:
    """Da de alta una persona."""
    return await create_person(session, payload)


@router.patch("/{user_id}", response_model=PersonOut)
async def edit_user(
    user_id: int,
    payload: PersonUpdate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> PersonOut:
    """Modifica los campos indicados de una persona."""
    return await update_person(session, user_id, payload)
