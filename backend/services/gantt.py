"""Feed del diagrama de Gantt.

Traduce las tareas de un proyecto al formato que consume la libreria de
Gantt del frontend: una barra por tarea, con la persona asignada en la
etiqueta y en una clase que permite pintar cada barra con su color.

El color se asigna por la posicion de cada persona en la lista ordenada por
nombre, la misma que usa la matriz de capacidad, de modo que una persona
conserva su color en las dos vistas.

Las tareas sin fechas no tienen sitio en el diagrama, asi que se listan
aparte en vez de aparecer en blanco.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol

PERSONA_CLASSES = (
    "persona-0",
    "persona-1",
    "persona-2",
    "persona-3",
    "persona-4",
    "persona-5",
)
"""Clases CSS de la paleta. El indice de cada persona elige su color."""

PROGRESS_BY_STATUS = {
    "done": 100,
    "testing": 75,
    "in_progress": 50,
    "backlog": 0,
}
"""Avance que muestra la barra segun el estado de la tarea."""


class TaskLike(Protocol):
    id: int
    title: str
    status: str
    start_date: date | None
    end_date: date | None
    assigned_to: int | None


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
class GanttTask:
    """Tara traducida al formato de la libreria de Gantt."""

    id: int
    name: str
    start: date
    end: date
    progress: int
    dependencies: str
    custom_class: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "progress": self.progress,
            "dependencies": self.dependencies,
            "custom_class": self.custom_class,
        }


@dataclass(frozen=True, slots=True)
class GanttFeed:
    """Contenido del diagrama: barras, colores y tareas que quedan fuera."""

    tasks: tuple[GanttTask, ...]
    members: tuple[GanttMember, ...]
    undated_task_ids: tuple[int, ...] = ()
    unassigned_task_ids: tuple[int, ...] = ()

    def to_dict(self) -> dict:
        return {
            "tasks": [task.to_dict() for task in self.tasks],
            "members": [member.to_dict() for member in self.members],
            "undated_task_ids": list(self.undated_task_ids),
            "unassigned_task_ids": list(self.unassigned_task_ids),
        }


def build_gantt_feed(
    users: list[UserLike],
    tasks: list[TaskLike],
) -> GanttFeed:
    """Construye el diagrama a partir de las personas y las tareas.

    Las personas se reciben ordenadas por nombre: de ahi sale el color de
    cada una.
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
                progress=PROGRESS_BY_STATUS.get(task.status, 0),
                dependencies="",
                custom_class=class_by_user.get(task.assigned_to, ""),
            )
        )

    return GanttFeed(
        tasks=tuple(bars),
        members=members,
        undated_task_ids=tuple(undated),
        unassigned_task_ids=tuple(unassigned),
    )
