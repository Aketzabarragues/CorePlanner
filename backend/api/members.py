"""Endpoints de miembros del proyecto."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select

from ..models import ProjectMember, Role, User
from ..schemas import MemberOut
from ..security import SessionDep, require_project_permission

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
