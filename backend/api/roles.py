"""Endpoints de roles.

El catalogo de roles de empresa es cerrado: gerente, jefe de departamento y
tecnico. Los roles de proyecto son los que se usan dentro de cada proyecto y
llevan sus permisos.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..models import COMPANY_ROLE_LABELS, COMPANY_ROLE_SCOPES
from ..schemas import CompanyRoleOut, RoleOut
from ..security import SessionDep, require_manager
from ..services.configuration import list_roles

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[CompanyRoleOut])
async def list_company_roles(
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> list[CompanyRoleOut]:
    """Catalogo de roles de empresa, con el alcance de cada uno."""
    return [
        CompanyRoleOut(value=value, label=label, scope=COMPANY_ROLE_SCOPES[value])
        for value, label in COMPANY_ROLE_LABELS.items()
    ]


@router.get("/project", response_model=list[RoleOut])
async def list_project_roles(
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> list[RoleOut]:
    """Roles aplicables dentro de un proyecto, con sus permisos."""
    roles = await list_roles(session)
    return [
        RoleOut(id=role.id, name=role.name, permissions=list(role.permissions_json or []))
        for role in roles
    ]
