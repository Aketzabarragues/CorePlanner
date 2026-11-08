"""Motor de calculo de capacidad por semanas ISO.

Reparte las horas estimadas de cada tarea entre los dias laborables que
abarca y las imputa a la semana ISO correspondiente de cada persona. La
capacidad de la semana sale del horario vigente de la persona.

Las operaciones son puras: no hay acceso a base de datos ni estado global.
La aritmetica trabaja en centimas de hora enteras, de modo que el total del
informe coincide exactamente con la suma de las tareas y el resultado no
depende del orden de las sumas. Cada tarea se cuantiza a centimas al
entrar, con un desvio maximo de 0,005 h por tarea.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Protocol

from .schedule import FULL_DAY, ScheduleVersion, capacity_units_for_week
from .units import from_units, hours_to_json, to_units

__all__ = [
    "CapacityError",
    "CapacityReport",
    "CellProject",
    "Holiday",
    "InvalidEstimatedHoursError",
    "InvalidTaskRangeError",
    "InvalidWeekRangeError",
    "NoBusinessDaysError",
    "PersonCapacity",
    "TaskLike",
    "UserLoad",
    "WeekLoad",
    "build_capacity_report",
    "business_days",
    "compute_task_week_load",
    "compute_task_week_units",
    "from_units",
    "hours_to_json",
    "iso_week_key",
    "split_units",
    "split_weighted_units",
    "to_units",
    "week_range",
    "weeks_in_range",
    "working_days",
]


class CapacityError(Exception):
    """Error de calculo de capacidad."""


class InvalidTaskRangeError(CapacityError):
    """El rango de fechas de la tarea es incoherente."""


class NoBusinessDaysError(CapacityError):
    """El rango de fechas no contiene ningun dia laborable."""


class InvalidEstimatedHoursError(CapacityError):
    """Las horas estimadas de la tarea no son validas."""


class InvalidWeekRangeError(CapacityError):
    """El rango de semanas del informe no es valido."""


@dataclass(frozen=True, slots=True)
class Holiday:
    """Dia no laborable, con su nombre.

    Los que llegan al informe son los de alcance global: son los unicos que
    se pueden marcar en la cabecera de una semana, porque afectan a toda la
    columna y no solo a una persona.
    """

    date: date
    name: str
    scope: str = "global"
    half_day: bool = False


class TaskLike(Protocol):
    """Datos de tarea que intervienen en el calculo."""

    id: int
    assigned_to: int | None
    start_date: date | None
    end_date: date | None
    estimated_hours: Decimal
    project_id: int | None


@dataclass(frozen=True, slots=True)
class CellProject:
    """Proyecto del que salen las horas de una celda.

    El desglose sale del mismo reparto que da las horas de la celda, de modo
    que los proyectos siempre suman las horas de la celda.
    """

    project_id: int
    units: int

    @property
    def hours(self) -> Decimal:
        return from_units(self.units)


@dataclass(frozen=True, slots=True)
class PersonCapacity:
    """Perfil de capacidad de una persona.

    Los dias no laborables que se apliquen se expresan como un mapa de fecha a
    peso, con el peso en medios dias: 2 es un dia laborable completo, 1 un
    festivo de medio dia y 0 un festivo de jornada entera.
    """

    user_id: int
    name: str
    weekly_base_hours: Decimal | None = None
    schedules: tuple[ScheduleVersion, ...] = ()
    holidays: Mapping[date, int] = field(default_factory=dict)
    department_id: int | None = None
    job_title: str | None = None
    project_ids: tuple[int, ...] = ()


@dataclass(frozen=True, slots=True)
class WeekLoad:
    """Carga de una persona en una semana ISO.

    Las horas se guardan en centimas enteras y se exponen como Decimal, de
    modo que la aritmetica no pasa por coma flotante. La capacidad es None
    cuando la persona no tiene ninguna definida.
    Los proyectos son el desglose de esas horas por proyecto.
    """

    week: str
    units: int
    capacity_units: int | None
    is_overloaded: bool
    projects: tuple[CellProject, ...] = ()

    @property
    def hours(self) -> Decimal:
        return from_units(self.units)

    @property
    def capacity(self) -> Decimal | None:
        if self.capacity_units is None:
            return None
        return from_units(self.capacity_units)


@dataclass(frozen=True, slots=True)
class UserLoad:
    """Carga de una persona en el conjunto de semanas del informe."""

    user_id: int
    name: str
    weekly_base_hours: Decimal | None
    cells: tuple[WeekLoad, ...]
    department_id: int | None = None
    job_title: str | None = None
    project_ids: tuple[int, ...] = ()

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
    holiday_task_ids: tuple[int, ...] = ()
    holidays: tuple[Holiday, ...] = ()

    def to_dict(self) -> dict:
        return {
            "weeks": [
                {
                    "week": week,
                    "holidays": [
                        {
                            "date": holiday.date.isoformat(),
                            "name": holiday.name,
                            "scope": holiday.scope,
                            "half_day": holiday.half_day,
                        }
                        for holiday in self.holidays
                        if iso_week_key(holiday.date) == week
                    ],
                }
                for week in self.weeks
            ],
            "rows": [
                {
                    "user_id": row.user_id,
                    "name": row.name,
                    "weekly_base_hours": (
                        hours_to_json(row.weekly_base_hours)
                        if row.weekly_base_hours is not None
                        else None
                    ),
                    "total_hours": hours_to_json(row.total_hours),
                    "has_overload": row.has_overload,
                    "department_id": row.department_id,
                    "job_title": row.job_title,
                    "project_ids": list(row.project_ids),
                    "cells": [
                        {
                            "week": cell.week,
                            "hours": hours_to_json(cell.hours),
                            "capacity": (
                                hours_to_json(cell.capacity)
                                if cell.capacity is not None
                                else None
                            ),
                            "is_overloaded": cell.is_overloaded,
                            "projects": [
                                {
                                    "project_id": project.project_id,
                                    "hours": hours_to_json(project.hours),
                                }
                                for project in cell.projects
                            ],
                        }
                        for cell in row.cells
                    ],
                }
                for row in self.rows
            ],
            "unassigned_task_ids": list(self.unassigned_task_ids),
            "undated_task_ids": list(self.undated_task_ids),
            "holiday_task_ids": list(self.holiday_task_ids),
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


def working_days(
    start: date,
    end: date,
    holidays: Mapping[date, int] | None = None,
) -> list[tuple[date, int]]:
    """Dias laborables del rango con su peso, en medios dias.

    Los sabados y domingos no cuentan. Los dias no laborables que apliquen
    pesan la mitad o no pesan nada, segun sean de medio dia o de jornada
    entera.
    """
    weights = holidays or {}
    days: list[tuple[date, int]] = []
    for day in business_days(start, end):
        weight = weights.get(day, FULL_DAY)
        if weight > 0:
            days.append((day, weight))
    return days


def iso_week_key(day: date) -> str:
    """Clave de semana ISO en formato YYYY-Www.

    El año es el año ISO, que puede no coincidir con el del calendario:
    el 31 de diciembre de 2026 pertenece a 2026-W53.
    """
    iso = day.isocalendar()
    return f"{iso[0]:04d}-W{iso[1]:02d}"


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


def split_weighted_units(total_units: int, weights: Sequence[int]) -> list[int]:
    """Reparte las centimas entre los dias en proporcion a su peso.

    Un dia de medio dia recibe la mitad de horas que uno de jornada
    completa. El sobrante se reparte entre los primeros dias, de modo que la
    suma de las partes coincide exactamente con el total.
    """
    total_weight = sum(weights)
    if total_weight <= 0:
        raise NoBusinessDaysError("La tarea no tiene dias laborables que repartir")
    parts: list[int] = []
    assigned = 0
    for weight in weights:
        part = (total_units * weight) // total_weight
        parts.append(part)
        assigned += part
    leftover = total_units - assigned
    for index in range(len(parts)):
        if leftover <= 0:
            break
        parts[index] += 1
        leftover -= 1
    return parts


def compute_task_week_units(
    start_date: date,
    end_date: date,
    estimated_hours: Decimal | float | int,
    holidays: Mapping[date, int] | None = None,
) -> dict[str, int]:
    """Carga de una tarea por semana ISO, en centimas de hora.

    Si el rango no deja ningun dia laborable **de la persona** -porque lo
    cubren enteramente sus dias no laborables- la tarea no se imputa y el
    reparto sale vacio. Un informe no se rompe por una sola tarea: quien lo
    llama decide como avisar.

    Lanza InvalidTaskRangeError si el rango esta invertido e
    InvalidEstimatedHoursError si las horas estimadas son negativas.
    """
    if estimated_hours < 0:
        raise InvalidEstimatedHoursError(
            f"Las horas estimadas no pueden ser negativas: {estimated_hours}"
        )
    days = working_days(start_date, end_date, holidays)
    if not days:
        return {}

    units_per_day = split_weighted_units(
        to_units(estimated_hours), [weight for _, weight in days]
    )
    totals: dict[str, int] = {}
    for (day, _), units in zip(days, units_per_day, strict=True):
        key = iso_week_key(day)
        totals[key] = totals.get(key, 0) + units
    return totals


def compute_task_week_load(
    start_date: date,
    end_date: date,
    estimated_hours: Decimal | float | int,
    holidays: Mapping[date, int] | None = None,
) -> dict[str, Decimal]:
    """Horas estimadas de una tarea por semana ISO."""
    return {
        key: from_units(units)
        for key, units in compute_task_week_units(
            start_date, end_date, estimated_hours, holidays
        ).items()
    }


def _monday_of(key: str) -> date:
    """Lunes de la semana ISO con clave YYYY-Www."""
    year, _, week = key.partition("-W")
    try:
        return date.fromisocalendar(int(year), int(week), 1)
    except ValueError as err:
        raise InvalidWeekRangeError(f"La semana {key} no existe") from err


def weeks_in_range(start: str, end: str) -> tuple[str, ...]:
    """Semanas del rango, la primera y la ultima incluidas.

    El rango es continuo: sale una semana por cada semana ISO entre las dos,
    tengan actividad o no. Si el rango esta invertido, es un error.
    """
    first = _monday_of(start)
    last = _monday_of(end)
    if last < first:
        raise InvalidWeekRangeError(
            f"El rango {start}..{end} esta invertido"
        )
    weeks: list[str] = []
    current = first
    while current <= last:
        weeks.append(iso_week_key(current))
        current += timedelta(days=7)
    return tuple(weeks)


def week_range(start: str | None, end: str | None) -> tuple[str, ...] | None:
    """Rango de semanas pedido, o None si no se pide ninguno.

    Las dos van juntas: un rango a medias no significa nada.
    """
    if start is None and end is None:
        return None
    if start is None or end is None:
        raise InvalidWeekRangeError("from y to tienen que venir juntos")
    return weeks_in_range(start, end)


def build_capacity_report(
    people: Sequence[PersonCapacity],
    tasks: Iterable[TaskLike],
    *,
    weeks: Sequence[str] | None = None,
    holidays: Sequence[Holiday] = (),
) -> CapacityReport:
    """Construye la matriz de ocupacion a partir de personas y tareas.

    Sin weeks, las semanas del informe son la union de las semanas con
    actividad. Con weeks, el eje es ese rango y sale completo: las semanas sin
    actividad tambien aparecen, con cero horas, para que se vea el hueco.
    Las tareas que caen fuera del rango no se imputan.
    Las tareas sin persona asignada o sin fechas no se imputan a ninguna
    fila, pero se listan para que la planificacion incompleta sea visible.
    Lo mismo ocurre con las tareas cuyo rango lo cubren enteramente los dias
    no laborables de su persona: valen cero horas y se listan aparte.
    La capacidad de cada celda sale del horario vigente de la persona en esa
    semana.
    """
    by_id = {person.user_id: person for person in people}
    loads: dict[int, dict[str, int]] = {person.user_id: {} for person in people}
    project_loads: dict[tuple[int, str], dict[int, int]] = {}
    weeks_seen: set[str] = set()
    fixed_weeks = tuple(weeks) if weeks is not None else None
    unassigned: list[int] = []
    undated: list[int] = []
    holidays_only: list[int] = []
    for task in tasks:
        if task.assigned_to is None:
            unassigned.append(task.id)
            continue
        if task.start_date is None or task.end_date is None:
            undated.append(task.id)
            continue

        person = by_id.get(task.assigned_to)
        holidays_map = person.holidays if person is not None else {}
        week_units = compute_task_week_units(
            task.start_date, task.end_date, task.estimated_hours, holidays_map
        )
        if not week_units:
            # A la persona no le queda ningun dia laborable en el rango: la
            # tarea vale cero horas, pero se avisa en vez de romper el informe.
            holidays_only.append(task.id)
            continue
        if fixed_weeks is not None:
            week_units = {
                key: units for key, units in week_units.items() if key in fixed_weeks
            }
            if not week_units:
                # La tarea cae fuera del rango pedido: no se enseña.
                continue
        weeks_seen.update(week_units)
        target = loads.setdefault(task.assigned_to, {})
        project_id = getattr(task, "project_id", None)
        for key, units in week_units.items():
            target[key] = target.get(key, 0) + units
            if project_id is None:
                continue
            by_project = project_loads.setdefault((task.assigned_to, key), {})
            by_project[project_id] = by_project.get(project_id, 0) + units

    ordered_weeks = fixed_weeks if fixed_weeks is not None else tuple(sorted(weeks_seen))
    rows: list[UserLoad] = []
    for person in people:
        user_load = loads.get(person.user_id, {})
        cells: list[WeekLoad] = []
        for week in ordered_weeks:
            units = user_load.get(week, 0)
            capacity = capacity_units_for_week(
                person.schedules,
                person.weekly_base_hours,
                week,
                person.holidays,
            )
            by_project = project_loads.get((person.user_id, week), {})
            cells.append(
                WeekLoad(
                    week=week,
                    units=units,
                    capacity_units=capacity,
                    is_overloaded=capacity is not None and units > capacity,
                    projects=tuple(
                        CellProject(project_id=project_id, units=project_units)
                        for project_id, project_units in sorted(by_project.items())
                    ),
                )
            )
        rows.append(
            UserLoad(
                user_id=person.user_id,
                name=person.name,
                weekly_base_hours=person.weekly_base_hours,
                cells=tuple(cells),
                department_id=person.department_id,
                job_title=person.job_title,
                project_ids=person.project_ids,
            )
        )

    return CapacityReport(
        weeks=ordered_weeks,
        rows=tuple(rows),
        unassigned_task_ids=tuple(unassigned),
        undated_task_ids=tuple(undated),
        holiday_task_ids=tuple(holidays_only),
        holidays=tuple(holidays),
    )
