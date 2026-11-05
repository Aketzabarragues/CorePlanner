# Plan de replicacion de la base de OpenProject en CorePlanner

Este documento convierte el analisis de OpenProject en trabajo concreto sobre el
codigo que ya existe. La base que se replica es el **modelo** (asignaciones,
vistas guardadas, permisos por entidad), no el stack.

## 1. Resumen ejecutivo

| Fase | Objetivo | Riesgo | Esfuerzo |
| --- | --- | --- | --- |
| F10 | Horario laboral y dias no laborables | bajo | media |
| F11 | Asignaciones explicitas con reparto diario | medio | alta |
| F12 | Matriz construida sobre asignaciones | medio | media |
| F13 | Vistas guardadas (consultas configurables) | medio | media |
| F14 | Permisos con alcance de entidad | alto | media |
| F15 | Planificador de recursos (vistas por persona) | medio | alta |
| F16 | Extras: iCal, actividad, campos configurables | bajo | media |

Orden recomendado: F10 y F11 primero. Sin horario y sin asignaciones, las fases
posteriores no tienen sobre que trabajar.

## 2. Encuadre

- **Se replica sobre FastAPI + Vue.** El stack actual esta verificado (143
  pruebas de backend, 127 de frontend, build y guard de CSS en verde) y OpenProject
  no aporta nada tecnico que lo mejore.
- **Trabajo clean-room.** Se replican conceptos, modelo y experiencia de uso. El
  nucleo de OpenProject es GPLv3 y los modulos Enterprise son comerciales: nada
  de codigo copiado.
- **Unidad de tiempo: centimas de hora enteras.** OpenProject guarda minutos
  enteros en sus asignaciones; CorePlanner ya trabaja en centimas de hora con
  `Decimal` y un unico paso a float (`hours_to_json`). Se mantiene la convencion
  propia: lo que se copia es el principio (aritmetica entera de punta a punta y
  filas diarias derivadas), no la unidad literal.
- **El horario se guarda en centimas, no en minutos.** Un minuto son 100/60
  centimas de hora, asi que un horario en minutos no siempre cabe en centimas
  enteras (6 h 40 min son 666,67 centimas). Por eso `working_schedules` guarda
  centimas de hora por dia (0..10000): la interfaz pide horas y minutos y
  redondea a centimas hacia arriba, igual que hace ya el resto de la
  aplicacion con `estimated_hours`.
- **Reglas que no se rompen:** cero floats en el backend, `ON DELETE` explicito,
  restricciones `CHECK` que SQLite y PostgreSQL interpretan igual, motor de
  calculo puro y testeable, commits por fase y push nunca.

## 3. Mapa de equivalencias

| OpenProject | CorePlanner actual | Decision |
| --- | --- | --- |
| `Project` con `identifier`, `parent`, `status` | `projects` con `parent_id`, `status`, `department_id` | Faltaria el `identifier` como prefijo de display; se puede anadir en F13 |
| `WorkPackage` (contenedor generico) | `Task` (concreta) | No replicar la genericidad |
| `Query` (filtros, columnas, orden, agrupacion) | No existe; la matriz es fija | **Replicar en F13** |
| `Membership` + `Role` por proyecto | `project_members` + `roles.permissions_json` | Base ya vale; falta el alcance global y de entidad |
| `Role` con alcance de entidad (WP Viewer/Commenter/Editor) | No existe | **Replicar en F14** |
| `UserWorkingHours` (minutos por dia, factor de disponibilidad, versionado) | `users.weekly_base_hours` (numero fijo) | **Replicar en F10** |
| `NonWorkingDay` (festivos de la empresa) | No existe; el motor quita sabados y domingos fijos | **Replicar en F10** |
| `ResourceAllocation` (persona, fechas, horas, estado) | Derivado: la tarea reparte sus horas | **Replicar en F11** |
| `ScheduledEntry` (reparto diario, horas extra) | No existe | **Replicar en F11** |
| `ResourcePlanner` + 4 vistas | La matriz global y de proyecto | **Replicar en F15** |
| `Team planner` (columna por persona, tarjetas arrastrables) | La matriz (personas en filas) | Adaptar: son la misma idea con distinta orientacion |
| `Staffing` (peticiones de recurso por filtro) | No existe | Fuera de alcance inicial; queda para F16 |
| Boards, backlog, wiki, reuniones, noticias, costes | Kanban existe; el resto no | Solo el Kanban se mantiene |

## 4. Las tres piezas a construir

### 4.1 Asignaciones y reparto diario (F10 + F11)

Hoy el motor `backend/services/capacity.py` reparte las horas de cada tarea de
forma uniforme entre los dias laborables del rango y las imputa a la semana ISO
de la persona. De ahi sale todo: la matriz, la sobrecarga y el Gantt.

OpenProject separa tres cosas que CorePlanner mezcla:

1. **Cuantas horas tiene la tarea** (`estimated_hours`).
2. **Quien las tiene y en que rango** (asignacion).
3. **Como se reparten esos minutos dia a dia** (entradas diarias) y cuanto
   exceden el horario de la persona (horas extra).

Esquema propuesto:

```python
class WorkingSchedule(Base):
    """Horario laboral de una persona, versionado en el tiempo."""
    __tablename__ = "working_schedules"
    id: int
    user_id: int              # -> users.id, ON DELETE CASCADE
    valid_from: date          # fecha en la que entra en vigor
    monday .. sunday: int     # centimas de hora laborables por dia (0..10000)
    availability_factor: int  # porcentaje de tiempo disponible (0..100)
    # UNIQUE(user_id, valid_from)

class NonWorkingDay(Base):
    """Dia no laborable de la empresa."""
    __tablename__ = "non_working_days"
    id: int
    date: date                # unico
    name: str

class Allocation(Base):
    """Horas previstas de una persona para una tarea."""
    __tablename__ = "allocations"
    id: int
    task_id: int              # -> tasks.id, ON DELETE CASCADE
    user_id: int              # -> users.id, ON DELETE CASCADE
    start_date: date
    end_date: date
    allocated_units: int      # centimas de hora, > 0
    state: str                # allocated | requested | rejected | canceled
    requested_by_id: int|None # -> users.id, ON DELETE SET NULL

class AllocationEntry(Base):
    """Parte de una asignacion que cae en un dia concreto."""
    __tablename__ = "allocation_entries"
    id: int
    allocation_id: int        # -> allocations.id, ON DELETE CASCADE
    user_id: int              # -> users.id, ON DELETE CASCADE
    allocated_on: date
    units: int                # centimas imputadas ese dia
    overtime_units: int       # centimas por encima del horario de la persona
    # UNIQUE(allocation_id, allocated_on)
```

El motor de reparto debe ser **puro y por persona**, como el actual:

```python
def distribute_allocation(
    allocation: AllocationLike,
    capacity_by_day: Mapping[date, int],
) -> list[AllocationEntryLike]:
    """Reparte las horas de una asignacion entre los dias laborables.

    `capacity_by_day` son las centimas de hora disponibles cada dia, ya
    ajustadas por el factor de disponibilidad y sin los dias no laborables.

    Los dias no laborables no reciben carga. Si el rango no tiene dias
    laborables, la asignacion no se puede planificar y se marca como tal.
    """
```

Y un segundo paso, tambien puro, que detecta la sobrecarga:

```python
def detect_overtime(
    entries: Sequence[AllocationEntryLike],
    capacity_by_day: Mapping[date, int],
) -> list[int]:
    """Devuelve los identificadores de asignacion con horas extra.

    Las horas extra se calculan por persona y dia: se suma la carga de todas
    sus asignaciones de ese dia y se resta la capacidad del dia. La parte que
    excede es tiempo extra, y se atribuye a las asignaciones de ese dia.
    """
```

Criterio de aceptacion de F11:

- Una asignacion de 10 h entre lunes y viernes, con un horario de 8 h/dia, se
  reparte en 2 h por dia y la suma de las partes es exactamente 10 h.
- Los dias no laborables no reciben carga.
- Con dos asignaciones de la misma persona que sumen mas de la capacidad de un
  dia, ese dia acumula horas extra por el exceso.
- Una persona sin horario configurado no se marca como sobrecargada: su
  capacidad se desconoce.
- Cambiar el horario de una persona recalcula sus entradas y el resultado es
  idempotente.

### 4.2 Vistas guardadas (F13)

```python
class SavedView(Base):
    """Vista guardada: columnas, filtros, orden y agrupacion."""
    __tablename__ = "saved_views"
    id: int
    scope: str                # global | project
    project_id: int|None      # -> projects.id, ON DELETE CASCADE
    owner_id: int             # -> users.id, ON DELETE CASCADE
    name: str
    view_type: str            # capacity | kanban | gantt
    is_public: bool
    is_favorite: bool
    columns_json: JSON
    filters_json: JSON
    sort_json: JSON
    group_by: str|None
    options_json: JSON        # rango de fechas, zoom, columnas visibles
```

El alcance replica el de OpenProject: `scope` global o de proyecto, `is_public`
para compartirla y `is_favorite` para marcarla. La vista se aplica a la matriz
de capacidad (columnas = semanas, filtros = proyecto, departamento, persona y
estado), al tablero Kanban y al Gantt.

La diferencia con OpenProject, que se adapta a proposito: ahi la consulta es la
entidad y la pagina es una vista de ella. En CorePlanner conviene al reves: la
vista guardada describe **la configuracion de una pagina que ya existe**, con lo
que el cambio es incremental y no obliga a rehacer el backend de las tres
paginas.

Criterio de aceptacion de F13:

- Guardar una vista con filtro por departamento y recuperarla deja la matriz en
  el mismo estado.
- Dos personas con permisos distintos ven la misma vista publica con los mismos
  filtros aplicados a sus datos visibles.
- Una vista privada no aparece a otras personas.

### 4.3 Permisos con alcance de entidad (F14)

```python
class TaskShare(Base):
    """Acceso de una persona a una tarea concreta."""
    __tablename__ = "task_shares"
    task_id: int              # -> tasks.id, ON DELETE CASCADE
    user_id: int              # -> users.id, ON DELETE CASCADE
    level: str                # view | comment | edit
```

Los tres estados de OpenProject (no ver, ver, ver y editar) se reproducen con
`level`. El alcance, en cambio, se simplifica: OpenProject permite compartir una
tarea con quien no es miembro del proyecto; en CorePlanner eso exige resolver
permisos por proyecto **y** por tarea en cada consulta, lo que complica el
modelo de token (`projects: {project_id: [permisos]}`) que ya funciona.

Propuesta pragmatica: las acciones de escritura sobre una tarea compartida
exigen ademas ser miembro del proyecto; el acceso de solo lectura a una tarea
compartida se permite a quien tenga el vinculo. Asi el modelo de token no
cambia y el alcance de entidad aporta valor sin arrastrar el motor de permisos
de OpenProject.

Criterio de aceptacion de F14:

- Un miembro del proyecto sin permiso de escritura ve la tarea compartida pero
  no puede modificarla.
- Quien pierde el vinculo de miembro y no tiene el enlace deja de verla.

## 5. Fases

### F10. Horario laboral y dias no laborables

- Tablas `working_schedules` y `non_working_days`.
- Pantalla de ajuste de horario por persona (dias, horas, factor de
  disponibilidad) y pantalla global de dias no laborables.
- El motor de capacidad pasa a calcular la capacidad semanal a partir del
  horario vigente en cada semana, con `weekly_base_hours` como valor por
  defecto cuando no hay horario configurado (compatibilidad sin saltos).
- Historial: las filas con `valid_from` pasado se conservan.

### F11. Asignaciones con reparto diario

- Tablas `allocations` y `allocation_entries`.
- Servicio puro `backend/services/scheduling.py` con `distribute_allocation` y
  `detect_overtime`.
- API de lectura y escritura de asignaciones.
- Recalculo incremental: al cambiar una asignacion, de un horario o de un dia no
  laborable, solo se rehacen las entradas de la persona y rango afectados.

### F12. Matriz sobre asignaciones

- La matriz pasa a consumir entradas diaries: las celdas por semana se suman
  desde `allocation_entries`.
- La sobrecarga se marca por celda a partir del horario de esa semana, no contra
  un numero fijo.
- La asignacion implicita (la tarea repartida entre sus dias) se mantiene como
  comportamiento por defecto mientras no exista asignacion explicita para esa
  persona; cuando exista, manda la explicita.

### F13. Vistas guardadas

- Tabla `saved_views`, API para crear, listar, actualizar, compartir y
  eliminar.
- Selector de vistas en la cabecera de la matriz, el tablero y el Gantt.
- Filtros guardables: proyecto, departamento, persona, estado y rango de fechas.

### F14. Permisos con alcance de entidad

- Tabla `task_shares` y resolucion de permisos por tarea.
- Tarea compartida con enlace, visible en la vista de tareas aunque la persona
  no sea miembro del proyecto; modificarla exige ademas que sea miembro.

### F15. Planificador de recursos

- Un "planificador" es una vista guardada de tipo capacidad con rango de
  fechas.
- Cuatro vistas sobre el mismo rango, como en OpenProject: linea de tiempo por
  tarea, linea de tiempo por persona, tabla de planificacion y tarjetas de
  persona (departamento, horario, atributos y barra de utilizacion).
- Aviso de sobrecarga por persona y por dia.

### F16. Extras (opcional)

- Exportacion a calendario `.ics` de las asignaciones.
- Registro de actividad por asignacion (el `journal` de OpenProject).
- Peticiones de recurso por filtro de atributos (vista Staffing).

## 6. Lo que se descarta

- WorkPackage generico, tipos por proyecto, campos personalizados y relaciones
  jerarquicas: OpenProject lo necesita porque es un PMS completo; CorePlanner
  es un gestor de capacidad.
- Boards multiples, backlog, wiki, reuniones, noticias, control de costes y
  presupuestos.
- Informes y exportacion a Excel.
- Integraciones con GitHub, GitLab, LDAP, SAML y OIDC: el acceso por JWT actual
  es suficiente para un uso interno.

## 7. Riesgos

| Riesgo | Mitigacion |
| --- | --- |
| El reparto diario multiplica el trabajo del motor | Motor puro y por persona; recalculo incremental por persona y rango, nunca global |
| Duplicidad entre asignacion implicita y explicita | Regla explicita: manda la asignacion explicita; la implicita solo se usa si no hay ninguna para esa persona y tarea |
| Consultas mas caras con entradas diarias | Indices por `(user_id, allocated_on)` y por `(allocation_id)`; agregacion en SQL antes de devolver filas al frontend |
| El alcance de entidad rompe el modelo de token | Regla de la seccion 4.3: la escritura exige pertenencia al proyecto |
| Que el Gantt actual y las asignaciones se contradigan | El Gantt sigue mostrando las fechas de la tarea; las asignaciones son otra capa, con su propio rango |
| Mezcla de unidades | Centimas de hora en todo el sistema; un unico punto de conversion a JSON |

## 8. Decisiones abiertas

1. **Capacidad por horario o por numero fijo.** F10 propone horario por persona
   con `weekly_base_hours` como valor por defecto. La alternativa es mantener el
   numero fijo y no entrar en horarios.
2. **Asignacion obligatoria o implicita.** Hoy una tarea ocupa capacidad sin
   que nadie la asigne. La propuesta es mantener el reparto implicito y anadir
   la asignacion explicita como capa superior, pero cabe la opcion de exigir
   asignacion para que una tarea ocupe capacidad.
3. **Alcance de las vistas guardadas.** Privadas por defecto, publicas por
   proyecto, como en OpenProject, o tambien globales.

## 9. Fuentes

El detalle del analisis que sostiene este plan esta en
[`analisis-openproject.md`](analisis-openproject.md). Las referencias de codigo
fuente y documentacion estan recogidas alli, en su seccion 8.
