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
│   │   ├── departments.py    # listado de departamentos
│   │   ├── gantt.py          # feed JSON del Gantt
│   │   ├── kanban.py         # tablero por estados
│   │   ├── members.py        # miembros del proyecto
│   │   ├── overview.py       # capacidad y Gantt globales
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
│   │   ├── capacity_repository.py # lectura de datos de capacidad
│   │   ├── gantt.py               # tareas y miembros del Gantt (puro)
│   │   ├── gantt_repository.py    # lectura del feed del Gantt
│   │   ├── kanban.py              # agrupacion por estado (puro)
│   │   ├── kanban_repository.py   # lectura del tablero
│   │   └── tasks.py              # reglas de alta, edicion y borrado
│   ├── .env.example
│   └── tests/
├── frontend/
│   ├── scripts/
│   │   └── verify-css.mjs  # guard del bundle CSS
│   └── src/
│       ├── api/client.js # cliente HTTP con token JWT
│       ├── components/
│       │   ├── AppIcon.vue        # iconos SVG de la interfaz
│       │   ├── AppShell.vue       # menu lateral, cabecera y area de contenido
│       │   ├── CapacityMatrix.vue  # tabla de ocupacion
│       │   ├── CellBreakdown.vue   # desglose de una celda
│       │   ├── ProjectPicker.vue   # desplegable de proyecto
│       │   └── TaskForm.vue        # alta y edicion de tarea
│       ├── stores/       # estado Pinia (sesion, proyectos y departamentos)
│       ├── tests/        # tests de vitest
│       ├── utils/        # helpers puros (gantt, kanban, navegacion)
│       ├── views/        # Login, Proyectos, Departamentos, Capacidad, Gantt, Kanban, Miembros, Resumen, Pendientes
│       └── router/       # rutas y guardas de sesion
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

### Proyectos de demostracion

| Proyecto | Departamento | Contenido |
| --- | --- | --- |
| Linea Pasteurizadora SIVE | Automatización & SCADA | Sebastián acumula 48 h en 2026-W46, por encima de su base de 40 h, y la celda aparece en rojo |
| Red de tuberias linea 2 | Oficina Técnica / EPLAN | Ana, de Automatización, trabaja en un proyecto que gestiona la oficina técnica |

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
| `GET` | `/api/capacity` | token valido, filtro opcional `department_id` |
| `GET` | `/api/gantt` | token valido |
| `GET` | `/api/tasks` | token valido, filtros `assigned_to` y `week` |
| `POST` | `/api/projects/{id}/tasks` | `task.write` en el proyecto |
| `PATCH` | `/api/tasks/{task_id}` | `task.write` en el proyecto de la tarea |
| `DELETE` | `/api/tasks/{task_id}` | `task.write` en el proyecto de la tarea |

El listado de tareas admite los filtros `assigned_to` y `week` (semana ISO,
por ejemplo `2026-W46`).

## Gestion de tareas

El alta de tareas vive en la cabecera, con el boton **+ Nueva Tarea**, que
funciona en cualquier vista del proyecto abierto. La matriz es interactiva:

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

La vista global `/departments` los muestra con su responsable y los proyectos
que gestiona cada uno, con los proyectos sin departamento aparte.

La asignacion de tareas es transversal: una tarea de un proyecto de
Automatización puede llevarla alguien de Oficina Técnica, siempre que sea
miembro del proyecto.

## Armazon de la aplicacion

`frontend/src/components/AppShell.vue` envuelve a las vistas en un menu lateral
y una cabecera, al estilo de OpenProject o Linear.

La navegacion tiene dos contextos, y el que esta abierto lo decide la URL: si
lleva un identificador de proyecto, se esta en el espacio de proyecto; si no,
en el espacio global. El menu lateral, las migas y las acciones de la cabecera
cambian con el contexto.

El menu lateral lleva el isotipo con su version, un bloque de contexto que dice
en que espacio se esta y, al pie, la tarjeta de quien esta dentro con su
avatar, su departamento y el boton de cerrar sesion. Se puede colapsar a una
tira de iconos; el estado se guarda en `localStorage` con la clave
`coreplanner_sidebar`.

La cabecera lleva las migas de pan, el selector de contexto y las acciones
rapidas. En el espacio de proyecto aparecen la pila con el estado del proyecto
y el boton **+ Nueva Tarea**, que abre el alta de tarea en un modal sobre la
vista que este abierta. En el espacio global solo queda el selector.

### Selector de contexto

El desplegable de la cabecera es el que salta de un contexto al otro. Su
primera opcion es **Todos los proyectos (Global)** y a continuacion vienen los
proyectos agrupados por su departamento gestor. Al elegir un proyecto se entra
en la vista homologa de la que se estaba viendo; si la vista no tiene
equivalente global se cae en el listado de proyectos, y al reves en la matriz
del proyecto.

### Menu lateral

En el espacio global:

| Grupo | Vistas |
| --- | --- |
| Espacio Global | Proyectos, Capacidad Global, Gantt Global, Departamentos |

En el espacio de proyecto:

| Grupo | Vistas |
| --- | --- |
| Planificación & ejecucion | Matriz de Capacidad, Cronograma (Gantt), Tablero Kanban |
| Gestion & equipo | Miembros y Asignaciones |

La configuracion del proyecto no esta en el menu: se llega desde el resumen
del proyecto, que es donde tiene sentido abrirla. La ruta sigue viva y explica
lo que queda por hacer, para no dejar enlaces muertos.

### Rutas

| Ruta | Contexto | Vista |
| --- | --- | --- |
| `/` | - | redirige a la matriz del primer proyecto accesible |
| `/login` | - | acceso, con entrada automatica si ya hay sesion guardada |
| `/projects` | global | listado de proyectos |
| `/capacity` | global | matriz de ocupacion consolidada |
| `/gantt` | global | cronograma de todos los proyectos |
| `/departments` | global | departamentos y sus responsables |
| `/projects/{id}` | proyecto | resumen del proyecto |
| `/projects/{id}/capacity` | proyecto | matriz de ocupacion |
| `/projects/{id}/gantt` | proyecto | diagrama de Gantt |
| `/projects/{id}/kanban` | proyecto | tablero Kanban |
| `/projects/{id}/members` | proyecto | miembros y asignaciones |
| `/projects/{id}/settings` | proyecto | configuracion del proyecto (pendiente) |

El proyecto abierto se toma siempre de la URL, de modo que al recargar la
pagina se vuelve al mismo proyecto y a la misma vista.

Las guardas del router live en `frontend/src/router/guards.js`: una comprueba
la sesion antes de entrar en una vista privada y otra lleva la raiz al primer
proyecto disponible. Si falta la sesion, el guard lleva al formulario de acceso
recordando la vista que se queria abrir, y el formulario vuelve a ella al
entrar.

### Vista global

Los endpoints globales no dependen de un proyecto: reunen todo lo que la
persona que entra puede ver.

| Endpoint | Que devuelve |
| --- | --- |
| `GET /api/capacity` | matriz de ocupacion de todos los proyectos accesibles, con filtro opcional `?department_id=` |
| `GET /api/gantt` | barras de todos los proyectos accesibles, cada una con su `project_id` y `project_name` |
| `GET /api/tasks` | tareas de todos los proyectos accesibles, con los filtros `assigned_to` y `week` |

El alcance son los proyectos accesibles de quien entra: el administrador global
ve todos y un miembro solo los suyos. La matriz global suma las horas de cada
persona entre proyectos y sus filas son la union de los miembros de esos
proyectos con las personas que tengan tareas asignadas. El filtro por
departamento limita a los proyectos que gestiona ese departamento.

El listado global de tareas es lo que permite abrir el desglose de una celda
de la matriz global: sin el, la celda no sabria que tareas la componen.

En el Gantt global cada barra lleva delante el nombre del proyecto, y el
frontend lo antepone solo en este modo: en el espacio de proyecto la barra ya
esta dentro de su contexto.

### Iconos y clases

Los iconos salen de `AppIcon.vue`, que guarda los trazados de Heroicons. El
tamano lo fija el elemento que envuelve al icono, nunca una propiedad: las
clases llegan al SVG por el envoltorio, que debe ser flex o bloque, porque en
un `span` en linea el ancho y el alto no se aplican.

Las clases del aviso de estado se declaran en ramas `v-if` con su `class`
propia, y no en un objeto `:class`, porque el guard del bundle extrae todos
los literales de `:class` y los daba por clases de Tailwind que no existen.

### Datos frescos al cambiar de vista

El router reutiliza la misma instancia del componente cuando solo cambia el
parametro de la ruta, de modo que `CapacityMatrix.vue` vigila `props.id` y
vuelve a pedir la matriz. Sin esa recarga, cambiar de proyecto en la cabecera
dejaria en pantalla los datos del proyecto anterior.

Cada vista pide sus datos al montarse, de modo que un cambio hecho en el
Gantt o en el Kanban se ve al volver a la capacidad. Para que el alta de tarea
tambien refresque la vista abierta, el shell incrementa `store.tasksRevision` y
el `router-view` se monta con esa marca como clave. No hay cache en el cliente:
cada peticion va al servidor.

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
frontend con login, listado de proyectos, armazon de aplicacion con menu
lateral, cabecera con migas, selector de contexto y alta de tarea, navegacion
dual con espacio global y espacio de proyecto, matriz de ocupacion con reparto
semanal (por proyecto y consolidada), CRUD de tareas, feed JSON del Gantt
(por proyecto y consolidado), tablero Kanban y vista de departamentos.
Pendiente de implementar: la exportacion `.ics`, el alta y baja de miembros del
proyecto, el cambio de rol y la configuracion del proyecto.

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
- **Reutilizacion de instancia en el router.** Cuando solo cambia el
  parametro de la ruta, el router reutiliza la instancia del componente, que
  no se vuelve a montar. Por eso las vistas que dependen del proyecto
  vigilan `props.id` y recargan.
- **Cierre de sesion frente a acceso automatico.** El acceso automatico con
  `admin@example.com` no repone una sesion que el usuario cerro: el store de
  sesion guarda esa marca en `localStorage` y el guard lleva al formulario de
  acceso.

