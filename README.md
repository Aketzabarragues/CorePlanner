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
working_days(start, end, ...)  -> dias laborables con su peso (festivos de medio dia)
iso_week_key(day)             -> "2026-W10"
split_units(total_hours, days)-> reparto en centimas de hora
split_weighted_units(...)      -> reparto proporcional al peso de cada dia
compute_task_week_units(...)  -> carga de una tarea por semana ISO
build_capacity_report(people, tasks) -> matriz de ocupacion
```

El algoritmo:

1. Se cuentan los dias laborables entre `start_date` y `end_date`, excluyendo
   sabados, domingos y los dias no laborables que apliquen a la persona
   asignada. Un festivo de medio dia pesa la mitad que un dia normal.
2. Las `estimated_hours` se reparten de forma uniforme entre esos dias, en
   proporcion a su peso.
3. Cada dia laborable imputa su carga a la semana ISO correspondiente, con el
   formato `YYYY-Www`.
4. La capacidad de la celda sale del **horario vigente** de la persona en esa
   semana: el ultimo horario cuya entrada en vigor no es posterior al lunes.
   La capacidad es la suma de sus dias multiplicada por el factor de
   disponibilidad.
5. Si la persona no tiene horario, se usan sus `weekly_base_hours`. Si la
   capacidad resuelta queda en cero, **se desconoce**: no se marca como
   sobrecargada, porque el motor no inventa un limite que nadie ha definido.
6. La suma por persona y semana se compara con esa capacidad: si la supera, la
   celda queda marcada con `is_overloaded`.

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
│   │   ├── departments.py    # listado y edicion de departamentos
│   │   ├── gantt.py          # feed JSON del Gantt
│   │   ├── kanban.py         # tablero por estados
│   │   ├── me.py             # ambito de la persona que entra
│   │   ├── members.py        # miembros del proyecto
│   │   ├── non_working_days.py # dias no laborables del calendario
│   │   ├── overview.py       # capacidad y Gantt globales
│   │   ├── people.py         # directorio, horarios y competencias
│   │   ├── projects.py       # listado, alta y edicion de proyectos
│   │   ├── roles.py          # catalogo de roles
│   │   ├── skills.py         # catalogo de competencias
│   │   ├── tasks.py          # CRUD de tareas
│   │   └── users.py          # personas de la organizacion
│   ├── auth.py           # hash bcrypt, emision y validacion de JWT
│   ├── config.py         # settings via pydantic-settings (prefijo COREPLANNER_)
│   ├── database.py       # engine asincrono y sesion por peticion
│   ├── main.py           # aplicacion FastAPI
│   ├── migrations.py     # columnas nuevas en bases ya creadas
│   ├── models.py         # esquema SQLAlchemy (users, roles, projects, ...)
│   ├── schemas.py        # modelos Pydantic de la API
│   ├── security.py       # dependencias de autorizacion por proyecto
│   ├── seed.py           # datos de demostracion
│   ├── services/
│   │   ├── capacity.py           # motor de calculo (puro)
│   │   ├── capacity_repository.py # lectura de datos de capacidad
│   │   ├── configuration.py       # reglas de personas, departamentos y proyectos
│   │   ├── gantt.py               # tareas y miembros del Gantt (puro)
│   │   ├── gantt_repository.py    # lectura del feed del Gantt
│   │   ├── kanban.py              # agrupacion por estado (puro)
│   │   ├── kanban_repository.py   # lectura del tablero
│   │   ├── people.py              # directorio, horarios y competencias
│   │   ├── schedule.py            # horario versionado y capacidad (puro)
│   │   ├── scope.py               # ambito por rol de empresa
│   │   ├── tasks.py               # reglas de alta, edicion y borrado
│   │   ├── units.py               # centimas de hora (puro)
│   │   └── work_calendar.py       # dias no laborables
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
│       │   ├── TaskForm.vue        # alta y edicion de tarea
│       │   ├── people/             # directorio, ficha, competencias y calendario
│       │   └── settings/           # paneles de la configuracion
│       ├── stores/       # estado Pinia (sesion, proyectos y departamentos)
│       ├── tests/        # tests de vitest
│       ├── utils/        # helpers puros (gantt, kanban, navegacion, semanas)
│       ├── views/        # Login, Proyectos, Departamentos, Personas, Capacidad, Gantt, Kanban, Miembros, Resumen, Configuración, Pendientes
│       └── router/       # rutas y guardas de sesion
├── docs/
│   ├── especificaciones.md              # alcance y reglas de la v1
│   └── openproject/
│       ├── analisis-openproject.md        # ingenieria inversa de OpenProject
│       └── plan-replicacion-coreplanner.md # plan de replicacion por fases
├── pyproject.toml        # configuracion de python (raiz del monorepo)
├── .gitignore
└── README.md
```

## Modelo de datos

| Tabla | Campos clave |
| --- | --- |
| `users` | `id`, `name`, `email`, `hashed_password`, `is_global_admin`, `company_role`, `job_title`, `seniority`, `employment_type`, `weekly_base_hours` (40 por defecto), `department_id` |
| `roles` | `id`, `name`, `permissions_json` |
| `departments` | `id`, `name` (unico), `manager_id` |
| `projects` | `id`, `parent_id` (subproyectos), `name`, `status`, `department_id`, `owner_id` |
| `project_members` | `user_id`, `project_id`, `role_id` (clave primaria compuesta) |
| `tasks` | `id`, `project_id`, `assigned_to`, `title`, `status`, `start_date`, `end_date`, `estimated_hours` |
| `working_schedules` | `user_id`, `valid_from`, `monday`..`sunday` (centimas), `availability_factor`, `note` |
| `non_working_days` | `date`, `name`, `scope` (global o de departamento), `department_id`, `half_day` |
| `skills` | `id`, `name` (unico) |
| `person_skills` | `user_id`, `skill_id`, `level` (de 1 a 3) |

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

| Email | Rol de empresa | Departamento |
| --- | --- | --- |
| `admin@example.com` | Gerente | sin departamento |
| `ana@example.com` | Jefe de departamento | Automatización & SCADA |
| `sebastian@example.com` | Tecnico | Automatización & SCADA |
| `marta@example.com` | Tecnico | Automatización & SCADA |
| `diego@example.com` | Tecnico | Automatización & SCADA |
| `hector@example.com` | Tecnico | Automatización & SCADA |
| `jorge@example.com` | Jefe de departamento | Oficina Técnica / EPLAN |
| `lucia@example.com` | Tecnico | Oficina Técnica / EPLAN |
| `ivan@example.com` | Jefe de departamento | Mantenimiento |
| `nuria@example.com` | Jefe de departamento | Control de Calidad |

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
| `GET` | `/api/me` | token valido; ambito de la persona |
| `GET` | `/api/users` | gerente |
| `POST` | `/api/users` | gerente |
| `PATCH` | `/api/users/{user_id}` | gerente |
| `GET` | `/api/roles` | gerente; catalogo de roles de empresa |
| `GET` | `/api/roles/project` | gerente; roles de proyecto |
| `POST` | `/api/departments` | gerente |
| `PATCH` | `/api/departments/{id}` | gerente |
| `POST` | `/api/projects` | gerente |
| `PATCH` | `/api/projects/{id}` | gerente |
| `POST` | `/api/projects/{id}/members` | gerente |
| `DELETE` | `/api/projects/{id}/members/{user_id}` | gerente |
| `GET` | `/api/people` | token valido; directorio segun el ambito, con `?week=` |
| `GET` | `/api/people/{id}` | token valido; ficha con el historial de horarios |
| `POST` | `/api/people/{id}/schedules` | gerente; nueva version de horario |
| `PATCH` | `/api/people/{id}/schedules/{sid}` | gerente; corrige una version |
| `DELETE` | `/api/people/{id}/schedules/{sid}` | gerente; quita una version |
| `PUT` | `/api/people/{id}/skills` | gerente; fija las competencias de la persona |
| `GET` | `/api/skills` | token valido; catalogo de competencias |
| `POST` | `/api/skills` | gerente |
| `PATCH` | `/api/skills/{id}` | gerente; renombra |
| `DELETE` | `/api/skills/{id}` | gerente; 409 si alguien la tiene asignada |
| `GET` | `/api/non-working-days` | token valido; filtros `from`, `to` y `department_id` |
| `POST` | `/api/non-working-days` | gerente |
| `DELETE` | `/api/non-working-days/{id}` | gerente |
| `GET` | `/api/capacity` | token valido, filtro opcional `department_id` |
| `GET` | `/api/gantt` | token valido |
| `GET` | `/api/tasks` | token valido, filtros `assigned_to` y `week` |
| `POST` | `/api/projects/{id}/tasks` | `task.write` en el proyecto |
| `PATCH` | `/api/tasks/{task_id}` | `task.write` en el proyecto de la tarea |
| `DELETE` | `/api/tasks/{task_id}` | `task.write` en el proyecto de la tarea |

El listado de tareas admite los filtros `assigned_to` y `week` (semana ISO,
por ejemplo `2026-W46`).

## Roles y ambito

Cada persona tiene un rol de empresa y un departamento. El rol de empresa
decide **que se ve**, y el rol dentro de cada proyecto decide **que se puede
hacer**. Son dos ejes separados.

| Rol de empresa | Ve | Puede escribir |
| --- | --- | --- |
| `gerente` | todos los proyectos y todas las personas | en todos los proyectos |
| `jefe_departamento` | los proyectos de su departamento y los de los que es miembro | en los proyectos de su departamento |
| `tecnico` | los proyectos de los que es miembro y los que tiene tareas | en los proyectos de los que es miembro |

`backend/services/scope.py` resuelve ese ambito y `backend/api/me.py` lo
devuelve para que la interfaz no ofrezca acciones que van a fallar: un
proyecto que solo se puede ver aparece como **solo lectura** y sin boton de
alta de tarea.

El alcance se aplica en `list_accessible_projects`, que es el punto por el que
pasan el listado de proyectos, la matriz global, el Gantt global y el listado
global de tareas. En `check_project_permission`, los permisos que concede el
rol de empresa se suman a los del rol de proyecto: el jefe de un area puede
trabajar en los proyectos de su area aunque no sea miembro.

El detalle completo esta en `docs/especificaciones.md`.

## Configuracion

La pantalla `/configuration` es del gerente. Reune en cinco pestanas todo lo
que se puede cambiar de la organizacion:

| Pestana | Que se gestiona |
| --- | --- |
| Personas | alta y modificacion de gente: rol de empresa, departamento y horas base |
| Departamentos | alta, renombre y responsable |
| Proyectos | alta y modificacion: estado, departamento que lo gestiona y responsable |
| Miembros | quien entra en cada proyecto y con que rol |
| Roles | catalogo de roles de empresa con su alcance, y de roles de proyecto con sus permisos |

El enlace aparece en el menu lateral, en un grupo **Administracion**, solo si
quien entra es el gerente. La API lo comprueba tambien: `require_manager` en
`backend/security.py` devuelve 403 a cualquier otro rol.

Reglas del dominio, en `backend/services/configuration.py`:

- El correo de una persona es unico.
- El responsable de un departamento **pertenece** a ese departamento: al
  asignarlo, la persona pasa a formar parte de el.
- Una persona no se mete dos veces en el mismo proyecto.
- Los cambios son parciales: un `PATCH` solo toca los campos que van en la
  peticion, como en las tareas.

## Personas y competencias

La pantalla `/people` es global y tiene tres pestanas: **Directorio**,
**Competencias** y **Días no laborables**. La persona deja de ser un usuario con
acceso y pasa a tener una identidad profesional.

| Pieza | Que resuelve |
| --- | --- |
| Horario versionado | La capacidad deja de ser un escalar y depende de la semana |
| Factor de disponibilidad | Permite "hasta marzo al 100 %, desde abril al 80 %" |
| Días no laborables con alcance | Una tarea que cruza un puente se reparte en los dias que existen |
| Puesto, nivel y tipo de contrato | Identidad profesional de la persona |
| Competencias con nivel 1-3 | Catalogo de habilidades y matriz |

Reglas del motor, en `backend/services/schedule.py`:

- El horario vigente de una semana es el ultimo con fecha de entrada en vigor
  anterior o igual al lunes de esa semana. Las versiones anteriores se
  conservan: el historial dice como ha cambiado la capacidad.
- La capacidad de la semana es la suma de las horas de los siete dias menos los
  dias no laborables que apliquen, multiplicada por el factor de disponibilidad.
- Un dia no laborable global se quita a todo el mundo; uno de departamento,
  solo a quien pertenece a ese departamento. Un festivo de medio dia pesa la
  mitad que un dia normal.
- Si la persona no tiene horario, se usan sus horas base semanales. Si la
  capacidad resuelta queda en cero, **se desconoce**: no se marca como
  sobrecargada, porque el motor no inventa un limite que nadie ha definido.

Quien ve el directorio depende del rol de empresa: el gerente ve a todo el
equipo con su carga, el jefe ve a su departamento con su carga y el tecnico ve
a su departamento **sin** la carga.

### Como se configura cada cosa

| Que | Donde | Quien |
| --- | --- | --- |
| Competencias del catalogo | Pestana **Competencias**, bloque "Catalogo de competencias" | Gerente |
| Nivel de una persona en cada competencia | Ficha de la persona, en "Competencias" | Gerente |
| Horario de una persona | Ficha de la persona, en "Historial de horarios" y "Nueva version de horario" | Gerente |
| Dias no laborables | Pestana **Dias no laborables** | Gerente |
| Puesto, nivel y tipo de contrato | `/configuration`, pestana **Personas** | Gerente |
| Horas base semanales | `/configuration`, pestana **Personas** | Gerente |

El catalogo de competencias no es una lista fija: se anade, se renombra y se
quita. Una competencia que alguien tiene asignada no se puede quitar, para no
dejar a nadie con un nivel sin nombre. Los horarios van por versiones: cada
una tiene su fecha de entrada en vigor y se pueden corregir o quitar, y el
historial conserva lo que habia antes.

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
| `/configuration` | global | configuracion de la organizacion (solo gerente) |
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
(por proyecto y consolidado), tablero Kanban, vista de departamentos, ambito
por rol de empresa (gerente, jefe de departamento y tecnico), pantalla de
configuracion de la organizacion y bloque de personas: horario versionado,
dias no laborables con alcance, competencias y pantalla de personas.
Pendiente de implementar: la exportacion `.ics`, el alta y baja de miembros del
proyecto desde la vista de proyecto, el cambio de rol y la pantalla de "Mi
trabajo".

### Especificaciones

`docs/especificaciones.md` define el alcance de la aplicacion: los tres roles
(gerente, jefe de departamento y tecnico), que ve cada uno, las reglas de
visibilidad, lo que tiene que haber y, sobre todo, lo que no tiene que haber en
la primera version. Es el documento que decide si una funcionalidad entra.

### Analisis de OpenProject

CorePlanner nace con la ambition de ser un OpenProject en version ligera: mismo
modelo de proyecto, persona y capacidad, con menos piezas. El trabajo de
ingenieria inversa esta documentado en `docs/openproject/`:

- `docs/openproject/analisis-openproject.md` recoge el modelo de datos real
  (consulta guardable, asignaciones con reparto diario, permisos con alcance de
  entidad) y las decisiones de no replicar.
- `docs/openproject/plan-replicacion-coreplanner.md` traduce ese modelo a un
  plan por fases sobre el codigo actual, con esquema de tablas y criterios de
  aceptacion.

Los dos documentos son la referencia para las fases siguientes: las primeras
fases replican el horario laboral por persona y las asignaciones explicitas,
que es lo que separa una ocupacion estimada de una ocupacion planificada.

### Analisis competitivo

En `docs/analisis-competitivo.md` se contrasta ese plan con once repositorios
de referencia (OpenProject, ERPNext, Plane, Leantime, Paperclip, AppFlowy,
Focalboard, Planka, Kanboard, Kaneo y Ever Gauzy), leidos a nivel de codigo.

Tres conclusiones que condicionan el trabajo:

- **El filtro de licencias.** Solo Paperclip, Kanboard y Kaneo son MIT y por
  tanto reutilizables. ERPNext y OpenProject son GPLv3; AppFlowy, Plane,
  Leantime y Ever Gauzy son AGPLv3; Focalboard y Planka tienen licencias
  propias que impiden el uso comercial a terceros. De los repos con licencia
  copyleft se reimplementa la idea, nunca se copia el codigo.
- **El hueco de mercado es nuestro.** Ninguno de los once tiene una matriz de
  carga persona por semana contra una capacidad base: tres de ellos (Plane,
  Kanboard y Planka) tienen cero ocurrencias del vocabulario de capacidad. No
  hay que copiar el producto de nadie; hay que profundizar en el dominio.
- **Cinco piezas que el plan actual no cubre**: politica de capacidad con
  umbral blando y veto humano (Paperclip), imputacion de horas reales frente
  a lo planificado (ERPNext, OpenProject), dependencias entre tareas y ruta
  critica (ERPNext, con `graphlib` de la stdlib), bitacora de cambios
  append-only (Kanboard, Leantime) y un servidor MCP que haga CorePlanner
  operable por un agente (Paperclip, Kaneo).

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

