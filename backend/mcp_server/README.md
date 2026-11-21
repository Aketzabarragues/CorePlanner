# Servidor MCP de CorePlanner

Expone la API de CorePlanner a agentes MCP como herramientas de **solo lectura**.
El servidor es un cliente HTTP de la propia API: no toca la base de datos, no
duplica reglas de permiso y el agente hereda exactamente la autorización y la
visibilidad del token configurado.

## Instalación

El extra `mcp` es opcional; la API y los tests no lo necesitan.

```sh
pip install -e ".[dev,mcp]"
```

## Arranque

```sh
COREPLANNER_MCP_TOKEN=<token-bearer> python -m backend.mcp_server.server
```

El servidor habla MCP por stdio: un cliente MCP (Claude Desktop, un agente, etc.)
lo lanza como proceso y le manda `initialize`, `tools/list` y `tools/call`.
Sin token, el arranque falla con el motivo y no hay traza.

## Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `COREPLANNER_MCP_TOKEN` | sí | Token Bearer de la persona que el agente representa. El mismo que usaría cualquier cliente de la API. |
| `COREPLANNER_API_URL` | no | Raíz de la API, sin el prefijo `/api`. Por defecto `http://127.0.0.1:8000`. |

El servidor no lee ningún fichero `.env`: lo único que importa es el entorno
del proceso.

## Herramientas

| Herramienta | Parámetros | Devuelve |
| --- | --- | --- |
| `whoami` | — | Persona, rol, departamento y proyectos visibles/editables del token. |
| `projects` | — | Proyectos visibles: id, nombre, estado, color y responsable. |
| `capacity_matrix` | `from_week`, `to_week`, `department_id` (opcionales) | Matriz de capacidad por persona y semana: carga, capacidad, horas libres, sobrecarga, veredicto de la política y horas reales. |
| `overloaded_people` | `from_week`, `to_week`, `department_id` (opcionales) | Quien está sobrecargado o por encima del umbral de la política, con semana, carga y capacidad. |
| `project_capacity` | `project_id` (obligatorio), `from_week`, `to_week` | La matriz de capacidad de un proyecto concreto. |
| `actual_hours` | `user_id`, `week` (opcionales) | Horas reales imputadas, por tarea y con total. Sin `user_id`, la persona del token. |
| `tasks` | `project_id` (obligatorio), `week` | Tareas del proyecto: id, título, estado, responsable, fechas y horas. |
| `capacity_incidents` | `include_resolved` (opcional) | Incidentes de capacidad pendientes; con el flag, también los resueltos. |

Las semanas van con clave ISO `YYYY-Www` (por ejemplo `2026-W45`), igual que en
la API. Los errores de la API (401, 403, 404, 422) llegan al agente como mensaje
legible con el detalle del backend, sin traza de pila.

## Pruebas

```sh
.venv/bin/pytest backend/tests/test_mcp_tools.py backend/tests/test_mcp_server.py
```

La API no se toca de verdad: el cliente HTTP lleva un transporte de prueba que
registra las peticiones y devuelve las respuestas preparadas.
