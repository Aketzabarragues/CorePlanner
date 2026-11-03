"""Tablero Kanban: agrupacion de tareas por estado.

El agrupado es puro, de modo que el reparto en columnas se pueda probar sin
base de datos.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Protocol

from ..models import TaskStatus

KANBAN_ORDER = (
    TaskStatus.BACKLOG,
    TaskStatus.IN_PROGRESS,
    TaskStatus.TESTING,
    TaskStatus.DONE,
)
"""Orden de las columnas del tablero."""


class TaskLike(Protocol):
    id: int
    title: str
    status: str
    assigned_to: int | None
    estimated_hours: Decimal
    start_date: date | None
    end_date: date | None


class UserLike(Protocol):
    id: int
    name: str


@dataclass(frozen=True, slots=True)
class KanbanCard:
    """Tarjeta del tablero."""

    id: int
    title: str
    status: str
    assigned_to: int | None
    assigned_name: str | None
    estimated_hours: Decimal
    start_date: date | None
    end_date: date | None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "status": self.status,
            "assigned_to": self.assigned_to,
            "assigned_name": self.assigned_name,
            "estimated_hours": self.estimated_hours,
            "start_date": self.start_date,
            "end_date": self.end_date,
        }


@dataclass(frozen=True, slots=True)
class KanbanColumn:
    """Columna de un estado, con sus tarjetas."""

    status: str
    cards: tuple[KanbanCard, ...]

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "tasks": [card.to_dict() for card in self.cards],
        }


def build_kanban(tasks: list[TaskLike], users: list[UserLike]) -> list[KanbanColumn]:
    """Agrupa las tareas por estado, con las cuatro columnas siempre presentes.

    La persona asignada se resuelve por su identificador: puede ser de otro
    departamento, de modo que en la tarjeta se ve quien la lleva.
    """
    name_by_user = {user.id: user.name for user in users}
    grouped: dict[str, list[KanbanCard]] = {status.value: [] for status in KANBAN_ORDER}

    for task in tasks:
        grouped.setdefault(task.status, []).append(
            KanbanCard(
                id=task.id,
                title=task.title,
                status=task.status,
                assigned_to=task.assigned_to,
                assigned_name=(
                    name_by_user.get(task.assigned_to)
                    if task.assigned_to is not None
                    else None
                ),
                estimated_hours=task.estimated_hours,
                start_date=task.start_date,
                end_date=task.end_date,
            )
        )

    return [
        KanbanColumn(status=status.value, cards=tuple(grouped[status.value]))
        for status in KANBAN_ORDER
    ]
