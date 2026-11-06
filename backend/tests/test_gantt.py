"""Pruebas del feed del diagrama de Gantt."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from backend.services.gantt import PERSONA_CLASSES, build_gantt_feed


@dataclass
class Persona:
    id: int
    name: str


@dataclass
class Tarea:
    id: int
    title: str
    status: str = "backlog"
    start_date: date | None = date(2026, 11, 5)
    end_date: date | None = date(2026, 11, 11)
    assigned_to: int | None = None
    project_id: int = 1


PERSONAS = [Persona(1, "Ana"), Persona(2, "Jorge"), Persona(3, "Sebastian")]

PROYECTOS = {1: "Linea Pasteurizadora SIVE", 2: "Red de tuberias linea 2"}


def test_una_barra_por_tarea_con_el_formato_de_la_libreria():
    feed = build_gantt_feed(
        PERSONAS, [Tarea(id=7, title="Programacion", assigned_to=1)], PROYECTOS
    )

    barra = feed.to_dict()["tasks"][0]
    assert set(barra) == {
        "id",
        "name",
        "start",
        "end",
        "progress",
        "dependencies",
        "custom_class",
        "project_id",
        "project_name",
        "title",
        "assigned_to",
        "assigned_name",
        "status",
    }
    assert barra["id"] == 7
    assert barra["start"] == "2026-11-05"
    assert barra["end"] == "2026-11-11"
    assert barra["progress"] == 0
    assert barra["dependencies"] == ""


def test_cada_barra_lleva_el_titulo_y_la_persona_por_separado():
    """El calendario necesita el titulo y la persona sin mezclarlos."""
    feed = build_gantt_feed(
        PERSONAS, [Tarea(id=7, title="Programacion", assigned_to=1)], PROYECTOS
    )

    barra = feed.to_dict()["tasks"][0]
    assert barra["title"] == "Programacion"
    assert barra["assigned_to"] == 1
    assert barra["assigned_name"] == "Ana"
    assert barra["status"] == "backlog"


def test_una_tarea_sin_persona_no_inventa_un_nombre():
    feed = build_gantt_feed(PERSONAS, [Tarea(id=7, title="A"),], PROYECTOS)

    barra = feed.to_dict()["tasks"][0]
    assert barra["assigned_to"] is None
    assert barra["assigned_name"] is None
    assert barra["custom_class"] == ""


def test_cada_barra_lleva_el_proyecto_al_que_pertenece():
    tareas = [
        Tarea(id=1, title="A", assigned_to=1, project_id=1),
        Tarea(id=2, title="B", assigned_to=2, project_id=2),
    ]

    feed = build_gantt_feed(PERSONAS, tareas, PROYECTOS)

    barras = {barra["id"]: barra for barra in feed.to_dict()["tasks"]}
    assert barras[1]["project_id"] == 1
    assert barras[1]["project_name"] == "Linea Pasteurizadora SIVE"
    assert barras[2]["project_id"] == 2
    assert barras[2]["project_name"] == "Red de tuberias linea 2"


def test_la_persona_asignada_aparece_en_la_etiqueta_y_en_la_clase():
    feed = build_gantt_feed(
        PERSONAS, [Tarea(id=7, title="Programacion", assigned_to=1)], PROYECTOS
    )

    barra = feed.to_dict()["tasks"][0]
    assert "Ana" in barra["name"]
    assert "Programacion" in barra["name"]
    assert barra["custom_class"] == PERSONA_CLASSES[0]


def test_el_color_sigue_el_orden_por_nombre():
    feed = build_gantt_feed(
        PERSONAS, [Tarea(id=7, title="Tarea", assigned_to=3)], PROYECTOS
    )

    colores = {m["name"]: m["css_class"] for m in feed.to_dict()["members"]}
    assert colores["Ana"] == PERSONA_CLASSES[0]
    assert colores["Jorge"] == PERSONA_CLASSES[1]
    assert colores["Sebastian"] == PERSONA_CLASSES[2]
    assert feed.to_dict()["tasks"][0]["custom_class"] == PERSONA_CLASSES[2]


def test_el_avance_depende_del_estado():
    tareas = [
        Tarea(id=1, title="A", status="done", assigned_to=1),
        Tarea(id=2, title="B", status="in_progress", assigned_to=1),
        Tarea(id=3, title="C", status="backlog", assigned_to=1),
        Tarea(id=4, title="D", status="testing", assigned_to=1),
    ]

    feed = build_gantt_feed(PERSONAS, tareas, PROYECTOS)

    avances = {t["id"]: t["progress"] for t in feed.to_dict()["tasks"]}
    assert avances[1] == 100
    assert avances[2] == 50
    assert avances[3] == 0
    assert avances[4] == 75


def test_las_tareas_sin_fechas_quedan_fuera_y_se_listan():
    tarea = Tarea(id=9, title="Sin fechas", assigned_to=1, start_date=None, end_date=None)

    feed = build_gantt_feed(PERSONAS, [tarea], PROYECTOS)

    assert feed.to_dict()["tasks"] == []
    assert feed.to_dict()["undated_task_ids"] == [9]


def test_las_tareas_sin_persona_se_listan_pero_aparecen_en_el_diagrama():
    feed = build_gantt_feed(PERSONAS, [Tarea(id=4, title="Sin asignar")], PROYECTOS)

    assert len(feed.to_dict()["tasks"]) == 1
    assert feed.to_dict()["tasks"][0]["custom_class"] == ""
    assert feed.to_dict()["unassigned_task_ids"] == [4]


def test_el_color_va_mas_alli_del_tamano_de_la_paleta():
    personas = [Persona(index, f"Persona {index}") for index in range(1, 9)]

    feed = build_gantt_feed(personas, [], PROYECTOS)

    clases = [member["css_class"] for member in feed.to_dict()["members"]]
    assert len(clases) == 8
    assert all(clase in PERSONA_CLASSES for clase in clases)
