"""Dependencias de autorizacion por proyecto.

Cada proyecto tiene sus propios permisos derivados del rol de cada miembro.
Un administrador global accede a todos los proyectos.
"""

from __future__ import annotations

from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import get_current_user
from .database import get_db
from .models import Project, ProjectMember, Role, User

SessionDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_project_or_404(session: AsyncSession, project_id: int) -> Project:
    """Carga el proyecto o responde 404."""
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado"
        )
    return project


async def get_user_permissions(
    session: AsyncSession, user_id: int, project_id: int
) -> list[str]:
    """Permisos del usuario en el proyecto, o lista vacia si no es miembro."""
    result = await session.execute(
        select(Role.permissions_json)
        .join(ProjectMember, ProjectMember.role_id == Role.id)
        .where(
            ProjectMember.user_id == user_id,
            ProjectMember.project_id == project_id,
        )
    )
    permissions = result.scalar_one_or_none()
    return list(permissions or [])


def require_project_permission(
    permission: str,
) -> Callable[..., Coroutine[Any, Any, Project]]:
    """Dependencia que exige un permiso concreto sobre el proyecto de la ruta.

    El administrador global pasa siempre. El resto necesita ser miembro del
    proyecto y que su rol incluya el permiso.
    """

    async def dependency(
        project_id: int,
        user: CurrentUser,
        session: SessionDep,
    ) -> Project:
        project = await get_project_or_404(session, project_id)

        if user.is_global_admin:
            return project

        permissions = await get_user_permissions(session, user.id, project_id)
        if permission not in permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No tienes permiso '{permission}' en este proyecto",
            )
        return project

    return dependency


async def list_accessible_projects(
    session: AsyncSession, user: User
) -> list[Project]:
    """Proyectos visibles para el usuario.

    El administrador global los ve todos; el resto, solo los suyos.
    """
    if user.is_global_admin:
        result = await session.execute(select(Project).order_by(Project.name))
        return list(result.scalars().all())

    result = await session.execute(
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user.id)
        .order_by(Project.name)
    )
    return list(result.scalars().all())
