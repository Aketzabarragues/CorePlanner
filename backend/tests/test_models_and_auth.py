"""Pruebas de los modelos y del esquema de autenticacion."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.auth import (
    TokenError,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from backend.database import create_engine
from backend.models import Base, Project, ProjectMember, Role, Task, TaskStatus, User


@pytest.fixture
async def session():
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        yield db
    await engine.dispose()


async def test_create_all_tables(session):
    from sqlalchemy import inspect

    async with session.bind.connect() as conn:
        names = set(await conn.run_sync(lambda c: set(inspect(c).get_table_names())))
    assert {"users", "roles", "projects", "project_members", "tasks"} <= names


async def test_user_defaults(session):
    user = User(name="Ana", email="ana@example.com", hashed_password=hash_password("x"))
    session.add(user)
    await session.commit()
    await session.refresh(user)
    assert user.weekly_base_hours == 40.0
    assert user.is_global_admin is False


async def test_task_requires_dates_in_order(session):
    user = User(name="Ana", email="a@e.com", hashed_password="x")
    project = Project(name="Linea 1")
    session.add_all([user, project])
    await session.flush()

    task = Task(
        project_id=project.id,
        assigned_to=user.id,
        title="Tarea",
        status=TaskStatus.BACKLOG.value,
        start_date=date(2026, 3, 10),
        end_date=date(2026, 3, 1),
        estimated_hours=8,
    )
    session.add(task)
    with pytest.raises(IntegrityError):
        await session.flush()
    await session.rollback()


async def test_membership_links_user_project_role(session):
    user = User(name="Ana", email="a@e.com", hashed_password="x")
    project = Project(name="Linea 1")
    role = Role(name="Ingeniero", permissions_json=["task.read", "task.write"])
    session.add_all([user, project, role])
    await session.flush()

    session.add(ProjectMember(user_id=user.id, project_id=project.id, role_id=role.id))
    await session.commit()

    member = (
        await session.execute(
            select(ProjectMember).filter_by(user_id=user.id)
        )
    ).scalar_one()
    assert member.project.name == "Linea 1"
    assert member.role.permissions_json == ["task.read", "task.write"]


async def test_deleting_project_cascades_members_and_tasks(session):
    user = User(name="Ana", email="a@e.com", hashed_password="x")
    project = Project(name="Linea 1")
    role = Role(name="Lector", permissions_json=["task.read"])
    session.add_all([user, project, role])
    await session.flush()

    session.add(ProjectMember(user_id=user.id, project_id=project.id, role_id=role.id))
    session.add(
        Task(
            project_id=project.id,
            assigned_to=user.id,
            title="Tarea",
            status=TaskStatus.BACKLOG.value,
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 5),
            estimated_hours=16,
        )
    )
    await session.commit()

    await session.delete(project)
    await session.commit()

    assert (await session.execute(select(ProjectMember))).scalars().all() == []
    assert (await session.execute(select(Task))).scalars().all() == []


async def test_deleting_role_in_use_is_rejected(session):
    user = User(name="Ana", email="a@e.com", hashed_password="x")
    project = Project(name="Linea 1")
    role = Role(name="Lector", permissions_json=["task.read"])
    session.add_all([user, project, role])
    await session.flush()
    session.add(ProjectMember(user_id=user.id, project_id=project.id, role_id=role.id))
    await session.commit()

    await session.delete(role)
    with pytest.raises(IntegrityError):
        await session.commit()
    await session.rollback()


def test_password_hash_roundtrip():
    hashed = hash_password("clave-de-prueba")
    assert hashed != "clave-de-prueba"
    assert verify_password("clave-de-prueba", hashed)
    assert not verify_password("otra-clave", hashed)


def test_access_token_roundtrip(session_user=None):
    user = User(id=7, name="Ana", email="a@e.com", hashed_password="x", is_global_admin=True)
    token = create_access_token(user, projects={"1": ["task.read"]})
    payload = decode_access_token(token)
    assert payload.sub == 7
    assert payload.email == "a@e.com"
    assert payload.is_global_admin is True
    assert payload.projects == {"1": ["task.read"]}


def test_access_token_rejects_tampered_signature():

    user = User(id=7, name="Ana", email="a@e.com", hashed_password="x")
    token = create_access_token(user)
    tampered = token[:-4] + ("aaaa" if not token.endswith("aaaa") else "bbbb")
    with pytest.raises(TokenError):
        decode_access_token(tampered)


def test_access_token_rejects_expired():
    user = User(id=7, name="Ana", email="a@e.com", hashed_password="x")
    token = create_access_token(user, expires_delta=timedelta(seconds=-10))
    with pytest.raises(TokenError):
        decode_access_token(token)
