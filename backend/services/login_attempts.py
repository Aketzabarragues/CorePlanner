"""Intentos de login fallidos: limite por correo contra el adivinamiento.

Cada intento fallido se registra con su marca de tiempo. Si dentro de la
ventana hay tantos como el limite, los login del correo quedan bloqueados
hasta que el intento mas antiguo expire. Un login correcto borra los
intentos del correo y la purga de los viejos va de paso en cada intento.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import LoginAttempt


def _ahora() -> datetime:
    return datetime.now(UTC)


async def registrar_intento_fallido(session: AsyncSession, email: str) -> None:
    """Registra un intento de login fallido del correo."""
    session.add(LoginAttempt(email=email.lower()))
    await session.commit()


async def limpiar_intentos(session: AsyncSession, email: str) -> None:
    """Borra los intentos del correo: el login fue correcto."""
    await session.execute(
        delete(LoginAttempt).where(LoginAttempt.email == email.lower())
    )
    await session.commit()


async def purgar_intentos_viejos(
    session: AsyncSession, *, ahora: datetime | None = None
) -> None:
    """Borra los intentos que ya no cuentan: estan fuera de la ventana."""
    limite = ahora or _ahora()
    corte = limite - timedelta(
        minutes=get_settings().login_attempt_window_minutes
    )
    await session.execute(
        delete(LoginAttempt).where(LoginAttempt.created_at < corte)
    )
    await session.commit()


async def intentos_recientes(
    session: AsyncSession, email: str, *, ahora: datetime | None = None
) -> int:
    """Intentos del correo que todavia cuentan dentro de la ventana."""
    limite = ahora or _ahora()
    corte = limite - timedelta(
        minutes=get_settings().login_attempt_window_minutes
    )
    count = await session.scalar(
        select(func.count(LoginAttempt.id)).where(
            LoginAttempt.email == email.lower(),
            LoginAttempt.created_at >= corte,
        )
    )
    return int(count)


async def segundos_bloqueo(
    session: AsyncSession, email: str, *, ahora: datetime | None = None
) -> int:
    """Segundos que faltan para que el correo deje de estar bloqueado.

    Cero si el correo no lleva el limite de intentos dentro de la ventana.
    """
    if await intentos_recientes(session, email, ahora=ahora) < (
        get_settings().login_max_attempts
    ):
        return 0
    oldest = await session.scalar(
        select(func.min(LoginAttempt.created_at)).where(
            LoginAttempt.email == email.lower()
        )
    )
    if oldest is None:
        return 0
    if oldest.tzinfo is None:
        # SQLite devuelve la marca sin zona horaria; se escribio en UTC.
        oldest = oldest.replace(tzinfo=UTC)
    limite = ahora or _ahora()
    corte = limite - timedelta(
        minutes=get_settings().login_attempt_window_minutes
    )
    # El intento mas antiguo expira un segundo mas tarde de lo estricto,
    # para que el bloqueo nunca salga a cero en el borde exacto.
    return max(1, int((corte - oldest).total_seconds()) + 1)
