"""Tablero Kanban: agrupacion de tareas por estado.

El agrupado es puro, de modo que el reparto en columnas se pueda probar sin
base de datos.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
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
"""Orden de las columnas del tablero por defecto."""


class TaskLike(Protocol):
    id: int
    title: str
    status: str
    assigned_to: int | None
    estimated_hours: Decimal
    start_date: date | None
    end_date: date | None
    position: int | None


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
    position: int | None

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
            "position": self.position,
        }


@dataclass(frozen=True, slots=True)
class KanbanColumn:
    """Columna de un estado, con sus tarjetas y sus totales."""

    status: str
    cards: tuple[KanbanCard, ...]
    task_count: int = 0
    estimated_hours: Decimal = field(default_factory=lambda: Decimal("0.00"))

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "tasks": [card.to_dict() for card in self.cards],
            "task_count": self.task_count,
            "estimated_hours": self.estimated_hours,
        }


def build_kanban(
    tasks: list[TaskLike],
    users: list[UserLike],
    claves: Sequence[str] | None = None,
) -> list[KanbanColumn]:
    """Agrupa las tareas por estado, con una columna por estado del proyecto.

    `claves` son las claves de las columnas del tablero del proyecto, en su
    orden, las que trae el repositorio; sin ellas se dibujan las cuatro
    columnas por defecto, para que el agrupado se pueda probar sin base de
    datos. Una tarea cuya clave no este entre las columnas se descarta: la
    columna no se inventa, porque el estado ya se valido al escribir la
    tarea.

    La persona asignada se resuelve por su identificador: puede ser de otro
    departamento, de modo que en la tarjeta se ve quien la lleva. El orden de
    las tarjetas dentro de cada columna es el que llegan: la consulta que
    trae las tareas ya las ordena.
    """
    if claves is None:
        claves = tuple(estado.value for estado in KANBAN_ORDER)
    else:
        claves = tuple(claves)

    name_by_user = {user.id: user.name for user in users}
    grouped: dict[str, list[KanbanCard]] = {clave: [] for clave in claves}

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
                position=task.position,
            )
        )

    columnas: list[KanbanColumn] = []
    for clave in claves:
        cards = tuple(grouped[clave])
        columnas.append(
            KanbanColumn(
                status=clave,
                cards=cards,
                task_count=len(cards),
                estimated_hours=sum(
                    (card.estimated_hours for card in cards), Decimal("0.00")
                ),
            )
        )
    return columnas
