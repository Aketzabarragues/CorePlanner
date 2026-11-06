"""Carga y tareas propias de la persona que entra.

La pantalla de Mi trabajo reune lo unico que ve de si mismo: las tareas que
tiene asignadas y las horas que le caen en cada semana del periodo de
planificacion.

El periodo es el mismo que muestra la matriz de capacidad global: las semanas
en las que hay actividad en los proyectos visibles. Asi las dos vistas hablan
del mismo periodo y no hay que elegir entre ellas.

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
from .capacity import PersonCapacity, WeekLoad, compute_task_week_units
from .capacity_repository import load_capacity_for_projects, load_person_capacities
from .schedule import capacity_units_for_week
from .tasks import list_tasks_for_projects
from .units import from_units


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


@dataclass(frozen=True, slots=True)
class MyWork:
    """Tareas propias y carga por semana de una persona."""

    weeks: tuple[WeekLoad, ...]
    tasks: tuple[MyWorkTask, ...]

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
                    "hours": cell.hours,
                    "capacity": cell.capacity,
                    "is_overloaded": cell.is_overloaded,
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
                }
                for task in self.tasks
            ],
            "total_hours": self.total_hours,
            "has_overload": self.has_overload,
        }


def build_my_work(
    person: PersonCapacity,
    tasks: Sequence[Task],
    project_names: Mapping[int, str],
    weeks: Sequence[str],
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
            )
        )

    cells: list[WeekLoad] = []
    for week in weeks:
        units = loads[week]
        capacity = capacity_units_for_week(
            person.schedules, person.weekly_base_hours, week, person.holidays
        )
        cells.append(
            WeekLoad(
                week=week,
                units=units,
                capacity_units=capacity,
                is_overloaded=capacity is not None and units > capacity,
            )
        )

    return MyWork(weeks=tuple(cells), tasks=tuple(entries))


async def load_my_work(
    session: AsyncSession,
    user: User,
    projects: Sequence[Project],
) -> MyWork:
    """Informe de Mi trabajo para la persona que entra.

    El periodo sale de la matriz de capacidad de los proyectos visibles, de
    modo que coincide con el que ve en la vista global.
    """
    project_ids = [project.id for project in projects]
    if not project_ids:
        return MyWork(weeks=(), tasks=())

    project_names = {project.id: project.name for project in projects}
    report = await load_capacity_for_projects(session, project_ids)
    tasks = await list_tasks_for_projects(session, project_ids, assigned_to=user.id)
    people = await load_person_capacities(session, [user])
    person = people[0] if people else PersonCapacity(
        user_id=user.id,
        name=user.name,
        weekly_base_hours=user.weekly_base_hours,
    )

    return build_my_work(person, tasks, project_names, report.weeks)
