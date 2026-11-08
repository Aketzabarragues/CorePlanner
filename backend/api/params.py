"""Parametros de consulta que comparten varios endpoints."""

from __future__ import annotations

from fastapi import HTTPException

from ..services.capacity import InvalidWeekRangeError, week_range

__all__ = ["week_range_or_422"]


def week_range_or_422(
    from_week: str | None, to_week: str | None
) -> tuple[str, ...] | None:
    """Rango de semanas pedido, o None si no se pide ninguno.

    Un rango que no existe o que viene a medias es un 422 con el motivo, no un
    error de servidor.
    """
    try:
        return week_range(from_week, to_week)
    except InvalidWeekRangeError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err
