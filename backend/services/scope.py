"""Ambito de acceso: que proyectos ve cada persona y hasta donde puede editar.

El rol de empresa y el departamento abren la puerta a los proyectos. Lo que se
puede hacer dentro de cada uno lo dice el rol de proyecto. Son dos ejes
separados:

- gerente: ve todos los proyectos y puede trabajar en todos.
- jefe de departamento: ve los proyectos que gestiona su departamento y los de
  los que es miembro, y puede trabajar en los de su area aunque no sea
  miembro.
- tecnico: ve los proyectos de los que es miembro y los que tiene tareas
  asignadas. En estos ultimos puede consultar, pero no escribir.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CompanyRole, Project, ProjectMember, Task, User

MANAGER_PERMISSIONS = frozenset(
    {"capacity.read", "gantt.read", "task.write", "member.manage"}
)
"""Permisos que concede dirigir el area de la persona."""

READER_PERMISSIONS = frozenset({"capacity.read", "gantt.read"})
"""Permisos que concede participar en un proyecto con una tarea."""


@dataclass(frozen=True)
class Scope:
    """Ambito resuelto de una persona."""

    user_id: int
    company_role: str
    department_id: int | None
    all_projects: bool
    project_ids: frozenset[int]
    member_project_ids: frozenset[int]
    managed_project_ids: frozenset[int]

    def sees(self, project_id: int) -> bool:
        """Indica si el proyecto entra en el ambito de la persona."""
        return self.all_projects or project_id in self.project_ids

    def manages(self, project_id: int) -> bool:
        """Indica si la persona dirige el proyecto."""
        return self.all_projects or project_id in self.managed_project_ids


async def _member_project_ids(session: AsyncSession, user_id: int) -> frozenset[int]:
    result = await session.execute(
        select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
    )
    return frozenset(row[0] for row in result.all())


async def _assigned_project_ids(session: AsyncSession, user_id: int) -> frozenset[int]:
    result = await session.execute(
        select(Task.project_id).where(Task.assigned_to == user_id).distinct()
    )
    return frozenset(row[0] for row in result.all())


async def resolve_scope(session: AsyncSession, user: User) -> Scope:
    """Resuelve el ambito de la persona a partir de su rol y sus vinculos."""
    member_ids = await _member_project_ids(session, user.id)
    is_manager = user.is_global_admin or user.company_role == CompanyRole.GERENTE.value

    if is_manager:
        result = await session.execute(select(Project.id))
        all_ids = frozenset(row[0] for row in result.all())
        return Scope(
            user_id=user.id,
            company_role=user.company_role,
            department_id=user.department_id,
            all_projects=True,
            project_ids=all_ids,
            member_project_ids=member_ids,
            managed_project_ids=frozenset(),
        )

    managed_ids: frozenset[int] = frozenset()
    if user.company_role == CompanyRole.JEFE_DEPARTAMENTO.value and user.department_id:
        result = await session.execute(
            select(Project.id).where(Project.department_id == user.department_id)
        )
        managed_ids = frozenset(row[0] for row in result.all())

    assigned_ids = await _assigned_project_ids(session, user.id)

    return Scope(
        user_id=user.id,
        company_role=user.company_role,
        department_id=user.department_id,
        all_projects=False,
        project_ids=member_ids | managed_ids | assigned_ids,
        member_project_ids=member_ids,
        managed_project_ids=managed_ids,
    )


async def implicit_permissions(
    session: AsyncSession, user: User, project: Project
) -> frozenset[str]:
    """Permisos que concede el rol de empresa sobre un proyecto concreto.

    Se anaden a los del rol de proyecto: el rol de empresa no sustituye al
    rol dentro del proyecto, lo completa cuando la persona dirige un area.
    """
    if user.is_global_admin or user.company_role == CompanyRole.GERENTE.value:
        return MANAGER_PERMISSIONS

    if (
        user.company_role == CompanyRole.JEFE_DEPARTAMENTO.value
        and user.department_id is not None
        and project.department_id == user.department_id
    ):
        return MANAGER_PERMISSIONS

    participates = await session.execute(
        select(Task.id)
        .where(Task.project_id == project.id, Task.assigned_to == user.id)
        .limit(1)
    )
    if participates.first() is not None:
        return READER_PERMISSIONS

    return frozenset()
