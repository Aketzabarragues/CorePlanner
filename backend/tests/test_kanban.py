"""Pruebas del agrupado del tablero Kanban."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from backend.services.kanban import build_kanban


@dataclass
class Persona:
    id: int
    name: str


@dataclass
class Tarea:
    id: int
    title: str
    status: str = "backlog"
    assigned_to: int | None = None
    estimated_hours: Decimal = field(default_factory=lambda: Decimal("0.00"))
    start_date: date | None = None
    end_date: date | None = None


PERSONAS = [Persona(1, "Ana"), Persona(2, "Jorge")]


def test_las_cuatro_columnas_estan_siempre_y_en_orden():
    columnas = build_kanban([], PERSONAS)

    assert [columna.status for columna in columnas] == [
        "backlog",
        "in_progress",
        "testing",
        "done",
    ]
    assert all(columna.cards == () for columna in columnas)


def test_cada_tarea_va_a_su_columna():
    tareas = [
        Tarea(id=1, title="A", status="backlog"),
        Tarea(id=2, title="B", status="in_progress"),
        Tarea(id=3, title="C", status="testing"),
        Tarea(id=4, title="D", status="done"),
    ]

    columnas = build_kanban(tareas, PERSONAS)

    por_columna = {columna.status: [card.id for card in columna.cards] for columna in columnas}
    assert por_columna["backlog"] == [1]
    assert por_columna["in_progress"] == [2]
    assert por_columna["testing"] == [3]
    assert por_columna["done"] == [4]


def test_la_tarjeta_lleva_el_nombre_de_quien_la_tiene():
    tareas = [Tarea(id=1, title="A", assigned_to=2)]

    columnas = build_kanban(tareas, PERSONAS)

    tarjeta = columnas[0].cards[0]
    assert tarjeta.assigned_to == 2
    assert tarjeta.assigned_name == "Jorge"


def test_una_tarea_sin_persona_no_tiene_nombre():
    columnas = build_kanban([Tarea(id=1, title="A")], PERSONAS)

    tarjeta = columnas[0].cards[0]
    assert tarjeta.assigned_to is None
    assert tarjeta.assigned_name is None


def test_una_tarea_puede_llevarla_alguien_de_otro_departamento():
    # El tablero no conoce los departamentos: la asignacion transversal se
    # resuelve con el nombre de quien la tiene.
    personas = [Persona(1, "Ana"), Persona(2, "Jorge")]

    columnas = build_kanban([Tarea(id=1, title="A", assigned_to=1)], personas)

    assert columnas[0].cards[0].assigned_name == "Ana"


def test_las_horas_se_conservan_como_decimal():
    columnas = build_kanban(
        [Tarea(id=1, title="A", estimated_hours=Decimal("12.50"))], PERSONAS
    )

    horas = columnas[0].cards[0].estimated_hours
    assert horas == Decimal("12.50")
    assert not isinstance(horas, float)
