"""Endpoints de departamentos."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy import select

from ..models import Department, User
from ..schemas import DepartmentCreate, DepartmentOut, DepartmentUpdate
from ..security import CurrentUser, SessionDep, require_manager
from ..services.configuration import create_department, update_department
from ..services.scope import resolve_scope

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("", response_model=list[DepartmentOut])
async def list_departments(
    session: SessionDep,
    user: CurrentUser,
) -> list[DepartmentOut]:
    """Departamentos que puede ver quien entra, con su responsable.

    El gerente ve todos. El resto ve solo el suyo: un jefe de area no tiene
    nada que hacer con los departamentos de los demas, asi que no se le
    enseñan. Quien no tiene departamento asignado no ve ninguno.
    """
    scope = await resolve_scope(session, user)
    query = select(Department, User.name).outerjoin(
        User, Department.manager_id == User.id
    )
    if not scope.all_projects:
        if scope.department_id is None:
            return []
        query = query.where(Department.id == scope.department_id)

    rows = (await session.execute(query.order_by(Department.name))).all()

    return [
        DepartmentOut(
            id=department.id,
            name=department.name,
            manager_id=department.manager_id,
            manager_name=manager_name,
        )
        for department, manager_name in rows
    ]


@router.post("", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
async def add_department(
    payload: DepartmentCreate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> DepartmentOut:
    """Crea un departamento y coloca a su responsable dentro de el."""
    department = await create_department(session, payload)
    manager_name = None
    if department.manager_id is not None:
        result = await session.execute(
            select(User.name).where(User.id == department.manager_id)
        )
        manager_name = result.scalar_one_or_none()
    return DepartmentOut(
        id=department.id,
        name=department.name,
        manager_id=department.manager_id,
        manager_name=manager_name,
    )


@router.patch("/{department_id}", response_model=DepartmentOut)
async def edit_department(
    department_id: int,
    payload: DepartmentUpdate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> DepartmentOut:
    """Modifica los campos indicados de un departamento."""
    department = await update_department(session, department_id, payload)
    manager_name = None
    if department.manager_id is not None:
        result = await session.execute(
            select(User.name).where(User.id == department.manager_id)
        )
        manager_name = result.scalar_one_or_none()
    return DepartmentOut(
        id=department.id,
        name=department.name,
        manager_id=department.manager_id,
        manager_name=manager_name,
    )
