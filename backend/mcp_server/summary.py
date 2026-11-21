"""Resumenes de las respuestas de la API para el agente.

El JSON crudo de la API lleva mas campos de los que un agente necesita. Aqui
viven las funciones puras que lo recortan al resumen que cada tool devuelve;
se prueban sin ninguna peticion HTTP.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def _num(value: Any) -> int | float | None:
    """El numero que la API envio, o None.

    El borde JSON (services/units.py::hours_to_json) ya hizo la conversion a
    float en el servidor; aqui solo se traslada el numero recibido, sin
    convertirlo de nuevo.
    """
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    return None


def _cell_summary(cell: Mapping[str, Any]) -> dict[str, Any]:
    hours = _num(cell.get("hours"))
    capacity = _num(cell.get("capacity"))
    free = None
    if hours is not None and capacity is not None:
        free = round(capacity - hours, 2)
    return {
        "week": cell.get("week"),
        "hours": hours,
        "capacity": capacity,
        "free_hours": free,
        "overloaded": bool(cell.get("is_overloaded")),
        "policy_verdict": cell.get("policy_verdict"),
        "hours_actual": _num(cell.get("hours_actual")),
    }


def summarize_capacity_report(data: Mapping[str, Any]) -> dict[str, Any]:
    """La matriz al minimo: por persona y semana, carga, capacidad y veredicto.

    Del informe crudo se quitan los proyectos, los festivos y los ids sueltos
    por celda: lo que el agente pregunta es quien esta a tope, no el desglose
    por proyecto.
    """
    rows = []
    for row in data.get("rows", []):
        rows.append(
            {
                "user_id": row.get("user_id"),
                "name": row.get("name"),
                "department": row.get("department_name"),
                "cells": [_cell_summary(cell) for cell in row.get("cells", [])],
            }
        )
    return {
        "weeks": list(data.get("weeks", [])),
        "rows": rows,
        "unassigned_task_ids": list(data.get("unassigned_task_ids", [])),
        "undated_task_ids": list(data.get("undated_task_ids", [])),
    }


def overloaded_people(report: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Quien esta sobrecargado o por encima del umbral de la politica.

    Entra el resumen de summarize_capacity_report. Una celda entra en la lista
    si esta sobrecargada o si la politica le da un veredicto distinto de ok.
    """
    people: list[dict[str, Any]] = []
    for row in report.get("rows", []):
        for cell in row.get("cells", []):
            verdict = cell.get("policy_verdict")
            if cell.get("overloaded") or verdict not in (None, "ok"):
                people.append(
                    {
                        "user_id": row.get("user_id"),
                        "name": row.get("name"),
                        "week": cell.get("week"),
                        "hours": cell.get("hours"),
                        "capacity": cell.get("capacity"),
                        "policy_verdict": verdict,
                    }
                )
    return people


def summarize_tasks(tasks: list[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Las tareas al minimo: id, titulo, estado, responsable y fechas."""
    return [
        {
            "id": task.get("id"),
            "title": task.get("title"),
            "status": task.get("status"),
            "assigned_name": task.get("assigned_name"),
            "start_date": task.get("start_date"),
            "end_date": task.get("end_date"),
            "estimated_hours": _num(task.get("estimated_hours")),
            "week_hours": _num(task.get("week_hours")),
        }
        for task in tasks
    ]


def summarize_incidents(
    incidents: list[Mapping[str, Any]], pending_only: bool = True
) -> list[dict[str, Any]]:
    """Los incidentes al minimo, los pendientes por defecto.

    Con pending_only=False entran tambien los resueltos, con quien los
    resolvio y cuando.
    """
    out: list[dict[str, Any]] = []
    for incident in incidents:
        state = incident.get("state")
        if pending_only and state != "pendiente":
            continue
        item: dict[str, Any] = {
            "id": incident.get("id"),
            "user_name": incident.get("user_name"),
            "department": incident.get("department_name"),
            "week": incident.get("week"),
            "state": state,
            "hours": _num(incident.get("hours")),
            "capacity": _num(incident.get("capacity")),
            "note": incident.get("note"),
        }
        if state != "pendiente":
            item["resolved_by"] = incident.get("resolved_by")
            item["resolved_at"] = incident.get("resolved_at")
        out.append(item)
    return out
