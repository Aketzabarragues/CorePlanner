"""Unidades de tiempo del motor: centimas de hora enteras.

Todo el calculo de horas trabaja en centimas enteras, de modo que los totales
coinciden exactamente con la suma de las partes y no dependen del orden de las
sumas. La conversion a JSON ocurre en un solo punto, `hours_to_json`.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

HOURS_SCALE = 100
"""Centimas de hora en las que se trabaja internamente."""


def hours_to_json(hours: Decimal) -> float:
    """Convierte las horas a un numero JSON.

    El valor viene de centimas enteras, de modo que tiene como maximo dos
    decimales y se representa de forma exacta en JSON.
    """
    return float(hours)


def to_units(hours: Decimal | float | int) -> int:
    """Convierte horas a centimas de hora, redondeando a la mitad hacia arriba."""
    value = hours if isinstance(hours, Decimal) else Decimal(str(hours))
    return int(
        (value * HOURS_SCALE).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )


def from_units(units: int) -> Decimal:
    """Convierte centimas de hora a horas.

    Usa la misma politica de redondeo que to_units, de modo que el ciclo
    to_units -> from_units no introduce desviaciones.
    """
    return (Decimal(units) / HOURS_SCALE).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
