"""Configuracion de la organizacion: personas, departamentos, proyectos y miembros.

Las validaciones viven aqui para que los endpoints sean thin. Reglas del
dominio:

- El responsable de un departamento pertenece al departamento.
- Una persona tiene un unico rol de empresa y, como mucho, un departamento.
- Los miembros de un proyecto llevan el rol que ejercen dentro de el.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import hash_password
from ..models import (
    COMPANY_ROLE_LABELS,
    EMPLOYMENT_TYPE_LABELS,
    SENIORITY_LABELS,
    Department,
    Project,
    ProjectMember,
    Role,
    User,
)
from ..schemas import (
    DepartmentCreate,
    DepartmentUpdate,
    PersonCreate,
    PersonOut,
    PersonUpdate,
    ProjectCreate,
    ProjectUpdate,
)


async def _unique_email(
    session: AsyncSession, email: str, exclude_user_id: int | None = None
) -> None:
    """Comprueba que el correo no este en uso."""
    stmt = select(User.id).where(User.email == email.lower())
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    if (await session.execute(stmt)).scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya hay una persona con ese correo",
        )


async def _department_or_404(session: AsyncSession, department_id: int) -> Department:
    department = await session.get(Department, department_id)
    if department is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Departamento no encontrado",
        )
    return department


async def _person_or_404(session: AsyncSession, user_id: int) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Persona no encontrada"
        )
    return user


def _person_out(user: User, department_name: str | None) -> PersonOut:
    return PersonOut(
        id=user.id,
        name=user.name,
        email=user.email,
        company_role=user.company_role,
        company_role_label=COMPANY_ROLE_LABELS.get(user.company_role, user.company_role),
        department_id=user.department_id,
        department_name=department_name,
        weekly_base_hours=user.weekly_base_hours,
        is_global_admin=user.is_global_admin,
        job_title=user.job_title,
        seniority=user.seniority,
        seniority_label=SENIORITY_LABELS.get(user.seniority) if user.seniority else None,
        employment_type=user.employment_type,
        employment_type_label=EMPLOYMENT_TYPE_LABELS.get(
            user.employment_type, user.employment_type
        ),
    )


async def list_people(session: AsyncSession) -> list[PersonOut]:
    """Personas de la organizacion, con su rol y su departamento."""
    rows = (
        await session.execute(
            select(User, Department.name)
            .outerjoin(Department, Department.id == User.department_id)
            .order_by(User.name)
        )
    ).all()
    return [_person_out(user, department_name) for user, department_name in rows]


async def create_person(session: AsyncSession, payload: PersonCreate) -> PersonOut:
    """Da de alta una persona en la organizacion."""
    email = payload.email.lower()
    await _unique_email(session, email)

    if payload.department_id is not None:
        await _department_or_404(session, payload.department_id)

    user = User(
        name=payload.name,
        email=email,
        hashed_password=hash_password(payload.password),
        company_role=payload.company_role,
        department_id=payload.department_id,
        weekly_base_hours=payload.weekly_base_hours,
        job_title=payload.job_title,
        seniority=payload.seniority,
        employment_type=payload.employment_type,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    department_name = None
    if user.department_id is not None:
        department = await session.get(Department, user.department_id)
        department_name = department.name if department else None
    return _person_out(user, department_name)


async def update_person(
    session: AsyncSession, user_id: int, payload: PersonUpdate
) -> PersonOut:
    """Aplica los campos presentes de la peticion sobre la persona."""
    user = await _person_or_404(session, user_id)
    changed = payload.changed_fields()

    if "email" in changed and payload.email is not None:
        await _unique_email(session, payload.email.lower(), exclude_user_id=user.id)
        user.email = payload.email.lower()
    if "name" in changed and payload.name is not None:
        user.name = payload.name
    if "company_role" in changed and payload.company_role is not None:
        user.company_role = payload.company_role
    if "weekly_base_hours" in changed and payload.weekly_base_hours is not None:
        user.weekly_base_hours = payload.weekly_base_hours
    if "department_id" in changed:
        if payload.department_id is not None:
            await _department_or_404(session, payload.department_id)
        user.department_id = payload.department_id
    if "job_title" in changed:
        user.job_title = payload.job_title
    if "seniority" in changed:
        user.seniority = payload.seniority
    if "employment_type" in changed and payload.employment_type is not None:
        user.employment_type = payload.employment_type

    await session.commit()
    await session.refresh(user)

    department_name = None
    if user.department_id is not None:
        department = await session.get(Department, user.department_id)
        department_name = department.name if department else None
    return _person_out(user, department_name)


async def create_department(
    session: AsyncSession, payload: DepartmentCreate
) -> Department:
    """Crea un departamento y coloca a su responsable dentro de el."""
    name = payload.name.strip()
    existing = await session.execute(
        select(Department.id).where(Department.name == name)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya hay un departamento con ese nombre",
        )

    department = Department(name=name)
    session.add(department)
    await session.flush()

    if payload.manager_id is not None:
        manager = await _person_or_404(session, payload.manager_id)
        manager.department_id = department.id
        department.manager_id = manager.id

    await session.commit()
    await session.refresh(department)
    return department


async def update_department(
    session: AsyncSession, department_id: int, payload: DepartmentUpdate
) -> Department:
    """Aplica los campos presentes de la peticion sobre el departamento."""
    department = await _department_or_404(session, department_id)
    changed = payload.changed_fields()

    if "name" in changed and payload.name is not None:
        name = payload.name.strip()
        existing = await session.execute(
            select(Department.id).where(
                Department.name == name, Department.id != department.id
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya hay un departamento con ese nombre",
            )
        department.name = name

    if "manager_id" in changed:
        if payload.manager_id is None:
            department.manager_id = None
        else:
            manager = await _person_or_404(session, payload.manager_id)
            # El responsable pertenece al departamento que dirige.
            manager.department_id = department.id
            department.manager_id = manager.id

    await session.commit()
    await session.refresh(department)
    return department


async def create_project(session: AsyncSession, payload: ProjectCreate) -> Project:
    """Crea un proyecto."""
    if payload.department_id is not None:
        await _department_or_404(session, payload.department_id)
    if payload.owner_id is not None:
        await _person_or_404(session, payload.owner_id)

    project = Project(
        name=payload.name,
        status=payload.status,
        department_id=payload.department_id,
        owner_id=payload.owner_id,
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


async def update_project(
    session: AsyncSession, project_id: int, payload: ProjectUpdate
) -> Project:
    """Aplica los campos presentes de la peticion sobre el proyecto."""
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado"
        )

    changed = payload.changed_fields()
    if "name" in changed and payload.name is not None:
        project.name = payload.name
    if "status" in changed and payload.status is not None:
        project.status = payload.status
    if "department_id" in changed:
        if payload.department_id is not None:
            await _department_or_404(session, payload.department_id)
        project.department_id = payload.department_id
    if "owner_id" in changed:
        if payload.owner_id is not None:
            await _person_or_404(session, payload.owner_id)
        project.owner_id = payload.owner_id

    await session.commit()
    await session.refresh(project)
    return project


async def list_roles(session: AsyncSession) -> list[Role]:
    """Roles aplicables dentro de un proyecto."""
    result = await session.execute(select(Role).order_by(Role.name))
    return list(result.scalars().all())


async def add_project_member(
    session: AsyncSession, project_id: int, user_id: int, role_id: int
) -> ProjectMember:
    """Mete a una persona en un proyecto con el rol indicado."""
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado"
        )
    await _person_or_404(session, user_id)

    role = await session.get(Role, role_id)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rol no encontrado"
        )

    existing = await session.execute(
        select(ProjectMember.user_id).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La persona ya es miembro del proyecto",
        )

    member = ProjectMember(project_id=project_id, user_id=user_id, role_id=role_id)
    session.add(member)
    await session.commit()
    await session.refresh(member)
    return member


async def remove_project_member(
    session: AsyncSession, project_id: int, user_id: int
) -> None:
    """Saca a una persona del proyecto."""
    result = await session.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La persona no es miembro del proyecto",
        )
    await session.delete(member)
    await session.commit()
