"""Configuracion del servidor MCP, leida del entorno.

El token no se escribe en ningun fichero: viene de la variable
COREPLANNER_MCP_TOKEN y es el mismo que usaria cualquier cliente de la API,
de modo que el agente ve exactamente lo que ve esa persona y nada mas.
"""

from __future__ import annotations

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_API_URL = "http://127.0.0.1:8000"


class McpSettings(BaseSettings):
    """Variables con el prefijo COREPLANNER_, como el resto del backend.

    No lee ficheros .env: lo unico que importa es el entorno del proceso.
    """

    model_config = SettingsConfigDict(env_prefix="COREPLANNER_")

    mcp_token: str
    """Token Bearer de la persona que el agente representa."""

    api_url: str = DEFAULT_API_URL
    """Raiz de la API de CorePlanner, sin el prefijo /api."""


def load_mcp_settings() -> McpSettings:
    """Lee la configuracion del entorno o falla con el motivo.

    El token no puede faltar: sin el, el servidor no seria nadie en la API.
    """
    try:
        return McpSettings()
    except ValidationError as err:
        missing = {e["loc"][0] for e in err.errors() if e["type"] == "missing"}
        raise RuntimeError(
            "Faltan variables de entorno del servidor MCP: "
            + ", ".join(f"COREPLANNER_{name.upper()}" for name in missing)
            + ". Define al menos COREPLANNER_MCP_TOKEN con un token valido de la API."
        ) from err
