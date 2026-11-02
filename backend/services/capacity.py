"""Motor de calculo de capacidad por semanas ISO.

Reparte las horas estimadas de cada tarea entre los dias laborables que
abarca y las imputa a la semana ISO correspondiente de cada persona.

Las operaciones son puras: no hay acceso a base de datos ni estado global.
La aritmetica trabaja en centimas de hora enteras, de modo que el total del
informe coincide exactamente con la suma de las tareas y el resultado no
depende del orden de las sumas. Cada tarea se cuantiza a centimas al
entrar, con un desvio maximo de 0,005 h por tarea.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Protocol

HOURS_SCALE = 100
"""Centimas de hora en las que se trabaja internamente."""


def hours_to_json(hours: Decimal) -> float:
    """Convierte las horas a un numero JSON.

    El valor viene de centimas enteras, de modo que tiene como maximo dos
    decimales y se representa de forma exacta en JSON.
    """
    return float(hours)


class CapacityError(Exception):
    """Error de calculo de capacidad."""


class InvalidTaskRangeError(CapacityError):
    """El rango de fechas de la tarea es incoherente."""


class NoBusinessDaysError(CapacityError):
    """El rango de fechas no contiene ningun dia laborable."""


class InvalidEstimatedHoursError(CapacityError):
    """Las horas estimadas de la tarea no son validas."""


class UserLike(Protocol):
    """Datos de persona que intervienen en el calculo."""

    id: int
    name: str
    weekly_base_hours: Decimal


class TaskLike(Protocol):
    """Datos de tarea que intervienen en el calculo."""

    id: int
    assigned_to: int | None
    start_date: date | None
    end_date: date | None
    estimated_hours: Decimal


@dataclass(frozen=True, slots=True)
class WeekLoad:
    """Carga de una persona en una semana ISO.

    Las horas se guardan en centimas enteras y se exponen como Decimal, de
    modo que la aritmetica no pasa por coma flotante.
    """

    week: str
    units: int
    is_overloaded: bool

    @property
    def hours(self) -> Decimal:
        return from_units(self.units)


@dataclass(frozen=True, slots=True)
class UserLoad:
    """Carga de una persona en el conjunto de semanas del informe."""

    user_id: int
    name: str
    weekly_base_hours: Decimal
    cells: tuple[WeekLoad, ...]

    @property
    def total_units(self) -> int:
        return sum(cell.units for cell in self.cells)

    @property
    def total_hours(self) -> Decimal:
        return from_units(self.total_units)

    @property
    def has_overload(self) -> bool:
        return any(cell.is_overloaded for cell in self.cells)


@dataclass(frozen=True, slots=True)
class CapacityReport:
    """Matriz de ocupacion: semanas en las columnas, personas en las filas."""

    weeks: tuple[str, ...]
    rows: tuple[UserLoad, ...]
    unassigned_task_ids: tuple[int, ...] = ()
    undated_task_ids: tuple[int, ...] = ()

    def to_dict(self) -> dict:
        return {
            "weeks": list(self.weeks),
            "rows": [
                {
                    "user_id": row.user_id,
                    "name": row.name,
                    "weekly_base_hours": hours_to_json(row.weekly_base_hours),
                    "total_hours": hours_to_json(row.total_hours),
                    "has_overload": row.has_overload,
                    "cells": [
                        {
                            "week": cell.week,
                            "hours": hours_to_json(cell.hours),
                            "is_overloaded": cell.is_overloaded,
                        }
                        for cell in row.cells
                    ],
                }
                for row in self.rows
            ],
            "unassigned_task_ids": list(self.unassigned_task_ids),
            "undated_task_ids": list(self.undated_task_ids),
        }


def business_days(start: date, end: date) -> list[date]:
    """Dias laborables del rango, sin sabados ni domingos."""
    if end < start:
        raise InvalidTaskRangeError(
            f"El rango {start.isoformat()}..{end.isoformat()} esta invertido"
        )
    days: list[date] = []
    current = start
    while current <= end:
        if current.weekday() < 5:
            days.append(current)
        current += timedelta(days=1)
    return days


def iso_week_key(day: date) -> str:
    """Clave de semana ISO en formato YYYY-Www.

    El año es el año ISO, que puede no coincidir con el del calendario:
    el 31 de diciembre de 2026 pertenece a 2026-W53.
    """
    iso = day.isocalendar()
    return f"{iso[0]:04d}-W{iso[1]:02d}"


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


def split_units(total_hours: Decimal | float | int, days: int) -> list[int]:
    """Reparte las horas en centimas de forma uniforme entre los dias.

    El reparto es entero, de modo que la suma de las partes coincide
    exactamente con el total y no depende del orden de las sumas.
    """
    if days <= 0:
        raise NoBusinessDaysError("La tarea no tiene dias laborables que repartir")
    total_units = to_units(total_hours)
    base, remainder = divmod(total_units, days)
    return [base + 1 if index < remainder else base for index in range(days)]


def compute_task_week_units(
    start_date: date,
    end_date: date,
    estimated_hours: Decimal | float | int,
) -> dict[str, int]:
    """Carga de una tarea por semana ISO, en centimas de hora.

    Lanza InvalidTaskRangeError si el rango esta invertido,
    NoBusinessDaysError si no contiene dias laborables y
    InvalidEstimatedHoursError si las horas estimadas son negativas.
    """
    if estimated_hours < 0:
        raise InvalidEstimatedHoursError(
            f"Las horas estimadas no pueden ser negativas: {estimated_hours}"
        )
    days = business_days(start_date, end_date)
    if not days:
        raise NoBusinessDaysError(
            f"El rango {start_date.isoformat()}..{end_date.isoformat()} "
            "no contiene dias laborables"
        )

    units_per_day = split_units(estimated_hours, len(days))
    totals: dict[str, int] = {}
    for day, units in zip(days, units_per_day, strict=True):
        key = iso_week_key(day)
        totals[key] = totals.get(key, 0) + units
    return totals


def compute_task_week_load(
    start_date: date,
    end_date: date,
    estimated_hours: Decimal | float | int,
) -> dict[str, Decimal]:
    """Horas de una tarea por semana ISO."""
    return {
        key: from_units(units)
        for key, units in compute_task_week_units(
            start_date, end_date, estimated_hours
        ).items()
    }


def build_capacity_report(
    users: Sequence[UserLike],
    tasks: Iterable[TaskLike],
) -> CapacityReport:
    """Construye la matriz de ocupacion a partir de personas y tareas.

    Las semanas del informe son la union de las semanas con actividad.
    Las tareas sin persona asignada o sin fechas no se imputan a ninguna
    fila, pero se listan para que la planificacion incompleta sea visible.
    """
    loads: dict[int, dict[str, int]] = {user.id: {} for user in users}
    weeks: set[str] = set()
    unassigned: list[int] = []
    undated: list[int] = []
    for task in tasks:
        if task.assigned_to is None:
            unassigned.append(task.id)
            continue
        if task.start_date is None or task.end_date is None:
            undated.append(task.id)
            continue

        week_units = compute_task_week_units(
            task.start_date, task.end_date, task.estimated_hours
        )
        weeks.update(week_units)
        target = loads.setdefault(task.assigned_to, {})
        for key, units in week_units.items():
            target[key] = target.get(key, 0) + units

    ordered_weeks = tuple(sorted(weeks))
    rows: list[UserLoad] = []
    for user in users:
        base_units = to_units(user.weekly_base_hours)
        user_load = loads.get(user.id, {})
        cells = tuple(
            WeekLoad(
                week=week,
                units=user_load.get(week, 0),
                is_overloaded=user_load.get(week, 0) > base_units,
            )
            for week in ordered_weeks
        )
        rows.append(
            UserLoad(
                user_id=user.id,
                name=user.name,
                weekly_base_hours=from_units(base_units),
                cells=cells,
            )
        )

    return CapacityReport(
        weeks=ordered_weeks,
        rows=tuple(rows),
        unassigned_task_ids=tuple(unassigned),
        undated_task_ids=tuple(undated),
    )
