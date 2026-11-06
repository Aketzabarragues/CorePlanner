"""Panel global: el estado de la organizacion de un vistazo.

Reune lo que ya se sabe, sin reglas nuevas: la utilizacion de la semana de
referencia, quien se pasa de capacidad, como estan repartidos los proyectos y
las tareas, y que proyectos concentran mas trabajo.

Todo sale de la matriz de capacidad y del listado de tareas, de modo que el
panel y la matriz nunca pueden discrepar.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Project, Task
from .capacity import CapacityReport, build_capacity_report
from .capacity_repository import load_capacity_for_projects
from .schedule import current_week_key
from .tasks import list_tasks_for_projects
from .units import from_units, to_units


@dataclass(frozen=True, slots=True)
class PanelOverload:
    """Persona que supera su capacidad en una semana."""

    user_id: int
    name: str
    week: str
    units: int
    capacity_units: int


@dataclass(frozen=True, slots=True)
class PanelProject:
    """Proyecto visible, con el trabajo que concentra."""

    id: int
    name: str
    status: str
    estimated_units: int
    task_count: int
    people_count: int


@dataclass(frozen=True, slots=True)
class Panel:
    """Resumen de la organizacion."""

    week: str | None
    is_current_week: bool
    planned_units: int
    capacity_units: int
    utilization: int | None
    overloaded: tuple[PanelOverload, ...]
    projects_by_status: dict[str, int]
    tasks_by_status: dict[str, int]
    projects: tuple[PanelProject, ...]
    total_tasks: int
    total_people: int

    def to_dict(self) -> dict:
        """Representacion del panel. Las horas siguen siendo Decimal."""
        return {
            "week": self.week,
            "is_current_week": self.is_current_week,
            "planned_hours": from_units(self.planned_units),
            "capacity_hours": from_units(self.capacity_units),
            "utilization": self.utilization,
            "overloaded": [
                {
                    "user_id": item.user_id,
                    "name": item.name,
                    "week": item.week,
                    "hours": from_units(item.units),
                    "capacity": from_units(item.capacity_units),
                    "excess_hours": from_units(item.units - item.capacity_units),
                }
                for item in self.overloaded
            ],
            "projects_by_status": dict(self.projects_by_status),
            "tasks_by_status": dict(self.tasks_by_status),
            "projects": [
                {
                    "id": project.id,
                    "name": project.name,
                    "status": project.status,
                    "estimated_hours": from_units(project.estimated_units),
                    "task_count": project.task_count,
                    "people_count": project.people_count,
                }
                for project in self.projects
            ],
            "total_tasks": self.total_tasks,
            "total_people": self.total_people,
        }


def utilization_percent(planned_units: int, capacity_units: int) -> int | None:
    """Porcentaje de utilizacion de una semana, redondeado al entero.

    Sin capacidad definida el porcentaje se desconoce: el motor no inventa un
    limite que nadie ha fijado.
    """
    if capacity_units <= 0:
        return None
    return (planned_units * 100 + capacity_units // 2) // capacity_units


def reference_week(weeks: Sequence[str], today: date | None = None) -> str | None:
    """Semana de referencia del panel.

    Es la semana en curso si hay actividad en ella y, si no, la primera del
    periodo: el panel siempre muestra una semana con datos.
    """
    if not weeks:
        return None
    current = current_week_key(today)
    if current in weeks:
        return current
    return weeks[0]


def build_panel(
    report: CapacityReport,
    projects: Sequence[Project],
    tasks: Sequence[Task],
    today: date | None = None,
) -> Panel:
    """Monta el panel con la matriz, los proyectos y las tareas."""
    week = reference_week(report.weeks, today)
    current = current_week_key(today)

    planned_units = 0
    capacity_units = 0
    for row in report.rows:
        for cell in row.cells:
            if cell.week != week:
                continue
            planned_units += cell.units
            if cell.capacity_units is not None:
                capacity_units += cell.capacity_units

    overloaded: list[PanelOverload] = []
    for row in report.rows:
        for cell in row.cells:
            if not cell.is_overloaded:
                continue
            overloaded.append(
                PanelOverload(
                    user_id=row.user_id,
                    name=row.name,
                    week=cell.week,
                    units=cell.units,
                    capacity_units=cell.capacity_units or 0,
                )
            )
    overloaded.sort(key=lambda item: (-(item.units - item.capacity_units), item.name))

    projects_by_status: dict[str, int] = {}
    for project in projects:
        projects_by_status[project.status] = projects_by_status.get(project.status, 0) + 1

    tasks_by_status: dict[str, int] = {}
    for task in tasks:
        tasks_by_status[task.status] = tasks_by_status.get(task.status, 0) + 1

    tasks_by_project: dict[int, list[Task]] = {}
    for task in tasks:
        tasks_by_project.setdefault(task.project_id, []).append(task)

    panel_projects: list[PanelProject] = []
    for project in projects:
        project_tasks = tasks_by_project.get(project.id, [])
        people = {
            task.assigned_to for task in project_tasks if task.assigned_to is not None
        }
        panel_projects.append(
            PanelProject(
                id=project.id,
                name=project.name,
                status=project.status,
                estimated_units=sum(
                    to_units(task.estimated_hours) for task in project_tasks
                ),
                task_count=len(project_tasks),
                people_count=len(people),
            )
        )
    panel_projects.sort(key=lambda item: (-item.estimated_units, item.name))

    return Panel(
        week=week,
        is_current_week=week is not None and week == current,
        planned_units=planned_units,
        capacity_units=capacity_units,
        utilization=utilization_percent(planned_units, capacity_units),
        overloaded=tuple(overloaded),
        projects_by_status=projects_by_status,
        tasks_by_status=tasks_by_status,
        projects=tuple(panel_projects),
        total_tasks=len(tasks),
        total_people=len(report.rows),
    )


async def load_panel(
    session: AsyncSession,
    projects: Sequence[Project],
) -> Panel:
    """Panel de la organizacion para los proyectos visibles."""
    project_ids = [project.id for project in projects]
    if not project_ids:
        return build_panel(build_capacity_report([], []), [], [])

    report = await load_capacity_for_projects(session, project_ids)
    tasks = await list_tasks_for_projects(session, project_ids)
    return build_panel(report, projects, tasks)
