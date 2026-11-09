"""Panel global: el estado de la organizacion de un vistazo.

Reune lo que ya se sabe, sin reglas nuevas: la utilizacion de la semana de
referencia, quien se pasa de capacidad, como estan repartidos los proyectos y
las tareas, y que proyectos concentran mas trabajo.

Todo sale de la matriz de capacidad y del listado de tareas, de modo que el
panel y la matriz nunca pueden discrepar.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Department, Project, Task
from .capacity import CapacityReport, build_capacity_report
from .capacity_repository import load_capacity_for_projects
from .schedule import current_week_key, week_window
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
class PanelDepartment:
    """Resumen de un departamento: sus proyectos, sus sobrecargas y su uso."""

    id: int
    name: str
    active_projects: int
    overloaded_people: int
    utilization: int | None
    planned_units: int
    capacity_units: int


@dataclass(frozen=True, slots=True)
class PanelWeek:
    """Uso del equipo en una semana del periodo."""

    week: str
    units: int
    capacity_units: int | None
    utilization: int | None


@dataclass(frozen=True, slots=True)
class PanelPending:
    """Tarea que todavia no cuenta en la matriz."""

    id: int
    title: str
    project_id: int
    project_name: str
    problem: str


@dataclass(frozen=True, slots=True)
class PanelProject:
    """Proyecto visible, con el trabajo que concentra."""

    id: int
    name: str
    status: str
    estimated_units: int
    task_count: int
    people_count: int
    department_id: int | None = None


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
    weeks: tuple[PanelWeek, ...] = ()
    pending: tuple[PanelPending, ...] = ()
    by_department: tuple[PanelDepartment, ...] = ()

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
                    "department_id": project.department_id,
                }
                for project in self.projects
            ],
            "total_tasks": self.total_tasks,
            "total_people": self.total_people,
            "weeks": [
                {
                    "week": item.week,
                    "hours": from_units(item.units),
                    "capacity": (
                        from_units(item.capacity_units)
                        if item.capacity_units is not None
                        else None
                    ),
                    "utilization": item.utilization,
                }
                for item in self.weeks
            ],
            "pending": [
                {
                    "id": task.id,
                    "title": task.title,
                    "project_id": task.project_id,
                    "project_name": task.project_name,
                    "problem": task.problem,
                }
                for task in self.pending
            ],
            "by_department": [
                {
                    "id": department.id,
                    "name": department.name,
                    "active_projects": department.active_projects,
                    "overloaded_people": department.overloaded_people,
                    "utilization": department.utilization,
                    "planned_hours": from_units(department.planned_units),
                    "capacity_hours": from_units(department.capacity_units),
                }
                for department in self.by_department
            ],
        }


def utilization_percent(planned_units: int, capacity_units: int) -> int | None:
    """Porcentaje de utilizacion de una semana, redondeado al entero.

    Sin capacidad definida el porcentaje se desconoce: el motor no inventa un
    limite que nadie ha fijado.
    """
    if capacity_units <= 0:
        return None
    return (planned_units * 100 + capacity_units // 2) // capacity_units


def week_usage(report: CapacityReport, week: str | None) -> tuple[int, int]:
    """Horas planificadas y de capacidad de una semana del informe.

    Sin capacidad conocida, la capacidad no cuenta: no se inventa un limite que
    nadie ha fijado, y el porcentaje sale sin publicar.
    """
    planned = 0
    capacity = 0
    for row in report.rows:
        for cell in row.cells:
            if cell.week != week:
                continue
            planned += cell.units
            if cell.capacity_units is not None:
                capacity += cell.capacity_units
    return planned, capacity


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


def team_weeks(report: CapacityReport) -> tuple[PanelWeek, ...]:
    """Uso del equipo en cada semana del periodo.

    Una semana en la que alguien no tiene capacidad conocida no se cuenta como
    capacidad cero: no se sabe, y por eso el porcentaje tampoco se publica.
    """
    rows: list[PanelWeek] = []
    for week in report.weeks:
        units = 0
        capacity = 0
        unknown = False
        for row in report.rows:
            cell = next((item for item in row.cells if item.week == week), None)
            if cell is None:
                continue
            units += cell.units
            if cell.capacity_units is None:
                unknown = True
                continue
            capacity += cell.capacity_units
        rows.append(
            PanelWeek(
                week=week,
                units=units,
                capacity_units=None if unknown else capacity,
                utilization=None if unknown else utilization_percent(units, capacity),
            )
        )
    return tuple(rows)


def pending_tasks(
    report: CapacityReport,
    tasks: Sequence[Task],
    project_names: dict[int, str],
) -> tuple[PanelPending, ...]:
    """Tareas que no cuentan todavia en la matriz.

    Son las que no tienen persona o las que no tienen fechas: el motor las deja
    fuera y aqui se ven, con el motivo, para que la planificacion incompleta no
    pase desapercibida.
    """
    unassigned = set(report.unassigned_task_ids)
    undated = set(report.undated_task_ids)
    entries: list[PanelPending] = []
    for task in tasks:
        if task.id in unassigned:
            problem = "Sin persona"
        elif task.id in undated:
            problem = "Sin fechas"
        else:
            continue
        entries.append(
            PanelPending(
                id=task.id,
                title=task.title,
                project_id=task.project_id,
                project_name=project_names.get(task.project_id, ""),
                problem=problem,
            )
        )
    entries.sort(key=lambda item: (item.project_name.lower(), item.title.lower()))
    return tuple(entries)


def build_panel(
    report: CapacityReport,
    projects: Sequence[Project],
    tasks: Sequence[Task],
    today: date | None = None,
) -> Panel:
    """Monta el panel con la matriz, los proyectos y las tareas."""
    week = reference_week(report.weeks, today)
    current = current_week_key(today)

    planned_units, capacity_units = week_usage(report, week)

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
                department_id=project.department_id,
            )
        )
    panel_projects.sort(key=lambda item: (-item.estimated_units, item.name))

    project_names = {project.id: project.name for project in projects}

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
        weeks=team_weeks(report),
        pending=pending_tasks(report, tasks, project_names),
    )


async def load_department_panels(
    session: AsyncSession,
    projects: Sequence[Project],
    weeks: Sequence[str],
    today: date | None = None,
) -> tuple[PanelDepartment, ...]:
    """Resumen de cada departamento al que llegan los proyectos visibles.

    Cada departamento se mide con su propio subconjunto de proyectos y con el
    mismo calculo que el agregado global: uso del equipo en la semana de
    referencia, quien se pasa de capacidad y proyectos en marcha. Un proyecto
    sin departamento no entra en ningun grupo: no hay contra que medirlo.
    """
    groups: dict[int, list[Project]] = {}
    for project in projects:
        if project.department_id is None:
            continue
        groups.setdefault(project.department_id, []).append(project)
    if not groups:
        return ()

    rows = (
        await session.execute(
            select(Department).where(Department.id.in_(list(groups)))
        )
    ).scalars().all()
    names = {row.id: row.name for row in rows}

    entries: list[PanelDepartment] = []
    for department_id, department_projects in groups.items():
        report = await load_capacity_for_projects(
            session, [project.id for project in department_projects], weeks=weeks
        )
        week = reference_week(report.weeks, today)
        planned, capacity = week_usage(report, week)
        entries.append(
            PanelDepartment(
                id=department_id,
                name=names.get(department_id, ""),
                active_projects=sum(
                    1 for project in department_projects if project.status == "active"
                ),
                overloaded_people=sum(
                    1
                    for row in report.rows
                    if any(cell.is_overloaded for cell in row.cells)
                ),
                utilization=utilization_percent(planned, capacity),
                planned_units=planned,
                capacity_units=capacity,
            )
        )
    entries.sort(key=lambda item: item.name.lower())
    return tuple(entries)


async def load_panel(
    session: AsyncSession,
    projects: Sequence[Project],
    weeks: Sequence[str] | None = None,
    today: date | None = None,
) -> Panel:
    """Panel de la organizacion para los proyectos visibles."""
    window = tuple(weeks) if weeks else week_window(today=today)
    project_ids = [project.id for project in projects]
    if not project_ids:
        return build_panel(build_capacity_report([], [], weeks=window), [], [], today)

    report = await load_capacity_for_projects(
        session, project_ids, weeks=window
    )
    tasks = await list_tasks_for_projects(session, project_ids)
    panel = build_panel(report, projects, tasks, today)
    by_department = await load_department_panels(session, projects, window, today)
    return replace(panel, by_department=by_department)
