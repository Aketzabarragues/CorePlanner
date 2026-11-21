"""Catalogo de herramientas del servidor MCP, solo lectura.

Cada herramienta llama a la API a traves del cliente inyectado y devuelve el
resumen legible (summary.py), no el JSON crudo. El catalogo es un contrato:
backend/tests/test_mcp_tools.py fija la lista exacta de nombres, y un test
comprueba el esquema de parametros de cada una.

Los fallos de la API (ApiError) se convierten en errores de tool con el
mensaje del backend, sin traza: los convierte la capa de herramientas de
FastMCP, que envuelve la excepcion en un texto plano.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, timedelta
from typing import Annotated, Any

from mcp.server.fastmcp import FastMCP
from pydantic import Field

from .client import ApiClient
from .summary import (
    overloaded_people,
    summarize_capacity_report,
    summarize_incidents,
    summarize_tasks,
)

WEEK_FORMAT = "YYYY-Www"


def _monday_of_week(week: str) -> date:
    """Lunes de la semana ISO, o ValueError si la clave no existe.

    Mismo formato de clave que la API: 2026-W45, con el anio ISO. El error
    lleva la clave tal como la envio el agente, para que sepa que corregir.
    """
    year, _, number = week.partition("-W")
    try:
        return date.fromisocalendar(int(year), int(number), 1)
    except ValueError as err:
        raise ValueError(f"Semana ISO no válida: {week}") from err


def _clean_params(**params: Any) -> dict[str, Any]:
    """Solo los parametros que vienen fijados: la API decide el resto."""
    return {name: value for name, value in params.items() if value is not None}


def build_server(client: ApiClient) -> FastMCP:
    """El servidor MCP con el catalogo completo, cerrando sobre el cliente."""
    app = FastMCP(
        "coreplanner",
        instructions=(
            "CorePlanner, gestor de capacidad de un equipo de ingenieria. "
            "Solo lectura: las herramientas consultan la API con el token de "
            "la persona configurada, de modo que se ve lo que esa persona ve. "
            "Las semanas van con clave ISO YYYY-Www, por ejemplo 2026-W45."
        ),
    )

    @app.tool(
        name="whoami",
        description=(
            "Quien es el token: persona, rol de empresa, departamento y los "
            "proyectos que ve y en los que puede escribir."
        ),
    )
    async def whoami() -> Mapping[str, Any]:
        data = await client.get("/me")
        user = data["user"]
        return {
            "user_id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "company_role": user["company_role"],
            "role_label": data.get("role_label"),
            "is_manager": data.get("is_manager"),
            "department": data.get("department_name"),
            "visible_project_ids": data.get("visible_project_ids", []),
            "editable_project_ids": data.get("editable_project_ids", []),
        }

    @app.tool(
        name="projects",
        description=(
            "Los proyectos visibles para el token, con id, nombre, estado, "
            "color y responsable."
        ),
    )
    async def projects() -> list[dict[str, Any]]:
        data = await client.get("/projects")
        return [
            {
                "id": project["id"],
                "name": project["name"],
                "status": project["status"],
                "color": project.get("color"),
                "owner_name": project.get("owner_name"),
            }
            for project in data
        ]

    @app.tool(
        name="capacity_matrix",
        description=(
            "La capacidad del equipo: por persona y semana, la carga, la "
            "capacidad, las horas libres, si esta sobrecargada, el veredicto "
            "de la politica de capacidad y las horas reales registradas. "
            "Sin rango, la API decide las semanas del informe."
        ),
    )
    async def capacity_matrix(
        from_week: Annotated[
            str | None,
            Field(
                description=f"Semana ISO inicial del rango ({WEEK_FORMAT}), como el from de la API"
            ),
        ] = None,
        to_week: Annotated[
            str | None,
            Field(description=f"Semana ISO final del rango ({WEEK_FORMAT}), como el to de la API"),
        ] = None,
        department_id: Annotated[
            int | None,
            Field(description="Limita el informe a los proyectos de ese departamento"),
        ] = None,
    ) -> Mapping[str, Any]:
        data = await client.get(
            "/capacity",
            params=_clean_params(
                **{"from": from_week, "to": to_week, "department_id": department_id}
            ),
        )
        return summarize_capacity_report(data)

    @app.tool(
        name="overloaded_people",
        description=(
            "Quien esta sobrecargado o por encima del umbral de la politica "
            "de capacidad en el rango, con su semana, carga y capacidad. "
            "Sin rango, la API decide las semanas del informe."
        ),
    )
    async def overloaded_people_tool(
        from_week: Annotated[
            str | None,
            Field(
                description=f"Semana ISO inicial del rango ({WEEK_FORMAT}), como el from de la API"
            ),
        ] = None,
        to_week: Annotated[
            str | None,
            Field(description=f"Semana ISO final del rango ({WEEK_FORMAT}), como el to de la API"),
        ] = None,
        department_id: Annotated[
            int | None,
            Field(description="Limita el informe a los proyectos de ese departamento"),
        ] = None,
    ) -> list[dict[str, Any]]:
        data = await client.get(
            "/capacity",
            params=_clean_params(
                **{"from": from_week, "to": to_week, "department_id": department_id}
            ),
        )
        report = summarize_capacity_report(data)
        return overloaded_people(report)

    @app.tool(
        name="project_capacity",
        description=(
            "La capacidad de un proyecto concreto: la matriz de ocupacion "
            "de su equipo, con carga, capacidad, horas libres y veredicto "
            "por persona y semana."
        ),
    )
    async def project_capacity(
        project_id: Annotated[
            int, Field(description="Id del proyecto, como el de projects o whoami")
        ],
        from_week: Annotated[
            str | None,
            Field(
                description=f"Semana ISO inicial del rango ({WEEK_FORMAT}), como el from de la API"
            ),
        ] = None,
        to_week: Annotated[
            str | None,
            Field(description=f"Semana ISO final del rango ({WEEK_FORMAT}), como el to de la API"),
        ] = None,
    ) -> Mapping[str, Any]:
        data = await client.get(
            f"/projects/{project_id}/capacity",
            params=_clean_params(**{"from": from_week, "to": to_week}),
        )
        return summarize_capacity_report(data)

    @app.tool(
        name="actual_hours",
        description=(
            "Las horas reales registradas, por tarea y con el total, de una "
            "persona en una semana. Sin user_id, el token mismo; sin week, "
            "todas las semanas. Las horas salen de las imputaciones de la API."
        ),
    )
    async def actual_hours(
        user_id: Annotated[
            int | None,
            Field(description="De quien ver las horas; por defecto, el token"),
        ] = None,
        week: Annotated[
            str | None,
            Field(description=f"Solo esa semana ISO ({WEEK_FORMAT}), por defecto todas"),
        ] = None,
    ) -> Mapping[str, Any]:
        target = user_id
        if target is None:
            target = (await client.get("/me"))["user"]["id"]
        params: dict[str, Any] = {"assigned_to": target}
        monday: date | None = None
        if week is not None:
            monday = _monday_of_week(week)
            params["week"] = week
        sunday = monday + timedelta(days=6) if monday is not None else None
        tasks = await client.get("/tasks", params=params)
        # entry["hours"] llega ya como numero JSON del borde de la API: se suma
        # y se devuelve sin convertir.
        per_task: list[dict[str, Any]] = []
        total = 0
        for task in tasks:
            entries = await client.get(f"/tasks/{task['id']}/time-entries")
            hours = 0
            for entry in entries:
                if entry.get("user_id") != target:
                    continue
                day = date.fromisoformat(entry["work_date"])
                if monday is not None and not monday <= day <= sunday:
                    continue
                hours += entry["hours"]
            if hours > 0:
                per_task.append(
                    {
                        "task_id": task["id"],
                        "title": task["title"],
                        "hours": hours,
                    }
                )
                total += hours
        return {
            "user_id": target,
            "week": week,
            "per_task": per_task,
            "total_hours": total,
        }

    @app.tool(
        name="tasks",
        description=(
            "Las tareas de un proyecto: id, titulo, estado, responsable, "
            "fechas y horas estimadas. Con week, solo las que aportan horas "
            "en esa semana."
        ),
    )
    async def tasks(
        project_id: Annotated[
            int, Field(description="Id del proyecto, como el de projects o whoami")
        ],
        week: Annotated[
            str | None,
            Field(
                description=f"Solo las tareas que aportan horas en esa semana ISO ({WEEK_FORMAT})"
            ),
        ] = None,
    ) -> list[dict[str, Any]]:
        if week is not None:
            _monday_of_week(week)
        data = await client.get(
            f"/projects/{project_id}/tasks", params=_clean_params(week=week)
        )
        return summarize_tasks(data)

    @app.tool(
        name="capacity_incidents",
        description=(
            "Los incidentes de capacidad pendientes de resolucion, los que "
            "tocan a la persona del token, con carga, capacidad y semana."
        ),
    )
    async def capacity_incidents(
        include_resolved: Annotated[
            bool,
            Field(description="Incluir tambien los resueltos, con quien los resolvio"),
        ] = False,
    ) -> list[dict[str, Any]]:
        data = await client.get("/capacity-incidents")
        return summarize_incidents(data, pending_only=not include_resolved)

    return app
