"""Motor y sesion de base de datos.

Usa el driver asincrono correspondiente a la URL configurada, de modo que el
mismo codigo funciona con SQLite en desarrollo y PostgreSQL en produccion.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import get_settings

settings = get_settings()


def create_engine(
    url: str | None = None,
    echo: bool | None = None,
    *,
    foreign_keys: bool = True,
) -> AsyncEngine:
    """Crea un motor asincrono con la integridad referencial garantizada.

    SQLite tiene la integridad referencial desactivada por defecto, por lo que
    ON DELETE CASCADE y ON DELETE RESTRICT del esquema no se aplicarian.
    PostgreSQL si los aplica, de modo que sin este pragma el comportamiento
    diferiria entre desarrollo y produccion.

    Con foreign_keys=False la integridad no se activa. Hace falta para borrar
    las tablas cuando hay un ciclo de claves foraneas, porque SQLite no sabe
    ordenarlas en ese caso.
    """
    new_engine = create_async_engine(
        url or settings.database_url,
        echo=settings.database_echo if echo is None else echo,
        future=True,
    )

    @event.listens_for(new_engine.sync_engine, "connect")
    def _enable_foreign_keys(dbapi_connection, connection_record) -> None:
        if new_engine.dialect.name != "sqlite" or not foreign_keys:
            return
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()

    return new_engine


engine = create_engine()

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependencia FastAPI que entrega una sesion por peticion."""
    async with SessionLocal() as session:
        yield session


async def create_all() -> None:
    """Crea el esquema completo. Solo para desarrollo y pruebas."""
    from .models import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def dispose_engine() -> None:
    await engine.dispose()
