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
    position: int | None = None


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


def test_la_tarjeta_lleva_su_position():
    columnas = build_kanban(
        [
            Tarea(id=1, title="A", position=2),
            Tarea(id=2, title="B", position=None),
        ],
        PERSONAS,
    )

    tarjetas = {card.id: card for card in columnas[0].cards}
    assert tarjetas[1].position == 2
    assert tarjetas[2].position is None
    assert tarjetas[1].to_dict()["position"] == 2
    assert tarjetas[2].to_dict()["position"] is None


def test_las_columnas_llevan_su_contador_y_sus_horas_estimadas():
    tareas = [
        Tarea(id=1, title="A", status="backlog", estimated_hours=Decimal("8.50")),
        Tarea(id=2, title="B", status="backlog", estimated_hours=Decimal("3.25")),
        Tarea(id=3, title="C", status="done", estimated_hours=Decimal("1.00")),
    ]

    columnas = build_kanban(tareas, PERSONAS)
    por_columna = {columna.status: columna for columna in columnas}

    assert por_columna["backlog"].task_count == 2
    assert por_columna["backlog"].estimated_hours == Decimal("11.75")
    assert not isinstance(por_columna["backlog"].estimated_hours, float)
    assert por_columna["done"].task_count == 1
    assert por_columna["done"].estimated_hours == Decimal("1.00")
    assert por_columna["in_progress"].task_count == 0
    assert por_columna["in_progress"].estimated_hours == Decimal("0.00")

    salida = por_columna["backlog"].to_dict()
    assert salida["task_count"] == 2
    assert salida["estimated_hours"] == Decimal("11.75")


def test_el_orden_de_entrada_se_mantiene_dentro_de_cada_columna():
    # La consulta que trae las tareas ya llega ordenada: el agrupado no la
    # reordena, de modo que el orden del tablero es el de la lectura.
    tareas = [
        Tarea(id=1, title="Primera", position=1),
        Tarea(id=2, title="Segunda", position=0),
        Tarea(id=3, title="Tercera", position=None),
    ]

    columnas = build_kanban(tareas, PERSONAS)

    assert [card.id for card in columnas[0].cards] == [1, 2, 3]
