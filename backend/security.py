"""Dependencias de autorizacion por proyecto.

Cada proyecto tiene sus propios permisos derivados del rol de cada miembro.
El rol de empresa y el departamento amplian el ambito: el jefe de un
departamento trabaja en los proyectos de su area aunque no sea miembro, y el
gerente accede a todos. El administrador global accede a todos los proyectos.
"""

from __future__ import annotations

from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import get_current_user
from .database import get_db
from .models import CompanyRole, Project, ProjectMember, Role, Task, User
from .services.scope import implicit_permissions, resolve_scope

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


async def check_project_permission(
    session: AsyncSession,
    user: User,
    project_id: int,
    permission: str,
) -> Project:
    """Comprueba el permiso del usuario sobre el proyecto indicado.

    Primero se mira el rol que tiene en ese proyecto y, si no llega, los
    permisos que concede su rol de empresa sobre el.
    """
    project = await get_project_or_404(session, project_id)

    if user.is_global_admin:
        return project

    permissions = await get_user_permissions(session, user.id, project_id)
    if permission in permissions:
        return project

    granted = await implicit_permissions(session, user, project)
    if permission in granted:
        return project

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"No tienes permiso '{permission}' en este proyecto",
    )


def require_manager() -> Callable[..., Coroutine[Any, Any, User]]:
    """Dependencia que exige el rol de gerente.

    El gerente es quien configura la organizacion: personas, departamentos,
    proyectos y miembros. El administrador global tambien pasa, porque es la
    figura tecnica que da de alta a los gerentes.
    """

    async def dependency(user: CurrentUser) -> User:
        if not user.is_global_admin and user.company_role != CompanyRole.GERENTE.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo el gerente puede configurar la organizacion",
            )
        return user

    return dependency


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
        return await check_project_permission(session, user, project_id, permission)

    return dependency


def require_task_permission(
    permission: str,
) -> Callable[..., Coroutine[Any, Any, Task]]:
    """Dependencia para rutas sin project_id, que lo deduce de la tarea.

    Sirve para /api/tasks/{task_id}, donde el proyecto de la tarea es el que
    decide si el usuario puede operar sobre ella.
    """

    async def dependency(
        task_id: int,
        user: CurrentUser,
        session: SessionDep,
    ) -> Task:
        task = await session.get(Task, task_id)
        if task is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada"
            )
        await check_project_permission(session, user, task.project_id, permission)
        return task

    return dependency


async def list_accessible_projects(
    session: AsyncSession, user: User
) -> list[Project]:
    """Proyectos visibles para el usuario.

    El ambito lo da el rol de empresa: el gerente ve todos, el jefe de
    departamento ve los de su area y los de los que es miembro, y el tecnico
    ve los suyos y los que tiene tareas asignadas.
    """
    scope = await resolve_scope(session, user)
    if scope.all_projects:
        result = await session.execute(select(Project).order_by(Project.name))
        return list(result.scalars().all())

    if not scope.project_ids:
        return []

    result = await session.execute(
        select(Project)
        .where(Project.id.in_(scope.project_ids))
        .order_by(Project.name)
    )
    return list(result.scalars().all())
