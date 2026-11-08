"""Carga y tareas propias de la persona que entra.

La pantalla de Mi trabajo reune lo unico que ve de si mismo: las tareas que
tiene asignadas y las horas que le caen en cada semana del periodo de
planificacion.

El periodo es una ventana continua de semanas que empieza en la actual, de modo
que el grafico se ve igual que en la matriz de capacidad global: las semanas sin
actividad tambien salen, con cero horas.

Las operaciones son puras y trabajan en centimas de hora enteras, igual que el
motor de capacidad.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Project, Task, User
from .capacity import Holiday, PersonCapacity, compute_task_week_units, iso_week_key
from .capacity_repository import load_holidays, load_person_capacities
from .schedule import capacity_units_for_week, current_week_key, week_window
from .tasks import list_tasks_for_projects
from .units import from_units


@dataclass(frozen=True, slots=True)
class MyWorkWeek:
    """Carga propia de una semana del periodo, con sus dias no laborables."""

    week: str
    units: int
    capacity_units: int | None
    holidays: tuple[Holiday, ...] = ()
    capacity_without_units: int | None = None
    """Capacidad de esa semana si no contara los dias no laborables.

    La diferencia con la capacidad real es lo que le quitan los festivos.
    """

    @property
    def is_overloaded(self) -> bool:
        """True si las horas superan la capacidad de esa semana."""
        return self.capacity_units is not None and self.units > self.capacity_units


@dataclass(frozen=True, slots=True)
class MyWorkTask:
    """Tarea propia, con las horas que caen dentro del periodo."""

    id: int
    project_id: int
    project_name: str
    title: str
    status: str
    start_date: date | None
    end_date: date | None
    hours: Decimal
    estimated_hours: Decimal
    weeks: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class MyWork:
    """Tareas propias y carga por semana de una persona."""

    weeks: tuple[MyWorkWeek, ...]
    tasks: tuple[MyWorkTask, ...]
    current_week: str | None = None

    @property
    def total_units(self) -> int:
        return sum(cell.units for cell in self.weeks)

    @property
    def total_hours(self) -> Decimal:
        return from_units(self.total_units)

    @property
    def has_overload(self) -> bool:
        return any(cell.is_overloaded for cell in self.weeks)

    def to_dict(self) -> dict:
        """Representacion del informe. Las horas siguen siendo Decimal."""
        return {
            "weeks": [
                {
                    "week": cell.week,
                    "hours": from_units(cell.units),
                    "capacity": (
                        from_units(cell.capacity_units)
                        if cell.capacity_units is not None
                        else None
                    ),
                    "is_overloaded": cell.is_overloaded,
                    "capacity_without": (
                        from_units(cell.capacity_without_units)
                        if cell.capacity_without_units is not None
                        else None
                    ),
                    "holidays": [
                        {
                            "date": holiday.date.isoformat(),
                            "name": holiday.name,
                            "scope": holiday.scope,
                            "half_day": holiday.half_day,
                        }
                        for holiday in cell.holidays
                    ],
                }
                for cell in self.weeks
            ],
            "tasks": [
                {
                    "id": task.id,
                    "project_id": task.project_id,
                    "project_name": task.project_name,
                    "title": task.title,
                    "status": task.status,
                    "start_date": task.start_date,
                    "end_date": task.end_date,
                    "hours": task.hours,
                    "estimated_hours": task.estimated_hours,
                    "weeks": list(task.weeks),
                }
                for task in self.tasks
            ],
            "total_hours": self.total_hours,
            "has_overload": self.has_overload,
            "current_week": self.current_week,
        }


def reference_week(weeks: Sequence[str], today: date | None = None) -> str | None:
    """Semana de referencia de la pantalla: la actual si esta en el periodo.

    Si la semana en curso no cae en el periodo, se toma la primera: la pantalla
    siempre muestra una semana con datos.
    """
    if not weeks:
        return None
    current = current_week_key(today)
    if current in weeks:
        return current
    return weeks[0]


def build_my_work(
    person: PersonCapacity,
    tasks: Sequence[Task],
    project_names: Mapping[int, str],
    weeks: Sequence[str],
    holidays: Sequence[Holiday] = (),
    today: date | None = None,
) -> MyWork:
    """Carga por semana y tareas propias de una persona.

    Solo entran las tareas con fechas que tocan alguna semana del periodo. Las
    horas de cada tarea son las que caen dentro del periodo, que no tienen por
    que ser las horas estimadas enteras: una tarea puede empezar antes o
    terminar despues.
    """
    loads: dict[str, int] = {week: 0 for week in weeks}
    entries: list[MyWorkTask] = []

    for task in tasks:
        if task.assigned_to != person.user_id:
            continue
        if task.start_date is None or task.end_date is None:
            continue

        week_units = compute_task_week_units(
            task.start_date, task.end_date, task.estimated_hours, person.holidays
        )
        inside = {week: units for week, units in week_units.items() if week in loads}
        if not inside:
            continue

        for week, units in inside.items():
            loads[week] += units

        entries.append(
            MyWorkTask(
                id=task.id,
                project_id=task.project_id,
                project_name=project_names.get(task.project_id, ""),
                title=task.title,
                status=task.status,
                start_date=task.start_date,
                end_date=task.end_date,
                hours=from_units(sum(inside.values())),
                estimated_hours=task.estimated_hours,
                weeks=tuple(sorted(inside)),
            )
        )

    holidays_by_week: dict[str, list[Holiday]] = {}
    for holiday in holidays:
        holidays_by_week.setdefault(iso_week_key(holiday.date), []).append(holiday)

    cells: list[MyWorkWeek] = []
    for week in weeks:
        capacity = capacity_units_for_week(
            person.schedules, person.weekly_base_hours, week, person.holidays
        )
        capacity_without = capacity_units_for_week(
            person.schedules, person.weekly_base_hours, week, {}
        )
        cells.append(
            MyWorkWeek(
                week=week,
                units=loads[week],
                capacity_units=capacity,
                holidays=tuple(
                    holidays_by_week.get(week, ()),
                ),
                capacity_without_units=capacity_without,
            )
        )

    return MyWork(
        weeks=tuple(cells),
        tasks=tuple(entries),
        current_week=reference_week(weeks, today),
    )


async def load_my_work(
    session: AsyncSession,
    user: User,
    projects: Sequence[Project],
    weeks: Sequence[str] | None = None,
    today: date | None = None,
) -> MyWork:
    """Informe de Mi trabajo para la persona que entra.

    Las semanas son las del periodo pedido. Sin periodo se usa la ventana por
    defecto: la semana actual y las ocho siguientes.
    """
    window = tuple(weeks) if weeks else ()
    if not window:
        window = week_window(today=today)

    project_ids = [project.id for project in projects]
    project_names = {project.id: project.name for project in projects}
    tasks = await list_tasks_for_projects(session, project_ids, assigned_to=user.id)
    people = await load_person_capacities(session, [user])
    person = people[0] if people else PersonCapacity(
        user_id=user.id,
        name=user.name,
        weekly_base_hours=user.weekly_base_hours,
    )
    _, global_days = await load_holidays(session)

    return build_my_work(person, tasks, project_names, window, global_days, today)
