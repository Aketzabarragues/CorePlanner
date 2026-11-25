"""Feed del diagrama de Gantt.

Traduce las tareas de un proyecto al formato que consume la libreria de
Gantt del frontend: una barra por tarea, con la persona asignada en la
etiqueta y en una clase que permite pintar cada barra con su color.

El color se asigna por la posicion de cada persona en la lista ordenada por
nombre, la misma que usa la matriz de capacidad, de modo que una persona
conserva su color en las dos vistas. El color del proyecto no se calcula aqui:
llega guardado en la base de datos, junto al nombre.

Las tareas sin fechas no tienen sitio en el diagrama, asi que se listan
aparte en vez de aparecer en blanco.

Cada barra guarda el proyecto al que pertenece. En el diagrama de un solo
proyecto el dato es el mismo para todas las barras; en el diagrama global
permite agruparlas por proyecto.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Protocol

from .task_dependencies import critical_path, find_violations
from .task_statuses import default_progress

PERSONA_CLASSES = (
    "persona-0",
    "persona-1",
    "persona-2",
    "persona-3",
    "persona-4",
    "persona-5",
)
"""Clases CSS de la paleta. El indice de cada persona elige su color."""

DEFAULT_PROJECT_COLOR = "#57606a"
"""Color de una barra cuyo proyecto no tiene color guardado."""


class TaskLike(Protocol):
    id: int
    title: str
    status: str
    start_date: date | None
    end_date: date | None
    assigned_to: int | None
    project_id: int
    estimated_hours: Decimal


class UserLike(Protocol):
    id: int
    name: str


@dataclass(frozen=True, slots=True)
class GanttMember:
    """Persona con su color asignado en el diagrama."""

    user_id: int
    name: str
    css_class: str

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "name": self.name,
            "css_class": self.css_class,
        }


@dataclass(frozen=True, slots=True)
class GanttDependency:
    """Vinculo entre dos barras del diagrama, para dibujar la flecha."""

    task_id: int
    depends_on_id: int
    type: str

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "depends_on_id": self.depends_on_id,
            "type": self.type,
        }


@dataclass(frozen=True, slots=True)
class GanttTask:
    """Tara traducida al formato de la libreria de Gantt."""

    id: int
    name: str
    start: date
    end: date
    progress: int
    dependencies: str
    custom_class: str
    project_color: str
    project_id: int
    project_name: str
    title: str = ""
    assigned_to: int | None = None
    assigned_name: str | None = None
    status: str = ""
    estimated_hours: Decimal = Decimal("0")
    is_provisional: bool = False
    violations: tuple[int, ...] = ()
    """Requisitos que la barra empieza antes de que terminen: el vinculo esta
    roto y el diagrama lo marca."""
    in_critical_path: bool = False
    """La barra esta en la ruta critica de su proyecto: la cadena mas larga
    de precedencias, medida en dias de calendario."""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "progress": self.progress,
            "dependencies": self.dependencies,
            "custom_class": self.custom_class,
            "project_color": self.project_color,
            "project_id": self.project_id,
            "project_name": self.project_name,
            "is_provisional": self.is_provisional,
            "title": self.title,
            "assigned_to": self.assigned_to,
            "assigned_name": self.assigned_name,
            "status": self.status,
            "estimated_hours": self.estimated_hours,
            "violations": list(self.violations),
            "in_critical_path": self.in_critical_path,
        }


@dataclass(frozen=True, slots=True)
class GanttFeed:
    """Contenido del diagrama: barras, colores, vinculos y tareas fuera."""

    tasks: tuple[GanttTask, ...]
    members: tuple[GanttMember, ...]
    undated_task_ids: tuple[int, ...] = ()
    unassigned_task_ids: tuple[int, ...] = ()
    dependencies: tuple[GanttDependency, ...] = ()

    def to_dict(self) -> dict:
        return {
            "tasks": [task.to_dict() for task in self.tasks],
            "members": [member.to_dict() for member in self.members],
            "undated_task_ids": list(self.undated_task_ids),
            "unassigned_task_ids": list(self.unassigned_task_ids),
            "dependencies": [dep.to_dict() for dep in self.dependencies],
        }


def _tareas_de_ruta_critica(
    task_by_id: Mapping[int, TaskLike],
    edges: Sequence[tuple[int, int, str]],
) -> set[int]:
    """Identificadores de las barras que van en la ruta critica.

    Las dependencias son dentro del mismo proyecto, asi que la ruta critica
    se calcula por proyecto y la marca del feed es la union de las cadenas:
    en el diagrama de un solo proyecto es esa misma cadena, y en el global
    cada proyecto marca la suya. Un proyecto sin vinculos precedes no tiene
    ruta critica y ninguna de sus barras se marca.
    """
    project_by_task = {task.id: task.project_id for task in task_by_id.values()}
    edges_by_project: dict[int, list[tuple[int, int, str]]] = {}
    for edge in edges:
        project_id = project_by_task.get(edge[0])
        if project_id is not None:
            edges_by_project.setdefault(project_id, []).append(edge)

    critical_ids: set[int] = set()
    for project_edges in edges_by_project.values():
        critical_ids.update(critical_path(task_by_id, project_edges))
    return critical_ids


def _avance_por_tarea(
    tasks: list[TaskLike],
    progress_by_project: dict[int, dict[str, int]] | None,
) -> dict[int, int]:
    """El avance de cada barra: el de su proyecto, o el avance por defecto
    cuando no se pasa la tabla del repositorio."""
    por_defecto = default_progress() if progress_by_project is None else None
    avance: dict[int, int] = {}
    for task in tasks:
        if por_defecto is not None:
            avance[task.id] = por_defecto.get(task.status, 0)
        else:
            avance[task.id] = progress_by_project.get(task.project_id, {}).get(
                task.status, 0
            )
    return avance


def build_gantt_feed(
    users: list[UserLike],
    tasks: list[TaskLike],
    project_names: Mapping[int, str],
    project_colors: Mapping[int, str],
    provisional_projects: frozenset[int] = frozenset(),
    edges: Sequence[tuple[int, int, str]] = (),
    progress_by_project: dict[int, dict[str, int]] | None = None,
) -> GanttFeed:
    """Construye el diagrama a partir de las personas y las tareas.

    Las personas se reciben ordenadas por nombre: de ahi sale el color de
    cada una. Cada barra guarda el proyecto al que pertenece, de modo que el
    diagrama global puede agrupar las barras por proyecto. El color del
    proyecto es el que tiene guardado en la base de datos.

    provisional_projects son los ids de los proyectos no firmados: su carga
    no cuenta como firmada y el frontend lo pinta en contorno.

    edges son los vinculos entre tareas del proyecto, como
    (task_id, depends_on_id, tipo). Del grafo salen las flechas del diagrama,
    las violaciones de cada barra (una barra que empieza antes de que termine
    su requisito va marcada) y la ruta critica de cada proyecto, que marca a
    las barras de su cadena mas larga de precedencias.

    progress_by_project es el avance de cada estado de cada proyecto,
    {proyecto: {clave: avance}}, el que trae el repositorio. Sin el, cada
    barra usa el avance por defecto de su estado, para que el feed se pueda
    probar sin base de datos.
    """
    members = tuple(
        GanttMember(
            user_id=user.id,
            name=user.name,
            css_class=PERSONA_CLASSES[index % len(PERSONA_CLASSES)],
        )
        for index, user in enumerate(users)
    )
    class_by_user = {member.user_id: member.css_class for member in members}
    name_by_user = {member.user_id: member.name for member in members}
    task_by_id = {task.id: task for task in tasks}
    violations = find_violations(task_by_id, edges)
    critical_ids = _tareas_de_ruta_critica(task_by_id, edges)
    avance = _avance_por_tarea(tasks, progress_by_project)

    bars: list[GanttTask] = []
    undated: list[int] = []
    unassigned: list[int] = []

    for task in tasks:
        if task.start_date is None or task.end_date is None:
            undated.append(task.id)
            continue
        if task.assigned_to is None:
            unassigned.append(task.id)

        assignee = name_by_user.get(task.assigned_to)
        bars.append(
            GanttTask(
                id=task.id,
                name=f"{task.title} · {assignee}" if assignee else task.title,
                start=task.start_date,
                end=task.end_date,
                progress=avance[task.id],
                dependencies="",
                custom_class=class_by_user.get(task.assigned_to, ""),
                project_color=project_colors.get(task.project_id)
                or DEFAULT_PROJECT_COLOR,
                project_id=task.project_id,
                project_name=project_names.get(task.project_id, ""),
                title=task.title,
                assigned_to=task.assigned_to,
                assigned_name=assignee,
                status=task.status,
                estimated_hours=task.estimated_hours,
                is_provisional=task.project_id in provisional_projects,
                violations=tuple(violations.get(task.id, ())),
                in_critical_path=task.id in critical_ids,
            )
        )

    return GanttFeed(
        tasks=tuple(bars),
        members=members,
        undated_task_ids=tuple(undated),
        unassigned_task_ids=tuple(unassigned),
        dependencies=tuple(
            GanttDependency(
                task_id=task_id, depends_on_id=depends_on_id, type=tipo
            )
            for task_id, depends_on_id, tipo in edges
        ),
    )
