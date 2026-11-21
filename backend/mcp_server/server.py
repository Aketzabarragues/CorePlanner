"""Punto de entrada del servidor MCP: python -m backend.mcp_server.server.

El servidor habla a la API con el token del entorno, de modo que la
autorizacion y la visibilidad son las de esa persona, sin mas. Sin token,
el arranque falla con el motivo y no hay traza.
"""

from __future__ import annotations

import asyncio
import sys

from mcp.server.fastmcp import FastMCP

from .client import ApiClient
from .config import McpSettings, load_mcp_settings
from .tools import build_server


def create_server(settings: McpSettings) -> tuple[ApiClient, FastMCP]:
    """El cliente de la API y el servidor MCP sobre el.

    El cliente se cierra al terminar la sesion stdio, no antes.
    """
    client = ApiClient(token=settings.mcp_token, api_url=settings.api_url)
    return client, build_server(client)


def _fail(message: str) -> None:
    print(f"coreplanner-mcp: {message}", file=sys.stderr)
    raise SystemExit(2)


async def _serve(client: ApiClient, server: FastMCP) -> None:
    try:
        await server.run_stdio_async()
    finally:
        await client.close()


def main() -> None:
    try:
        settings = load_mcp_settings()
    except RuntimeError as err:
        _fail(str(err))
    client, server = create_server(settings)
    try:
        asyncio.run(_serve(client, server))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
