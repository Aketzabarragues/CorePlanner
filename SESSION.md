# Estado de la sesion

## Objetivo actual

Estados de tarea configurables por proyecto: **implementado y verificado** en
backend y frontend. Cada proyecto define sus propios estados (clave, etiqueta,
color y avance) en la tabla `task_statuses`, en vez de la lista global fija de
cuatro. Los cuatro por defecto (Backlog, En Desarrollo, Pruebas (FAT/SAT) y
Completado, con avances 0/50/75/100) se siembran en todos los proyectos, nuevos
o ya existentes, y no cambian.

Tres fases, tres commits de checkpoint en `Main`:

- `7007ad6` `feat(estados)`: backend (modelo, siembra, servicio, API, migracion).
- `ce4d66d` `feat(frontend)`: el frontend toma la lista del backend.
- `feat(configuracion)`: la pantalla de gestion de estados (Fase 3).

Ningun commit ha sido pusheado.

## Cambios realizados

### Backend

- `backend/models.py`: `ProjectTaskStatus` -> tabla `task_statuses` (clave,
  etiqueta, color, avance 0-100, orden; `UNIQUE(project_id, key)`). Fuera el
  `CheckConstraint` de `Task.status`. `DEFAULT_TASK_STATUSES` es la unica lista
  de los cuatro por defecto. Evento `after_insert` de `Project` que los siembra
  en la misma transaccion.
- `backend/services/task_statuses.py` (nuevo): `list_statuses`,
  `statuses_by_project`, `progress_by_project` (una consulta, la comparten Gantt
  y resumen), `status_usage`, alta con clave generada, edicion, reorden y
  borrado con reasignacion en la misma transaccion y recomposicion de la
  columna destino (0..n-1).
- `backend/api/task_statuses.py` (nuevo): `GET /task-statuses`, y por proyecto
  `GET/POST /projects/{id}/task-statuses`, `PATCH .../{status_id}`,
  `PUT .../order`, `DELETE .../{status_id}?reassign_to=`. Lectura con permiso
  de proyecto, escritura con `require_manager()` y 404 si el proyecto no existe
  (`get_project_or_404`).
- `backend/schemas.py`: `TaskOrder.status` y `TaskUpdate.status` pasan de
  `TaskStatus` a `str`; nuevos `TaskStatusCreate/Update/Out/Order` con el
  color validado contra la paleta.
- `backend/migrations.py`: siembra idempotente de los defaults y recreacion de
  `tasks` sin el CHECK (misma tecnica que `_migrate_non_working_days`). Como
  `tasks` es padre de cuatro tablas hijas con `CASCADE`, la migracion las
  captura antes del `DROP` y las restituye despues.
- Consumidores: `tasks.py` valida la clave contra los estados del proyecto (422)
  y la tarea nueva nace en el primer estado por orden; `kanban.py` dibuja las
  columnas del proyecto; `gantt.py` usa el avance de SU proyecto;
  `project_summary.py` cuenta completadas las de avance 100.

### Frontend

- `frontend/src/stores/taskStatuses.js` (nuevo) y `taskStatusesApi` en
  `api/client.js`.
- `frontend/src/utils/statusColor.js` (nuevo): `pildora(hex)` y `barra(hex)`.
- `frontend/src/utils/kanban.js`: fuera `KANBAN_COLUMNS`, `STATUS_PILL` y
  `STATUS_BAR`; `columnLabel`, `statusPill`, `statusBar` y `columnAt` reciben
  la lista; `DEFAULT_TASK_STATUSES` queda como respaldo; `estadosCon` une la
  lista del proyecto con los estados que usan las tareas que se ven.
- Migrados: `KanbanView`, `TaskListView`, `MyWorkView`, `ProjectSummaryView`,
  `GanttView`, `PanelView`, `CalendarView`, `ActivityView`, `DayDetail`,
  `WeekLanes`, `TaskDetailDialog`, `utils/ganttColumns.js`, `utils/activity.js`.
- `frontend/src/views/ProjectSettingsView.vue`: seccion "Estados de tarea" (solo
  el gerente): tabla en orden con etiqueta, color, avance y numero de tareas,
  alta y edicion en un dialogo con `ColorPicker`, reordenado con botones
  subir/bajar y borrado en un dialogo con el estado de reemplazo obligatorio
  cuando el estado tiene tareas.
- `frontend/scripts/verify-css.mjs`: escapa tambien la coma al buscar una
  clase en el bundle.

### Documentacion

- `docs/especificaciones.md`: seccion 62 nueva ("Los estados de tarea son de
  cada proyecto") y las filas afectadas de las tablas de alcance y datos
  minimos.
- `CHANGELOG.md`: entradas en Added, Changed y Fixed.

## Decisiones tecnicas

- **La siembra va en un evento `after_insert` de `Project`**, no solo en
  `create_project`: asi todo proyecto (servicio, seed, pruebas) nace con sus
  estados y se cumple el invariante "todo proyecto tiene al menos un estado".
- **La clave la genera el servidor** (slug ASCII de la etiqueta) y es
  inmutable: las tareas la referencian.
- **El avance es un dato, no un tipo**: "completada" es la que tenga avance
  100. No hay clave "hecha" con categoria especial.
- **El color sale de la paleta cerrada de dieciocho** y es semantico de estado,
  no de identidad de proyecto: vive en su propia columna.
- **El color se pinta con estilos en linea**, nunca con clases Tailwind
  dinamicas. El texto de la pila se oscurece hasta 4.5:1 de contraste contra su
  fondo (WCAG 2.1 AA): con el color tal cual, tres de los cuatro defaults
  estaban entre 2.79:1 y 4.33:1.
- **Los estados que se pintan son la union** de la lista del proyecto con los
  estados que usan las tareas visibles: si la peticion de estados falla, las
  tareas con estado propio no desaparecen del tablero ni del desplegable.
- **Borrar es una reasignacion**, no un borrado en seco: el numero de tareas
  sale a la vista antes de borrar (patron de `skill_usage`).
- **El estado no se registra en `activity_log`**: cambiar la configuracion de
  los estados no es un movimiento de trabajo. Queda pendiente.
- **La migracion no puede usar `PRAGMA` ni `sqlite_master`** (guarda de
  `test_migrations.py`: no existen en PostgreSQL), asi que captura y restituye
  las filas hijas en vez de desactivar la integridad referencial.

## Pendientes / Siguiente paso inmediato

- **Pendiente Known**: registrar en `activity_log` los cambios de la
  configuracion de estados (crear, editar, reordenar, borrar). No entra en la
  v1 y no esta decidido como.
- **Pendiente Known**: `PanelView.tasks_by_status` agrupa por clave entre
  proyectos, asi que la etiqueta sale del primer proyecto cargado que tenga esa
  clave. Es una limitacion documentada, no un contrato.
- **Siguiente paso**: la auditoria de coherencia y de tokens ya preparada, que
  debe ver el inventario de hardcoding con el sistema nuevo y no con el fijo.
- Revisar si `docs/especificaciones.md` §62 quiere el detalle de la pantalla de
  gestion (hoy lo describe en dos lineas).
