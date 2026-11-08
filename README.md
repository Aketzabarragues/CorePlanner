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
| Base de datos | SQLite (desarrollo) · PostgreSQL (previsto, sin probar), SQLAlchemy 2.0 ORM |
| Backend | FastAPI asincrono, Uvicorn, JWT (PyJWT) |
| Frontend | Vue 3 Composition API, Vite, Tailwind CSS, Pinia, Vue Router |
| Gantt | `frappe-gantt` (frontend). La exportacion `.ics` esta pendiente |

El ORM se declara con `Mapped` / `mapped_column` y con `ON DELETE` explicito,
lo que hace el cambio de motor mucho menos painful. **PostgreSQL no se ha
probado**: la migracion de esquema es SQL estandar y no depende del catalogo
de SQLite, pero las restricciones y los `ON DELETE` hay que revisarlos contra
ese motor antes de confiar en el.

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
| No miembro, pero con tareas asignadas en el proyecto | Lectura (`capacity.read`, `gantt.read`); escritura 403 |
| Miembro sin el permiso, o sin vinculo con el proyecto | 403 |
| Proyecto inexistente | 404 |

El token lleva la identidad de la persona (su identificador y su rol de
empresa), pero **los permisos por proyecto se consultan en la base de datos en
cada peticion**. Asi un cambio de rol surte efecto de inmediato, sin esperar a
que caduque el token.

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
│   │   ├── my_work.py        # tareas propias y carga por semana
│   │   ├── non_working_days.py # dias no laborables del calendario
│   │   ├── overview.py       # capacidad y Gantt globales
│   │   ├── people.py         # directorio, horarios y competencias
│   │   ├── projects.py       # listado, alta y edicion de proyectos
│   │   ├── roles.py          # catalogo de roles
│   │   ├── skills.py         # catalogo de competencias
│   │   ├── tasks.py          # CRUD de tareas
│   │   ├── users.py          # personas de la organizacion
│   │   └── work_calendar.py  # informe del calendario laboral
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
│   │   ├── calendar_report.py    # impacto de los dias no laborables en la capacidad
│   │   ├── configuration.py       # reglas de personas, departamentos y proyectos
│   │   ├── gantt.py               # tareas y miembros del Gantt (puro)
│   │   ├── gantt_repository.py    # lectura del feed del Gantt
│   │   ├── kanban.py              # agrupacion por estado (puro)
│   │   ├── kanban_repository.py   # lectura del tablero
│   │   ├── my_work.py             # tareas propias y carga por semana
│   │   ├── panel.py               # resumen global de la organizacion
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
│       │   ├── LoadBars.vue        # grafico de barras de carga por semana
│       │   ├── ProjectPicker.vue   # desplegable de proyecto
│       │   ├── ModalDialog.vue      # modal centrado de los formularios de configuracion
│       │   ├── TaskForm.vue        # alta y edicion de tarea
│       │   ├── DayDetail.vue       # detalle de un dia del calendario
│       │   ├── WeekGrid.vue        # rejilla de la vista semanal del calendario
│       │   ├── LaborMonthGrid.vue  # rejilla del mes del calendario laboral
│       │   │   ├── people/             # directorio, ficha y competencias
│       │   │   └── settings/           # paneles de la configuracion
│       ├── stores/       # estado Pinia (sesion, proyectos y departamentos)
│       ├── tests/        # tests de vitest
│       ├── utils/        # helpers puros (gantt, kanban, navegacion, semanas)
│       ├── views/        # Login, Panel, Mi trabajo, Proyectos, Departamentos, Personas, Capacidad, Gantt, Calendario, Kanban, Miembros, Resumen, Configuración, Configuración de proyecto
│       └── router/       # rutas y guardas de sesion
├── docs/
│   ├── especificaciones.md              # alcance y reglas de la v1
│   └── openproject/
│       ├── analisis-openproject.md        # ingenieria inversa de OpenProject
│       └── plan-replicacion-coreplanner.md # plan de replicacion por fases
├── iniciar.py             # arranque de la API y la interfaz en un comando
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

### Arranque rapido

```powershell
python iniciar.py
```

Levanta la API y la interfaz a la vez, espera a que las dos respondan y abre el
navegador en `http://localhost:5173`. `Ctrl+C` cierra los dos procesos. Si un
puerto ya esta ocupado, lo da por arrancado y no lo relanza, de modo que se
puede arrancar solo la parte que falte.

El script no siembra la base de datos ni instala dependencias: para eso estan
`backend/seed.py` y los apartados siguientes.

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

La URL es lo unico que cambia, pero **es la parte facil**: todavia no se ha
ejecutado la aplicacion contra PostgreSQL.

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

Dos avisos, porque los dos son defaults de demostracion:

- **El secreto JWT tiene un valor por defecto** en `backend/config.py` y nada comprueba al arrancar que se haya cambiado. Fuera de la maquina del desarrollador hay que cambiarlo.
- **El frontend entra solo con el administrador de demostracion** (`admin@example.com` / `coreplanner`). Solo lo hace en desarrollo, o con la bandera `VITE_DEMO_AUTO_LOGIN` puesta a `true` (vease `frontend/.env.example`). En una compilacion de produccion queda apagado y cada persona entra con sus credenciales.

Ademas, **un error del servidor ya no cierra la sesion**: solo lo hace un 401.
Con un 500 la sesion sigue viva y recargar la vista puede resolverlo.

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

Los pasos 2 y 3 son los que hace `python iniciar.py`, que ademas abre el
navegador. El paso 1 es independiente: solo hace falta la primera vez o cuando
se quiera empezar de cero.

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
| `PATCH` | `/api/projects/{id}/members/{user_id}` | gerente; cambia el rol que ejerce |
| `GET` | `/api/people` | token valido; directorio segun el ambito, con `?week=` |
| `GET` | `/api/people/{id}` | token valido; ficha con el historial de horarios |
| `POST` | `/api/people/{id}/schedules` | gerente; nueva version de horario |
| `PATCH` | `/api/people/{id}/schedules/{sid}` | gerente; corrige una version |
| `DELETE` | `/api/people/{id}/schedules/{sid}` | gerente; quita una version |
| `PUT` | `/api/people/{id}/skills` | gerente; fija las competencias de la persona |
| `GET` | `/api/skills` | token valido; catalogo de competencias, con cuantas personas tienen cada una |
| `POST` | `/api/skills` | gerente |
| `PATCH` | `/api/skills/{id}` | gerente; renombra |
| `DELETE` | `/api/skills/{id}` | gerente; 409 si alguien la tiene asignada |
| `GET` | `/api/non-working-days` | token valido; filtros `from`, `to` y `department_id` |
| `POST` | `/api/non-working-days` | gerente |
| `DELETE` | `/api/non-working-days/{id}` | gerente |
| `GET` | `/api/capacity` | token valido, filtros opcionales `department_id` y `project_id` |
| `GET` | `/api/gantt` | token valido, filtro opcional `project_id` |
| `GET` | `/api/panel` | token valido; resumen de la organizacion |
| `GET` | `/api/my-work` | token valido; tareas propias y carga por semana |
| `GET` | `/api/tasks` | token valido, filtros `assigned_to`, `week`, `from` y `to` |
| `POST` | `/api/projects/{id}/tasks` | `task.write` en el proyecto |
| `PATCH` | `/api/tasks/{task_id}` | `task.write` en el proyecto de la tarea |
| `DELETE` | `/api/tasks/{task_id}` | `task.write` en el proyecto de la tarea |

El listado de tareas admite los filtros `assigned_to` y `week` (semana ISO,
por ejemplo `2026-W46`), y tambien el rango `from` y `to`. Si vienen la semana y
el rango a la vez, manda la semana.

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
trabajar en los proyectos de su area aunque no sea miembro, y un tecnico con
una tarea asignada puede consultar el proyecto, aunque tampoco sea miembro.

El detalle completo esta en `docs/especificaciones.md`.

## Configuracion

La pantalla `/configuration` es del gerente, con una excepcion: la pestana del
calendario laboral se puede leer desde cualquier rol. Reune en siete pestanas
todo lo que se puede cambiar de la organizacion:

| Pestana | Que se gestiona |
| --- | --- |
| Calendario laboral | dias no laborables: alta, baja, alcance y su impacto en la capacidad |
| Personas | alta y modificacion de gente: rol de empresa, departamento y horas base |
| Departamentos | alta, renombre y responsable |
| Proyectos | alta y modificacion: estado, departamento que lo gestiona y responsable |
| Miembros | quien entra en cada proyecto y con que rol |
| Roles | catalogo de roles de empresa con su alcance, y de roles de proyecto con sus permisos |
| Competencias | catalogo de habilidades: alta, renombre y baja |

La pestana abierta vive en la URL (`?tab=`). Quien no es gerente ve solo la del
calendario laboral, y en modo de lectura: puede consultar los festivos y su
impacto, pero no darlos de alta ni quitarlos.

Cada panel tiene su boton de alta: el formulario se abre en un modal centrado
y la tabla se queda limpia. Se cierra con ESC, con el boton o pulsando fuera.

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

La pantalla `/people` es global y tiene dos pestanas: **Directorio** y
**Competencias**. La persona deja de ser un usuario con acceso y pasa a tener una
identidad profesional. La pestana **Competencias** muestra la matriz de quien
cubre que; el catalogo de habilidades se mantiene en `/configuration`, en la
pestana **Competencias**. Los dias no laborables ya no estan aqui: viven en la
pestana **Calendario laboral** de la configuracion.

| Pieza | Que resuelve |
| --- | --- |
| Horario versionado | La capacidad deja de ser un escalar y depende de la semana |
| Factor de disponibilidad | Permite "hasta marzo al 100 %, desde abril al 80 %" |
| Días no laborables con alcance | Una tarea que cruza un puente se reparte en los dias que existen |
| Puesto, nivel y tipo de contrato | Identidad profesional de la persona |
| Competencias con nivel 1-3 | Matriz de quien cubre que |

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
| Competencias del catalogo | `/configuration`, pestana **Competencias** | Gerente |
| Nivel de una persona en cada competencia | Ficha de la persona, en "Competencias" | Gerente |
| Horario de una persona | Ficha de la persona, en "Historial de horarios" y "Nueva version de horario" | Gerente |
| Dias no laborables | `/configuration`, pestana **Calendario laboral** | Gerente |
| Puesto, nivel y tipo de contrato | `/configuration`, pestana **Personas** | Gerente |
| Horas base semanales | `/configuration`, pestana **Personas** | Gerente |
| Equipo de un proyecto | `/projects/{id}/members` | Gerente |
| Nombre, estado, departamento gestor y responsable de un proyecto | `/projects/{id}/settings` | Gerente |

El catalogo de competencias no es una lista fija: se anade, se renombra y se
quita, desde la pestana **Competencias** de la configuracion. Una competencia
que alguien tiene asignada no se puede quitar, para no dejar a nadie con un
nivel sin nombre; el catalogo dice cuantas personas tienen cada competencia.
Los horarios van por versiones: cada una tiene su fecha de entrada en vigor y
se pueden corregir o quitar, y el historial conserva lo que habia antes.

## Gestion de tareas

El alta de tareas vive en la cabecera, con el boton **+ Nueva Tarea**, que
funciona en cualquier vista del proyecto abierto. La matriz es interactiva:

- **Pulsa una celda** para ver el desglose de las tareas que componen esas horas,
  en el panel lateral.
- Desde el desglose se puede **editar** una tarea (cambiar titulo, persona,
  fechas u horas), **reasignarla** a otra persona del proyecto o
  **eliminarla**, y **crear** una tarea de esa semana.
- Una tarea tambien se puede **arrastrar** a la celda de otra persona, con
  previsualizacion: lo cuenta la seccion de la matriz de capacidad.
- Cualquier cambio recarga la matriz, de modo que se ve al instante como una
  celda pasa de rojo a neutro al alivar la carga de alguien.

El formulario no envia campos que no se han tocado: un `PATCH` con
`{"estimated_hours": "12.00"}` solo cambia las horas.

## Diagrama de Gantt

La vista `/gantt` dibuja una barra por tarea con `frappe-gantt`:

- Cada barra lleva las fechas de la tarea, su avance segun el estado y la
  persona asignada, que aparece en la etiqueta y en el color de la barra.
- El diagrama es de toda la organizacion; con el filtro `?project=` solo entran
  las barras de ese proyecto.
- El selector **Dia / Semana / Mes** cambia la escala temporal.
- Al mover o redimensionar una barra se guardan las fechas con un `PATCH` de
  la tarea, de modo que el diagrama y la matriz de ocupacion cuentan lo mismo.
- Las tareas sin fechas no tienen sitio en el diagrama: se listan aparte en
  `undated_task_ids` para que no desaparezcan en silencio.

El backend devuelve las barras con el formato que espera la libreria:
`id`, `name`, `start`, `end`, `progress`, `dependencies` y `custom_class`. Los
identificadores viajan como texto porque la libreria compara con igualdad
estricta el identificador de la tarea con el que lee del DOM.

## Calendario

El Gantt muestra la planificacion como barras sobre una linea de tiempo. El
calendario muestra la misma planificacion como una rejilla de meses: cada dia
del mes y, dentro, las tareas que lo ocupan. Vive en `/calendar`, con los
proyectos visibles, y con el filtro `?project=` para uno solo.

- La rejilla va de **lunes a domingo** y se navega por mes: anterior,
  siguiente y **Hoy**.
- Las **celdas tienen alto fijo**: el mes se ve siempre igual de regular, sin
  que una semana con muchas tareas desborde la rejilla. Lo que no cabe se ve
  **desplazando la celda**, de modo que no se esconde ninguna tarea.
- Cada tarea aparece en todos los dias de lunes a viernes que ocupa, con el
  color de su persona (el mismo que en el Gantt) y el proyecto en el texto
  emergente. El fin de semana queda vacio, porque el motor de capacidad solo
  reparte horas entre dias laborables.
- Los **dias no laborables** aparecen marcados en su celda con su motivo: en
  gris los globales y en ambar los de departamento.
- Las **tareas sin fechas** se avisan aparte, para que la planificacion
  incompleta no desaparezca en silencio.
- Pulsando el **numero de un dia** se abre el **detalle de ese dia**: la fecha
  en texto, las tareas que lo ocupan con su persona, su estado y su proyecto, y
  los dias no laborables de esa fecha.

El mismo calendario tiene **vista semanal**: un conmutador en la cabecera pasa
de la rejilla del mes a la de la semana. Es el mismo corte de la misma
planificacion, no otra pantalla.

- La semana es la **semana ISO**, de lunes a domingo: la misma unidad que usa la
  matriz de capacidad.
- La rejilla semanal tiene **una columna por dia laborable**, de lunes a
  viernes. El fin de semana no se muestra, porque el motor de capacidad nunca
  reparte horas un sabado ni un domingo.
- Cada tarea aparece con mas detalle que en el mes: titulo, persona, estado y
  las fechas completas.
- La navegacion es la misma: anterior, siguiente y **Hoy**, moviendo semanas.
- Al cambiar de vista, la semana se coloca en la semana en curso si el mes que
  se estaba viendo es el actual, y si no en la del primer dia de ese mes.
- El numero de dia de la cabecera tambien es pulsable y abre el detalle del
  dia.

Es de lectura: las fechas se cambian desde el Gantt o desde el desglose de una
celda de la matriz.

El backend no tiene un endpoint propio: el calendario se monta con el feed de
Gantt (`/api/gantt`), que ahora lleva el titulo y la persona de cada barra por
separado, y con los dias no laborables (`/api/non-working-days`).

## Calendario laboral

El calendario laboral es la contraparte del calendario de la planificacion: el
calendario de la planificacion dice **cuando se trabaja** y este dice
**cuando no**, con el efecto que tiene sobre el trabajo.

Vive en **una sola pantalla**: la primera pestana de `/configuration`, la
**Calendario laboral**. La ruta `/work-calendar` redirige ahi, de modo que los
enlaces antiguos siguen funcionando.

- La **rejilla del mes** muestra los dias no laborables de cada mes, con el
  motivo y el color de su alcance. El mes vive en la URL (`?month=`).
- El **detalle del dia** dice a quien aplica el festivo, que jornada quita y
  cuanto le cuesta a cada persona, con las **tareas afectadas**: cuantas
  tareas cubren ese dia y estan asignadas a personas a las que el festivo
  aplica.
- El **alcance** distingue tres casos: a todo el mundo, a un departamento o a
  una sola persona (un permiso individual). Un festivo de medio dia se marca
  con "1/2".
- El **cuadro de impacto en la capacidad** del mes compara, por persona y
  semana, la capacidad que habria sin el festivo con la que queda con el: la
  diferencia y el motivo. Solo se listan las semanas en las que un festivo quita
  horas.
- El calculo usa el **mismo motor y las mismas centimas** que la matriz de
  capacidad, de modo que el cuadro cuadra con ella: una persona con jornada de
  3,6 h pierde 3,60 h, no 8.

**Quien puede hacer que.** La consulta es de lectura y la puede hacer cualquier
persona con sesion: la pantalla muestra solo el calendario laboral y oculta las
pestanas de configuracion. El alta y la baja de dias no laborables las lleva
**solo el gerente**, que es quien puede cambiar la organizacion.

El backend tiene un endpoint propio, `GET /api/work-calendar`, con el rango de
fechas en `from` y `to`. El alta y la baja van por `POST /api/non-working-days`
y `DELETE /api/non-working-days/{id}`, ambos reservados al gerente.

## Matriz de capacidad

La capacidad esta en **una sola pantalla**: la matriz. Vive en `/capacity`, con
los proyectos visibles, y con el filtro `?project=` para uno solo.

- El eje de semanas es **continuo**: sale el rango pedido, tenga actividad o no.
  El rango por defecto son nueve semanas, la en curso y las ocho siguientes, y
  las flechas lo mueven una semana. "Hoy" lo devuelve a la semana en curso.
- La celda se lee de tres maneras, con el conmutador de la cabecera: **Horas**
  ("36/40" con la barra de uso), **% de uso** ("90 %" y debajo "36/40 h") y
  **Proyectos** (una etiqueta por proyecto, con sus horas). El reparto por
  proyecto lo trae el informe, con el mismo criterio con el que el motor
  reparte las horas.
- Encima de la matriz, tres **chips de resumen**: las celdas sobrecargadas, los
  huecos de 20 h o mas libres y el uso medio del equipo.
- **Pulsa una celda** para abrir su detalle en un **panel lateral**: la cifra
  grande, la pila de estado con su porcentaje, la barra, las notas de la semana
  (jornada reducida y festivos) y la lista de tareas. Desde ahi se edita, se
  reasigna, se elimina o se crea una tarea de esa semana. La celda abierta vive
  en la URL (`?cell=2-2026-W46`), asi que recargar la pagina no cierra el panel.
  El panel es una columna al lado, no un modal: la matriz se sigue viendo y se
  puede seguir usando, que es lo que deja que las celdas reciban el arrastre.
- Los **filtros** (proyecto, departamento, competencia y nivel) y el rango viven
  en la URL: el enlace se puede compartir. El modo y la celda abierta tambien,
  pero no recargan el informe. El filtro de proyecto lo pone el selector de la
  cabecera, que es el unico control que lo cambia.

El arrastre con previsualizacion es la otra forma de reasignar:

- **Arrastra una tarea del panel** a la celda de otra persona: todas las celdas
  de esa semana enseñan lo que pasaria al soltar. La celda de origen muestra lo
  que quedaria sin la tarea, los destinos validos muestran la carga
  resultante con la escala de colores, y quien **no es miembro del proyecto** se
  marca con rayado y no acepta el destino.
- Las horas que se previsualizan son las de la tarea **en esa semana**, que son
  las que cuenta la celda.
- Al soltar, la matriz **se actualiza al momento** y vuelve atras si la API
  rechaza el cambio.
- Con el teclado: **Mayus** y las flechas **arriba** o **abajo** sobre una
  tarea del panel la mueven a la persona de al lado.

La reasignacion se guarda con el `PATCH /api/tasks/{id}` de siempre, asi que
sigue exigiendo que el nuevo responsable sea miembro del proyecto al que
pertenece la tarea. La pantalla lo avisa **antes** de soltar, no despues.

Lo que **no** entra: las tarjetas por persona del prototipo y los veredictos
discretos de disponibilidad (van aparte con sus umbrales).

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

## Miembros y configuracion del proyecto

Cada proyecto tiene su equipo. `GET /api/projects/{id}/members` devuelve las
personas que lo forman con el rol que ejercen dentro y sus horas base, que son
las que se toman como referencia para marcar la sobrecarga en la matriz. El
alcance de ese rol es lo que les deja ver y hacer en el proyecto.

La vista `/projects/{id}/members` la gestiona el gerente: anade a alguien
eligiendo persona y rol, cambia el rol con un desplegable por fila y quita a
quien sale del equipo. Quien no es gerente ve la lista sin las acciones. El
aviso de exito se muestra encima de la tabla, no en lugar de ella.

`PATCH /api/projects/{id}` edita el nombre, el estado, el departamento que
gestiona el proyecto y su responsable. La vista `/projects/{id}/settings` se
abre desde el resumen del proyecto y muestra los mismos campos deshabilitados
cuando quien entra no es gerente.

## Panel

`GET /api/panel` devuelve el estado de la organizacion de un vistazo. La vista
`/panel` es global y no depende del rol.

- **Cuatro indicadores**, que llevan a la pantalla de origen: uso del equipo en
  la semana de referencia, personas con sobrecarga, proyectos activos y
  planificacion incompleta.
- **Utilizacion**: horas planificadas frente a capacidad en la semana de
  referencia, en porcentaje. La semana de referencia es la semana en curso si
  hay actividad en ella y, si no, la primera del periodo, para que siempre haya
  una semana con datos.
- **Uso del equipo por semana**: la serie de las nueve semanas del periodo, con
  la linea del 100 %.
- **Personas sobrecargadas**: quien supera su capacidad en alguna semana, con
  sus semanas y su peor porcentaje.
- **Proyectos con mas carga**: horas estimadas, numero de tareas y de personas
  de cada proyecto visible, del mas cargado al menos cargado.
- **Planificacion incompleta**: las tareas sin persona y las tareas sin fechas,
  con el motivo y un enlace al tablero del proyecto.
- **Recuentos**: proyectos por estado, tareas por estado, personas con carga y
  tareas del periodo.

Todo sale de la matriz de capacidad y del listado de tareas, de modo que el
panel y la matriz no pueden discrepar. El panel **no** lleva veredictos
discretos, aprobaciones ni incidentes de politica: eso es la politica de
capacidad y va aparte.

## Mi trabajo

`GET /api/my-work` devuelve las tareas propias y la carga por semana de quien
entra. La vista `/my-work` es global y no depende del rol: cada quien ve lo
suyo.

- **Aviso de sobrecarga**: una banda por cada semana en la que se supera la
  capacidad, con las horas y el exceso.
- **Grafico de barras** de las semanas del periodo, con la linea del 100 % de la
  capacidad, la marca de "Hoy", la insignia de festivo y el triangulo de
  sobrecarga. El grafico es una imagen con su descripcion: lleva `role="img"`
  y un `aria-label` que resume las cifras.
- **Tarjeta "Esta semana"**: horas, capacidad, barra, pila de estado, el numero
  de tareas y el proximo festivo con lo que le quita de capacidad.
- **Tareas**: las propias de los proyectos visibles, con su proyecto, su estado,
  sus fechas y las horas que caen dentro del periodo. Se reparten en tres
  pestanas: **Esta semana**, **Proximas** y **Completadas**.
- **Cambio de estado**: cada tarea lleva un desplegable que la mueve de estado
  sin salir de la pantalla.

El periodo es una **ventana continua de semanas** que empieza en la actual, la
misma que muestra por defecto la matriz de capacidad global: asi las dos vistas
hablan de las mismas semanas. Sin rango, el backend devuelve la semana actual y
las ocho siguientes; con `from` y `to` se pide el que se quiera.

Las horas de una tarea son las que caen dentro del periodo, que no tienen por
que ser las estimadas enteras: una tarea puede empezar antes o terminar
despues. Cada tarea dice en que semanas del periodo cae.

## Pantalla de proyecto

`/projects/{id}` es el punto de entrada al proyecto. Antes solo mostraba tres
indicadores; ahora es el resumen completo:

- **Cabecera** con el nombre, el estado, el departamento gestor y el
  responsable.
- **Cuatro secciones**: Resumen, Tablero, Miembros y Ajustes, que enlazan con las
  vistas que ya existen.
- **Accesos** a *Ver su capacidad* (la matriz global filtrada por proyecto) y a
  *Ver su Gantt*.
- **Estado de las tareas**: barra segmentada y contador por estado.
- **Horas del proyecto por semana**.
- **Equipo**: quien participa, con su rol en el proyecto y las horas que lleva.

## Armazon de la aplicacion

`frontend/src/components/AppShell.vue` envuelve a las vistas en un menu lateral
y una cabecera, al estilo de OpenProject o Linear.

La navegacion tiene un solo arbol de rutas: el proyecto ya no es un espacio con
su propio menu, es un filtro (`?project=`) de las vistas de planificacion. El
menu lateral agrupa las vistas por lo que son y el selector de la cabecera elige
el proyecto que filtra.

El menu lateral lleva el isotipo con su version, un bloque que dice que se esta
viendo, al pie la tarjeta de quien esta dentro con su avatar, su rol de empresa
y el boton de cerrar sesion. Se puede colapsar a una tira de iconos; el estado
se guarda en `localStorage` con la clave `coreplanner_sidebar`.

La cabecera lleva las migas de pan, el selector de proyecto y las acciones
rapidas. Cuando hay un proyecto delante, en su pagina o filtrando por el,
aparecen la pila con el estado del proyecto y el boton **+ Nueva Tarea**, que
abre el alta de tarea en un modal sobre la vista que este abierta.

### Selector de proyecto

El desplegable de la cabecera es el filtro de las vistas de planificacion. Su
primera opcion es **Todos los proyectos**, que deja el filtro sin poner, y a
continuacion vienen los proyectos agrupados por su departamento gestor.

El filtro viaja en la URL (`?project=<id>`), de modo que el enlace se puede
compartir y recargar la pagina no lo pierde. Solo aparece en Capacidad, Gantt y
Calendario, que son las vistas donde hay un proyecto que filtrar. Al pasar de
una vista de planificacion a otra el filtro viaja con ella: quien esta mirando
un proyecto no lo pierde al pasar de la capacidad al Gantt.

### Menu lateral

Un solo menu, con cuatro grupos:

| Grupo | Vistas |
| --- | --- |
| Mi espacio | Panel, Mi trabajo |
| Planificacion | Capacidad, Gantt, Calendario |
| Organizacion | Proyectos, Personas y Competencias, Departamentos |
| Administracion (solo gerente) | Configuracion |

El menu no decide quien ve que: lo decide el rol de empresa, igual que hasta
ahora. El grupo de Administracion es el unico que se esconde.

Las pestanas del proyecto (Tablero, Miembros y Ajustes) no estan en el menu:
son de la pagina del proyecto, que es donde tiene sentido abrirlas y la que
tiene las cuatro. El calendario laboral tampoco esta: es una pestana de la
configuracion.

### Menu en cajon

Por debajo de 640 px el menu lateral no cabe: se esconde y sale como un cajon
encima de la pagina, abierto con el boton de la cabecera, que lleva su
`aria-expanded`. Un velo oscuro lo cierra al tocar fuera y el menu se cierra
solo al cambiar de vista. Los enlaces del menu y los botones de la cabecera
tienen 44 px de alto, que es el objetivo tactil minimo, y las tarjetas de Mi
trabajo y del Panel se apilan en una sola columna.

### Rutas

| Ruta | Vista |
| --- | --- |
| `/` | redirige segun el rol: el tecnico a Mi trabajo y el gerente y el jefe de departamento al Panel |
| `/login` | acceso, con entrada automatica si ya hay sesion guardada |
| `/panel` | resumen de la organizacion |
| `/my-work` | tareas propias y carga por semana |
| `/projects` | listado de proyectos |
| `/capacity` | matriz de ocupacion, con filtro `?project=` |
| `/gantt` | cronograma, con filtro `?project=` |
| `/calendar` | calendario de la planificacion, con filtro `?project=` |
| `/work-calendar` | redirige a la configuracion, pestana **Calendario laboral** |
| `/departments` | departamentos y sus responsables |
| `/people` | directorio y competencias |
| `/configuration` | configuracion de la organizacion; su primera pestana es el calendario laboral |
| `/projects/{id}` | resumen del proyecto |
| `/projects/{id}/kanban` | tablero Kanban |
| `/projects/{id}/members` | miembros y asignaciones |
| `/projects/{id}/settings` | configuracion del proyecto |

Las tres rutas de planificacion del proyecto quedaron como redireccion:
`/projects/{id}/capacity` lleva a `/capacity?project={id}`, y lo mismo con
`/gantt` y `/calendar`, para no romper los enlaces guardados.

El proyecto abierto se toma siempre de la URL, de modo que al recargar la
pagina se vuelve al mismo proyecto y a la misma vista.

Las guardas del router live en `frontend/src/router/guards.js`: una comprueba
la sesion antes de entrar en una vista privada y otra lleva la raiz a la vista
de entrada de cada rol. Si falta la sesion, el guard lleva al formulario de acceso
recordando la vista que se queria abrir, y el formulario vuelve a ella al
entrar.

### Vista global

Los endpoints globales no dependen de un proyecto: reunen todo lo que la
persona que entra puede ver.

| Endpoint | Que devuelve |
| --- | --- |
| `GET /api/capacity` | matriz de ocupacion de todos los proyectos accesibles, con los filtros `?department_id=` y `?project_id=` |
| `GET /api/gantt` | barras de todos los proyectos accesibles, cada una con su `project_id` y `project_name`, con el filtro `?project_id=` |
| `GET /api/tasks` | tareas de todos los proyectos accesibles, con los filtros `assigned_to` y `week` |

El alcance son los proyectos accesibles de quien entra: el administrador global
ve todos y un miembro solo los suyos. La matriz global suma las horas de cada
persona entre proyectos y sus filas son la union de los miembros de esos
proyectos con las personas que tengan tareas asignadas. El filtro por
departamento limita a los proyectos que gestiona ese departamento y el filtro por
proyecto deja solo uno. Si el proyecto no esta entre los que se ven, el backend
responde 404.

El listado global de tareas es lo que permite abrir el desglose de una celda
de la matriz global: sin el, la celda no sabria que tareas la componen.

En el Gantt cada barra lleva delante el nombre del proyecto, porque el
diagrama es de toda la organizacion y el filtro solo cambia que barras entran.

### Iconos y clases

Los iconos salen de `AppIcon.vue`, que guarda los trazados de Heroicons. El
tamano lo fija el elemento que envuelve al icono, nunca una propiedad: las
clases llegan al SVG por el envoltorio, que debe ser flex o bloque, porque en
un `span` en linea el ancho y el alto no se aplican.

Las clases del aviso de estado se declaran en ramas `v-if` con su `class`
propia, y no en un objeto `:class`, porque el guard del bundle extrae todos
los literales de `:class` y los daba por clases de Tailwind que no existen.

### Datos frescos al cambiar de vista

El router reutiliza la misma instancia del componente cuando solo cambia la
consulta, de modo que `CapacityMatrix.vue` vigila el filtro de la URL y vuelve a
pedir la matriz. Sin esa recarga, cambiar de proyecto en la cabecera dejaria en
pantalla los datos del proyecto anterior.

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
lateral unico en cuatro grupos, cabecera con migas, selector de proyecto como
filtro y alta de tarea, navegacion con un solo arbol de rutas, matriz de
ocupacion con reparto semanal, CRUD de tareas, feed JSON del Gantt, tablero
Kanban, vista de departamentos, ambito
por rol de empresa (gerente, jefe de departamento y tecnico), pantalla de
configuracion de la organizacion (personas, roles, departamentos, proyectos y
catalogo de competencias) y bloque de personas: horario versionado,
dias no laborables con alcance, competencias y pantalla de personas. En la
pagina del proyecto, los miembros se anaden, cambian de rol y se quitan, y el
proyecto se configura con nombre, estado, departamento gestor y responsable. La
planificacion se ve como diagrama de Gantt o como calendario mensual, semanal y
por dia. La capacidad esta en una sola pantalla: la matriz, con el detalle
en un panel lateral, los modos de celda y el arrastre con previsualizacion para
reasignar una tarea.

La navegacion ya no tiene dos contextos: el proyecto es un filtro
(`?project=`) de las vistas de planificacion, la pagina del proyecto conserva
sus cuatro pestanas y la raiz lleva a cada rol a su vista de entrada.

Las pantallas personales ya no son listas de tablas:

- **Mi trabajo** (`/my-work`) tiene el grafico de carga de las nueve semanas,
  la tarjeta de la semana en curso, el aviso de sobrecarga y las tareas
  repartidas en *Esta semana*, *Proximas* y *Completadas*, con el cambio de
  estado desde la propia pantalla.
- **El panel** (`/panel`) resume la organizacion con cuatro indicadores que
  llevan a su origen, la serie del equipo, las sobrecargas, los proyectos con
  mas carga y la planificacion incompleta.
- **El resumen del proyecto** (`/projects/{id}`) es la portada del proyecto:
  estado, equipo, horas por semana y accesos a las demas vistas.
- **El calendario laboral** vive en la primera pestana de la configuracion, con
  el mes navegable, el detalle del dia y el impacto en la capacidad.
- **En movil** el menu lateral sale como un cajon y las tarjetas se apilan.

Pendiente de implementar: la exportacion `.ics`.

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
  parametro de la ruta o la consulta, el router reutiliza la instancia del
  componente, que no se vuelve a montar. Por eso las vistas que dependen del
  filtro vigilan la consulta y recargan.
- **Cierre de sesion frente a acceso automatico.** El acceso automatico con
  `admin@example.com` no repone una sesion que el usuario cerro: el store de
  sesion guarda esa marca en `localStorage` y el guard lleva al formulario de
  acceso.
- **El filtro de periodo de las tareas va en SQL.** `list_tasks_for_projects`
  acota por `week`, `from` y `to` con un `start_date <= fin AND end_date >= inicio`,
  de modo que la base de datos devuelve solo las tareas que solapan con el
  rango. Encima se deja fuera las tareas cuyo rango solo pisa sabados y domingos,
  que no se pueden expresar en una consulta. El resultado es el mismo que
  filtrando todo en Python, pero sin traer el resto de las tareas.
- **Las vistas no se remontan al cambiar las tareas.** El shell ya no monta el
  `router-view` con una clave por revision: cada vista se suscribe con
  `useTaskReload` y recarga sus datos. Asi la vista conserva sus filtros, su
  pestana activa y su desplazamiento.

