"""Horario laboral de una persona y capacidad por semana.

El horario esta versionado en el tiempo: cada version dice que dias labora la
persona, cuantas horas en cada uno y que factor de disponibilidad aplica. La
version vigente en una semana es la ultima cuya entrada en vigor no es
posterior al lunes de esa semana.

Las operaciones son puras: no hay acceso a base de datos ni estado global.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from .units import from_units, to_units

DAYS_PER_WEEK = 7
"""Dias de la semana, de lunes a domingo."""

FULL_DAY = 2
"""Peso de un dia laborable completo, en medios dias."""

HALF_DAY = 1
"""Peso de un dia con festivo de medio dia, en medios dias."""


@dataclass(frozen=True, slots=True)
class ScheduleVersion:
    """Version del horario de una persona.

    Los dias van de lunes a domingo, en centimas de hora enteras. El factor de
    disponibilidad es un porcentaje entero entre 0 y 100.
    """

    valid_from: date
    days: tuple[int, ...]
    availability_factor: int = 100

    def __post_init__(self) -> None:
        if len(self.days) != DAYS_PER_WEEK:
            raise ValueError(
                f"El horario tiene {len(self.days)} dias, se esperan {DAYS_PER_WEEK}"
            )
        if not 0 <= self.availability_factor <= 100:
            raise ValueError(
                f"El factor de disponibilidad va de 0 a 100: {self.availability_factor}"
            )

    @property
    def weekly_units(self) -> int:
        """Horas laborables de la semana en centimas, sin aplicar el factor."""
        return sum(self.days)


def schedule_version(
    valid_from: date,
    days: Sequence[int],
    availability_factor: int,
) -> ScheduleVersion:
    """Construye una version de horario a partir de sus datos."""
    return ScheduleVersion(
        valid_from=valid_from,
        days=tuple(days),
        availability_factor=availability_factor,
    )


def current_week_key(today: date | None = None) -> str:
    """Clave de la semana ISO en curso."""
    day = today or date.today()
    iso = day.isocalendar()
    return f"{iso[0]:04d}-W{iso[1]:02d}"


def week_start(day: date) -> date:
    """Lunes de la semana ISO a la que pertenece el dia."""
    return day - timedelta(days=day.weekday())


def week_start_from_key(key: str) -> date:
    """Lunes de la semana ISO con clave YYYY-Www."""
    year, _, week = key.partition("-W")
    return date.fromisocalendar(int(year), int(week), 1)


def schedule_in_force(
    versions: Sequence[ScheduleVersion], on_date: date
) -> ScheduleVersion | None:
    """Horario vigente en una fecha: el ultimo que ya habia entrado en vigor."""
    candidates = [version for version in versions if version.valid_from <= on_date]
    if not candidates:
        return None
    return max(candidates, key=lambda version: version.valid_from)


def holiday_weight(half_day: bool) -> int:
    """Peso de un dia no laborable, en medios dias."""
    return HALF_DAY if half_day else 0


def merge_holidays(
    base: Mapping[date, int],
    extra: Mapping[date, int],
) -> dict[date, int]:
    """Anade dias no laborables de otro alcance a los de una persona.

    Si un dia cae en los dos, manda el peso mas restrictivo: un festivo de
    jornada entera sigue siendo de jornada entera aunque la persona tenga
    ademas un permiso de medio dia ese mismo dia.
    """
    merged = dict(base)
    for day, weight in extra.items():
        current = merged.get(day)
        merged[day] = weight if current is None else min(current, weight)
    return merged


def apply_day_weight(units: int, weight: int) -> int:
    """Aplica el peso de un dia a sus horas, redondeando a la mitad hacia arriba."""
    if weight >= FULL_DAY:
        return units
    if weight <= 0:
        return 0
    return (units * weight + FULL_DAY // 2) // FULL_DAY


def apply_factor(units: int, factor: int) -> int:
    """Aplica el factor de disponibilidad a las centimas de la semana."""
    if factor >= 100:
        return units
    if factor <= 0:
        return 0
    return to_units(from_units(units) * Decimal(factor) / Decimal(100))


def week_capacity_units(
    version: ScheduleVersion,
    week: str,
    holidays: Mapping[date, int],
) -> int:
    """Capacidad de la persona en una semana, en centimas.

    Se descuenta el peso de los dias no laborables que caen en la semana y se
    aplica el factor de disponibilidad.
    """
    monday = week_start_from_key(week)
    total = 0
    for index, units in enumerate(version.days):
        day = monday + timedelta(days=index)
        total += apply_day_weight(units, holidays.get(day, FULL_DAY))
    return apply_factor(total, version.availability_factor)


def capacity_units_for_week(
    schedules: Sequence[ScheduleVersion],
    weekly_base_hours: Decimal | None,
    week: str,
    holidays: Mapping[date, int],
) -> int | None:
    """Capacidad de la persona en una semana, en centimas.

    Se usa el horario vigente en esa semana. Si no hay horario, se recurre a las
    horas base semanales. Si no hay ninguna de las dos cosas, la capacidad se
    desconoce: se devuelve None, porque el motor no inventa un limite que nadie
    ha definido.
    """
    monday = week_start_from_key(week)
    version = schedule_in_force(schedules, monday)
    if version is not None:
        units = week_capacity_units(version, week, holidays)
    elif weekly_base_hours is not None:
        units = to_units(weekly_base_hours)
    else:
        return None
    if units <= 0:
        return None
    return units
