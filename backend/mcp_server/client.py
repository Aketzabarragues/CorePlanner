"""Cliente HTTP de la API de CorePlanner, con token Bearer.

Es la unica puerta de salida del servidor MCP: todas las herramientas pasan
por aqui y heredan la autorizacion y la visibilidad de la API, sin
duplicar ninguna regla de permiso.
"""

from __future__ import annotations

from typing import Any

import httpx

API_PREFIX = "/api"


class ApiError(Exception):
    """La API respondio con un error: el status y el detalle del backend.

    El detalle llega como el backend lo escribio, en espanol, de modo que el
    mensaje final para el agente no necesita mas que el status delante.
    """

    def __init__(self, status: int, detail: str) -> None:
        self.status = status
        self.detail = detail
        super().__init__(f"{status} {detail}")


class ApiClient:
    """Peticiones GET a la API con el token del entorno.

    Sin cache y sin reintentos: el agente pide, la API responde. Un error de
    la API (401, 403, 404, 422) se convierte en ApiError con el detalle del
    backend; no hay errores de cliente que manejar aqui.
    """

    def __init__(
        self,
        token: str,
        api_url: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        headers = {"Authorization": f"Bearer {token}"}
        self._client = httpx.AsyncClient(
            base_url=api_url,
            headers=headers,
            timeout=30.0,
            transport=transport,
        )

    async def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        """GET a una ruta bajo /api y el JSON de la respuesta.

        path va sin prefijo: /me, /projects, /capacity...
        """
        response = await self._client.get(f"{API_PREFIX}{path}", params=params)
        if response.status_code >= 400:
            raise ApiError(response.status_code, self._detail(response))
        if response.status_code == 204:
            return None
        return response.json()

    async def close(self) -> None:
        await self._client.aclose()

    @staticmethod
    def _detail(response: httpx.Response) -> str:
        """El detalle del backend, o un generico si no es JSON."""
        try:
            payload = response.json()
        except (ValueError, httpx.DecodingError):
            return f"la API respondio {response.status_code}"
        detail = payload.get("detail") if isinstance(payload, dict) else None
        if isinstance(detail, str) and detail:
            return detail
        if isinstance(detail, list) and detail:
            first = detail[0]
            if isinstance(first, dict):
                return str(first.get("msg") or "error de validacion")
        return f"la API respondio {response.status_code}"
