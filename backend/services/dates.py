"""Fechas que se leen de la base de datos.

SQLite guarda las fechas sin zona y las devuelve naive. Anadir la zona al
salir evita que el navegador las lea como hora local y calcule mal el tiempo
transcurrido.
"""

from __future__ import annotations

from datetime import UTC, datetime


def as_utc(value: datetime) -> datetime:
    """La fecha con zona, en UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
