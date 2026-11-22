# El servidor MCP en marcha: catalogo y prueba de cada tool

Prueba real contra la API local en marcha, con el token de un gerente
(`ivan@example.com`, el usuario 1 de la semilla de demostracion). El
servidor arranca como proceso hijo por stdio y el cliente es el propio
SDK (`mcp`), con `initialize`, `tools/list` y `tools/call`.

## Catalogo que expone

```
- whoami: sin parametros
    Quien es el token: persona, rol de empresa, departamento y los proyectos que ve y en los que puede escribir.
- projects: sin parametros
    Los proyectos visibles para el token, con id, nombre, estado, color y responsable.
- capacity_matrix: from_week, to_week, department_id
    La capacidad del equipo: por persona y semana, la carga, la capacidad, las horas libres, si esta sobrecargada, el veredicto de la politica de capacida
- overloaded_people: from_week, to_week, department_id
    Quien esta sobrecargado o por encima del umbral de la politica de capacidad en el rango, con su semana, carga y capacidad. Sin rango, la API decide la
- project_capacity: project_id, from_week, to_week
    La capacidad de un proyecto concreto: la matriz de ocupacion de su equipo, con carga, capacidad, horas libres y veredicto por persona y semana.
- actual_hours: user_id, week
    Las horas reales registradas, por tarea y con el total, de una persona en una semana. Sin user_id, el token mismo; sin week, todas las semanas. Las ho
- tasks: project_id, week
    Las tareas de un proyecto: id, titulo, estado, responsable, fechas y horas estimadas. Con week, solo las que aportan horas en esa semana.
- capacity_incidents: include_resolved
    Los incidentes de capacidad pendientes de resolucion, los que tocan a la persona del token, con carga, capacidad y semana.
```

## Una llamada por tool, con datos reales

### `whoami`

```json
{
  "user_id": 1,
  "name": "Iván",
  "email": "ivan@example.com",
  "company_role": "gerente",
  "role_label": "Gerente",
  "is_manager": true,
  "department": null,
  "visible_project_ids": [
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "editable_project_ids": [
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ]
}
```

### `projects`

```json
{
  "projects": [
    {
      "id": 1,
      "name": "26009 - FLUID SYSTEM - Pasteurizador",
      "status": "active",
      "color": "#1f6feb",
      "owner_name": "Ana"
    },
    {
      "id": 2,
      "name": "26010 - FLUID SYSTEM - Planta quesos",
      "status": "active",
      "color": "#0a3d91",
      "owner_name": "Ana"
    },
    {
      "id": 6,
      "name": "26012 - CMEX - Planta noruega",
      "status": "active",
      "color": "#0e7490",
      "owner_name": "Jorge"
    },
    {
      "id": 9,
      "name": "26012 - TEC - Parking automático",
      "status": "active",
      "color": "#b45309",
      "owner_name": "Sebastián"
    },
    {
      "id": 7,
      "name": "26014 - CMEX - Planta México",
      "status": "active",
      "color": "#bf8700",
      "owner_name": "Jorge"
    },
    {
      "id": 10,
      "name": "26014 - TEC - Disoluciones",
      "status": "active",
      "color": "#8250df",
      "owner_name": "Sebastián"
    },
    {
      "id": 3,
      "name": "26025 - HORGAS - Levaduras",
      "status": "active",
      "color": "#1a7f37",
      "owner_name": "Ana"
    },
    {
      "id": 4,
      "name": "26035 - FLUID SYSTEM - Ultrafiltración",
      "
```

### `capacity_matrix`

```json
{
  "weeks": [
    {
      "week": "2026-W49",
      "holidays": []
    },
    {
      "week": "2026-W50",
      "holidays": []
    },
    {
      "week": "2026-W51",
      "holidays": []
    },
    {
      "week": "2026-W52",
      "holidays": []
    },
    {
      "week": "2026-W53",
      "holidays": []
    }
  ],
  "rows": [
    {
      "user_id": 3,
      "name": "Aketza",
      "department": "Alimentación",
      "cells": [
        {
          "week": "2026-W49",
          "hours": 20.0,
          "capacity": 40.0,
          "free_hours": 20.0,
          "overloaded": false,
          "policy_verdict": null,
          "hours_actual": null
        },
        {
          "week": "2026-W50",
          "hours": 45.28,
          "capacity": 40.0,
          "free_hours": -5.28,
          "overloaded": true,
          "policy_verdict": null,
          "hours_actual": null
        },
        {
          "week": "2026-W51",
          "hours": 22.72,
          "capacity": 36.0,
          "free_hours": 13.28,
          "overloaded": false,
          "policy_verdict": null,
          "hours_actual": null
        },
        {
          "week": "2026-W52",
          "hours": 0.0,
```

### `overloaded_people`

```json
{
  "overloaded": [
    {
      "user_id": 3,
      "name": "Aketza",
      "week": "2026-W50",
      "hours": 45.28,
      "capacity": 40.0,
      "policy_verdict": null
    },
    {
      "user_id": 11,
      "name": "Emilio",
      "week": "2026-W50",
      "hours": 44.0,
      "capacity": 40.0,
      "policy_verdict": null
    }
  ]
}
```

### `project_capacity`

```json
{
  "weeks": [
    {
      "week": "2026-W49",
      "holidays": []
    },
    {
      "week": "2026-W50",
      "holidays": []
    },
    {
      "week": "2026-W51",
      "holidays": []
    }
  ],
  "rows": [
    {
      "user_id": 3,
      "name": "Aketza",
      "department": "Alimentación",
      "cells": [
        {
          "week": "2026-W49",
          "hours": 20.0,
          "capacity": 40.0,
          "free_hours": 20.0,
          "overloaded": false,
          "policy_verdict": null,
          "hours_actual": null
        },
        {
          "week": "2026-W50",
          "hours": 20.0,
          "capacity": 40.0,
          "free_hours": 20.0,
          "overloaded": false,
          "policy_verdict": null,
          "hours_actual": null
        },
        {
          "week": "2026-W51",
          "hours": 0.0,
          "capacity": 36.0,
          "free_hours": 36.0,
          "overloaded": false,
          "policy_verdict": null,
          "hours_actual": null
        }
      ]
    },
    {
      "user_id": 2,
      "name": "Ana",
      "department": "Alimentación",
      "cells": [
        {
          "week": "2026-W49",
          "hours": 0.0,
          "capacity
```

### `actual_hours`

```json
{
  "user_id": 1,
  "week": null,
  "per_task": [],
  "total_hours": 0
}
```

### `tasks`

```json
{
  "tasks": [
    {
      "id": 1,
      "title": "Programación PLC del pasteurizador",
      "status": "in_progress",
      "assigned_name": "Aketza",
      "start_date": "2026-11-30",
      "end_date": "2026-12-11",
      "estimated_hours": 40.0,
      "week_hours": null
    },
    {
      "id": 2,
      "title": "Pruebas FAT de la línea",
      "status": "backlog",
      "assigned_name": "Héctor",
      "start_date": "2026-12-14",
      "end_date": "2026-12-18",
      "estimated_hours": 24.0,
      "week_hours": null
    }
  ]
}
```

### `capacity_incidents`

```json
{
  "incidents": []
}
```

## Lectura del resultado

- Las ocho tools responden **sin errores** y con datos reales de la
  demostracion: los dos sobrecargados que ve el panel (Aketza 45,28 h de
  40 en 2026-W50 y Emilio 44 de 40 en la misma semana) salen exactamente
  iguales por la tool `overloaded_people`.
- `capacity_matrix` y `project_capacity` devuelven la celda completa: carga,
  capacidad, horas libres, si esta sobrecargada, el veredicto de la
  politica y las horas reales registradas.
- `actual_hours` sale vacia porque nadie ha imputado horas todavia: la
  tabla `time_entries` esta a cero en la semilla. Es el dato real, no un
  fallo.
- `capacity_incidents` sale vacia porque no hay ninguna politica de
  capacidad configurada: sin politica no hay umbral que cruzar y no se
  abre ningun incidente.
- `whoami` devuelve el ambito del token: el gerente ve los 11 proyectos
  y puede escribir en los 11. Un token mas limitado veria menos, sin que
  el servidor tenga que saber nada de permisos.

## Lo que se corrigio al probarlo

La primera ejecucion dio dos fallos que ninguna suite unitaria habia
visto:

1. **La salida no era parseable.** Las tools que devuelven una lista la
   reparten en varios bloques de texto, y una lista vacia no da ninguno:
   un agente recibia algo que no podia parsear de un tiron. Ahora todas
   devuelven **un objeto** (`{"projects": [...]}`, `{"tasks": [...]}`,
   `{"incidents": [...]}`), asi que hay un unico documento JSON por
   llamada y la lista vacia es `{"tasks": []}`. El SDK valida el retorno
   contra el tipo declarado, asi que las anotaciones se ajustaron
   tambien: sin eso el servidor rechazaba su propia respuesta.
2. **La documentacion de la variable de entorno era ambigua.**
   `COREPLANNER_API_URL` es la raiz de la API **sin** el prefijo `/api`
   (lo anade el cliente); con el prefijo puesto, las llamadas salian a
   `/api/api/me` y respondian 404. El README del paquete ya lo decia; la
   prueba lo recordo.
