"""Pruebas del arranque del servidor MCP.

El protocolo se prueba con el transporte en memoria del SDK: initialize,
tools/list y una llamada a una tool. El fallo por falta de token se prueba
con un proceso real, que es el camino que usa python -m backend.mcp_server.server.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import httpx
import pytest
from mcp.shared.memory import create_connected_server_and_client_session

from backend.mcp_server.client import ApiClient
from backend.mcp_server.config import McpSettings
from backend.mcp_server.tools import build_server

REPO_ROOT = Path(__file__).resolve().parents[2]


class RecordingTransport(httpx.AsyncBaseTransport):
    """Devuelve las rutas preparadas: el resto responde 404."""

    def __init__(self) -> None:
        self.routes: dict[str, tuple[int, Any]] = {}
        self.requests: list[httpx.Request] = []

    def route(self, path: str, body: Any, status: int = 200) -> None:
        self.routes[path] = (status, body)

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
def settings() -> McpSettings:
    return McpSettings(mcp_token="token-prueba", api_url="http://testserver")


def test_el_arranque_falla_claramente_sin_token() -> None:
    """Sin COREPLANNER_MCP_TOKEN, el proceso real sale con el motivo y sin traza."""
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith("COREPLANNER_")
    }
    # cwd fijo: el arranque con -m resuelve desde la raiz del repo, no desde
    # donde se lanzo pytest, y no hay ningun paquete mcp nuestro en ese nivel.
    proceso = subprocess.run(
        [sys.executable, "-m", "backend.mcp_server.server"],
        capture_output=True,
        text=True,
        env=env,
        timeout=60,
        cwd=REPO_ROOT,
    )

    assert proceso.returncode != 0
    assert "COREPLANNER_MCP_TOKEN" in proceso.stderr
    assert "Traceback" not in proceso.stderr


def test_our_package_does_not_shadow_the_mcp_sdk() -> None:
    """`import mcp` sigue resolviendo al SDK, no a un paquete nuestro."""
    import mcp

    assert "site-packages" in Path(mcp.__file__).parts


async def test_el_servidor_hace_initialize_list_y_llama_a_una_tool(
    settings: McpSettings, transport: RecordingTransport
) -> None:
    """El camino completo del SDK: initialize, tools/list y una llamada.

    El cliente es el mismo que monta create_server, con un transporte de
    prueba para no tocar la red.
    """
    client = ApiClient(
        token=settings.mcp_token, api_url=settings.api_url, transport=transport
    )
    server = build_server(client)
    transport.route(
        "/api/me",
        {
            "user": {
                "id": 1,
                "name": "Ana",
                "email": "a@x.dev",
                "company_role": "tecnico",
                "is_global_admin": False,
                "weekly_base_hours": 40.0,
                "department_id": None,
            },
            "role_label": "Tecnico",
            "is_manager": False,
            "department_name": None,
            "visible_project_ids": [1],
            "editable_project_ids": [],
        },
    )

    try:
        async with create_connected_server_and_client_session(server) as session:
            tools = (await session.list_tools()).tools
            assert [tool.name for tool in tools] == [
                "whoami",
                "projects",
                "capacity_matrix",
                "overloaded_people",
                "project_capacity",
                "actual_hours",
                "tasks",
                "capacity_incidents",
            ]
            result = await session.call_tool("whoami", {})
    finally:
        await client.close()

    assert result.isError is False
    assert result.structuredContent["name"] == "Ana"
    assert [request.url.path for request in transport.requests] == ["/api/me"]
    assert transport.requests[0].headers["Authorization"] == "Bearer token-prueba"


def test_el_token_no_lee_el_fichero_env_de_la_app() -> None:
    """El .env del backend no filtra el token del MCP: viene del entorno."""
    assert McpSettings.model_config.get("env_file") is None
