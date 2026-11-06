"""Endpoint con el ambito de la persona que entra.

El frontend necesita saber que proyectos ve y en cuales puede escribir, para
no ofrecer acciones que van a fallar con un 403.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from ..auth import load_user_projects
from ..models import COMPANY_ROLE_LABELS, CompanyRole, Department
from ..schemas import ScopeOut, UserOut
from ..security import CurrentUser, SessionDep
from ..services.scope import resolve_scope

router = APIRouter(tags=["scope"])


@router.get("/me", response_model=ScopeOut)
async def my_scope(user: CurrentUser, session: SessionDep) -> ScopeOut:
    """Rol, departamento y proyectos visibles y editables de quien entra."""
    scope = await resolve_scope(session, user)
    member_permissions = await load_user_projects(session, user.id)

    editable: set[int] = set()
    if scope.all_projects:
        editable = set(scope.project_ids)
    else:
        for project_id in scope.member_project_ids:
            if "task.write" in member_permissions.get(str(project_id), []):
                editable.add(project_id)
        editable |= set(scope.managed_project_ids)

    department_name = None
    if user.department_id is not None:
        result = await session.execute(
            select(Department.name).where(Department.id == user.department_id)
        )
        department_name = result.scalar_one_or_none()

    return ScopeOut(
        user=UserOut.model_validate(user),
        role_label=COMPANY_ROLE_LABELS.get(user.company_role, user.company_role),
        is_manager=(
            user.is_global_admin or user.company_role == CompanyRole.GERENTE.value
        ),
        department_name=department_name,
        visible_project_ids=sorted(scope.project_ids),
        editable_project_ids=sorted(editable),
    )
