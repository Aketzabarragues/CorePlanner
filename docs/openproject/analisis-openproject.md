# Analisis e ingenieria inversa de OpenProject

Objetivo: entender la base de OpenProject para replicarla y adaptarla a CorePlanner,
sin copiar codigo. Este documento es el resultado de inspeccionar la demo en
vivo, la API publica y el codigo fuente.

## 1. Resumen ejecutivo

| Fuente inspeccionada | Que se ha observado |
| --- | --- |
| Demo `safe.openproject.com` | Shell completo sin sesion: 12 entradas de menu global, selector de proyecto, buscador global |
| API v3 publica (`community.openproject.org`) | Forma real de `work_packages`, `projects`, `types`; la tabla es una `query` configurable |
| Codigo fuente (`opf/openproject`, rama `dev`) | 32 modulos; `Role`, `ResourceAllocation`, `ResourcePlanner`, `UserWorkingHours`, `NonWorkingDay` |
| Documentacion oficial | Team planner, Resource management, Schedule and availability, mapa de permisos |
| Conclusion | La base replicable son tres mecanismos: consulta guardable, asignacion con reparto diario y permisos con alcance de entidad |

## 2. Que es OpenProject

OpenProject es un gestor de proyectos de codigo abierto, descendiente de Redmine
a traves de ChiliProject. Stack: Ruby on Rails en el servidor, Angular en el
cliente, PostgreSQL como base de datos, Sidekiq para el trabajo en segundo plano
y Elasticsearch/OpenSearch para la busqueda. Se distribuye en edicion Community
y edicion Enterprise.

La distincion importante para CorePlanner no es el stack, es el modelo: en
OpenProject no existe una entidad "tarea". Existe `WorkPackage`, un contenedor
generico con tipo, estado, prioridad, fechas, campos personalizados, relaciones
y jerarquia. Los tableros, el Gantt, el calendario, la lista de tareas y los
planificadores de equipo son **vistas distintas sobre la misma tabla**.

Los dos modulos que mas se parecen a CorePlanner (`team_planner` y
`resource_management`) son precisamente los que anaden la capa de "personas y
horas" encima de los paquetes de trabajo. El manual declara el Team planner como
add-on Enterprise, disponible solo en los planes Basic, Professional, Premium y
Corporate.

## 3. La base: 32 modulos

El repositorio es un monorepo: el nucleo en `app/` y 32 modulos en `modules/`.

| Familia | Modulos |
| --- | --- |
| Trabajo y planificacion | `boards`, `backlogs`, `calendar`, `gantt`, `team_planner`, `resource_management` |
| Colaboracion | `meeting`, `news`, `documents`, `wikis`, `my_page`, `overviews` |
| Control | `costs`, `budgets`, `reporting`, `xls_export`, `storages` |
| Plataforma | `avatars`, `grids`, `job_status`, `llm`, `itsm`, `bim` |
| Identidad e integracion | `auth_plugins`, `auth_saml`, `openid_connect`, `ldap_departments`, `ldap_groups`, `two_factor_authentication`, `recaptcha`, `webhooks`, `github_integration`, `gitlab_integration` |

La leccion de arquitectura: **cada modulo es autonomo**. Boards no sabe nada
del Gantt; los dos hablan con el nucleo a traves de las mismas entidades y del
mismo motor de permisos. Un modulo se enciende o se apaga por proyecto
(`select_project_modules`).

## 4. Modelo de datos

### 4.1 Mapa de entidades

| Entidad | Campos que importan | Se une con |
| --- | --- | --- |
| `User` | `id`, `name`, `email`, administrador global | horarios, asignaciones, membresias |
| `UserWorkingHours` | `user_id`, `valid_from`, minutos por dia, `availability_factor` | `User` |
| `NonWorkingDay` | `date`, `name` | global de la empresa |
| `Project` | `id`, `identifier`, `name`, `parent_id`, `department_id`, `status`, `public` | `Department`, paquetes de trabajo |
| `WorkPackage` | `id`, `displayId`, `type`, `status`, `priority`, `project_id`, `parent_id`, `assignee_id`, fechas, esfuerzo, `position`, `lockVersion` | `Project`, `Type`, `Status` |
| `Query` | `filters`, `sortBy`, `groupBy`, `columns`, `sums`, `timeline*`, `public`, `starred` | paquetes de trabajo |
| `Membership` | `user_id`, `project_id`, `role_ids` | `User`, `Project`, `Role` |
| `Role` | `name`, permisos | `RolePermission` |
| `ResourceAllocation` | `entity_id`, `principal_id`, `placeholder_user_id`, `start_date`, `end_date`, `allocated_time`, `state` | paquete de trabajo, `User` |
| `ScheduledEntry` | `allocation_id`, `user_id`, `allocated_on`, `minutes`, `overtime_minutes` | `ResourceAllocation` |
| `ResourcePlanner` | `project_id`, `principal_id`, `start_date`, `end_date`, `default_view_id` | `PersistedView` y sus cuatro vistas hijas |

### 4.2 Project

Campos observados en la API: `id`, `identifier`, `name`, `active`, `public`,
`description`, `status`, `statusExplanation`, `createdAt`, `updatedAt`,
`favorited`, `parent`, `ancestors`, `customFields`, `links` hacia `workPackages`,
`categories`, `versions`, `types`, `storages` y `schema`.

Tres ideas que CorePlanner ya tiene y que conviene conservar:

- `identifier` es el prefijo del identificador visible de los elementos hijos
  (`AGILE-1` = proyecto AGILE, elemento 1). Es barato y evita colisiones.
- `parent` y `ancestors` dan jerarquia de proyectos. CorePlanner ya tiene
  `parent_id`.
- `types` son los tipos de elemento habilitados **por proyecto**: la
  configuracion del proyecto acota su propio vocabulario.

Un "Portfolio" es el mismo modelo con otro tipo, no otra entidad.

### 4.3 WorkPackage

Atributos reales devueltos por `GET /api/v3/work_packages`:

| Grupo | Atributos |
| --- | --- |
| Identidad | `id`, `displayId`, `subject`, `description` (markdown), `type`, `status`, `priority` |
| Ubicacion | `project`, `parent`, `ancestors`, `position`, `category` |
| Personas | `assignee`, `responsible`, `author` |
| Fechas | `startDate`, `dueDate`, `derivedStartDate`, `derivedDueDate`, `scheduleManually`, `ignoreNonWorkingDays` |
| Esfuerzo | `estimatedTime`, `derivedEstimatedTime`, `remainingTime`, `derivedRemainingTime`, `percentageDone`, `derivedPercentageDone`, `duration` (ISO 8601), `storyPoints` |
| Clasificacion | `labels`, `targetVersions`, `observedInVersions` |
| Otros | `costs`, `customFields`, `customActions`, `budget`, `readonly`, `lockVersion` |

Tres mecanismos que importan:

1. **Fecha directa y fecha derivada.** `startDate` es la que escribe la persona;
   `derivedStartDate` es la que calcula el motor de planificacion. Cada campo de
   esfuerzo y de fecha tiene su par directo/derivado. El motor rellena los
   derivados salvo que el elemento marque `scheduleManually`.
2. **Bloqueo optimista.** `lockVersion` para detectar ediciones concurrentes.
3. **Orden manual.** `position` define el orden dentro de la tabla, que no es el
   orden por identificador.

### 4.4 Query: la tabla es una consulta guardada

Este es el hallazgo mas transferible. En OpenProject no existe "la tabla de
tareas": existe una entidad `query` con:

- `filters`, `sortBy`, `groupBy`, `columns`, `sums`
- `showHierarchies`, `timelineVisible`, `timelineZoomLevel`, `highlightingMode`
- `public`, `hidden`, `starred`, `icalUrl`
- una `results` con su propia URL parametrizada

Los grupos de columnas son Details, People, Planning y Costs. Cada bloque de la
tabla (Subtasks, Related to, Open points) es a su vez una consulta secundaria
con sus filtros y sus columnas.

Consecuencia de producto: las columnas, el orden, el agrupamiento y los filtros
son **datos guardables y compartibles**, no codigo. Cualquier vista de la
aplicacion (lista, tablero, Gantt, calendario) es una consulta con una
presentacion distinta.

### 4.5 Membership, Role y el mapa de permisos

`Membership` es el vinculo persona-proyecto. `Role` es polimorfico: `Role`
(proyecto o global), `WorkPackageRole` (una entidad concreta) y
`ProjectQueryRole`. Hay roles integrados: Non member, Anonymous, Work Package
Viewer, Work Package Commenter, Work Package Editor, Project Query View, Project
Query Edit y Standard global.

Los roles guardan sus permisos en una tabla de union (`role_permissions`) con
simbolos como `view_work_packages` o `manage_members`.

El mapa de permisos se declara en `config/initializers/permissions.rb`. Cada
permiso define:

| Atributo | Significado |
| --- | --- |
| `permissible_on` | `global`, `project`, `work_package` o `project_query` |
| `require` | `:loggedin` o `:member` |
| `dependencies` | otros permisos que hay que tener antes |
| `public` | si se concede a quien no es miembro |
| `grant_to_admin` | si el administrador lo recibe siempre |
| `contract_actions` | `read`, `create`, `update`, `delete` |

Permisos del modulo de paquetes de trabajo: `view_work_packages`,
`add_work_packages`, `edit_work_packages`, `move_work_packages`,
`delete_work_packages`, `add_work_package_comments`,
`edit_own_work_package_comments`, `view_internal_comments`,
`add_internal_comments`, `edit_own_internal_comments`,
`add_work_package_attachments`, `manage_categories`, `export_work_packages`,
`manage_work_package_relations`, `manage_subtasks`, `save_queries`,
`view_work_package_watchers`, `add_work_package_watchers`,
`delete_work_package_watchers`, `view_shared_work_packages`, `assign_versions`,
`change_work_package_status`, `work_package_assigned`.

Permisos del modulo de gestion de recursos: `view_resource_planners`,
`allocate_user_resources`, `manage_public_resource_planners`,
`view_global_resource_planners`, `manage_public_global_resource_planners`.

La resolucion ocurre en `Authorization.roles(user, project)` y
`Authorization.roles(user, entity)`, con cache por proyecto
(`project_role_cache`, `project_authorization_cache`).

La idea de fondo: **tres estados sobre un elemento**. No se ve, se ve, o se ve
y se edita. Los roles integrados de elemento (Viewer, Commenter, Editor) lo
formaliczan para que un tercero pueda tener acceso puntual a una tarea sin
llegar a ser miembro del proyecto.

### 4.6 Capacidad: horario laboral, asignaciones y reparto

#### Horario laboral (`user_working_hours`)

- Una fila por persona y `valid_from`: el horario esta versionado en el tiempo,
  con historial y programaciones futuras.
- Minutos por dia de la semana (de 0 a 1440), con al menos un dia laborable.
- `availability_factor` entero de 0 a 100: el porcentaje del tiempo disponible
  para trabajo de proyecto. La capacidad efectiva es
  `minutos_del_dia * factor / 100`.
- `effective_within(rango)` devuelve el horario vigente en un rango.
  `unscheduled_within(rango)` devuelve los tramos sin horario: la capacidad ahi
  es **desconocida, no cero**.
- Los dias no laborables de la empresa viven aparte, en `non_working_days`
  (nombre y fecha unica).

#### Asignacion (`resource_allocations`)

- `entity` polimorfico (solo `WorkPackage`), `principal` (la persona), y
  `placeholder_user` (un recurso pedido por filtro de atributos, todavia sin
  persona asignada).
- Auditoria: `requested_by`, `reviewed_by`, `principal_assigned_by`.
- `allocated_time` en **minutos enteros**, mayor que cero, con un tope de 5000
  horas para que el entero no desborde.
- `start_date` y `end_date` propias, con `schedule_violation` que avisa si la
  asignacion empieza antes de la tarea, termina despues, o ambas cosas.
- Estados: `requested`, `allocated`, `rejected`, `canceled`.
- Journalizada: cada cambio queda en el historico.

#### Reparto diario (`resource_allocation_scheduled_entries`)

Una fila por asignacion, persona y dia:

- `minutes`: la parte de esa asignacion que cae en ese dia.
- `overtime_minutes`: la parte que excede el horario de esa persona.

De ahi sale el concepto de **sobrecarga**: una asignacion esta sobrecargada si
alguna de sus entradas tiene horas extra, o si no tiene ninguna entrada (no es
planificable). `ProspectiveOverbooking` resume el caso como
`overtime_minutes`, `period` y `unplannable`.

Las personas sin horario configurado se excluyen del calculo de sobrecarga:
su capacidad se desconoce, no se supone cero.

El recalculo se serializa por persona con bloqueos consultivos
(`lock_schedules_of`), de modo que dos recalculos simultaneos no se pisen.

#### Planificador (`resource_planners`)

`ResourcePlanner` hereda de `PersistedView`: es una vista guardada con opciones
propias (`start_date`, `end_date`, `default_view_id`) y cuatro vistas hijas
admitidas:

| Vista | Muestra |
| --- | --- |
| `ResourceWorkPackageTimeline` | linea de tiempo por paquete de trabajo |
| `ResourceUserTimeline` | linea de tiempo por persona: capacidad, sobrecarga y avisos |
| `ResourceWorkPackageList` | tabla con columnas de planificacion |
| `ResourceUserCard` | tarjetas de persona: departamento, estado, horario, atributos, barra de utilizacion |

Detalles que importan:

- El planificador puede ser global (`project_id` nulo) o de proyecto. Es el
  mismo patron de contexto global/proyecto que CorePlanner ya implemento.
- La consulta (filtros y columnas) cuelga de las vistas hijas, no del
  planificador.
- El planificador tiene dueno y visibilidad: publico, o propio. `visible?` es
  `public? || principal == user`.
- Asignar trabajo se puede hacer por persona o por criterios de filtro
  (idiomas, certificaciones, atributos de usuario). En el segundo caso nace una
  peticion de recurso sin persona, que la vista **Staffing** empareja mas tarde
  con quien tenga capacidad restante.

### 4.7 Planificacion temporal

El motor calcula `derivedStartDate` y `derivedDueDate` a partir de las
relaciones padre/hijo, del `scheduleManually` y de `ignoreNonWorkingDays`. Los
dias no laborables se muestran con fondo mas oscuro, y una tarea de tres dias
que va de jueves a lunes ocupa cinco dias de calendario pero sigue siendo de
tres dias de trabajo.

## 5. La IA: dos espacios y vistas guardadas

El menu global que se ve en la demo, sin sesion, tiene doce entradas: Inicio,
Mi pagina, Carteras, Proyectos, Paquetes de trabajo, Diagramas de Gantt,
Planificadores de equipos, Tableros, Reuniones, Noticias, Tiempo y costes y
Wiki. Arriba a la izquierda esta el selector de proyecto y en la cabecera el
buscador global.

Dentro de un proyecto, el menu es el de los modulos habilitados para ese
proyecto. La conmutacion entre contexto global y contexto de proyecto se hace
con el selector superior, y el menu lateral cambia con el: exactamente el
patron que CorePlanner implemento en la fase 9.

La unidad reutilizable no es la pagina, es la **vista guardada**: columnas, filtros,
orden, agrupamiento y zoom. Un objeto puede tener varias vistas a la vez (las
pestañas del planificador), y cada modulo define sus propios tipos de vista.

## 6. La base replicable: tres mecanismos

1. **Consulta guardable.** La matriz, el tablero y el Gantt dejan de ser
   paginas fijas y pasan a ser vistas con filtros, columnas y orden
   configurables, guardables y compartibles.
2. **Asignacion con reparto diario.** Separar "cuantas horas tiene la tarea" de
   "como se reparten esas horas entre los dias de cada persona", y poder medir
   horas extra por dia.
3. **Permisos con alcance de entidad.** Roles por proyecto mas acceso puntual a
   una tarea concreta, con los tres estados (no ver, ver, ver y editar).

## 7. Lo que no hay que replicar

| Elemento | Por que no |
| --- | --- |
| Tabla `work_packages` con 30+ columnas y polimorfismo por doquier | CorePlanner es pequeno y centrado; la genericidad de OpenProject es coste, no beneficio |
| Dos frameworks y un monolito Rails | Nuestro stack (FastAPI + Vue) ya funciona y esta verificado |
| Legacy heredado de Redmine (duraciones ISO, Gantt propio) | Compatibilidad historica, no modelo |
| Busqueda global, foros, wiki, reuniones, noticias, control de costes | Fuera del alcance: CorePlanner es un gestor de capacidad |
| Copia de codigo | El nucleo es GPLv3 (asi lo declaran los gemspec de los modulos) y los Enterprise son comerciales. El camino limpio es *clean-room*: replicar conceptos y experiencia de uso, escribir el codigo propio |

## 8. Fuentes consultadas

- Demo en vivo: <https://safe.openproject.com/>
- API v3 publica: <https://community.openproject.org/api/v3/work_packages>,
  <https://community.openproject.org/api/v3/projects>,
  <https://community.openproject.org/api/v3/types>
- Arbol de modulos: <https://github.com/opf/openproject/tree/dev/modules>
- Roles: <https://github.com/opf/openproject/blob/dev/app/models/role.rb>
- Mapa de permisos: <https://github.com/opf/openproject/blob/dev/config/initializers/permissions.rb>
- Concepto de permisos: <https://www.openproject.org/docs/development/concepts/permissions/>
- Roles y permisos (admin): <https://www.openproject.org/docs/system-admin-guide/users-permissions/roles-permissions/>
- Asignaciones: <https://github.com/opf/openproject/blob/dev/modules/resource_management/app/models/resource_allocation.rb>
- Planificador: <https://github.com/opf/openproject/blob/dev/modules/resource_management/app/models/resource_planner.rb>
- Reparto diario: <https://github.com/opf/openproject/blob/dev/modules/resource_management/app/models/resource_allocations/scheduled_entry.rb>
- Sobrecarga: <https://github.com/opf/openproject/blob/dev/modules/resource_management/app/models/resource_allocations/prospective_overbooking.rb>
- Horario laboral: <https://github.com/opf/openproject/blob/dev/app/models/user_working_hours.rb>
- Dias no laborables: <https://github.com/opf/openproject/blob/dev/app/models/non_working_day.rb>
- Team planner: <https://www.openproject.org/docs/user-guide/team-planner/>
- Resource management: <https://www.openproject.org/docs/user-guide/resource-management/>
- Horario y disponibilidad: <https://www.openproject.org/docs/user-guide/account-settings/schedule-and-availability/>
