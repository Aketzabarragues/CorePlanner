# CorePlanner

Gestor ligero de capacidad para equipos de ingenieria. Sustituye las hojas de
Excel de gestion con dos piezas centrales:

- **Matriz de ocupacion**: cruza el equipo contra las semanas del ano, reparte
  las horas estimadas de cada tarea entre las semanas que abarca y marca en rojo
  a quien supera su capacidad semanal.
- **Diagrama de Gantt**: vista temporal de las tareas del proyecto, alimentada
  por `frappe-gantt` y exportable a calendario (`.ics`).

Todo el acceso a la aplicacion se controla por proyecto: cada persona entra en
un proyecto con un rol concreto (Project Manager, Ingeniero, Lector) y solo ve
y toca lo que ese rol permite.

## Stack

| Capa | Tecnologia |
| --- | --- |
| Base de datos | SQLite (desarrollo) -> PostgreSQL (produccion), SQLAlchemy 2.0 ORM |
| Backend | FastAPI asincrono, Uvicorn, JWT (PyJWT) |
| Frontend | Vue 3 Composition API, Vite, Tailwind CSS, Pinia, Vue Router |
| Gantt | `frappe-gantt` (frontend), `icalendar` (exportacion `.ics`) |

El ORM se declara con `Mapped` / `mapped_column` y con `ON DELETE` explicito,
de modo que el paso a PostgreSQL consiste en cambiar la URL de conexion y el
driver, sin reescribir el esquema.

## Motor de capacidad

`backend/services/capacity.py` calcula la carga semanal por persona. Las
funciones son puras: no tocan la base de datos ni dependen de estado global.

```
business_days(start, end)     -> dias laborables, sin sabados ni domingos
iso_week_key(day)             -> "2026-W10"
split_units(total_hours, days)-> reparto en centimas de hora
compute_task_week_units(...)  -> carga de una tarea por semana ISO
build_capacity_report(users, tasks) -> matriz de ocupacion
```

El algoritmo:

1. Se cuentan los dias laborables entre `start_date` y `end_date`, excluyendo
   sabados y domingos.
2. Las `estimated_hours` se reparten de forma uniforme entre esos dias.
3. Cada dia laborable imputa su carga a la semana ISO correspondiente, con el
   formato `YYYY-Www`.
4. La suma por persona y semana se compara con `weekly_base_hours`: si lo
   supera, la celda queda marcada con `is_overloaded`.

La aritmetica se hace en centimas de hora enteras (`Decimal` con
`ROUND_HALF_UP`), no en coma flotante. Asi el total del informe coincide
exactamente con la suma de las tareas y no depende del orden de las sumas.
Cada tarea se cuantiza al entrar, con un desvio maximo de 0,005 h.

El anio de la semana es el anio ISO, que puede no coincidir con el del
calendario: el 31 de diciembre de 2026 pertenece a `2026-W53`.

Las tareas sin persona asignada o sin fechas no se imputan a ninguna fila, pero
se listan en `unassigned_task_ids` y `undated_task_ids` para que la
planificacion incompleta siga siendo visible.

`backend/services/capacity_repository.py` carga los datos del proyecto y
devuelve el informe. `backend/tests/test_capacity.py` valida el motor puro y
`backend/tests/test_capacity_repository.py` lo contrasta contra la base de
datos.

## Estructura

```
coreplanner/
├── backend/
│   ├── auth.py           # hash bcrypt, emision y validacion de JWT
│   ├── config.py         # settings via pydantic-settings (prefijo COREPLANNER_)
│   ├── database.py       # engine asincrono y sesion por peticion
│   ├── main.py           # aplicacion FastAPI
│   ├── models.py         # esquema SQLAlchemy (users, roles, projects, ...)
│   ├── services/
│   │   ├── capacity.py           # motor de calculo (puro)
│   │   └── capacity_repository.py # lectura de datos del proyecto
│   ├── .env.example
│   └── tests/
├── frontend/
│   ├── scripts/
│   │   └── verify-css.mjs  # guard del bundle CSS
│   └── src/
│       ├── api/client.js # cliente HTTP con token JWT
│       ├── stores/       # estado Pinia (sesion)
│       ├── tests/        # tests de vitest
│       ├── views/        # Login, Proyectos, Capacidad, Gantt
│       └── router/
├── pyproject.toml        # configuracion de python (raiz del monorepo)
├── .gitignore
└── README.md
```

## Modelo de datos

| Tabla | Campos clave |
| --- | --- |
| `users` | `id`, `name`, `email`, `hashed_password`, `is_global_admin`, `weekly_base_hours` (40 por defecto) |
| `roles` | `id`, `name`, `permissions_json` |
| `projects` | `id`, `parent_id` (subproyectos), `name`, `status` |
| `project_members` | `user_id`, `project_id`, `role_id` (clave primaria compuesta) |
| `tasks` | `id`, `project_id`, `assigned_to`, `title`, `status`, `start_date`, `end_date`, `estimated_hours` |

Un usuario puede tener un rol distinto en cada proyecto. El token JWT lleva la
lista de permisos por `project_id`, de forma que la autorizacion se resuelve
sin tocar la base de datos en cada peticion.

## Puesta en marcha

El repositorio es un monorepo: `backend/` y `frontend/` se mueven por separado.
El `pyproject.toml` vive en la raiz para que `backend` sea un paquete
importable (`backend.models`) y para que `pytest` encuentre las pruebas desde
cualquier subdirectorio.

### Backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn backend.main:app --reload
```

La API queda en `http://127.0.0.1:8000` y la documentacion interactiva en
`/docs`. El esquema se crea solo al arrancar (SQLite). Para PostgreSQL:

```powershell
$env:COREPLANNER_DATABASE_URL = "postgresql+asyncpg://usuario:clave@localhost/coreplanner"
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

La SPA queda en `http://localhost:5173` y redirige las llamadas a `/api` hacia
el backend por el proxy de Vite.

### Configuracion

Todas las variables usan el prefijo `COREPLANNER_`. Copia `backend/.env.example`
a `backend/.env` y ajusta, sobre todo `COREPLANNER_JWT_SECRET_KEY`, que debe
cambiarse en cualquier despliegue real.

## Pruebas

```powershell
# Backend
pytest

# Frontend
cd frontend
npm test
npm run build
npm run verify:css
```

`verify:css` extrae las clases Tailwind usadas en las plantillas y comprueba
que todas han acabado en el bundle compilado, para detectar un rebuild
parcial que pierda estilos sin avisar.

## Estado actual

Base del proyecto: esquema de datos, autenticacion JWT, esqueleto del frontend
con login, listado de proyectos y las vistas de capacidad y Gantt. Pendiente
de implementar: los endpoints de proyectos, la matriz de ocupacion con reparto
semanal, el feed JSON del Gantt, la exportacion `.ics` y el CRUD completo de
tareas y miembros.

### Detalles de implementacion que conviene conocer

- **Integridad referencial en SQLite.** SQLite la tiene desactivada por
  defecto, de modo que `ON DELETE CASCADE` y `ON DELETE RESTRICT` no se
  aplicarian. `backend/database.py` activa `PRAGMA foreign_keys=ON` en cada
  conexion, de modo que el comportamiento en desarrollo coincide con el de
  PostgreSQL.
- **Rol en uso.** `project_members.role_id` usa `ON DELETE RESTRICT`: un rol
  asignado a alguien no se puede borrar hasta que se reasigne.
- **Subject del token.** RFC 7519 obliga a que `sub` sea texto, asi que el
  token lo lleva como string y `TokenPayload` lo recupera como entero.
- **Coste de bcrypt.** `hash_password` rechaza contrasenas de mas de 72 bytes
  en UTF-8, que es el limite de bcrypt, en lugar de truncarlas en silencio.

