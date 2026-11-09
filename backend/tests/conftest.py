"""Utilidades compartidas por las pruebas.

El dataset de demostracion se escribe una sola vez en un fichero SQLite y
cada prueba que lo necesita trabaja sobre una copia. Asi el bcrypt de las
doce personas no se paga en cada prueba.
"""

from __future__ import annotations

import asyncio
import shutil
from collections.abc import Callable, Coroutine
from pathlib import Path
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.auth import hash_password
from backend.database import create_engine, get_db
from backend.main import app
from backend.models import Base, CompanyRole, User
from backend.seed import DEFAULT_PASSWORD, populate

PASSWORD = "clave-de-prueba"


async def _escribir_seed(ruta: Path) -> None:
    """Deja el dataset de demostracion escrito en un fichero SQLite."""
    engine = create_engine(f"sqlite+aiosqlite:///{ruta}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await populate(session)
        # Persona ajena a la organizacion: sin departamento y sin trabajo.
        session.add(
            User(
                name="Forastero",
                email="forastero@example.com",
                hashed_password=hash_password(PASSWORD),
                company_role=CompanyRole.TECNICO.value,
            )
        )
        await session.commit()
    await engine.dispose()


@pytest.fixture(scope="session")
def seed_database(tmp_path_factory) -> Path:
    """Dataset de demostracion, escrito una sola vez para toda la sesion."""
    ruta = tmp_path_factory.mktemp("seed") / "demo.sqlite"
    asyncio.run(_escribir_seed(ruta))
    return ruta


@pytest.fixture
async def client_con_seed(seed_database: Path, tmp_path: Path):
    """Cliente HTTP con una copia propia del dataset de demostracion."""
    destino = tmp_path / "datos.sqlite"
    shutil.copyfile(seed_database, destino)
    engine = create_engine(f"sqlite+aiosqlite:///{destino}")
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as http:
            yield http
    finally:
        app.dependency_overrides.pop(get_db, None)
        await engine.dispose()


@pytest.fixture
def entrar(client_con_seed: AsyncClient) -> Callable[..., Coroutine[Any, Any, dict[str, str]]]:
    """Entra en la aplicacion y devuelve la cabecera con el token."""

    async def _entrar(email: str, password: str = DEFAULT_PASSWORD) -> dict[str, str]:
        response = await client_con_seed.post(
            "/api/auth/login", json={"email": email, "password": password}
        )
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    return _entrar
