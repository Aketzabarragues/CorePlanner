"""Resumen de cada proyecto visible: equipo, avance de tareas y carga de la semana.

El reparto de horas y la comparacion con la capacidad son los del motor de
capacidad, el mismo que alimenta la matriz y el panel. Aqui no se recalcula
nada: solo se agrupa lo que el motor ya sabe por proyecto.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Project, ProjectMember, Task, TaskStatus, User
from .capacity import CapacityReport
from .capacity_repository import load_capacity_for_projects
from .panel import utilization_percent
from .schedule import current_week_key
from .tasks import list_tasks_for_projects


@dataclass(frozen=True, slots=True)
class SummaryMember:
    """Persona del equipo del proyecto."""

    user_id: int
    name: str


@dataclass(frozen=True, slots=True)
class SummaryLoad:
    """Carga del proyecto en una semana, frente a la capacidad de su equipo.

    Las horas van en centimas enteras, igual que en el motor. La capacidad es
    la suma de la de las personas que trabajan en el proyecto esa semana: cada
    una aporta la suya completa, como ya hace el desglose por departamento del
    panel.
    """

    week: str
    planned_units: int
    capacity_units: int
    utilization: int | None

    @property
    def overloaded(self) -> bool:
        """La carga del proyecto supera la capacidad de su equipo.

        La comparacion es exacta, como la de las celdas del motor: el
        porcentaje es la cifra que se enseña, no la que decide. Sin capacidad
        conocida no se puede afirmar nada.
        """
        return self.capacity_units > 0 and self.planned_units > self.capacity_units


@dataclass(frozen=True, slots=True)
class ProjectSummary:
    """Lo que el listado global de proyectos enseña de cada proyecto."""

    id: int
    members: tuple[SummaryMember, ...]
    tasks_total: int
    tasks_done: int
    load: SummaryLoad


async def _members_by_project(
    session: AsyncSession, project_ids: Sequence[int]
) -> dict[int, tuple[SummaryMember, ...]]:
    """Equipo de cada proyecto, ordenado por nombre."""
    rows = (
        await session.execute(
            select(ProjectMember.project_id, User.id, User.name)
            .join(User, User.id == ProjectMember.user_id)
            .where(ProjectMember.project_id.in_(project_ids))
        )
    ).all()

    grouped: dict[int, list[SummaryMember]] = {}
    for project_id, user_id, name in rows:
        grouped.setdefault(project_id, []).append(
            SummaryMember(user_id=user_id, name=name)
        )
    return {
        project_id: tuple(sorted(members, key=lambda item: item.name.lower()))
        for project_id, members in grouped.items()
    }


def _task_counts(tasks: Sequence[Task]) -> dict[int, tuple[int, int]]:
    """Tareas totales y completadas de cada proyecto."""
    counts: dict[int, list[int]] = {}
    for task in tasks:
        if task.project_id is None:
            continue
        entry = counts.setdefault(task.project_id, [0, 0])
        entry[0] += 1
        if task.status == TaskStatus.DONE.value:
            entry[1] += 1
    return {project_id: (total, done) for project_id, (total, done) in counts.items()}


def _loads_by_project(report: CapacityReport, week: str) -> dict[int, SummaryLoad]:
    """Carga de cada proyecto en la semana, con la capacidad de su equipo.

    Las horas salen del desglose por proyecto que el motor deja en cada celda:
    los proyectos de una celda siempre suman las horas de esa celda. Solo
    cuentan las personas que tienen horas en el proyecto esa semana.
    """
    planned: dict[int, int] = {}
    capacity: dict[int, int] = {}

    for row in report.rows:
        for cell in row.cells:
            if cell.week != week:
                continue
            for piece in cell.projects:
                planned[piece.project_id] = (
                    planned.get(piece.project_id, 0) + piece.units
                )
                if cell.capacity_units is not None:
                    capacity[piece.project_id] = (
                        capacity.get(piece.project_id, 0) + cell.capacity_units
                    )

    loads: dict[int, SummaryLoad] = {}
    for project_id, units in planned.items():
        team_capacity = capacity.get(project_id, 0)
        loads[project_id] = SummaryLoad(
            week=week,
            planned_units=units,
            capacity_units=team_capacity,
            utilization=utilization_percent(units, team_capacity),
        )
    return loads


async def load_project_summaries(
    session: AsyncSession,
    projects: Sequence[Project],
    week: str | None = None,
) -> tuple[ProjectSummary, ...]:
    """Resumen de los proyectos dados, con la carga de una semana.

    La semana es la actual si no se indica otra. El ambito no se decide aqui:
    quien llama pasa los proyectos que ya son visibles y aqui solo se resumen.
    """
    if not projects:
        return ()

    target_week = week or current_week_key()
    project_ids = [project.id for project in projects]

    members = await _members_by_project(session, project_ids)
    tasks = await list_tasks_for_projects(session, project_ids)
    report = await load_capacity_for_projects(
        session, project_ids, weeks=[target_week]
    )

    counts = _task_counts(tasks)
    loads = _loads_by_project(report, target_week)

    return tuple(
        ProjectSummary(
            id=project.id,
            members=members.get(project.id, ()),
            tasks_total=counts.get(project.id, (0, 0))[0],
            tasks_done=counts.get(project.id, (0, 0))[1],
            load=loads.get(
                project.id,
                SummaryLoad(
                    week=target_week,
                    planned_units=0,
                    capacity_units=0,
                    utilization=None,
                ),
            ),
        )
        for project in projects
    )
