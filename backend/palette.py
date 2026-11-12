"""Paleta cerrada de colores de la organizacion.

Los departamentos y los proyectos tienen un color propio, guardado en la base
de datos. El color se elige una vez, al crear la fila, y desde entonces es un
dato mas, como el nombre: no se calcula cada vez que se lee.

Este modulo es la unica fuente de la paleta. El fichero
`frontend/src/utils/palette.js` tiene la misma lista y las dos copias deben
mantenerse iguales: el backend decide el color y el frontend lo ofrece.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

PALETTE = (
    ("#1f6feb", "Azul"),
    ("#0a3d91", "Azul profundo"),
    ("#1a7f37", "Verde"),
    ("#0b6e4f", "Verde azulado"),
    ("#0f766e", "Teal"),
    ("#0e7490", "Cian"),
    ("#bf8700", "Ocre"),
    ("#8a5a00", "Marrón"),
    ("#b45309", "Naranja"),
    ("#8250df", "Violeta"),
    ("#5b21b6", "Violeta profundo"),
    ("#c2255c", "Magenta"),
    ("#9d174d", "Granate"),
    ("#cf222e", "Rojo"),
    ("#a11d2b", "Rojo oscuro"),
    ("#4d7c0f", "Oliva"),
    ("#57606a", "Pizarra"),
    ("#3f4c5a", "Pizarra oscura"),
)
"""Los unicos colores aceptados, con su nombre."""

PALETTE_COLORS = frozenset(color for color, _ in PALETTE)
"""Los valores de color validos."""


def least_used_color(counts: Mapping[str, int]) -> str:
    """El color de la paleta que menos veces aparece en `counts`.

    Los empates se resuelven con el orden de la paleta, de modo que el reparto
    es siempre el mismo.
    """
    return min((color for color, _ in PALETTE), key=lambda color: counts.get(color, 0))


async def suggest_color(session: AsyncSession, model) -> str:
    """El color de la paleta que menos se repite hoy entre las filas de `model`."""
    rows = (
        await session.execute(select(model.color).where(model.color.is_not(None)))
    ).scalars().all()
    return least_used_color(Counter(rows))


async def assign_missing_colors(session: AsyncSession, model) -> int:
    """Asigna color a las filas de `model` que aun no lo tienen.

    Las filas se recorren por id, asi que el reparto es siempre el mismo. Cada
    color asignado cuenta para las siguientes: mientras queden colores libres,
    las filas siguientes reciben colores distintos. Los cambios los guarda el
    llamante al confirmar la sesion.
    """
    filas = (
        await session.execute(select(model).order_by(model.id))
    ).scalars().all()
    counts = Counter(fila.color for fila in filas if fila.color)

    asignados = 0
    for fila in filas:
        if fila.color:
            continue
        fila.color = least_used_color(counts)
        counts[fila.color] += 1
        asignados += 1
    return asignados
