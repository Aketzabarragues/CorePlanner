"""Pruebas del servidor MCP: contrato del catalogo y herramientas simuladas.

La API no se toca de verdad: el ApiClient lleva un transporte de prueba que
registra las peticiones y devuelve las respuestas preparadas. El catalogo es
un contrato: EXPECTED_TOOLS fija la lista exacta de nombres y el orden, y si
una tool se anade, se renombra o se quita, esta prueba falla.
"""

from __future__ import annotations

from typing import Any

import httpx
import jsonschema
import pytest
from mcp.shared.memory import create_connected_server_and_client_session

from backend.mcp_server.client import ApiClient, ApiError
from backend.mcp_server.summary import (
    overloaded_people,
    summarize_capacity_report,
    summarize_incidents,
    summarize_tasks,
)
from backend.mcp_server.tools import build_server

EXPECTED_TOOLS = [
    "whoami",
    "projects",
    "capacity_matrix",
    "overloaded_people",
    "project_capacity",
    "actual_hours",
    "tasks",
    "capacity_incidents",
]


class RecordingTransport(httpx.AsyncBaseTransport):
    """Devuelve las rutas preparadas y anota cada peticion.

    El mapeo es ruta completa (con el prefijo /api) a (status, cuerpo JSON).
    Una ruta sin preparar responde 404, como la API.
    """

    def __init__(self) -> None:
        self.routes: dict[str, tuple[int, Any]] = {}
        self.requests: list[httpx.Request] = []

    def route(self, path: str, body: Any, status: int = 200) -> None:
        self.routes[path] = (status, body)

    def paths(self) -> list[str]:
        return [request.url.path for request in self.requests]

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        entry = self.routes.get(request.url.path)
        if entry is None:
            return httpx.Response(404, json={"detail": "No encontrado"})
        status, body = entry
        return httpx.Response(status, json=body)


@pytest.fixture
def transport() -> RecordingTransport:
    return RecordingTransport()


@pytest.fixture
def api(transport: RecordingTransport) -> ApiClient:
    return ApiClient(
        token="token-prueba", api_url="http://testserver", transport=transport
    )


async def _call(api: ApiClient, name: str, arguments: dict[str, Any] | None = None):
    """Llama a la tool a traves del SDK, en memoria."""
    async with create_connected_server_and_client_session(build_server(api)) as session:
        return await session.call_tool(name, arguments or {})


def _text(result) -> str:
    return result.content[0].text


# ---------------------------------------------------------------------------
# Contrato del catalogo
# ---------------------------------------------------------------------------


async def test_catalogo_fija_la_lista_exacta_de_tools(api: ApiClient) -> None:
    async with create_connected_server_and_client_session(
        build_server(api)
    ) as session:
        tools = (await session.list_tools()).tools
    assert [tool.name for tool in tools] == EXPECTED_TOOLS


async def test_el_esquema_de_cada_tool_es_publicable(
    api: ApiClient, transport: RecordingTransport
) -> None:
    """Cada tool publica un input schema valido para el protocolo MCP.

    Se valida cada esquema contra jsonschema (que el SDK ya usa para validar
    las llamadas) y se comprueba que las properties son las esperadas.
    """
    expected_params: dict[str, set[str]] = {
        "whoami": set(),
        "projects": set(),
        "capacity_matrix": {"from_week", "to_week", "department_id"},
        "overloaded_people": {"from_week", "to_week", "department_id"},
        "project_capacity": {"project_id", "from_week", "to_week"},
        "actual_hours": {"user_id", "week"},
        "tasks": {"project_id", "week"},
        "capacity_incidents": {"include_resolved"},
    }
    async with create_connected_server_and_client_session(
        build_server(api)
    ) as session:
        tools = {tool.name: tool for tool in (await session.list_tools()).tools}
    assert set(tools) == set(EXPECTED_TOOLS)
    for name, tool in tools.items():
        schema = tool.inputSchema
        assert schema["type"] == "object"
        assert set(schema.get("properties", {})) == expected_params[name]
        # Que el SDK pueda validar argumentos contra el esquema sin quebrarse.
        jsonschema.Draft202012Validator.check_schema(schema)


# ---------------------------------------------------------------------------
# whoami y projects
# ---------------------------------------------------------------------------


async def test_whoami_pide_me_y_devuelve_el_resumen(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route(
        "/api/me",
        {
            "user": {
                "id": 3,
                "name": "Ana Ruiz",
                "email": "ana@core.dev",
                "company_role": "tecnico",
                "is_global_admin": False,
                "weekly_base_hours": 40.0,
                "department_id": 1,
            },
            "role_label": "Tecnico",
            "is_manager": False,
            "department_name": "Ingenieria",
            "visible_project_ids": [1, 2],
            "editable_project_ids": [1],
        },
    )

    result = await _call(api, "whoami")

    assert result.isError is False
    assert transport.paths() == ["/api/me"]
    payload = result.structuredContent
    assert payload["user_id"] == 3
    assert payload["name"] == "Ana Ruiz"
    assert payload["company_role"] == "tecnico"
    assert payload["visible_project_ids"] == [1, 2]
    assert payload["editable_project_ids"] == [1]


async def test_projects_pide_projects_y_devuelve_el_resumen(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route(
        "/api/projects",
        [
            {"id": 1, "name": "Lienzo A", "status": "planificacion", "color": "#123456",
             "owner_name": "Luis"},
            {"id": 2, "name": "Lienzo B", "status": "en_marcha", "color": None,
             "owner_name": None},
        ],
    )

    result = await _call(api, "projects")

    assert result.isError is False
    assert transport.paths() == ["/api/projects"]
    rows = result.structuredContent["projects"]
    assert rows == [
        {"id": 1, "name": "Lienzo A", "status": "planificacion",
         "color": "#123456", "owner_name": "Luis"},
        {"id": 2, "name": "Lienzo B", "status": "en_marcha",
         "color": None, "owner_name": None},
    ]


# ---------------------------------------------------------------------------
# capacity_matrix, overloaded_people y project_capacity
# ---------------------------------------------------------------------------

REPORT = {
    "weeks": [{"week": "2026-W45"}, {"week": "2026-W46"}],
    "rows": [
        {
            "user_id": 1,
            "name": "Ana",
            "department_name": "Ingenieria",
            "cells": [
                {
                    "week": "2026-W45",
                    "hours": 36.0,
                    "capacity": 40.0,
                    "hours_actual": 35.5,
                    "is_overloaded": False,
                    "policy_verdict": "ok",
                    "projects": [{"project_id": 1, "hours": 36.0, "provisional": False}],
                },
                {
                    "week": "2026-W46",
                    "hours": 44.0,
                    "capacity": 40.0,
                    "hours_actual": None,
                    "is_overloaded": True,
                    "policy_verdict": "aprobacion",
                    "projects": [],
                },
            ],
        },
        {
            "user_id": 2,
            "name": "Luis",
            "department_name": None,
            "cells": [
                {
                    "week": "2026-W45",
                    "hours": 20.0,
                    "capacity": None,
                    "hours_actual": None,
                    "is_overloaded": False,
                    "policy_verdict": None,
                    "projects": [],
                },
                {
                    "week": "2026-W46",
                    "hours": 0.0,
                    "capacity": 40.0,
                    "hours_actual": None,
                    "is_overloaded": False,
                    "policy_verdict": None,
                    "projects": [],
                },
            ],
        },
    ],
    "unassigned_task_ids": [7],
    "undated_task_ids": [],
}


async def test_capacity_matrix_pide_el_rango_y_resume(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route("/api/capacity", REPORT)

    result = await _call(
        api, "capacity_matrix", {"from_week": "2026-W45", "to_week": "2026-W46"}
    )

    assert result.isError is False
    request = transport.requests[0]
    assert request.url.path == "/api/capacity"
    assert request.url.params["from"] == "2026-W45"
    assert request.url.params["to"] == "2026-W46"

    summary = result.structuredContent
    # Resumen, no crudo: sin desglose por proyecto ni festivos por celda.
    assert summary["weeks"] == [{"week": "2026-W45"}, {"week": "2026-W46"}]
    ana = summary["rows"][0]
    assert ana["user_id"] == 1 and ana["name"] == "Ana"
    assert ana["cells"][0] == {
        "week": "2026-W45",
        "hours": 36.0,
        "capacity": 40.0,
        "free_hours": 4.0,
        "overloaded": False,
        "policy_verdict": "ok",
        "hours_actual": 35.5,
    }
    assert ana["cells"][1]["free_hours"] == -4.0
    assert ana["cells"][1]["overloaded"] is True
    # Luis no tiene capacidad definida: la capacidad libre no se inventa.
    luis = summary["rows"][1]
    assert luis["cells"][0]["capacity"] is None
    assert luis["cells"][0]["free_hours"] is None
    assert summary["unassigned_task_ids"] == [7]


async def test_capacity_matrix_sin_rango_no_envia_parametros(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route("/api/capacity", REPORT)

    result = await _call(api, "capacity_matrix")

    assert result.isError is False
    assert dict(transport.requests[0].url.params) == {}


async def test_capacity_matrix_con_departamento(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route("/api/capacity", REPORT)

    result = await _call(api, "capacity_matrix", {"department_id": 4})

    assert result.isError is False
    assert transport.requests[0].url.params["department_id"] == "4"


async def test_overloaded_people_filtra_sobre_el_mismo_informe(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route("/api/capacity", REPORT)

    result = await _call(
        api, "overloaded_people", {"from_week": "2026-W45", "to_week": "2026-W46"}
    )

    assert result.isError is False
    people = result.structuredContent
    # Solo la celda sobrecargada de Ana; el resto (ok o sin veredicto) no entra.
    assert people["overloaded"] == [
        {
            "user_id": 1,
            "name": "Ana",
            "week": "2026-W46",
            "hours": 44.0,
            "capacity": 40.0,
            "policy_verdict": "aprobacion",
        }
    ]


def test_overloaded_people_incluye_los_umbrales_de_la_politica() -> None:
    """Aviso de politica sin sobrecarga dura tambien entra en la lista."""
    report = summarize_capacity_report(
        {
            "weeks": [{"week": "2026-W45"}],
            "rows": [
                {
                    "user_id": 5,
                    "name": "Eva",
                    "department_name": None,
                    "cells": [
                        {
                            "week": "2026-W45",
                            "hours": 34.0,
                            "capacity": 40.0,
                            "hours_actual": None,
                            "is_overloaded": False,
                            "policy_verdict": "aviso",
                        }
                    ],
                }
            ],
        }
    )
    assert overloaded_people(report) == [
        {
            "user_id": 5,
            "name": "Eva",
            "week": "2026-W45",
            "hours": 34.0,
            "capacity": 40.0,
            "policy_verdict": "aviso",
        }
    ]


async def test_project_capacity_pide_la_ruta_del_proyecto(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route("/api/projects/2/capacity", REPORT)

    result = await _call(api, "project_capacity", {"project_id": 2})

    assert result.isError is False
    assert transport.paths() == ["/api/projects/2/capacity"]
    assert result.structuredContent["rows"][0]["name"] == "Ana"


# ---------------------------------------------------------------------------
# actual_hours
# ---------------------------------------------------------------------------


async def test_actual_hours_con_semana_y_usuario(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route("/api/me", {"user": {"id": 3}})
    transport.route(
        "/api/tasks",
        [
            {"id": 11, "title": "Tarea A", "status": "en_marcha"},
            {"id": 12, "title": "Tarea B", "status": "hecha"},
        ],
    )
    # 2026-W45 cae del 2026-11-02 al 2026-11-08.
    transport.route(
        "/api/tasks/11/time-entries",
        [
            {"task_id": 11, "user_id": 3, "work_date": "2026-11-03", "hours": 3.5},
            {"task_id": 11, "user_id": 9, "work_date": "2026-11-04", "hours": 99.0},
        ],
    )
    transport.route(
        "/api/tasks/12/time-entries",
        [
            {"task_id": 12, "user_id": 3, "work_date": "2026-11-10", "hours": 1.0},
        ],
    )

    result = await _call(api, "actual_hours", {"week": "2026-W45"})

    assert result.isError is False
    assert transport.paths() == [
        "/api/me",
        "/api/tasks",
        "/api/tasks/11/time-entries",
        "/api/tasks/12/time-entries",
    ]
    tasks_request = transport.requests[1]
    assert tasks_request.url.params["assigned_to"] == "3"
    assert tasks_request.url.params["week"] == "2026-W45"

    summary = result.structuredContent
    assert summary["user_id"] == 3
    assert summary["week"] == "2026-W45"
    # La entrada de otra persona (user 9) y la de otra semana (11-10) no entran.
    assert summary["per_task"] == [{"task_id": 11, "title": "Tarea A", "hours": 3.5}]
    assert summary["total_hours"] == 3.5


async def test_actual_hours_sin_semana_suma_todo(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route("/api/me", {"user": {"id": 3}})
    transport.route("/api/tasks", [{"id": 11, "title": "Tarea A"}])
    transport.route(
        "/api/tasks/11/time-entries",
        [
            {"task_id": 11, "user_id": 3, "work_date": "2026-11-03", "hours": 3.5},
            {"task_id": 11, "user_id": 3, "work_date": "2026-11-10", "hours": 2.25},
        ],
    )

    result = await _call(api, "actual_hours", {"user_id": 3})

    assert result.isError is False
    assert "/api/me" not in transport.paths()
    summary = result.structuredContent
    assert summary["week"] is None
    assert summary["per_task"] == [{"task_id": 11, "title": "Tarea A", "hours": 5.75}]
    assert summary["total_hours"] == 5.75


async def test_actual_hours_con_semana_inexistente_da_error_legible(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route("/api/me", {"user": {"id": 3}})

    result = await _call(api, "actual_hours", {"week": "2026-W99"})

    assert result.isError is True
    assert "2026-W99" in _text(result)
    assert "Traceback" not in _text(result)


# ---------------------------------------------------------------------------
# tasks
# ---------------------------------------------------------------------------


async def test_tasks_pide_el_proyecto_y_filtra_por_semana(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route(
        "/api/projects/1/tasks",
        [
            {
                "id": 5,
                "title": "Diseño",
                "status": "en_marcha",
                "assigned_name": "Ana",
                "start_date": "2026-11-02",
                "end_date": "2026-11-06",
                "estimated_hours": 16.0,
                "week_hours": 12.0,
            }
        ],
    )

    result = await _call(api, "tasks", {"project_id": 1, "week": "2026-W45"})

    assert result.isError is False
    request = transport.requests[0]
    assert request.url.path == "/api/projects/1/tasks"
    assert request.url.params["week"] == "2026-W45"
    summary = result.structuredContent
    assert summary["tasks"] == [
        {
            "id": 5,
            "title": "Diseño",
            "status": "en_marcha",
            "assigned_name": "Ana",
            "start_date": "2026-11-02",
            "end_date": "2026-11-06",
            "estimated_hours": 16.0,
            "week_hours": 12.0,
        }
    ]


# ---------------------------------------------------------------------------
# capacity_incidents
# ---------------------------------------------------------------------------


async def test_capacity_incidents_pide_la_lista_y_resume_pendientes(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route(
        "/api/capacity-incidents",
        [
            {
                "id": 1,
                "user_name": "Ana",
                "department_name": "Ingenieria",
                "week": "2026-W45",
                "state": "pendiente",
                "hours": 44.0,
                "capacity": 40.0,
                "note": None,
            },
            {
                "id": 2,
                "user_name": "Luis",
                "department_name": None,
                "week": "2026-W44",
                "state": "aprobada",
                "hours": 41.0,
                "capacity": 40.0,
                "note": None,
                "resolved_by": "Marta",
                "resolved_at": "2026-11-01T09:00:00+00:00",
            },
        ],
    )

    result = await _call(api, "capacity_incidents")

    assert result.isError is False
    assert transport.paths() == ["/api/capacity-incidents"]
    summary = result.structuredContent["incidents"]
    assert len(summary) == 1
    assert summary[0]["user_name"] == "Ana"
    assert summary[0]["state"] == "pendiente"
    assert "resolved_by" not in summary[0]

    result_all = await _call(api, "capacity_incidents", {"include_resolved": True})
    all_summary = result_all.structuredContent["incidents"]
    assert len(all_summary) == 2
    resolved = all_summary[1]
    assert resolved["state"] == "aprobada"
    assert resolved["resolved_by"] == "Marta"


# ---------------------------------------------------------------------------
# Errores de la API
# ---------------------------------------------------------------------------


async def test_el_403_llega_como_mensaje_legible_sin_traza(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route(
        "/api/projects/9/capacity",
        {"detail": "No tienes permiso 'capacity.read' en este proyecto"},
        status=403,
    )

    result = await _call(api, "project_capacity", {"project_id": 9})

    assert result.isError is True
    text = _text(result)
    assert "No tienes permiso" in text
    assert "403" in text
    assert "Traceback" not in text
    assert "site-packages" not in text


async def test_el_404_llega_como_mensaje_legible(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route("/api/projects/9/capacity", {"detail": "Proyecto no encontrado"}, status=404)

    result = await _call(api, "project_capacity", {"project_id": 9})

    assert result.isError is True
    assert "Proyecto no encontrado" in _text(result)


async def test_el_401_llega_como_mensaje_legible(
    api: ApiClient, transport: RecordingTransport
) -> None:
    transport.route("/api/me", {"detail": "No se ha proporcionado un token"}, status=401)

    result = await _call(api, "whoami")

    assert result.isError is True
    text = _text(result)
    assert "401" in text
    assert "token" in text.lower()
    assert "Traceback" not in text


def test_api_error_lleva_status_y_detalle() -> None:
    error = ApiError(403, "No tienes permiso")
    assert error.status == 403
    assert error.detail == "No tienes permiso"


def test_summarize_tasks_recorta_al_minimo() -> None:
    rows = summarize_tasks(
        [
            {
                "id": 1,
                "title": "T",
                "status": "en_marcha",
                "assigned_name": None,
                "start_date": None,
                "end_date": None,
                "estimated_hours": 8.0,
                "week_hours": None,
                "description": "no debe salir",
            }
        ]
    )
    assert rows[0]["title"] == "T"
    assert "description" not in rows[0]


def test_summarize_incidents_pendientes_por_defecto() -> None:
    incidents = [
        {"id": 1, "state": "pendiente", "user_name": "Ana", "week": "2026-W45",
         "hours": 44.0, "capacity": 40.0, "department_name": None, "note": None},
        {"id": 2, "state": "rechazada", "user_name": "Luis", "week": "2026-W44",
         "hours": 41.0, "capacity": 40.0, "department_name": None, "note": None,
         "resolved_by": "Marta", "resolved_at": "2026-11-01T09:00:00+00:00"},
    ]
    assert summarize_incidents(incidents) == [
        {
            "id": 1,
            "user_name": "Ana",
            "department": None,
            "week": "2026-W45",
            "state": "pendiente",
            "hours": 44.0,
            "capacity": 40.0,
            "note": None,
        }
    ]
    with_resolved = summarize_incidents(incidents, pending_only=False)
    assert len(with_resolved) == 2
    assert with_resolved[1]["resolved_by"] == "Marta"
