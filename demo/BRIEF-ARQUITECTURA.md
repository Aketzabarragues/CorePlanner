# CorePlanner — brief de arquitectura y objetivo

> Documento de traspaso. Quien lo lee (persona o IA) debe poder producir **su propia demo visual** y **su propio análisis** de cómo sería CorePlanner tras integrar lo aprendido del análisis competitivo.
>
> No es un pliego de la demo existente: es el contexto de partida. La demo que ya existe (`demo/index.html`) sirve como referencia visual y numérica, pero el objetivo es rehacerla desde cero con otro criterio.

---

## 1. Qué es CorePlanner

Gestor ligero de **capacidad de equipos de ingeniería**. Sustituye las hojas de Excel de gestión con dos piezas centrales:

- **Matriz de ocupación**: cruza el equipo (personas) contra las semanas ISO del año, reparte las horas estimadas de cada tarea entre las semanas que abarca y marca quién supera su capacidad semanal.
- **Cronograma (Gantt)**: vista temporal de las tareas, con `frappe-gantt`. La exportación a `.ics` sigue pendiente.

El núcleo se ha ampliado desde el primer brief. Además del Gantt y la matriz están el **calendario** (mes, semana y día), el **calendario laboral** con el impacto de los festivos sobre la capacidad, el **planificador de recursos**, el **panel**, **Mi trabajo**, el **directorio de personas y competencias**, la **configuración de la organización**, el **tablero Kanban** (4 estados fijos) y la **vista de departamentos**. En el espacio de proyecto: matriz, Gantt, calendario, Kanban, miembros y configuración.

El acceso se controla **por proyecto**: cada persona entra en un proyecto con un rol (Project Manager / Ingeniero / Lector) y solo ve y toca lo que ese rol permite.

**Usuario real**: departments manager, project manager e ingenieros de automatización/SCADA que hoy planifican en Excel. Son usuarios que pasan 30 minutos a la semana mirando la matriz, no 8 horas al día en un Jira. La app tiene que ser legible de un vistazo, y la trazabilidad («quién movió qué y cuándo») es un requisito explícito.

**El hueco de mercado** (verificado sobre 11 repos de referencia): **ninguno tiene una matriz de carga persona × semana ISO contra una capacidad base**. Plane, Kanboard y Planka tienen cero apariciones del vocabulario de capacidad. Focalboard tiene cero. El camino no es clonar a Jira/Plane/OpenProject: es profundizar en el dominio de la capacidad e ignorar todo lo demás.

---

## 2. Arquitectura actual (código real, no proyecto futuro)

### 2.1 Stack

| Capa | Tecnología |
|---|---|
| BD | SQLite (desarrollo) → PostgreSQL (producción), SQLAlchemy 2.0 async, ORM declarativo `Mapped`/`mapped_column` |
| Backend | FastAPI async, Uvicorn, JWT (PyJWT), bcrypt, pydantic-settings (prefijo `COREPLANNER_`) |
| Frontend | Vue 3 Composition API, Vite, Tailwind CSS, Pinia, Vue Router, vitest |
| Gantt | `frappe-gantt` (frontend). La exportación `.ics` está pendiente |

### 2.2 Monorepo

```
coreplanner/
├── backend/
│   ├── main.py            # app FastAPI, CORS, lifespan, include_router de los 16 routers
│   ├── models.py          # esquema SQLAlchemy (10 tablas)
│   ├── schemas.py         # modelos Pydantic de la API
│   ├── auth.py            # hash bcrypt, emisión y validación de JWT
│   ├── security.py        # dependencias de autorización por proyecto
│   ├── config.py          # settings (pydantic-settings)
│   ├── database.py        # engine async, sesión por petición, PRAGMA foreign_keys=ON
│   ├── migrations.py      # columnas y tablas nuevas en bases ya creadas
│   ├── seed.py            # datos de demostración
│   ├── api/               # routers: auth, departments, gantt, kanban, me, members,
│   │                      #         my_work, non_working_days, overview, people,
│   │                      #         projects, roles, skills, tasks, users, work_calendar
│   ├── services/          # capacity(.py|_repository.py), calendar_report, configuration,
│   │                      # gantt(...), kanban(...), my_work, panel, people, schedule,
│   │                      # scope, tasks, units, work_calendar
│   └── tests/             # 23 ficheros de pruebas
├── frontend/
│   ├── scripts/verify-css.mjs   # guard del bundle CSS
│   └── src/
│       ├── api/client.js        # cliente HTTP con JWT
│       ├── components/          # AppShell, CapacityMatrix, CellBreakdown, DayDetail,
│       │                        # LaborMonthGrid, ModalDialog, PlannerMatrix, ProjectPicker,
│       │                        # TaskForm, WeekGrid, AppIcon
│       ├── stores/              # auth.js, projects.js (Pinia)
│       ├── router/              # index.js + guards.js
│       ├── utils/               # gantt, kanban, labor, month, navigation, planner, weeks (puros)
│       ├── views/               # Login, Panel, Mi trabajo, Proyectos, Departamentos, Personas,
│       │                        # Configuración, Capacidad, Gantt, Calendario, Calendario laboral,
│       │                        # Planificador, Kanban, Miembros, Resumen, Configuración de proyecto
│       └── tests/               # 26 ficheros de vitest
├── docs/
│   ├── analisis-competitivo.md                     # 11 repos, ingeniería inversa
│   ├── especificaciones.md                          # alcance de la v1, sección por sección
│   └── openproject/
│       ├── analisis-openproject.md                  # modelo real de OpenProject
│       └── plan-replicacion-coreplanner.md          # fases F10–F16
├── demo/                     # demo visual ya existente (referencia) + este brief
├── iniciar.py                # arranque de la API y la interfaz en un comando
├── pyproject.toml
└── README.md
```

### 2.3 Patrón de backend: router → servicio puro → repositorio

Es la decisión estructural más importante y **no se toca**:

- `api/*.py` = HTTP. Resuelve permisos con dependencias (`Depends`), valida y delega.
- `services/xxx.py` = **función pura**. Sin base de datos, sin estado global, sin I/O. Testeable en aislamiento.
- `services/xxx_repository.py` = lectura de datos y construcción del informe.
- `services/tasks.py` = reglas de alta, edición y borrado.

Ejemplo: `services/capacity.py` (383 líneas) no sabe qué es SQLAlchemy; `capacity_repository.py` (222 líneas) carga datos y llama al motor.

### 2.4 Frontend: dos contextos y un shell

- `AppShell.vue` envuelve todo: sidebar + cabecera + contenido.
- **El contexto lo decide la URL**: si lleva `project_id` estás en el espacio de proyecto; si no, en el espacio global. Sidebar, migas y acciones cambian con el contexto.
- Sidebar: isotipo con versión, bloque de contexto, grupos de vistas, tarjeta del usuario al pie (avatar, departamento, logout), colapsable a tira de iconos con estado en `localStorage` (`coreplanner_sidebar`).
- Cabecera: migas, selector de contexto (primera opción «Todos los proyectos (Global)», luego proyectos agrupados por departamento gestor) y acciones rápidas. En espacio de proyecto aparece **+ Nueva Tarea**.
- Stores Pinia: `auth` (sesión, token en `localStorage`) y `projects` (proyectos, departamentos).
- `api/client.js` centraliza el token; **no hay caché en cliente**: cada vista pide al montarse.
- `utils/` con helpers puros y testeados aparte.

### 2.5 Modelo de datos (10 tablas)

| Tabla | Campos clave |
|---|---|
| `users` | `id`, `name`, `email`, `hashed_password`, `is_global_admin`, `company_role`, `job_title`, `seniority`, `employment_type`, `weekly_base_hours` (`Numeric(12,2)`, 40 por defecto), `department_id` |
| `departments` | `id`, `name` (único), `manager_id` → `users.id` |
| `roles` | `id`, `name`, `permissions_json` (lista de permisos) |
| `projects` | `id`, `parent_id` (subproyectos), `name`, `status`, `department_id`, `owner_id` |
| `project_members` | PK compuesta (`user_id`, `project_id`, `role_id`) → rol **por proyecto** |
| `tasks` | `id`, `project_id`, `assigned_to`, `title`, `status`, `start_date`, `end_date`, `estimated_hours` (`Numeric(12,2)`) |
| `working_schedules` | `id`, `user_id`, `valid_from`, `monday`…`sunday` (centimas), `availability_factor` → horario **versionado** |
| `non_working_days` | `id`, `date`, `name`, `scope` (`global`/`department`/`person`), `department_id`, `user_id`, `half_day` |
| `skills` | `id`, `name` (único) |
| `person_skills` | PK compuesta (`user_id`, `skill_id`), `level` (1–3) → competencias por persona |

Restricciones declaradas explícitamente: `CHECK` de estados (`projects`: planning/active/on_hold/done/cancelled; `tasks`: backlog/in_progress/testing/done), `CHECK` de `estimated_hours >= 0`, `CHECK` de `end_date >= start_date`, `CHECK` de `level BETWEEN 1 AND 3`, `CHECK` del alcance del festivo (`scope` y `scope_target`: un festivo global no lleva destinatario, uno de departamento lleva `department_id`, uno de persona lleva `user_id`), `ON DELETE` explícito en cada FK (CASCADE en `project_members` y `tasks`, SET NULL en `department_id` y `assigned_to`, RESTRICT en `role_id`).

Regla de negocio: **un proyecto pertenece a un departamento gestor, pero las tareas se pueden asignar a cualquier persona del proyecto, de ese departamento o de otro**. La pertenencia al departamento no restringe la asignación.

### 2.6 Seguridad: dos ejes, RBAC por proyecto

- El token lleva la **identidad** de la persona (`sub`, `company_role`, `department_id`) y nada más. El claim `projects` existe por compatibilidad, pero **no se usa para autorizar**.
- **Los permisos por proyecto se consultan en la base de datos en cada petición**. Es más lento que leerlos del token, y a cambio un cambio de rol surte efecto de inmediato, sin esperar a que caduque el token.
- Dependencias: `require_project_permission(permiso)` para rutas con `project_id`; `require_task_permission(permiso)` para rutas sin `project_id` (deduce el proyecto de la propia tarea, para que la ruta no sirva para tocar tareas de otro proyecto).
- Respuestas: 401 sin token/inválido · 403 no miembro o sin permiso · 404 proyecto inexistente.
- Permisos actuales: `capacity.read`, `gantt.read`, `task.write`, `member.manage`. Administrador global pasa siempre.
- Los **dos ejes son independientes**: el rol de empresa (gerente / jefe de departamento / técnico) decide **qué se ve**, y el rol de proyecto (Project Manager / Ingeniero / Lector) decide **qué se puede hacer**. Ambos se aplican.

### 2.7 Motor de capacidad (el corazón)

`backend/services/capacity.py` (383 líneas), funciones puras:

```
business_days(start, end)             -> días laborables (lunes a viernes)
working_days(start, end, holidays)     -> días laborables con su peso (2 entero, 1 medio, 0 festivo)
iso_week_key(day)                     -> "2026-W46"
split_units(total_hours, days)        -> reparto uniforme en céntimas
split_weighted_units(total, weights)   -> reparto por pesos (un medio día pesa la mitad)
compute_task_week_units(...)          -> carga de una tarea por semana ISO
build_capacity_report(people, tasks)  -> matriz de ocupación
```

Algoritmo actual: contar los días laborables del rango **para esa persona** —los días no laborables que le aplican se pesan: el festivo de jornada entera pesa 0 y el de medio día la mitad— → repartir `estimated_hours` entre esos días según su peso → imputar cada día a su semana ISO → sumar por persona y semana → comparar con la **capacidad de esa semana**, que sale del horario versionado vigente (y, si no hay horario, de `weekly_base_hours`) → marcar `is_overloaded`.

La capacidad **desconocida** (ni horario vigente ni horas base) no se marca como sobrecarga: el motor no inventa un límite que nadie ha definido.

Una tarea cuyo rango queda **enteramente** en días no laborables de su persona vale cero horas y no se imputa. No rompe el informe: sale listada en `holiday_task_ids` para que la pantalla avise.

**Aritmética en céntimas de hora enteras** (`Decimal` con `ROUND_HALF_UP`, `Numeric(12,2)`), nunca coma flotante. El float solo aparece en el borde JSON y con 2 decimales máximo. Cada tarea se cuantiza al entrar (desvío máximo 0,005 h). Hay un test (`test_no_floats.py`) que falla si el motor devuelve un float.

El año de la semana es el **año ISO**, que puede no coincidir con el del calendario (31-12-2026 pertenece a `2026-W53`).

Tareas sin persona o sin fechas no se imputan a ninguna fila, pero se listan en `unassigned_task_ids` y `undated_task_ids`: **la planificación incompleta sigue siendo visible**.

### 2.8 Pruebas

- Backend: `pytest` — **270 tests** en 23 ficheros.
- Frontend: `npm test` (vitest) — **243 tests** en 26 ficheros, más `npm run build` y `npm run verify:css`.
- `verify:css` extrae las clases Tailwind usadas en las plantillas y comprueba que han acabado en el bundle compilado: detecta un rebuild parcial sin avisar.
- Hay un test que vigila que el motor no devuelva nunca un `float`.
- La suite de backend tardaba más de 3 minutos. El coste dominante es el **hash bcrypt de las fixtures**, no la base de datos: bajar las rondas solo en los tests lo recortaría.

### 2.9 Detalles de implementación que conviene conocer

- **SQLite tiene las FK desactivadas por defecto**: `backend/database.py` activa `PRAGMA foreign_keys=ON` en cada conexión para que el comportamiento en desarrollo coincida con PostgreSQL.
- `project_members.role_id` usa `ON DELETE RESTRICT`: un rol asignado no se puede borrar hasta reasignarlo.
- RFC 7519 obliga a que `sub` sea texto: el token lo lleva como string y `TokenPayload` lo recupera como entero.
- `hash_password` rechaza contraseñas de más de 72 bytes UTF-8 (límite de bcrypt) en vez de truncarlas en silencio.
- `PATCH` parcial: solo se tocan los campos presentes. Para desasignar hay que enviar `assigned_to: null` explícito.
- **El router reutiliza la instancia del componente cuando solo cambia el parámetro de ruta**: las vistas que dependen del proyecto vigilan `props.id` y recargan, o la pantalla muestra los datos del proyecto anterior.
- Guardas del router: una comprueba la sesión y recuerda la vista wanted; otra lleva la raíz al primer proyecto accesible.
- Iconos: `AppIcon.vue` guarda trazados de Heroicons. El tamaño lo fija el **envoltorio** (flex o bloque), nunca el SVG; en un `span` en línea el ancho y el alto no se aplican.
- Las clases del aviso de estado se declaran en ramas `v-if` con su `class` propia, **no** en un objeto `:class`: el guard del bundle extrae todos los literales de `:class` y los daba por clases de Tailwind inexistentes.
- **El alto de la celda del mes va en el contenido, no en el `<td>`**: una tabla no resuelve alturas en porcentaje, así que las filas medían distinto unas de otras. El alto fijo y el desplazamiento interno van en el `<div>` de dentro de la celda.
- **Las páginas no llevan `max-width`**: el contenido ocupa todo el ancho útil. Los límites de ancho se quedan solo en los elementos flotantes (modales, cajón lateral, acceso).
- **La migración de los días no laborables no consulta el catálogo de SQLite**: decide con el inspector de SQLAlchemy y el resto es SQL estándar, de modo que no rompe al arrancar contra otro motor.
- **El frontend entra solo con el administrador de demostración** (`admin@example.com` / `coreplanner`) y renueva la sesión con esas credenciales cuando la API responde 401. Es una ayuda para la demo, **no** un mecanismo de despliegue.
- **El secreto JWT tiene un valor por defecto** en `config.py` y nada comprueba al arrancar que se haya cambiado. Fuera de la máquina del desarrollador hay que cambiarlo sí o sí.

### 2.10 Qué pantallas hay

**Espacio global** (la URL no lleva `project_id`):

| Pantalla | Ruta | Qué es |
|---|---|---|
| Panel | `/panel` | resumen de la organización: utilización, sobrecargas, proyectos y tareas |
| Mi trabajo | `/my-work` | tareas propias y carga por semana |
| Proyectos | `/projects` | cartera de proyectos |
| Capacidad Global | `/capacity` | matriz de ocupación consolidada, con filtro por departamento |
| Gantt Global | `/gantt` | cronograma de todos los proyectos visibles |
| Calendario Global | `/calendar` | calendario de la planificación, en vista de mes, semana y día |
| Calendario Laboral | `/work-calendar` | días no laborables, su alcance y su impacto en la capacidad |
| Planificador de Recursos | `/planner` | carga por tarea, línea de tiempo por persona y tabla de planificación, con arrastre para reasignar |
| Departamentos | `/departments` | departamentos y sus responsables |
| Personas y Competencias | `/people` | directorio, horarios versionados, competencias y días no laborables |
| Configuración | `/configuration` | personas, roles, departamentos, proyectos y catálogo de competencias |

**Espacio de proyecto** (la URL lleva `project_id`): resumen, matriz de capacidad, Gantt, calendario, tablero Kanban, miembros y asignaciones, y configuración del proyecto.

Las tres vistas del planificador comparten el mismo rango de semanas y la misma matriz persona×semana: **carga por tarea** (horas y % de ocupación, con la tabla de asignaciones debajo), **línea de tiempo por persona** (cada bloque es una tarea) y **tabla de planificación** (reparto por proyecto). En la segunda, **arrastrar una tarea a la celda de otra persona le cambia el responsable**, con el mismo `PATCH` de siempre.

---

## 3. Qué falta y por qué (el trabajo de fondo)

Este bloque es el plan de trabajo. Los patrones 1 y 2 y la fase F10 ya están hechos: lo que queda de verdad es la política de capacidad, las horas reales, las dependencias, la bitácora y el MCP.

### 3.1 Los cinco patrones del dominio

| # | Patrón | De dónde | Qué es | Impacto |
|---|---|---|---|---|
| 1 | **Calendario laboral real** | ERPNext (`Holiday List`, `is_half_day`), OpenProject (`NonWorkingDay`) | Tabla de festivos con **alcance** (global / proyecto / persona) y días laborables por defecto, en vez de `weekday() < 5` | Una tarea que cruza un puente festivo se reparte hoy en 5 días; con el calendario correcto, en 3. Es el error más silencioso y corrosivo del motor actual |
| 2 | **Disponibilidad versionada por persona** | OpenProject (`UserWorkingHours`: `availability_factor` + `valid_from`), Ever Gauzy (`EmployeeAvailability`), Leantime (`EmploymentType`) | `weekly_base_hours` deja de ser un escalar y pasa a ser el **resumen de un perfil con vigencia temporal** | Permite «hasta marzo iba al 100 %, desde abril al 60 %» y «el martes no trabaja» |
| 3 | **Política de capacidad con umbral y consecuencias** | Paperclip (`budget_policies`, `budget_incidents`, `approvals`), Leantime (veredictos discretos) | La celda roja deja de ser un color y pasa a ser el resultado de evaluar una política: ámbito, métrica, ventana, **umbral de aviso 80 %**, **umbral duro 100 %**, y qué pasa al superarlo | Es la diferencia entre una herramienta que informa y una que gobierna. **La pieza más barata de todo el análisis**: una tabla y una función pura |
| 4 | **Estimado contra real** | ERPNext (`expected_time` vs `actual_time`), OpenProject (`TimeEntry`), Leantime (`actualDrift()`) | Tabla de imputaciones por persona, tarea y día; comparación contra lo planificado en la **ventana semanal** (la única en la que la capacidad es comparable) | Sin esto la matriz es una intención; con esto es un termómetro. **Requiere adopción real o es ruido**: no penalizar a quien no imputa |
| 5 | **Dependencias entre tareas** | ERPNext (`Task Depends On` + `graphlib`), OpenProject (`Relation`), Kanboard | Predecesores/sucesores, orden topológico, detección de ciclos, ruta crítica, reprogramación en cascada **propuesta, no aplicada** | El Gantt deja de ser una vista de barras y pasa a ser un grafo |

**Estado de los cinco patrones** (a fecha de este brief):

| # | Patrón | Estado |
|---|---|---|
| 1 | **Calendario laboral real** | **Hecho**: tabla de días no laborables con alcance global / departamento / persona, medio día, y pantalla `/work-calendar` con el impacto en la capacidad |
| 2 | **Disponibilidad versionada por persona** | **Hecho**: `working_schedules` con `valid_from` y factor de disponibilidad; la capacidad de cada semana sale del horario vigente |
| 3 | **Política de capacidad con umbral y consecuencias** | Pendiente (N1) |
| 4 | **Estimado contra real** | Pendiente (N2) |
| 5 | **Dependencias entre tareas** | Pendiente (N3) |

**Veredictos discretos** (Leantime), ordenados por gravedad, sustituyendo el rojo/verde:

`critical` · `tight` · `balanced` · `buffer` · `no_capacity` · `no_work`

### 3.2 Las cinco piezas nuevas (N1–N5), por valor/esfuerzo

| # | Pieza | Origen | Tabla / mecanismo | Esfuerzo · Riesgo |
|---|---|---|---|---|
| **N1** | **Política de capacidad** | Paperclip | `capacity_policies` (ámbito persona/proyecto/departamento, métrica, ventana ISO, umbral aviso, umbral duro, acción: avisar / pausar / pedir aprobación) + `approvals`. Evaluación como **función pura** e incidentes **idempotentes** por ventana. El umbral duro **no es una alerta: es una aprobación obligatoria** | Bajo · Bajo |
| **N2** | **Imputación de horas reales** | ERPNext, OpenProject, Leantime, Ever Gauzy | `time_entries` (persona, tarea, fecha, horas, tipo). Separación explícita planificado/real. Comparación en ventana semanal. **Céntimas enteras**, no float | Medio-alto · Medio-alto (adopción) |
| **N3** | **Dependencias y ruta crítica** | ERPNext, OpenProject | `task_dependencies` con tipos `relates`/`precedes`/`follows`/`blocks`/`blocked`/`duplicates`. Orden topológico con **`graphlib.TopologicalSorter` de la stdlib** (sin dependencias). Ciclos con CTE recursivo. Cascada propuesta, nunca aplicada de golpe | Medio · Medio-alto |
| **N4** | **Bitácora de cambios** | Kanboard, Leantime, Paperclip | `activity_log` **append-only**: actor, acción, entidad, id, payload JSON, fecha. Paperclip añade `actorType` para distinguir «lo hizo un agente» de «lo hizo una persona» | Bajo · Bajo |
| **N5** | **CorePlanner operable por un agente** | Paperclip y Kaneo (**los dos MIT**) | Servidor **MCP por stdio**, primero solo lectura: `capacity_matrix`, `overloaded_people`, `project_capacity`, `task_dependencies`. Bearer token con hash sha256. Cabecera `X-Run-Id` en escrituras. Catálogo con `riskLevel`, `isReadOnly`, `isDestructive` y **deny-by-default**. Test de contrato que fija el catálogo | Medio · Bajo |

### 3.3 El plan por fases que ya existe (F10–F16)

Vive en `docs/openproject/plan-replicacion-coreplanner.md`. Es el plan derivado del análisis de OpenProject; el análisis competitivo **no lo sustituye, lo contrasta y lo amplía**.

| Fase | Contenido | Riesgo | Esfuerzo |
|---|---|---|---|
| F10 | Horario laboral y días no laborables (`working_schedules`, `non_working_days`) | Bajo | Media |
| F11 | Asignaciones explícitas con reparto diario (`allocations`, `allocation_entries`, `scheduling.py`) | Medio | Alta |
| F12 | Matriz construida sobre asignaciones | Medio | Media |
| F13 | Vistas guardadas (`saved_views`) | Medio | Media |
| F14 | Permisos con alcance de entidad (`task_shares`) | Alto | Media |
| F15 | Planificador de recursos: **4 vistas** sobre el mismo rango | Medio | Alta |
| F16 | Extras: `.ics`, bitácora, campos configurables | Bajo | Media |

**Orden obligatorio: F10 y F11 primero.** Sin horario y sin asignaciones, las fases posteriores no tienen sobre qué trabajar. F10 bloquea a todas las demás.

**Estado de las fases**: **F10 está hecha** (`working_schedules` y `non_working_days`, con el alcance por persona y la pantalla del calendario laboral). **F15 está hecha a medias**: el planificador tiene las tres vistas de lectura y el arrastre para reasignar, pero no las tarjetas por persona, que se descartaron por decisión de alcance. F11 a F14 y F16 siguen pendientes.

Las 4 vistas del planificador (F15), que son la referencia de OpenProject:
1. Línea de tiempo por tarea
2. Línea de tiempo por persona
3. Tabla de planificación
4. Tarjetas de persona (departamento, horario, atributos, barra de utilización)

Las tres primeras están implementadas. La cuarta se decidió que **no** entra: repite la ficha de la persona, que ya existe.

Además, por el análisis competitivo:
- La matriz publica el **ratio de utilización** (`scheduled / capacity × 100`) como métrica de primera clase, no solo el estado rojo.
- Una vista guardada puede llevar **agregados calculados** por columna (`sum`, `average`, `median`, `min`, `max`, `range`).
- El tablero Kanban admite **límite de WIP por columna**.
- **Decisiones abiertas** a resolver: ¿capacidad por horario o número fijo? ¿asignación obligatoria o implícita? ¿alcance de las vistas guardadas (privadas / por proyecto / globales)?

### 3.4 Qué NO implementar (y por qué)

| No implementar | Tentación | Por qué |
|---|---|---|
| Motor de campos personalizados | Kaneo, OpenProject, ERPNext | Convierte un gestor de trabajo en un ERP a medio hacer |
| Multi-tenant / jerarquía de organizaciones | Plane, Kaneo, ERPNext | Ya hay `departments` + `projects.parent_id`; un nivel más es complejidad sin caso de uso |
| CRDT y edición colaborativa offline | AppFlowy | La decisión más cara de revertir; no lo necesita una herramienta interna |
| Estimación en puntos | Plane | Sin conversión pública a horas no sirve para capacidad |
| Sprints / burndown | Plane, Leantime, OpenProject | La unidad natural de CorePlanner es la semana ISO |
| Pipeline de estados configurable | Paperclip | En Paperclip **no está implementado**; nuestro `CHECK` de 4 estados es una virtud |
| Kanban, tarjetas, listas, tableros | Planka, Focalboard, Kanboard | CorePlanner ya tiene un kanban mejor: estados fijos atados a un flujo real |
| Plugins, marketplace, gamificación | Paperclip, Leantime, ERPNext | Ruido a esta escala |
| Módulos ofimáticos | ERPNext | CorePlanner no es un ERP |
| Informes y exportación a Excel | OpenProject | — |

También se descarta de OpenProject: `WorkPackage` genérico, tipos por proyecto, relaciones jerárquicas, boards múltiples, backlog, wiki, reuniones, noticias, control de costes, integraciones GitHub/GitLab/LDAP/SAML/OIDC.

---

## 4. Reglas que no se rompen

Estas son **inviolables**. Una demo o un análisis que las contradiga está mal.

### 4.1 Técnicas

1. **Cero coma flotante en el backend.** Todo en `Decimal` / `Numeric(12,2)`, céntimas de hora enteras. El float solo en el borde JSON, con 2 decimales. Hay un test que lo vigila.
2. **`ON DELETE` explícito** en cada clave foránea, siempre.
3. **Restricciones `CHECK`** que SQLite y PostgreSQL interpretan igual.
4. **Motor de cálculo puro y testeable**: sin BD, sin estado global. Los repositorios van aparte.
5. **Una sola conversión a JSON** de horas (`hours_to_json`), para no dispersar la regla.
6. `PRAGMA foreign_keys=ON` en SQLite, o el desarrollo no se parece a producción.
7. Tests: pytest (backend) + vitest + `verify:css` (frontend). Commits por fase. El **push lo decide quien lleva el proyecto**: el repositorio remoto ya está publicado y se sube al cerrar cada bloque.

### 4.2 De licencia

Filtro objetivo, con la licencia literal leída del fichero `LICENSE*` de la raíz de cada repo:

| Repo | Licencia | ¿Copiar código? |
|---|---|---|
| Paperclip | MIT | **Sí** |
| Kanboard | MIT | **Sí** (repo en mantenimiento) |
| Kaneo | MIT | **Sí** |
| ERPNext, OpenProject | GPL-3.0 | **No** (obligaría a GPL-izar el proyecto) |
| AppFlowy, Plane, Leantime, Ever Gauzy | AGPL-3.0 | **No** |
| Focalboard | AGPLv3 + excepción Apache-2.0 solo en `webapp/html-templates/`, `app-config.json`, `config.json`, `webapp/i18n/`, `server/model/`, `plugin/` | Solo esos ficheros, con aviso y `NOTICE.txt` |
| Planka | PLANKA Community License 1.1 (Fair Use) | Uso interno sí; **hosting comercial a terceros no**; los ficheros `.pe.` (Pro/Enterprise) quedan fuera |

La regla: **las ideas, los algoritmos, los modelos de datos y las arquitecturas no están protegidos por copyright**; la expresión concreta sí. Copyleft = *referencia conceptual sí, simultaneidad de código no*. Cuando una idea venga de un repo AGPL/GPL, reescribirla con nuestras palabras y nuestras tablas.

**Aviso**: el repo de CorePlanner **no tiene fichero `LICENSE`** y **ya está publicado en GitHub como repositorio público**. Sin licencia, por defecto «todos los derechos reservados»: legalmente no es software libre. Conviene decidirlo (propietario si se mantiene cerrado, MIT si se quiere abrir) antes de que el proyecto crezca.

### 4.3 De alcance

- Replicar el **modelo** de OpenProject, no su stack ni su genericidad.
- El trabajo es **clean-room**.
- Lo que falta se prioriza por valor/esfuerzo: **N1 (política) es lo más barato y lo más rentable**.

---

## 5. Identidad visual (la que ya tiene CorePlanner)

- Sidebar `slate-900` oscuro, texto claro; superficie de contenido `slate-50`; cabecera blanca.
- Acento Siemens: `900: rgb(0 52 102)` · `700: rgb(0 74 137)` · `500: rgb(0 100 180)`. **Solo esos tres tonos**: `bg-siemens-800` o `bg-siemens-50` no existen y el guard del CSS lo detecta.
- Tailwind v4 compilado offline. **Sin daisyUI, sin CDN**.
- Iconos SVG propios (Heroicons) en un componente central.
- `frappe-gantt` en el Gantt real.
- **Las páginas van a ancho completo**: el contenido ocupa todo el espacio útil, sin `max-width` centrado. Los límites de ancho se quedan solo en los elementos flotantes (modales, cajón lateral, pantalla de acceso).
- Interfaz **en español**.

---

## 6. Qué se espera como entregable

### 6.1 Una demo visual

- **Web HTML navegable, sin backend** (o con datos simulados en el cliente). Debe poder abrirse localmente.
- Que recorra la **navegación real**: dos contextos (global / proyecto) decididos por la URL, sidebar, migas, selector de contexto, vistas de detalle con drill-down.
- **Las vistas que la demo debe cubrir** (16):

  *Espacio global:* Panel de capacidad · Capacidad Global (modos planificado / real / deriva, filtro por departamento, vistas guardadas, agregados) · Planificador de Recursos (las 4 vistas) · Proyectos (cartera) · Personas & Competencia (directorio, matriz de skills, historial de horarios) · Calendario Laboral (festivos con alcance, mes, impacto en capacidad) · Actividad (bitácora con filtros) · Agente MCP (catálogo deny-by-default, ejecuciones, sesión de chat).

  *Espacio proyecto:* Resumen (KPIs, perfil de carga, incidencias de política) · Matriz de capacidad · Cronograma Gantt (dependencias y ruta crítica) · Tablero Kanban (límites WIP) · Miembros y Asignaciones · Políticas de Capacidad · Imputación de Horas · Actividad.

- Que se vean los **cinco patrones** y las **cinco piezas nuevas** integrados, y que cada pantalla indique de qué repo procede la idea (etiqueta visible tipo «OpenProject · Leantime · Paperclip»).

### 6.2 Coherencia numérica (el requisito que más se nota si falla)

- El **planificado no se guarda**: se **deriva** de tareas + calendario laboral. Así la vista global y la de proyecto cuadran *por construcción*.
- Las **horas reales** viven aparte (`time_entries` es otra tabla). La **deriva** se compara en la **ventana semanal**.
- Umbrales: **aviso 80 %**, **duro 100 %**. El duro es **aprobación obligatoria**, no una alerta.
- Nadie inventa números: si un dato no sale del motor, no se pone.

Valores de referencia de la semilla de la **demo**, para comprobar que tu demo cuadra:

| Referencia | Valor |
|---|---|
| Sebastián Ortega | 48 h en 2026-W46 → **120 %** de 40 h (el caso semilla del README) |
| Jorge Landa | 44 h en 2026-W47 → 110 % |
| Diego Sanz | 42 h en 2026-W47 → 116,7 % (media jornada de formación) |
| Iván Cortés | 41 h en 2026-W46 → 102,5 % |
| Héctor Navarro | Sin horario / sin capacidad → veredicto `no_capacity` |
| Utilización global | 91,7 % en S47 · 84,6 % en W46 |
| PRJ-014 «Línea Pasteurizadora SIVE» | 26 tareas abiertas de 31 · 4 celdas críticas · 3 aprobaciones pendientes · 94,2 % en S47 |
| Semilla de la **demo** | 9 personas · 4 departamentos · 5 proyectos · 47 tareas · 14 dependencias con ruta crítica · 8 festivos |

Ojo: esos son los datos simulados de `demo/assets/data.js`. La semilla real de la **aplicación** (`backend/seed.py`) es mucho más pequeña: **10 personas** · 4 departamentos · 3 roles de proyecto · **2 proyectos** (Linea Pasteurizadora SIVE y Red de tuberias linea 2) · 9 tareas · 13 versiones de horario · **8 días no laborables** (5 globales —dos de ellos de medio día—, 2 de departamento —uno de medio día— y 1 permiso individual) · 13 competencias.

### 6.3 Un análisis

El análisis debe **contrastar y ampliar**, no repetir. Estructura útil:

1. **Lectura del hueco**: qué tiene CorePlanner hoy que no tiene ninguno de los 11 repos, y qué se arriesga si se copia su forma.
2. **Propuesta de arquitectura** para los patrones que faltan: tablas, funciones puras, endpoints, y dónde encaja cada pieza en el esquema actual (F10–F16 + N1–N5).
3. **Decisiones abiertas** que solo puede cerrar el dominio: horario vs número fijo, asignación implícita vs obligatoria, alcance de las vistas guardadas, penalización (o no) de quien no imputa.
4. **Riesgos**: coste del motor con entradas diarias, duplicidad implícita/explícita, coste de las consultas diarias, riesgo de adopción de las horas reales, riesgo de licencia.
5. **Qué se descarta** y por qué (de los 11 repos y de OpenProject).
6. **Orden de fases propuesto** por valor/esfuerzo, con la dependencia crítica de F10.

### 6.4 Criterios de aceptación de la demo

- Se abre con doble clic (`file://`) o con un `python -m http.server` y **no tiene errores de consola**.
- Toda la navegación funciona: no hay enlaces muertos ni vistas vacías.
- Los números de la vista global y de la de proyecto **coinciden** en la misma semana (es el test de coherencia).
- Los **veredictos discretos** se ven en pantalla, no solo el rojo/verde.
- El **umbral duro** se materializa como aprobación pendiente, no como alerta.
- Las dependencias y la ruta crítica se ven en el Gantt.
- La demo **no copia código** de ningún repo: reimplementa ideas.

---

## 7. Mapa de ficheros que hay que leer (si se trabaja sobre el repo real)

```
README.md                                       # arquitectura, endpoints, motor, estado
docs/especificaciones.md                         # alcance de la v1, sección por sección
docs/analisis-competitivo.md                    # los 11 repos, licencias, 5 patrones, N1–N5
docs/openproject/analisis-openproject.md         # modelo real de OpenProject
docs/openproject/plan-replicacion-coreplanner.md # F10–F16, mapa de equivalencias, riesgos
backend/models.py                               # las 10 tablas
backend/security.py                             # RBAC por proyecto
backend/services/capacity.py                    # motor puro
backend/services/capacity_repository.py          # lectura de datos
backend/services/schedule.py                     # horario versionado y peso de los festivos
backend/migrations.py                           # migración del alcance por persona
backend/api/overview.py                         # endpoints globales
backend/api/work_calendar.py                    # endpoint del calendario laboral
frontend/src/components/AppShell.vue            # shell, dos contextos
frontend/src/components/CapacityMatrix.vue      # matriz y drill-down
frontend/src/components/PlannerMatrix.vue       # matriz persona por semana del planificador
frontend/src/utils/navigation.js                # navegación
frontend/tailwind.config.js                     # tokens de color
frontend/scripts/verify-css.mjs                 # guard del bundle
demo/                                           # demo visual ya existente (referencia)
```

**Nota**: la demo existente (`demo/index.html`, con su `assets/app.js`, `assets/engine.js`, `assets/data.js` y `assets/styles.css`) ya implementa muchas de estas vistas con un motor de cálculo en JavaScript que replica las reglas del backend. Sirve de referencia visual y de números de contraste, **no** como base a copiar: el objetivo de esta tarea es que la otra IA construya la suya desde cero.
