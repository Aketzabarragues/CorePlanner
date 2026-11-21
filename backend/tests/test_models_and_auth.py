"""Pruebas de los modelos y del esquema de autenticacion."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import httpx
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
from backend.config import get_settings
from backend.database import create_engine, get_db
from backend.main import app
from backend.models import (
    Base,
    CompanyRole,
    LoginAttempt,
    Project,
    ProjectMember,
    Role,
    Task,
    TaskStatus,
    User,
)
from backend.services import login_attempts


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


EMAIL = "ana@example.com"
PASSWORD = "clave-de-prueba"


async def _intentos(session, cantidad: int, hace: timedelta, email: str = EMAIL) -> None:
    """Intentos fallidos con la marca de tiempo indicada, hacia atras desde ahora."""
    ahora = datetime.now(UTC)
    session.add_all(
        LoginAttempt(email=email, created_at=ahora - hace - timedelta(seconds=i))
        for i in range(cantidad)
    )
    await session.commit()


async def test_purga_quita_solo_lo_que_sale_de_la_ventana(session):
    ventana = get_settings().login_attempt_window_minutes
    await _intentos(session, 2, timedelta(minutes=ventana + 10))
    await _intentos(session, 1, timedelta(minutes=1))
    await login_attempts.purgar_intentos_viejos(session)
    rows = (await session.execute(select(LoginAttempt))).scalars().all()
    assert len(rows) == 1


async def test_segundos_bloqueo_con_el_limite_de_intentos(session):
    ahora = datetime.now(UTC)
    settings = get_settings()
    await _intentos(session, settings.login_max_attempts - 1, timedelta(minutes=1))
    assert await login_attempts.segundos_bloqueo(session, EMAIL, ahora=ahora) == 0

    await login_attempts.registrar_intento_fallido(session, EMAIL)
    espera = await login_attempts.segundos_bloqueo(session, EMAIL, ahora=ahora)
    assert espera > 0
    # El bloqueo dura hasta que el intento mas antiguo salga de la ventana.
    assert espera <= settings.login_attempt_window_minutes * 60

    # Con el tiempo, el intento mas antiguo expira y el bloqueo se acaba.
    mas_late = ahora + timedelta(
        minutes=settings.login_attempt_window_minutes + 5
    )
    assert (
        await login_attempts.segundos_bloqueo(session, EMAIL, ahora=mas_late) == 0
    )


async def test_login_correcto_borra_los_intentos(session):
    await _intentos(session, 3, timedelta(minutes=1))
    await login_attempts.limpiar_intentos(session, EMAIL)
    assert (
        await login_attempts.intentos_recientes(session, EMAIL)
    ) == 0


@pytest.fixture
async def client():
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with factory() as session:
            session.add(
                User(
                    name="Ana",
                    email=EMAIL,
                    hashed_password=hash_password(PASSWORD),
                    company_role=CompanyRole.GERENTE.value,
                )
            )
            await session.commit()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
            yield http
    finally:
        app.dependency_overrides.pop(get_db, None)
        await engine.dispose()


async def test_login_bloquea_tras_el_limite_de_intentos(client):
    settings = get_settings()
    for _ in range(settings.login_max_attempts):
        response = await client.post(
            "/api/auth/login", json={"email": EMAIL, "password": "mala"}
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "Credenciales inválidas"

    response = await client.post(
        "/api/auth/login", json={"email": EMAIL, "password": "mala"}
    )
    assert response.status_code == 429
    assert response.json()["detail"] == (
        "Demasiados intentos de acceso. Intentalo de nuevo en unos minutos."
    )
    assert int(response.headers["Retry-After"]) > 0

    # Bloqueado: ni siquiera con la contrasena correcta.
    response = await client.post(
        "/api/auth/login", json={"email": EMAIL, "password": PASSWORD}
    )
    assert response.status_code == 429

    # Un correo sin intentos no se ve afectado.
    response = await client.post(
        "/api/auth/login",
        json={"email": "nadie@example.com", "password": "mala"},
    )
    assert response.status_code == 401


async def test_login_correcto_desbloquea_tras_el_limite(client):
    settings = get_settings()
    for _ in range(settings.login_max_attempts - 1):
        response = await client.post(
            "/api/auth/login", json={"email": EMAIL, "password": "mala"}
        )
        assert response.status_code == 401

    # Falta uno para el bloqueo: el login correcto borra los intentos.
    response = await client.post(
        "/api/auth/login", json={"email": EMAIL, "password": PASSWORD}
    )
    assert response.status_code == 200
    assert response.json()["access_token"]

    # Se pueden volver a fallar todos los intentos sin bloqueo previo.
    for _ in range(settings.login_max_attempts):
        response = await client.post(
            "/api/auth/login", json={"email": EMAIL, "password": "mala"}
        )
        assert response.status_code == 401
    response = await client.post(
        "/api/auth/login", json={"email": EMAIL, "password": "mala"}
    )
    assert response.status_code == 429
