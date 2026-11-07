# Análisis competitivo e ingeniería inversa: 11 repos de referencia para CorePlanner

Fecha: 2026-11-05. Autor: análisis realizado sobre clones superficiales de los 11 repositorios, con lectura directa del código fuente.

**Dónde encaja este documento.** CorePlanner ya tiene un análisis de OpenProject y su plan de fases: [`docs/openproject/analisis-openproject.md`](openproject/analisis-openproject.md) y [`docs/openproject/plan-replicacion-coreplanner.md`](openproject/plan-replicacion-coreplanner.md). Este documento **no los sustituye**. Amplía el mismo trabajo a los once repositorios, añade el filtro de licencias (que el análisis anterior no abordaba en detalle) y contrasta la hoja de ruta existente con lo que aportan los otros diez. La sección 7 es el contraste; el resto es material nuevo.

---

## 0. Método y trazabilidad

Qué se hizo, para que se pueda auditar:

1. Ficha objetiva de los 11 repos vía API de GitHub (licencia declarada, stack, tamaño, fecha del último push).
2. Clone `--depth 1` de los 11 repos (los tres gigantes, ERPNext y OpenProject, con `--filter=blob:none --sparse`) y lectura directa del código.
3. Lectura íntegra de los ficheros de licencia de los 11 repos (no basta con el campo de la API: Focalboard y Planka declaran licencias que la API reporta como `NOASSERTION`).
4. Escaneo sistemático de los 11 repos buscando el vocabulario del dominio de CorePlanner (`weekly_base_hours`, `overalloc`, `workload`, `utilization`, `sobrecarg`…), para medir de forma objetiva quién resuelve realmente nuestro problema y quién no.
5. Verificación manual de una muestra de los hallazgos contra el código: los ficheros citados se han abierto y leído.

Lo que **no** se ha hecho: no se ha ejecutado ninguna suite de tests de los repos ajenos, ni se ha medido rendimiento. Las afirmaciones sobre comportamiento son inferencias de lectura de código.

---

## 1. Veredicto en una página

**El hallazgo central: CorePlanner ocupa un hueco que ninguno de los 11 repos cubre.** Ninguno tiene una matriz de carga persona × semana ISO contra una capacidad base.

Recuento objetivo de coincidencias del vocabulario de capacidad (excluyendo `node_modules`, `vendor`, traducciones):

| Repo | `overalloc` | `workload` | `utilization` | `weekly_base_hours` | ¿Matriz persona × semana? |
|---|---|---|---|---|---|
| paperclip | – | 166 | 96 | – | No (es carga de *agentes IA*, no de personas) |
| openproject | – | – | 69 | – | No, pero **calcula capacidad y % de utilización reales** |
| ever-gauzy | 5 | 13 | 14 | – | No (parte de persona: skills, niveles, ausencias) |
| leantime | 4 (`over_alloc`) | – | 15 | – | No, pero **ya tiene modelo de capacidad y veredictos discretos** |
| erpnext | – | 4 | – | – | No (tiene calendario laboral y estimado vs real) |
| plane | – | 4 | – | – | **No: cero capacidad** |
| kaneo | – | 3 | – | – | **No: las tareas ni siquiera tienen campo de estimación** |
| AppFlowy | – | – | – | – | No |
| focalboard | – | – | – | – | **No: 0 coincidencias** |
| kanboard | – | – | – | – | **No: 0 coincidencias** |
| planka | – | – | – | – | **No: 0 coincidencias** |

Conclusión operativa: **no copies el producto de nadie**. Diez de los once empujan a convertir CorePlanner en un clon de Jira/Plane/OpenProject, que es un mercado saturado y en el que no tenemos ventaja. Lo que no tiene nadie es lo que ya tenemos: la pregunta "esta persona, esta semana, ¿cuánta carga tiene y contra qué capacidad?".

El camino correcto es: **profundizar en el dominio de la capacidad** (calendario laboral, disponibilidad por persona, capacidad configurable, estimación vs realidad, políticas de sobrecarga) y **ignorar todo lo demás** (campos personalizados, jerarquía de espacios, CRDT, gamificación, suites ofimáticas, plugins).

Los tres repos que de verdad aportan algo al motor:

| Repositorio | Qué aporta | Licencia |
|---|---|---|
| **OpenProject** | El modelo de disponibilidad versionada (`availability_factor` + `valid_from`) y el cálculo de capacidad por día | GPL-3.0 → reimplementar |
| **Leantime** | El contrato de recursos + read model inmutable, y los veredictos discretos de capacidad | AGPL-3.0 → reimplementar |
| **Paperclip** | El motor de presupuestos con umbral blando/duro y veto humano, y el ciclo OB1 | **MIT → reutilizable** |

---

## 2. Licencias: el filtro que decide qué se puede tocar

Inspección directa de los ficheros `LICENSE*` de la raíz de cada repo.

| Repo | Licencia literal | ¿Copiar código a CorePlanner? |
|---|---|---|
| paperclipai/paperclip | MIT | **Sí** |
| kanboard/kanboard | MIT | **Sí** (pero el repo está en modo mantenimiento) |
| usekaneo/kaneo | MIT | **Sí** |
| frappe/erpnext | GPL-3.0 | No (obligaría a GPL-izar CorePlanner) |
| opf/openproject | GPL-3.0 | No (idem; además la EE no es open source) |
| AppFlowy-IO/AppFlowy | AGPL-3.0 | No (copyleft de red: obligaría a publicar el servicio) |
| makeplane/plane | AGPL-3.0-only | No |
| Leantime/leantime | AGPL-3.0-only (`composer.json:12`) | No |
| ever-co/ever-gauzy | AGPL-3.0 | No |
| mattermost-community/focalboard | AGPLv3 + excepción Apache-2.0 **solo** en `webapp/html-templates/`, `app-config.json`, `config.json`, `webapp/i18n/`, `server/model/`, `plugin/` | Solo esos ficheros, con aviso y `NOTICE.txt` |
| plankanban/planka | PLANKA Community License 1.1 ("Fair Use") | Uso interno sí; **hosting comercial a terceros no**; los ficheros `.pe.` son Pro/Enterprise y no están cubiertos |

### La regla que hay que fijar por escrito

- **Las ideas, los algoritmos, los modelos de datos y las arquitecturas no están protegidos por copyright.** Solo lo está su expresión concreta (el texto del código). Reimplementar desde cero es lícito y es la vía correcta con AGPL/GPL.
- **Copiar código de AGPL/GPL/Planka/Focalboard está prohibido.** No es una cuestión de "atribución": es una obligación de publicar la obra derivada.
- Por tanto: **referencia conceptual sí, Simultaneidad de código no.** Cuando una idea venga de un repo AGPL, reescribirla con nuestras propias palabras y nuestras propias tablas.
- **Falta la licencia de CorePlanner.** El repo no tiene fichero `LICENSE`. Sin licencia, por defecto "todos los derechos reservados" (que es lo que probablemente quieres para un producto propio), pero conviene hacerlo explícito: si la intención es mantenerlo cerrado, un `LICENSE` propietario; si la intención es abrirlo, elegir MIT y publicarlo.
- **Paperclip, Kanboard y Kaneo son MIT**: son las tres únicas fuentes de código realmente reutilizable. Con el modelo de `budget_policies` de Paperclip y el `ical.ts` de Kaneo se puede trabajar directamente.

---

## 3. CorePlanner hoy: el punto de partida y lo que falta

Estado real del repo (rama `Main`, último commit `806bfbd`).

Lo que ya funciona y está bien:

- **Motor de capacidad**: `backend/services/capacity.py` — reparto uniforme de `estimated_hours` entre días laborables entre `start_date` y `end_date`, imputación por semana ISO, comparación contra `users.weekly_base_hours`, `Decimal`/`Numeric(12,2)` sin coma flotante.
- **RBAC**: JWT con permisos por proyecto (`roles.permissions_json`), dependencia `require_project_permission`, permisos `capacity.read`, `gantt.read`, `task.write`, administrador global.
- **Separación persona/proyecto**: `users`, `departments` (con `manager_id`), `projects` (con `parent_id`), `project_members` (PK `user_id + project_id + role_id`).
- **Servicio puro**: el motor de cálculo no toca la base de datos; los repositorios están aparte. Es la arquitectura correcta y hay que conservarla.

Lo que **no** existe y es lo que este análisis propone añadir:

| Hueco | Hoy | Consecuencia concreta |
|---|---|---|
| Calendario laboral | `business_days` solo salta sábado y domingo | Una tarea que cruza un festivo se reparte en un día que no existe; la semana de 4 días de una persona se trata como de 5 |
| Disponibilidad por persona | `weekly_base_hours` es un escalar plano | No se puede expresar un 50 %, unas vacaciones, un período de jornada reducida ni un cambio a partir de una fecha |
| Capacidad configurable por día | 40 h/semana indiferenciado | "Lunes 8 h, martes 4 h" es indistinguible de "40 h repartidas" |
| Horas reales | Solo `estimated_hours` | El plan se desvía del real y no hay forma de saberlo |
| Dependencias entre tareas | Ninguna | El Gantt no tiene predecesores, ni ruta crítica, ni reprogramación en cascada |
| Jerarquía de tareas | Ninguna | No se puede agrupar tareas en paquetes/epics para rollup de carga |
| Políticas de sobrecarga | La celda se pinta roja | No hay umbral configurable, ni aviso, ni registro, ni aprobación |
| Bitácora de cambios | Ninguna | No se sabe quién movió qué ni cuándo (trazabilidad, que es un requisito explícito) |
| Estados configurables | `CHECK` fijo de 4 valores | Fino si no se quiere cambiar nunca; rígido si algún equipo lo necesita |

---

## 4. Los 11 repos, uno a uno

### 4.1 OpenProject — el modelo de disponibilidad (GPL-3.0)

**El hallazgo más importante de todo el análisis.** OpenProject modela la disponibilidad de una persona con tres piezas que encajan con nuestro `users.weekly_base_hours` como una generalización natural.

1. **`UserWorkingHours`** (`app/models/user_working_hours.rb`) — el corazón:
   - `user_id`, **`valid_from`** (único por usuario), **`availability_factor`** (entero 0..100) y minutos por día (`monday`…`sunday`).
   - `effective_weekly_working_hours` = `((weekly_working_hours * availability_factor) / 100.0).round(2)`.
   - `effective_minutes_on(date)` = `((minutes_on(date) * availability_factor) / 100.0).round`.
   - `scope :effective_within(range)` resuelve **qué horario estaba vigente en cada momento** con un `NOT EXISTS`: el horario de una persona está **versionado en el tiempo**.

2. **`UserNonWorkingTime`** (`app/models/user_non_working_time.rb`) — rangos de no disponibilidad por persona, con validación de no solapamiento (`validate :no_overlapping_ranges`) y `working_days_in(range)` que combina días laborables globales con festivos globales.

3. **`NonWorkingDay`** (`app/models/non_working_day.rb`) — `name` + `date` único, con `scope :for_dates` y `scope :for_year`. Festivos **globales de la instancia**.

Y el algoritmo de capacidad, en `modules/resource_management/app/services/resource_allocations/working_time_calendar.rb`:

```ruby
def compute_capacity(date)
  return 0 if @global_non_working_days.include?(date)
  return 0 if non_working?(date)
  working_hours = working_hours_for(date)
  return 0 if working_hours.nil?
  minutes = working_hours.public_send(WDAY_TO_COLUMN.fetch(date.wday))
  return 0 if minutes.zero?
  (minutes * working_hours.availability_factor / 100.0).round
end
```

El detalle de diseño importante: **`Setting.working_days` global no se consulta**, porque `UserWorkingHours` ya codifica qué días trabaja esa persona (un día con 0 minutos es no laborable para ella). Una sola tabla cubre calendario global, horario personal y factor de disponibilidad.

El ratio de utilización está en `ResourceAllocations::Availability`:
- `capacity_minutes_within(range)` → `WorkingTimeCalendar.new(user:, range:).total`
- `scheduled_minutes_within(range)` → suma de minutos reservados
- **`utilization_ratio(range)` = `(scheduled / capacity) * 100`** redondeado
- `overbooked?` y `overbooked_dates` → detección de sobreasignación

Y hay un detalle operativo muy aprovechable: al cambiar el calendario laboral, OpenProject **no recalcula en caliente**, sino que lanza jobs de reprogramación (`ApplyWorkingDaysChangeJob`) que persisten `previous_working_days` / `previous_non_working_days`. Es exactamente el problema que tendremos al añadir los festivos: ¿qué pasa con la matriz ya calculada?

**Otros hallazgos reutilizables:**
- `Relation` (`app/models/relation.rb`) con tipos `relates`, `precedes`, `follows`, `blocks`, `blocked`, `duplicates`, `includes`, `partof`, `requires` y su `reverse`.
- `SchedulingRules#soonest_start` = máximo de los `successor_soonest_start` de los predecesores, ajustado al siguiente día laborable.
- `Workflow.statuses(role:, tab:)` — **workflow por rol**, no un enum fijo.
- `Member` polimórfico: la pertenencia puede ser a un proyecto **o a un work package concreto**, y admite **varios roles por persona en el mismo proyecto** (`member_roles`).
- `Journal` polimórfico + `has_paper_trail` + `WorkPackage::Versions` (`kind: "target"` / `"observed_in"`) → bitácora de cambios.
- `Day` (`app/models/day.rb:61-91`) genera el calendario en SQL con `generate_series` y `POSITION(extract(isodow from dd)::text IN settings.value) > 0`.
- OpenProject también usa **float** para `estimated_hours`: nuestro `Numeric(12,2)` es mejor, mantenerlo.

### 4.2 Leantime — capacidad y MCP (AGPL-3.0-only)

Leantime es, contra todo pronóstico, el que más se parece a nosotros en dominio, y lo hace con una arquitectura muy Transferible.

**El modelo de capacidad** está en `app/Core/Resources/`:

- `Contracts/ResourcesGateway.php` — el **contrato** (puerto).
- `Services/ResourcesRegistry.php` — registro de implementaciones.
- `Models/PersonAllocation.php` — `itemId`, `userId`, `displayName`, `capacity`, `allocations[projectId => weeklyHours]`, con `totalAllocated()` y **`available() = max(0, capacity - totalAllocated())`**.
- `Models/ResourceSummary.php` — read model inmutable: `totalCapacity`, `totalAllocated`, `totalBudgeted`, `totalSpent`, `totalActual`, `actualsByProject`, y los métodos `actualDrift()` (= `totalActual - totalAllocated`), `capacityUtilization()` (con guarda `if totalCapacity <= 0 return 0`) y `budgetUtilization()`.

Tres decisiones que nos encajan como anillo al dedo:

1. **El contrato y el read model viven en el core; la implementación de datos vive en un plugin.** El core no sabe de dónde salen los datos. Es exactamente la separación `services/capacity.py` (puro) + `services/*_repository.py` (datos) que ya tenemos, pero con la frontera de la interfaz formalizada. Merece la pena añadir un `CapacityProvider` (protocolo) en nuestro backend.
2. **`totalActual` se calcula en la ventana de la semana en curso**, y el propio docblock lo justifica: "capacity/allocated are weekly rates (h/wk), so the comparable actual is this week's logged hours". Es la respuesta correcta a la pregunta "¿cómo comparo plan con real si uno es un reparto y el otro es un total?".
3. **`EmploymentType`** (`app/Domain/Users/Enums/EmploymentType.php:8-10`) decide **cómo se interpreta `weekly_hours`**: objetivo, techo, tope de facturación o mejor esfuerzo, y cómo la matemática de capacidad trata a esa persona. Es la semántica que le falta a nuestro `weekly_base_hours`.

**Aviso importante**: Leantime usa `zp_user.weekly_hours int(11)` (verificado en `app/Domain/Install/Repositories/Install.php:766`) y su propio código lo reconoce: *"the int column cannot represent genuinely fractional contracts (37.5 h/wk is common part-time)"* (`app/Domain/Users/Repositories/Users.php:637-639`). **No copiar ese error**: nuestro `Numeric(12,2)` ya lo hace bien.

**Los veredictos discretos de capacidad** están en `app/Domain/Reports/Services/CapacityAnalyzer.php`: `critical`, `tight`, `balanced`, `buffer`, `no_capacity`, `no_work`. El orden de presentación es "el peor primero" (`$verdictRank = ['critical' => 0, 'tight' => 1, ...]`). Esto es una **máquina de estados de capacidad**, y encaja con la manera de pensar del operario: en vez de un booleano "rojo/verde", un enumerado con seis estados ordenados por gravedad, cada uno con su presentación.

**MCP**: `composer.json:105` declara `"laravel/mcp": "^1.0"`, y hay ~62 herramientas en `app/Domain/*/Tools/` que extienden `Laravel\Mcp\Server\Tool`, con `#[IsDestructive(false)]` y schema JSON Schema. La autenticación es *bearer token* contra `zp_access_tokens` (hash sha256). Y hay un detalle ejemplar: `tests/Acceptance/API/McpCest.php` mantiene una lista `EXPECTED_TOOLS` que actúa de **test de contrato** — cualquier tool nueva o renombrada rompe el CI. Es el patrón que hay que adoptar si exponemos CorePlanner vía MCP.

**Otros**: el Gantt de Leantime **usa frappe-gantt** (la misma librería que ya tenemos) pero solo como *roadmap de hitos*, no de tareas planificadas: `getAllMilestones()` en `app/Domain/Tickets/Services/Tickets.php:1695`. Nuestro Gantt es más rico.

Cuidado con `app/Domain/Entityrelations/Services/Entityrelations.php:19-35`: está **roto y marcado FIXME** (`saveRelationship()` delega en `Setting::saveSetting()` y descarta silenciosamente `$relationship`, `$entityB`, `$entityBType` y `$meta`). No es un patrón a imitar.

### 4.3 Paperclip — presupuestos y ciclo OB1 (MIT, reutilizable)

El único de los grandes con licencia permisiva, y el que aporta el patrón más transferible: **convertir "pintar una celda en rojo" en una política configurable con consecuencias**.

**Modelo** (`packages/db/src/schema/budget_policies.ts`): `companyId`, `scopeType` + `scopeId` (ámbitos `company`, `agent`, `project`), `metric`, `windowKind` (p. ej. `calendar_month_utc`), `amount`, `reservationCents`, **`warnPercent` (80 por defecto)**, **`hardStopEnabled`**, `notifyEnabled`, `unpricedUsagePolicy`, y dos contadores de fence (`enforcementVersion` / `enforcementDeliveredVersion`). Índice único por `(company, scope, metric, window)`.

**El evaluador** (`server/src/services/budgets.ts`):
- `budgetStatusFromObserved()` devuelve exactamente `ok` | `warning` | `hard_stop`. Umbral blando = `ceil(amount * warnPercent / 100)`; duro = observado ≥ `amount`.
- `observedBlocks()` bloquea si se supera el.amount, **o** si hay runs pendientes sin contabilizar, **o** si hay uso sin precio fiable.
- `evaluateAffectedScopes()` al cruzar el umbral blando crea un incidente `threshold_type='soft'` y registra `budget.soft_threshold_crossed`; al bloquear, cierra los soft, crea el duro, **pausa el ámbito** y registra `budget.hard_threshold_crossed`.
- **Idempotencia**: `createIncidentIfNeeded()` no duplica por índice único parcial sobre `(policyId, windowStart, thresholdType)` mientras `status='open'`.
- **Veto humano**: el umbral duro inserta una fila en `approvals` con `type: 'budget_override_required'`. Rebasar el límite **no es una alerta: es una aprobación obligatoria**.
- **Reservas**: `budget_reservations` con estado `held | settled | released` y un CHECK que exige exactamente una fuente (`run` XOR `decision` XOR ...): no se puede gastar lo que ya está reservado por un trabajo en curso.
- **Precisión**: todo se compara con `compareCents` sobre `numeric(24,7)` en string. **Nunca float.** Coincide con nuestra regla.

Para CorePlanner el mapeo es directo y de alto valor:

| Paperclip | CorePlanner |
|---|---|
| `scopeType` + `scopeId` | `persona` / `proyecto` / `departamento` |
| `metric` | `horas_planificadas` |
| `windowKind` | `semana_iso` |
| `amount` | `weekly_base_hours` (o el valor efectivo) |
| `warnPercent` | 80 % → aviso; 100 % → sobrecarga |
| `hardStopEnabled` | bloquear la asignación de tareas que desbordan |
| `approvals` | "necesita aprobación del responsable de departamento" |
| `budget_incidents` | registro histórico de sobrecargas |

**El ciclo OB1** es literal (`server/src/services/budget-enforcement-worker.ts:35-62`): `coordinator.register(DELIVERY_QUEUES.budgetEnforcement, { retryMs: 1000, coalesceMs: 1000, runDuringDrain: true, run(signal), hasPending(), nextRunAt() })`. El ciclo es: despertar → reconciliar políticas vencidas → drenar cola de evaluación → entregar efectos.

Y **`coalesced_count`** merece atención: en `server/src/modules/wake-queue/application/use-cases.ts:921-925`, `mergeIntoExistingDeferredWake()` hace `nextCoalescedCount: (existingDeferred.coalescedCount ?? 0) + 1`. Es **fusión de disparadores**, no reintento: N avisos distintos se funden en un solo disparo, y el contador dice cuántos se fusionaron. Es el "coalescing" de una SFC y encaja con la cabeza de PLC del operario.

**La máquina de estados, con una corrección importante**: el CHECK real de `pipeline_stages.kind` es `('working','review','done','cancelled')` — **no existe 'open'**. Y, más revelador, **`enforceTransitions` no aparece en ninguna parte de `server/src`**: la columna existe en el schema pero la máquina de estados configurable **está declarada pero no implementada**. Es scaffolding, no funcionalidad. No hay que copiarla.

Lo que sí es aprovechable: **`issues.status` es `text` con default `'backlog'` y sin CHECK** (`packages/db/src/schema/issues.ts:47`, verificado). El estado es libre de facto, con `statusVersion` como contador de concurrencia optimista. La lección para nosotros: **el conjunto de estados puede estar fijo en la base y ser configurable en la aplicación** (una tabla `project_statuses` con `key`, `name`, `position`, `wip_limit`), sin tocar el esquema.

**MCP**: `packages/mcp-server` (MIT, `@modelcontextprotocol/sdk ^1.31.0`, bin `paperclip-mcp-server` → `dist/stdio.js`), con ~30 tools en `src/tools.ts` construidas por un helper `makeTool(name, description, zodSchema, execute)`. En las escrituras envía la cabecera `X-Paperclip-Run-Id`: **trazabilidad de qué ejecución originó la mutación**. Y `tool_profiles` con **`defaultAction` `'deny'` por defecto**: *deny-by-default* para las herramientas.

### 4.4 ERPNext — calendario laboral, estimado vs real y dependencias (GPL-3.0)

Aporta tres cosas que nos faltan y que están muy bien resueltas.

**Calendario laboral** (`erpnext/setup/doctype/holiday_list/holiday_list.py`): campos `from_date`, `to_date`, **`weekly_off`** (un único día no laborable semanal), `is_half_day`, `country`, `subdivision` y una child table `holidays` con `holiday_date`, `description`, `weekly_off`, `is_half_day`. Funciones de módulo **`is_holiday(holiday_list, date)`** y `is_half_holiday(...)`. El encadenamiento es `Company.default_holiday_list` → override por `Employee.holiday_list` → override por `Project.holiday_list`. Y el consumo en duraciones es `Project.update_if_holiday()` (`project.py:181-187`), que desplaza la fecha mientras sea festivo.

Ojo: en la v17 actual **no existe `erpnext/hr/`** (el módulo se partió); el material autoritativo está en `erpnext/setup/`. Y **no existe un doctype "Workday"**: los días laborables se modelan con `weekly_off` + filas `Holiday` con `weekly_off: 1` + `is_half_day` para medios días.

**Estimado vs real** (`erpnext/projects/doctype/task/task.json`):
- `expected_time` (Float) = lo planificado; `actual_time` (Float) = **calculado desde los timesheets** en `update_time_and_costing()`: `SUM(TimesheetDetail.hours)` filtrando `docstatus == 1`.
- Fechas en dos pares: `exp_start_date`/`exp_end_date` frente a `act_start_date`/`act_end_date` (las reales vienen de los timesheets).
- `expected_time` es **Float**, no Decimal. CorePlanner es mejor aquí; no lo cambiemos.
- Si no hay `exp_end_date` pero sí `expected_time`, se deriva: `exp_end_date = add_to_date(exp_start_date, hours=expected_time)`.

**Porcentaje de completitud ponderado** (`project.py:319-331`): `sum(p * w for p, w in zip(progress, weights)) / sum(weights)`, con `Completed|Cancelled` = 100 y peso por defecto 1. Y `percent_complete_method` con cuatro modos: `Manual`, `Task Completion`, `Task Progress`, `Task Weight`.

**Dependencias** (`task.py`): la child table `Task Depends On` es un grafo dirigido; `check_recursion` detecta ciclos con un **CTE recursivo con UNION en ambas direcciones**; y el orden topológico se resuelve con **`graphlib.TopologicalSorter` de la biblioteca estándar de Python**:

```python
def get_tasks_in_dependency_order(self):
    dependencies = {}
    for task in self.get_tasks():
        dependencies[task.name] = [d.task for d in task.depends_on]
    sorter = TopologicalSorter(dependencies)
    return list(sorter.static_order())
```

OpenProject tiene el equivalente (`SchedulingRules#soonest_start`), pero **ERPNext usa lastdlib de Python y por tanto es copiable incluso en un contexto con licencia incompatible** (el algoritmo topológico no es expresión protegida; además es un patrón genérico de la que hay que reimplementar).

**Timesheets** (`erpnext/projects/doctype/timesheet/`): cabecera con `employee`, `user`, `parent_project`, `department`, `status`, `total_hours`, y child table `Timesheet Detail` con `task`, `hours`, `billing_hours`, `is_billable`, `costing_rate`, `from_time`, `to_time`. Dos detalles: `set_user()` liga `Employee.user_id` → **el empleado es la persona y el usuario es su cuenta** (separación que a nosotros nos falta); y `validate_overlap()` comprueba solapes de `from_time/to_time` por persona.

**Lo que ERPNext NO tiene**: roles por proyecto. `Project User` solo da acceso binario vía `DocShare` del core. CorePlanner con `project_members(user_id, project_id, role_id)` es más expresivo.

### 4.5 Ever Gauzy — el lado "persona" (AGPL-3.0)

El repositorio con el modelo de recursos humanos más completo de los once, y con una estructura de código que hoy es un monorepo NestJS/Nx (`packages/core`, `packages/contracts`, `packages/plugin`, `packages/mcp-server`, `packages/desktop-activity`) más apps (`apps/agent`, `apps/mcp`, `apps/desktop-timer`).

Los módulos del dominio (`packages/core/src/lib/`) que nos interesan:

- **`employee-availability`** — `EmployeeAvailability` con fecha de inicio y de fin, y un **estado de disponibilidad por día de la semana** (`AvailabilityStatusEnum`), más `availabilityNotes`. A diferencia del modelo de OpenProject (un factor porcentual único), este modela **ventanas de disponibilidad recurrente** (p. ej. trabaja de lunes a miércoles).
- **`official-holiday`** — `OfficialHoliday` con `name`, `date`, `holidayType` (enum), `organizationId`, `employeeIds`, `recurrence` (0 = no recurrente) y `notes`. El **alcance es por empleado y por organización**: un festivo puede aplicar solo a ciertas personas. Es más fino que el `Holiday List` de ERPNext y que el `NonWorkingDay` global de OpenProject.
- **`skills`** — `Skill` con tabla pivote `skill_employee` (many-to-many con empleados) y `skill_organization` (habilidades que la organización requiere). Es la **matriz de competencias**.
- **`employee-level`** — nivel/bandas de clasificación.
- **`organization-position`**, **`organization-department`**, **`organization-team`** + `organization-team-employee` — estructura organizativa.
- **`time-off-policy`**, **`time-off-request`**, **`time-off-balance`** — ausencias con saldo y política.
- **`time-tracking`** — horas reales.
- **`organization-sprint`**, **`organization-project-module`**, **`organization-task-setting`** — sprint, módulos de proyecto y ajustes de tarea por proyecto.
- **`activity_log`**, **`webhook`**, **`search`**, **`role` / `role-permission`**, **`event-bus` / `event-outbox`**.

Verificado en el código: `EmployeeAvailability` (entity en `packages/core/src/lib/employee-availability/employee-availability.entity.ts`) y `OfficialHoliday` (en `packages/core/src/lib/official-holiday/official-holiday.entity.ts`).

**Lección para nosotros**: el concepto de "persona" de Ever Gauzy es más rico que el nuestro (persona ≠ usuario ≠ empleado ≠ posición). Para CorePlanner, el salto性价比 está en **oficializar que `users` representa a personas con una identidad profesional** (posición, nivel, habilidades), porque es lo que permite asignar por competencia y no solo por disponibilidad.

**Lo que descartar**: `apps/desktop-timer` (captura de actividad de escritorio para imputar tiempo automáticamente) es un nivel de rastreo que una herramienta interna de planificación no necesita y que tiene implicaciones de privacidad serias.

### 4.6 Kanboard — trazabilidad y export iCal (MIT)

Kanboard **no tiene modelo de capacidad**: la búsqueda de `capacity|utilization|workload|overload` en `app/` devuelve **0 coincidencias** (verificado). Además el repo está en modo mantenimiento y `plugins/` solo contiene un `.gitignore`: los plugins de capacity y Gantt que existieron en el pasado ya no están en el repo. No es la fuente de nada que nos falte en el dominio.

Lo que sí aporta, y es de calidad:

- **Export iCal** (`app/Formatter/TaskICalFormatter.php`, `app/Controller/ICalendarController.php`) — tenemos `.ics` en pendientes. El formateador fija un patrón: UID estable `task-#{id}-#{startColumn}-#{endColumn}`, `setCreated`/`setModified` desde las marcas de la tarea, `setSummary` = `#id título`, `setDescription` + `setDescriptionHTML`, `setUrl` con enlace profundo, **`setAttendees` con MAILTO + CN** (el asignado) y `setOrganizer` (el creador). Distingue evento con inicio y fin de evento solo con fecha límite, y marca `setNoTime(true)` cuando la fecha no lleva hora. La librería es `Eluceo/iCal` (MIT).
- **Bitácora append-only** (`app/Model/ProjectActivityModel.php`) con `payload` en JSON: cada cambio de tarea deja un registro con el usuario, la fecha y el detalle. Barato y de alto valor para trazabilidad.
- **Enlaces entre tareas** (`app/Model/TaskLinkModel.php`): `create()` inserta **las dos direcciones** (A bloquea a B y B bloqueado por A) en una transacción. Simple y correcto.
- **Límite de WIP por columna** (`task_limit`): un entero opcional que bloquea el movimiento si la columna destino supera el límite. Coincide con el `wip_limit` de Paperclip.
- **49 acciones automáticas** (`app/Action/`): 50 ficheros de acciones declarativas con evento → condición → efecto. Es un motor de reglas simple y declarativo.
- **Permisos de rol por proyecto** (`app/Model/ProjectRoleModel.php` y `app/Model/ProjectUserRoleModel.php`): CorePlanner ya lo tiene resuelto con `project_members`.

### 4.7 Kaneo — MCP y calendario RFC 5545 (MIT)

Kaneo es un project management moderno (Hono + React + Postgres) y aporta dos cosas muy concretas.

**Su `ical.ts`** (`apps/api/src/calendar-feed/ical.ts`) es una implementación **correcta de RFC 5545**, y es MIT:
- `escapeText()` escapa `\`, `\r\n`, `;` y `,`.
- `foldLine()` plegado a **75 octetos** con el espacio de continuación, contando bytes UTF-8 reales (no caracteres).
- `timestamp()` normaliza a UTC en formato básico (`20260101T120000Z`).
- `calendarDate()` usa `Intl.DateTimeFormat` para las fechas por zona horaria.

Y un detalle de dominio que es una trampa clásica: **la fecha límite de una tarea es inclusiva, pero `DTEND` en iCalendar es exclusivo**, así que hay que emitir el día siguiente. Cualquier export `.ics` que no haga esto desplaza todas las tareas un día.

**Su servidor MCP** (`apps/api/src/mcp/`): ~42 tools registradas, con manifiesto `server.json` para el registro de MCP, dos métodos de autenticación (device flow y API key) y un sistema de roles editable en base de datos. Es la referencia más limpia de los once para "hacer que CorePlanner sea operable por un agente".

**Lo que Kaneo NO tiene**: las tareas **no tienen campo de estimación** (verificado: 0 coincidencias de `estimatedHours|estimated_hours|storyPoints|effort|estimate` en el schema). Es un tablero puro sin horas.

### 4.8 Plane — el caso de que no copiar (AGPL-3.0-only)

Plane es AGPL-3.0 **sin excepciones**: el backend es un monolito AGPL y la "Plane Enterprise" (con su módulo de *Time*) vive en repositorios separados con licencia distinta. **Su propio backend open source no puede calcular horas ni capacidad.** Su modelo es de **puntos y categorías de estimación**, con una tabla de valores por tipo de tarea, y el binario de conversión a horas es precisamente la parte que no está en el AGPL.

Merece la pena insistir en esto: **quien quiera replicar la estimación de Plane tiene que salir del AGPL.** Para nosotros, esto valida la decisión de trabajar en horas: el modelo de Plane es "bonito" pero su conversión a capacidad no es pública.

**Consecuencia estratégica**: 10 de los 11 repos empujan a un gestor de trabajo genérico. Copiar su ergonomía de estimación sin capacidad es un error de posicionamiento.

Lo que sí se puede mirar (como idea): el concepto de **cycle** (sprint) con fechas de inicio/fin, y el "workload view" de una persona. Pero CorePlanner no necesita sprints todavía: su unidad natural es la semana ISO.

### 4.9 Focalboard — multi-vista y agregados (AGPLv3 con excepción Apache-2.0)

Focalboard está **sin mantener** ("This repository is currently not maintained" en su README) y su código es AGPLv3 salvo `server/model/` (Apache-2.0). El código no es reutilizable, pero el **modelo de vista** es excelente y hay que局局长lo:

- **Un mismo conjunto de datos, varias vistas**: `board | table | gallery | calendar` (`webapp/src/blocks/boardView.ts:7`), todas sobre el mismo modelo de `Block` con `Fields` JSON.
- **Agregados calculados por columna y por vista**: `columnCalculations` y `kanbanCalculations` (`boardView.ts:27-28`), con las funciones `count`, `countEmpty`, `countNotEmpty`, `percentEmpty`, `percentNotEmpty`, `countUniqueValue`, `sum`, `average`, `median`, `min`, `max`, `range` (`webapp/src/components/calculations/calculations.ts:52-224`, verificado).

Para CorePlanner esto es el modelo de la matriz: **personas en filas, semanas ISO en columnas, y cada celda = un agregado `sum` sobre las horas de esa persona en esa semana**. Focalboard ya tiene el motor de agregados; a nosotros nos falta el eje temporal y el `weekly_base_hours` de referencia.

- **Agrupación por persona** (`getPersonGroups` en `webapp/src/boardUtils.ts:55-88`): el swimlane por persona.
- **9 permisos por tablero** (`server/model/permission.go:16-24`): `manage_board_type`, `delete_board`, `view_board`, `manage_board_roles`, `share_board`, `manage_board_cards`, `manage_board_properties`, `comment_board_cards`, `delete_others_comments`. Es el catálogo de referencia para ampliar nuestros tres permisos.
- **Token de compartición de solo lectura** (`server/model/sharing.go`), desactivado por defecto: el modelo para "pasa este enlace y mira la carga de mi equipo sin entrar".

### 4.10 Planka — colaboración y el límite de la licencia (Fair Use)

Planka es pleasantísimo y **no aporta nada a la capacidad**: las búsquedas de `capacity|workload|allocation|utilization` en `server/` y de `holiday|vacation|workingHours` en `client/src/` devuelven 0 coincidencias. Sus "listas" son estados de kanban (`type` solo admite `active|closed`), no swimlanes; la palabra "swimlane" no aparece en el repo. Calendario, recurrentes y plantillas están declarados **exclusivamente Pro**.

La licencia es el punto importante: la **PLANKA Community License 1.1** es "fair-code", no copyleft. Permite uso interno en la propia organización, prohíbe explícitamente "operating PLANKA as a hosted service for third parties for any commercial gain whatsoever", obliga a conservar los avisos y a declarar las modificaciones, y **excluye de la licencia los ficheros marcados `.pe.` (Pro/Enterprise)**.

Conclusión práctica: si CorePlanner se ofrece como servicio a terceros con ganancia comercial, **Planka es una trampa de licencia**. Y su stack (Sails/Waterline + Redux-ORM/sagas) es incompatible con FastAPI/SQLAlchemy/Pinia de todas formas.

### 4.11 AppFlowy — lo que no vamos a hacer (AGPL-3.0)

AppFlowy es el CRDT collaborative editor. Su lesson más importante es **estructural**: **el CRDT no está en este repo**. `frontend/rust-lib/Cargo.toml` declara las dependencias `collab`, `collab-document`, `collab-database`, `collab-plugins`, `collab-entity`, `collab-folder`, `collab-user` apuntando al repo externo `AppFlowy-IO/AppFlowy-Collab`, y `client-api` a `AppFlowy-IO/AppFlowy-Cloud`. Lo que está aquí es el cliente.

La librería CRDT es **`yrs` 0.21.0** (Yjs en Rust). No hay código de resolución de conflictos porque el CRDT resuelve por construcción.

Dos ideas sí son transferibles y baratas:

1. **Máquina de estados de sincronización explícita**: `SyncState` con `InitSyncBegin`, `InitSyncEnd`, `Syncing`, `SyncFinished`, más `subscribe_sync_state()`. Un estado discreto, no una maraña de flags.
2. **Un puerto con dos backends**: `flowy-server/src/server.rs:62` define el trait `AppFlowyServer` y tiene **dos implementaciones**: `af_cloud/` (HTTP contra la nube) y `local_server/` (SQLite puro). El mismo contrato, nube y offline.

Lo que **no** aporta nada: no tiene Gantt (solo grid, board/kanban y calendario), y su modelo de bloques con payload JSON libre es sobreingeniería para una matriz de ocupación. CorePlanner no necesita documentos colaborativos concurrentes, y el CRDT es la decisión más cara de revertir de todo el análisis.

---

## 5. Los cinco patrones que nos faltan

Síntesis de todo lo anterior, en orden de valor.

### Patrón 1 — Calendario laboral real
**De dónde:** ERPNext (`Holiday List`, `is_holiday`, `Company.default_holiday_list`), OpenProject (`NonWorkingDay`, `Setting.working_days`, `UserNonWorkingTime`).
**Qué:** una tabla de festivos con alcance (global / proyecto / persona) y una lista de días laborables por defecto, en lugar de `weekday() < 5`.
**Impacto:** una tarea que dura de lunes a viernes en un puente festivo se reparte hoy en 5 días; con el calendario correcto, en 3. Es el error más silencioso y más corrosivo del motor actual.

### Patrón 2 — Disponibilidad versionada por persona
**De dónde:** OpenProject (`UserWorkingHours`: `availability_factor` + minutos por día + `valid_from` con scope `effective_within`), Ever Gauzy (`EmployeeAvailability`, `OfficialHoliday` por empleado), Leantime (`EmploymentType`).
**Qué:** `users.weekly_base_hours` deja de ser un escalar y pasa a ser el resumen de un perfil con vigencia temporal.
**Impacto:** permite "hasta marzo iba al 100 %, desde abril al 60 %" y "el martes no trabaja", que son la realidad de cualquier equipo.

### Patrón 3 — Política de capacidad con umbral y consecuencias
**De dónde:** Paperclip (`budget_policies`, `budget_incidents`, `approvals`, `budget_reservations`), Leantime (veredictos `critical`/`tight`/`balanced`/`buffer`).
**Qué:** la celda roja deja de ser un color y pasa a ser el resultado de evaluar una política: ámbito (persona/proyecto), métrica (horas), ventana (semana ISO), umbral de aviso (80 %), umbral duro (100 %), y qué pasa al superarlo (avisar / pausar / pedir aprobación).
**Impacto:** es la diferencia entre una herramienta que informa y una herramienta que gobierna. Y es **la pieza más barata de todo el análisis**: una tabla y una función pura.

### Patrón 4 — Estimado contra real
**De dónde:** ERPNext (`expected_time` vs `actual_time` desde timesheets; `exp_*` vs `act_*`), OpenProject (`TimeEntry` con `spent_on`, `hours`, `user`, `entity`), Leantime (`zp_timesheets` con `workDate` diario y `actualDrift()`), Ever Gauzy (`time-tracking`).
**Qué:** una tabla de imputaciones por persona, tarea y día, y una comparación contra lo planificado en la ventana semanal (la ventana en la que la capacidad es comparable).
**Impacto:** sin esto, la matriz es una intención; con esto, es un termómetro. **Requiere adopción real del usuario o es ruido**: el dato tiene que salir del trabajo diario, no de una pantalla aparte.

### Patrón 5 — Dependencias entre tareas
**De dónde:** ERPNext (`Task Depends On`, `graphlib.TopologicalSorter` de la stdlib, `check_recursion` con CTE recursivo), OpenProject (`Relation` con `precedes`/`follows`, `SchedulingRules#soonest_start`), Kanboard (enlaces bidireccionales en transacción), Plane (`IssueRelation`).
**Qué:** predecesores y sucesores entre tareas, orden topológico, detección de ciclos, y reprogramación en cascada **propuesta, no aplicada** (que mueva el Gantt del usuario sin avisar es una forma de perder su confianza).
**Impacto:** el Gantt deja de ser una vista de barras y pasa a ser un grafo; es lo que permite detectar el camino crítico y decir "esta tarea no puede empezar hasta que termine aquella".

---

## 6. Qué NO implementar (y por qué)

| No implementar | De dónde viene la tentación | Por qué no |
|---|---|---|
| Motor de campos personalizados | Kaneo, OpenProject, ERPNext | Es la vía por la que un gestor de trabajo se convierte en un ERP a medio hacer. CorePlanner tiene un modelo de datos pequeño y con intención; diluirlo es el error clásico. |
| Jerarquía de espacios / organizaciones / multi-tenant | Plane (workspace), Kaneo, ERPNext (Company), Ever Gauzy (organization) | Ya tenemos `departments` + `projects` con `parent_id`. Un nivel más es complejidad sin caso de uso. |
| CRDT y edición colaborativa offline | AppFlowy | La decisión más cara de revertir de todo el análisis. No lo necesita una herramienta interna de planificación. |
| Estimación en puntos | Plane | Sin conversión pública a horas, no sirve para capacidad. Además, su backend AGPL no incluye el módulo de horas. |
| Sprints / ciclos / burndown | Plane, Leantime, OpenProject, Focalboard | La unidad natural de CorePlanner es la semana ISO. Meter sprints ahora es anticipar un problema que quizá no exista. |
| Pipeline de estados configurable | Paperclip (`pipelines`) | En Paperclip **no está implementado** (`enforceTransitions` no aparece en `server/src`). Y nuestro `CHECK` de 4 estados es una virtud, no un defecto. |
| Kanban, tarjetas, listas, tableros | Planka, Focalboard, Kanboard | CorePlanner ya tiene un kanban mejor que el de ellos: estados fijos atados a un flujo real. |
| Plugins, marketplace, gamificación | Paperclip, Leantime, ERPNext | Ruido a esta escala. |
| Módulos ofimáticos (ventas, compras, facturación, inventario) | ERPNext | CorePlanner no es un ERP. |
| Copiar código de AGPL/GPL/Planka/Focalboard | — | Obligaría a publicar CorePlanner o Usar su marca. Ver sección 2. |

---

## 7. Qué aporta este análisis al plan que ya existe

CorePlanner ya tiene un plan derivado del análisis de OpenProject: [`docs/openproject/plan-replicacion-coreplanner.md`](openproject/plan-replicacion-coreplanner.md), con las fases F10 a F16, y su análisis fuente en [`docs/openproject/analisis-openproject.md`](openproject/analisis-openproject.md).

**Este documento no sustituye ese plan: lo contrasta y lo amplía.** El plan actual analysa un repositorio; este analiza once. La conclusión es que el plan actual está bien orientado y que su fase F10 es, con más razón de la que se suponía, la que bloquea a todas las demás.

### 7.1 Contraste fase por fase

| Fase del plan actual | Veredicto de este análisis | Qué aportan los otros diez repositorios |
|---|---|---|
| **F10** Horario laboral y días no laborables | Correcta, y es la fase que bloquea a todas las demás. El modelo elegido (`working_schedules` con `valid_from`, `availability_factor` y minutos por día) es exactamente el `UserWorkingHours` de OpenProject | **ERPNext**: el festivo tiene *alcance* (`Company.default_holiday_list` → override por persona → override por proyecto) y admite **medio día** (`is_half_day`). **Ever Gauzy**: el festivo puede aplicar solo a ciertas personas (`employeeIds`). **Leantime**: `EmploymentType` decide cómo se interpreta el horario (objetivo, techo, tope o mejor esfuerzo) y por tanto cómo la matemática trata a esa persona |
| **F11** Asignaciones con reparto diario | Confirmada. `detect_overtime` por persona y día es el modelo correcto | **Paperclip**: el reparto se puede **reservar** (`held` / `settled` / `released`) para que dos asignaciones no compitan por el mismo hueco sin avisar |
| **F12** Matriz sobre asignaciones | Confirmada | **OpenProject**: publicar el **ratio de utilización** (`scheduled / capacity × 100`) como métrica de primera clase, no solo el estado rojo. **Leantime**: el `actualDrift()` calculado en la ventana semanal |
| **F13** Vistas guardadas | Confirmada, y bien planteada (que la vista describa una página y no una entidad es la decisión correcta) | **Focalboard**: la vista puede llevar **agregados calculados** por columna (`sum`, `average`, `median`, `min`, `max`, `range` sobre la propiedad numérica), que es lo que hace útil una vista de capacidad |
| **F14** Permisos con alcance de entidad | Confirmada, incluida la simplificación de que la escritura exige pertenencia al proyecto | **Focalboard**: catálogo de referencia de nueve permisos por tablero (`manage_board_cards`, `comment_board_cards`, `share_board`…) y **token de compartición de solo lectura** para consultar la carga sin entrar. **Kanboard**: límite de WIP por columna (`task_limit`) |
| **F15** Planificador de recursos | Confirmada: las cuatro vistas de OpenProject son la referencia correcta | **Leantime**: sustituir el booleano "sobrecargado" por **veredictos discretos** ordenados por gravedad (`critical`, `tight`, `balanced`, `buffer`, `no_capacity`, `no_work`). Es la lectura más útil que CorePlanner puede hacer y encaja con un modelo de estados discretos |
| **F16** Extras (`.ics`, actividad) | Confirmada | **Kaneo + Kanboard** concretan el `.ics`: `DTEND` exclusivo, UID estable, `ATTENDEE`/`ORGANIZER`, plegado a 75 octetos. **Kanboard + Leantime** dan el patrón de bitácora append-only con payload JSON |

### 7.2 Lo que este análisis añade y el plan actual no cubre

Cinco piezas nuevas, ordenadas por relación valor/esfuerzo. Cada una es independiente y commiteable por separado, y todas respetan las reglas que ya están fijadas en el plan: cero floats en el backend, `ON DELETE` explícito, centimas de hora enteras, motor puro y testeable, commits por fase.

**N1. Política de capacidad (Paperclip)** — *la mejor relación valor/esfuerzo de todo el conjunto*
- Tabla `capacity_policies`: ámbito (persona / proyecto / departamento), métrica (horas planificadas), ventana (semana ISO), umbral de aviso, umbral duro y acción (avisar / pausar / pedir aprobación).
- Evaluación como **función pura** y registro de incidentes idempotente por ventana, con índice único parcial mientras el incidente está abierto.
- El umbral duro **no es una alerta: es una aprobación obligatoria** (`approvals` con `type = 'budget_override_required'`).
- Mapeo directo de `budget_policies` de Paperclip: `scopeType`/`scopeId` → ámbito, `metric` → horas, `windowKind` → `semana_iso`, `amount` → capacidad de referencia, `warnPercent` → 80 %.
- Por qué: hoy la celda roja es un color. Esto la convierte en una regla configurable con consecuencias y con registro. Es una tabla y una función pura.
- *Esfuerzo: bajo. Riesgo: bajo.*

**N2. Imputación de horas reales (ERPNext, OpenProject, Leantime, Ever Gauzy)**
- Tabla `time_entries` (persona, tarea, fecha, horas, tipo), al estilo `Timesheet Detail` de ERPNext o `TimeEntry` de OpenProject (`spent_on`, `hours`, `user`, `entity`).
- Separación explícita entre lo planificado y lo real, como los pares `exp_*` / `act_*` de ERPNext y `estimated_hours` / `spent_hours` de OpenProject.
- La comparación va en la **ventana semanal**, con la justificación que ya da Leantime: capacidad y plan son tasas semanales, así que el real comparable es el de la semana en curso.
- Advertencia de OpenProject y ERPNext: las horas reales se guardan en **float** en ambos. No repetirlo; aquí deben ser céntimas enteras como todo lo demás.
- Riesgo real: sin adopción, la tabla no se rellena. Hay que tratarlo como opcional y no penalizar a quien no imputa.
- *Esfuerzo: medio-alto. Riesgo: medio-alto (adopción, no técnica).*

**N3. Dependencias entre tareas y ruta crítica (ERPNext, OpenProject)**
- Tabla `task_dependencies` (tarea, predecesor, tipo), con los tipos de `Relation` de OpenProject: `relates`, `precedes`, `follows`, `blocks`, `blocked`, `duplicates`.
- Orden topológico con **`graphlib.TopologicalSorter` de la biblioteca estándar de Python**, exactamente como hace ERPNext (`get_tasks_in_dependency_order`). Sin dependencias externas.
- Detección de ciclos con CTE recursivo al estilo `check_recursion` de ERPNext.
- Reprogramación en cascada **propuesta, nunca aplicada de golpe**: el motor calcula el arrastre y el usuario lo acepta. Mover el Gantt de alguien sin avisar es la forma más rápida de perder su confianza.
- Por qué: el Gantt deja de ser una vista de barras y pasa a ser un grafo. Es lo que permite decir "esta tarea no puede empezar hasta que termine aquella".
- *Esfuerzo: medio. Riesgo: medio-alto.*

**N4. Bitácora de cambios (Kanboard, Leantime, Paperclip)** — *trazabilidad, requisito explícito*
- Tabla `activity_log` append-only: actor, acción, entidad, identificador, payload JSON, fecha.
- Patrón de Leantime (`storeEvent(action, values, entity, entityId, userId, projectId)`, con lectura por entidad) y de Kanboard (`ProjectActivity` con `payload` JSON).
- `activity_log` de Paperclip añade `actorType` y `responsibleUserId`, que permiten distinguir "lo hizo un agente" de "lo hizo una persona" cuando llegue N5.
- *Esfuerzo: bajo. Riesgo: bajo.*

**N5. CorePlanner operable por un agente (Paperclip y Kaneo, ambos MIT)** — *la jugada de 2026*
- Servidor MCP por stdio, con tools de solo lectura primero: `capacity_matrix`, `overloaded_people`, `project_capacity`, `task_dependencies`.
- Autenticación por *bearer token* con hash sha256, como Leantime; cabecera `X-Run-Id` en las escrituras para saber qué ejecución originó cada cambio, como Paperclip.
- Catálogo de tools con `riskLevel`, `isReadOnly`, `isDestructive` y **deny-by-default** (`tool_profiles.defaultAction = 'deny'`), de Paperclip.
- Test de contrato que fije el catálogo de tools, con el patrón `EXPECTED_TOOLS` de Leantime: si se añade o renombra una tool, el CI falla.
- Referencia de código: `packages/mcp-server` de Paperclip (MIT) y `apps/api/src/mcp/` de Kaneo (MIT). Son las dos únicas fuentes reutilizables de todo el análisis.
- Por qué: una herramienta de capacidad que un agente puede consultar y con la que puede actuar. El perfil del operario (automatización industrial) hace que esta sea la pieza con más afinidad.
- *Esfuerzo: medio. Riesgo: bajo.*

**Condicionado: estados configurables por proyecto**
- Solo si aparece el caso: tabla `project_statuses` (`key`, `name`, `position`, `wip_limit`), catálogo en la aplicación **sin tocar el esquema** (lección de `issues.status` en Paperclip, que es `text` libre sin CHECK).
- Hoy el `CHECK` de cuatro estados es una virtud. Y las `pipelines` de Paperclip **no sirven de referencia**: la columna `enforceTransitions` existe en el schema pero no aparece en `server/src`, es decir, la máquina de estados configurable está declarada y no implementada.
- *Esfuerzo: bajo. Riesgo: bajo. **No hacer porpreventismo.***

---

## 8. Anexo: trazabilidad de las evidencias

Rutas de los ficheros citados, en los clones de trabajo (Windows, `%TEMP%\cp-rev\<repo>`).

**OpenProject** (`app/models/user_working_hours.rb`, `app/models/non_working_day.rb`, `app/models/user_non_working_time.rb`, `app/models/relation.rb`, `app/models/work_package/scheduling_rules.rb`, `app/models/member.rb`, `app/models/workflow.rb`, `app/models/journal.rb`, `modules/resource_management/app/services/resource_allocations/working_time_calendar.rb`, `modules/resource_management/app/services/resource_allocations/availability.rb`, `modules/costs/app/models/time_entry.rb`).

**ERPNext** (`erpnext/setup/doctype/holiday_list/holiday_list.py`, `erpnext/projects/doctype/task/task.json`, `erpnext/projects/doctype/task/task.py`, `erpnext/projects/doctype/project/project.py`, `erpnext/projects/doctype/timesheet/timesheet.py`, `erpnext/projects/doctype/timesheet/timesheet_detail/timesheet_detail.py`, `erpnext/setup/doctype/employee/employee.json`, `erpnext/setup/doctype/department/department.json`).

**Leantime** (`app/Core/Resources/Models/ResourceSummary.php`, `app/Core/Resources/Models/PersonAllocation.php`, `app/Core/Resources/Contracts/ResourcesGateway.php`, `app/Core/Resources/Services/ResourcesRegistry.php`, `app/Domain/Reports/Services/CapacityAnalyzer.php`, `app/Domain/Users/Enums/EmploymentType.php`, `app/Domain/Users/Repositories/Users.php`, `app/Domain/Install/Repositories/Install.php`, `app/Domain/Audit/Repositories/Audit.php`, `app/Domain/Tickets/Services/Tickets.php`).

**Paperclip** (`packages/db/src/schema/budget_policies.ts`, `packages/db/src/schema/budget_incidents.ts`, `packages/db/src/schema/issues.ts`, `packages/db/src/schema/pipelines.ts`, `packages/db/src/schema/agent_wakeup_requests.ts`, `packages/db/src/schema/heartbeat_runs.ts`, `packages/db/src/schema/activity_log.ts`, `packages/db/src/schema/tool_access.ts`, `server/src/services/budgets.ts`, `server/src/services/budget-enforcement-worker.ts`, `server/src/modules/wake-queue/application/use-cases.ts`, `packages/mcp-server/src/tools.ts`).

**Ever Gauzy** (`packages/core/src/lib/employee-availability/employee-availability.entity.ts`, `packages/core/src/lib/official-holiday/official-holiday.entity.ts`, `packages/core/src/lib/skills/skill.entity.ts`).

**Kanboard** (`app/Formatter/TaskICalFormatter.php`, `app/Controller/ICalendarController.php`, `app/Model/ProjectActivityModel.php`, `app/Model/TaskLinkModel.php`, `app/Action/`).

**Kaneo** (`apps/api/src/calendar-feed/ical.ts`, `apps/api/src/mcp/`, `apps/api/src/database/schema.ts`).

**Focalboard** (`webapp/src/blocks/boardView.ts`, `webapp/src/components/calculations/calculations.ts`, `webapp/src/boardUtils.ts`, `server/model/permission.go`, `server/model/sharing.go`).

**Planka** (`server/api/models/Board.js`, `server/api/models/Card.js`, `server/api/models/BoardMembership.js`, `server/api/models/Action.js`, `LICENSES/PLANKA Community License EN.md`).

**AppFlowy** (`frontend/rust-lib/Cargo.toml`, `frontend/rust-lib/flowy-document/src/entities.rs`, `frontend/rust-lib/flowy-document/src/document.rs`, `frontend/rust-lib/flowy-server/src/server.rs`).

**CorePlanner** (`backend/services/capacity.py`, `backend/security.py`, `backend/models.py`, `backend/services/tasks.py`, `pyproject.toml`).
