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

## Control de acceso

Cada proyecto concede sus propios permisos a traves del rol de cada miembro.
Un endpoint protegido se declara con la dependencia
`require_project_permission(permiso)`, que comprueba que el token es valido y
que el rol del usuario en ese proyecto incluye el permiso.

| Situacion | Respuesta |
| --- | --- |
| Sin token o token invalido | 401 |
| Administrador global | Acceso a cualquier proyecto |
| Miembro con el permiso | Acceso |
| No miembro, o miembro sin el permiso | 403 |
| Proyecto inexistente | 404 |

El token lleva los permisos por proyecto, de modo que la comprobacion no
necesita consultar la base de datos en cada peticion.

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
│   ├── api/
│   │   ├── auth.py           # login
│   │   ├── members.py        # miembros del proyecto
│   │   ├── projects.py       # listado y matriz de capacidad
│   │   └── tasks.py          # CRUD de tareas
│   ├── auth.py           # hash bcrypt, emision y validacion de JWT
│   ├── config.py         # settings via pydantic-settings (prefijo COREPLANNER_)
│   ├── database.py       # engine asincrono y sesion por peticion
│   ├── main.py           # aplicacion FastAPI
│   ├── models.py         # esquema SQLAlchemy (users, roles, projects, ...)
│   ├── schemas.py        # modelos Pydantic de la API
│   ├── security.py       # dependencias de autorizacion por proyecto
│   ├── seed.py           # datos de demostracion
│   ├── services/
│   │   ├── capacity.py           # motor de calculo (puro)
│   │   ├── capacity_repository.py # lectura de datos del proyecto
│   │   └── tasks.py              # reglas de alta, edicion y borrado
│   ├── .env.example
│   └── tests/
├── frontend/
│   ├── scripts/
│   │   └── verify-css.mjs  # guard del bundle CSS
│   └── src/
│       ├── api/client.js # cliente HTTP con token JWT
│       ├── components/
│       │   ├── CapacityMatrix.vue  # tabla de ocupacion
│       │   ├── CellBreakdown.vue   # desglose de una celda
│       │   └── TaskForm.vue        # alta y edicion de tarea
│       ├── stores/       # estado Pinia (sesion)
│       ├── tests/        # tests de vitest
│       ├── views/        # Login, Proyectos, Gantt
│       └── router/
├── pyproject.toml        # configuracion de python (raiz del monorepo)
├── .gitignore
└── README.md
```

## Modelo de datos

| Tabla | Campos clave |
| --- | --- |
| `users` | `id`, `name`, `email`, `hashed_password`, `is_global_admin`, `weekly_base_hours` (40 por defecto), `department_id` |
| `roles` | `id`, `name`, `permissions_json` |
| `departments` | `id`, `name` (unico), `manager_id` |
| `projects` | `id`, `parent_id` (subproyectos), `name`, `status`, `department_id` |
| `project_members` | `user_id`, `project_id`, `role_id` (clave primaria compuesta) |
| `tasks` | `id`, `project_id`, `assigned_to`, `title`, `status`, `start_date`, `end_date`, `estimated_hours` |

Un usuario puede tener un rol distinto en cada proyecto. El token JWT lleva la
lista de permisos por `project_id`, de forma que la autorizacion se resuelve
sin tocar la base de datos en cada peticion.

Un proyecto pertenece a un departamento gestor, pero las tareas se pueden
asignar a cualquier persona del proyecto, este o de otro departamento: la
pertenencia al departamento no restringe la asignacion.

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

## Prueba en vivo

Tres comandos, en este orden, desde la raiz del repositorio. El primero deja
la base de datos con datos de demostracion, el segundo levanta la API y el
tercero la interfaz.

```powershell
# 1. Datos semilla (borra la base de datos si existe)
.\.venv\Scripts\python.exe backend\seed.py

# 2. API
.\.venv\Scripts\fastapi.exe dev backend\main.py --reload-dir backend

# 3. Interfaz (en otra terminal)
cd frontend
npm run dev
```

Abre `http://localhost:5173`. La matriz aparece cargada: filas = personas,
columnas = semanas ISO, y en rojo las semanas que superan las horas base.

El `--reload-dir backend` limita la recarga automatica a la carpeta del
backend. Sin el, el vigilante de ficheros tambien avisa de los cambios dentro
de `.venv` y el servidor se reinicia en bucle.

### Usuarios de demostracion

Todos con la contrasena `coreplanner`:

| Email | Rol | Departamento |
| --- | --- | --- |
| `admin@example.com` | Administrador global | sin departamento |
| `ana@example.com` | Project Manager | Automatización & SCADA |
| `sebastian@example.com` | Ingeniero | Automatización & SCADA |
| `jorge@example.com` | Lector | Oficina Técnica / EPLAN |

El frontend hace login automatico con `admin@example.com` al abrir y guarda el
token en `localStorage`.

### Endpoints

| Metodo | Ruta | Permiso |
| --- | --- | --- |
| `POST` | `/api/auth/login` | publico |
| `GET` | `/api/projects` | token valido |
| `GET` | `/api/projects/{id}/capacity` | `capacity.read` en el proyecto |
| `GET` | `/api/projects/{id}/tasks` | `capacity.read` en el proyecto |
| `GET` | `/api/projects/{id}/members` | `capacity.read` en el proyecto |
| `GET` | `/api/projects/{id}/gantt` | `gantt.read` en el proyecto |
| `GET` | `/api/projects/{id}/kanban` | `capacity.read` en el proyecto |
| `GET` | `/api/departments` | token valido |
| `POST` | `/api/projects/{id}/tasks` | `task.write` en el proyecto |
| `PATCH` | `/api/tasks/{task_id}` | `task.write` en el proyecto de la tarea |
| `DELETE` | `/api/tasks/{task_id}` | `task.write` en el proyecto de la tarea |

El listado de tareas admite los filtros `assigned_to` y `week` (semana ISO,
por ejemplo `2026-W46`).

## Gestion de tareas

La matriz es interactiva:

- **+ Nueva Tarea** abre un formulario con titulo, persona asignada (desplegable
  de miembros), fechas y horas estimadas.
- **Pulsa una celda** para ver el desglose de las tareas que componen esas horas.
- Desde el desglose se puede **editar** una tarea (cambiar titulo, persona,
  fechas u horas), **reasignarla** a otra persona del proyecto o
  **eliminarla**.
- Cualquier cambio recarga la matriz, de modo que se ve al instante como una
  celda pasa de rojo a neutro al alivar la carga de alguien.

El formulario no envia campos que no se han tocado: un `PATCH` con
`{"estimated_hours": "12.00"}` solo cambia las horas.

## Diagrama de Gantt

La vista `/projects/{id}/gantt` dibuja una barra por tarea con `frappe-gantt`:

- Cada barra lleva las fechas de la tarea, su avance segun el estado y la
  persona asignada, que aparece en la etiqueta y en el color de la barra.
- El selector **Dia / Semana / Mes** cambia la escala temporal.
- Al mover o redimensionar una barra se guardan las fechas con un `PATCH` de
  la tarea, de modo que el diagrama y la matriz de ocupacion cuentan lo mismo.
- Las tareas sin fechas no tienen sitio en el diagrama: se listan aparte en
  `undated_task_ids` para que no desaparezcan en silencio.

El backend devuelve las barras con el formato que espera la libreria:
`id`, `name`, `start`, `end`, `progress`, `dependencies` y `custom_class`. Los
identificadores viajan como texto porque la libreria compara con igualdad
estricta el identificador de la tarea con el que lee del DOM.

## Tablero Kanban

La vista `/projects/{id}/kanban` muestra las tareas en cuatro columnas:
Backlog, En Desarrollo, Pruebas (FAT/SAT) y Completado. Son los estados
`backlog`, `in_progress`, `testing` y `done`, los unicos que acepta la base de
datos y el `PATCH` de una tarea.

- Cada tarjeta muestra el titulo, quien la lleva, las horas estimadas y las
  fechas.
- Se mueve de columna arrastrandola con el raton o cambiando el estado en su
  desplegable. En los dos casos se guarda con un `PATCH /api/tasks/{id}`.

Las cuatro columnas estan siempre presentes en la respuesta, aunque esten
vacias, para que el tablero no cambie de forma al guardar.

## Departamentos

`GET /api/departments` devuelve los departamentos con su responsable. Un
departamento agrupa a las personas y es el gestor de los proyectos que
declaran su `department_id`.

La asignacion de tareas es transversal: una tarea de un proyecto de
Automatización puede llevarla alguien de Oficina Técnica, siempre que sea
miembro del proyecto.

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

Base del proyecto: esquema de datos con departamentos, autenticacion JWT,
frontend con login, listado de proyectos, matriz de ocupacion con reparto
semanal, CRUD de tareas, feed JSON del Gantt y tablero Kanban. Pendiente de
implementar: la exportacion `.ics`, el alta y baja de miembros del proyecto y
el cambio de rol.

### Detalles de implementacion que conviene conocer

- **No hay aritmetica en coma flotante.** Las columnas de horas son
  `Numeric(12, 2)` y el motor trabaja con `Decimal` y centimas de hora
  enteras. El float solo aparece en el borde JSON, donde el valor tiene como
  maximo dos decimales. Un test comprueba que el motor nunca devuelve un
  float.
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
- **Rutas sin project_id.** `/api/tasks/{task_id}` deduce el proyecto de la
  propia tarea para resolver el permiso, de modo que la ruta no puede usarse
  para tocar una tarea de otro proyecto.
- **PATCH parcial.** Solo se tocan los campos presentes en la peticion. Para
  desasignar una tarea hay que enviar `assigned_to` con null de forma
  explicita.

