"""Endpoints de miembros del proyecto."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy import select

from ..models import ProjectMember, Role, User
from ..schemas import MemberCreate, MemberOut
from ..security import SessionDep, require_manager, require_project_permission
from ..services.configuration import add_project_member, remove_project_member

router = APIRouter(prefix="/projects", tags=["members"])


@router.get("/{project_id}/members", response_model=list[MemberOut])
async def list_members(
    project_id: int,
    session: SessionDep,
    _project=Depends(require_project_permission("capacity.read")),
) -> list[MemberOut]:
    """Personas asignadas al proyecto, con el rol que ejercen en el."""
    result = await session.execute(
        select(ProjectMember, User, Role)
        .join(User, User.id == ProjectMember.user_id)
        .join(Role, Role.id == ProjectMember.role_id)
        .where(ProjectMember.project_id == project_id)
        .order_by(User.name)
    )

    return [
        MemberOut(
            user_id=member.user_id,
            name=user.name,
            email=user.email,
            role_id=role.id,
            role_name=role.name,
            weekly_base_hours=user.weekly_base_hours,
        )
        for member, user, role in result.all()
    ]


@router.post("/{project_id}/members", status_code=status.HTTP_201_CREATED)
async def add_member(
    project_id: int,
    payload: MemberCreate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> None:
    """Mete a una persona en el proyecto con el rol indicado."""
    await add_project_member(session, project_id, payload.user_id, payload.role_id)


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    project_id: int,
    user_id: int,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> None:
    """Saca a una persona del proyecto."""
    await remove_project_member(session, project_id, user_id)
