"""Endpoints de departamentos."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from ..models import Department, User
from ..schemas import DepartmentOut
from ..security import CurrentUser, SessionDep

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("", response_model=list[DepartmentOut])
async def list_departments(
    session: SessionDep,
    _user: CurrentUser,
) -> list[DepartmentOut]:
    """Departamentos de la organizacion con su responsable."""
    rows = (
        await session.execute(
            select(Department, User.name)
            .outerjoin(User, Department.manager_id == User.id)
            .order_by(Department.name)
        )
    ).all()

    return [
        DepartmentOut(
            id=department.id,
            name=department.name,
            manager_id=department.manager_id,
            manager_name=manager_name,
        )
        for department, manager_name in rows
    ]
