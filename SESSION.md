# Estado de la sesion

## Objetivo actual

Los tres bloques del §51 (B: Gantt, A: Kanban, C: Calendario) quedan
cerrados en codigo, sobre el contrato comun de interaccion de la §52: motor
de Gantt propio, Kanban con orden persistido, contadores, alta y edicion
inline, Calendario con arrastre entre dias, alta y edicion en la vista de
dia, y el gesto de arrastre compartido.

La revision visual con navegador esta hecha (48 capturas, cuatro fallos
corregidos). La v1 queda cerrada entera (con la exportacion `.ics`), y con
ella G1, G2, G3, G4 y G5: todo el plan, en codigo.

Pendiente de decidir: si la semilla de demostracion sigue anclando el trabajo
dos y tres semanas por delante (deja la primera pantalla del calendario y de
"Mi trabajo" vacia) o si se mueve parte del trabajo a la semana en curso.

## Cambios realizados

- `docs/comparativa-mercado.md` (nuevo): comparativa con OpenProject Enterprise
  (v17.7, ago 2026: su modulo de Resource management es add-on de pago),
  EstiMate (complementario: estima horas, no capacidad) y la categoria SaaS
  (Float, Resource Guru, Runn, Mosaic, Productive, Kantata, ...). Ninguna es
  self-hosted; todas cobran por persona. CorePlanner sigue ocupando el hueco:
  matriz persona x semana ISO contra capacidad resuelta, local, sin coste por
  asiento.
- `docs/especificaciones.md` §51 (nuevo): hoja de ruta post-v1 con el orden,
  el bloque de componentes interactivos (que entra y que no entra en cada
  vista) y la decision del motor de Gantt propio.
- `docs/especificaciones.md` §52 (nuevo): contrato comun de interaccion de
  Kanban, Gantt y Calendario, y la aclaracion de que solo el Gantt cambia de
  motor: los otros dos ya arrastran y lo que les falta es el contrato.
- `docs/especificaciones.md` §53 (nuevo): contrato del motor de Gantt propio
  (geometria en UTC y dias, escalas, sombreado, permiso por barra, reglas de
  alta y de recarga).
- Motor de Gantt, fases 0 a 3:
  - `frontend/src/utils/ganttScale.js` (nuevo): escalas (`Dia` 44 px/dia,
    `Semana` 14 px, `Mes` 5 px) y aritmetica de dias en UTC.
  - `frontend/src/utils/ganttLayout.js` (nuevo): modelo del diagrama (eje,
    filas, barras, sombreado, linea de hoy) y operaciones de arrastre
    (`snapDelta`, `moveRange`, `resizeRange`).
  - `frontend/src/utils/gantt.js`: queda con `GANTT_VIEW_MODES` y el
    re-export de `dateChangePayload`; `toIsoDate` pasa a `ganttScale.js` en
    version UTC (la anterior usaba los campos locales y desplazaba el dia).
  - Tests nuevos: `ganttScale.spec.js` (11) y `ganttLayout.spec.js` (19).
    `gantt.spec.js` pasa a fechas ISO. `GanttView.spec.js`: el test de
    arrastre pasa a fechas UTC, que es el contrato real del motor.
  - `frontend/src/utils/ganttMetrics.js` (nuevo): medidas del diagrama.
  - `frontend/src/components/gantt/` (nuevo): `GanttChart.vue` (svg unico),
    `GanttAxis.vue`, `GanttBar.vue`, `GanttGroupRow.vue` y
    `GanttNamesColumn.vue`.
  - `frontend/src/composables/useGanttDrag.js` (nuevo): arrastre y
    redimension con umbral de 5 px, fantasma, `Escape` y cancelacion al
    soltar fuera.
  - `frontend/src/views/GanttView.vue`: reescrito sobre el motor propio
    (filtros, visibilidad, leyenda, rango en la URL, dias no laborables
    globales, permiso por barra, teclado).
  - `frontend/src/assets/gantt.css`: se quedan las clases `persona-0..5` y se
    anaden las del motor; fuera las reglas de la libreria.
  - `frontend/package.json`: fuera `frappe-gantt`.
  - Tests nuevos: `GanttChart.spec.js`, `useGanttDrag.spec.js` y el
    `GanttView.spec.js` reescrito (sin el mock de la libreria).
- Bloque A (Kanban), backend:
  - `tasks.position`: la posicion dentro de la columna (proyecto + estado),
    con migracion idempotente y backfill que no reordena nada.
  - `PUT /api/projects/{id}/tasks/order`: mueve y reordena en una transaccion,
    con bitacora. La columna affected queda con posiciones 0..n-1.
  - El feed del tablero trae `task_count` y `estimated_hours` por columna
    (los calcula el backend con `Decimal`).
- Bloque A (Kanban), frontend:
  - `frontend/src/composables/useArrastre.js` (nuevo): el esqueleto del gesto,
    compartido por el Kanban y el Gantt. `useGanttDrag.js` se reescribio
    encima, con su contrato publico intacto.
  - `KanbanView.vue` reescrito: contadores del feed, arrastre con indice de
    insercion, alta inline al pie de columna, edicion inline de titulo, horas
    y responsable, y el selector de estado pasando por el endpoint de orden.
  - `tasksApi.reorder` en `frontend/src/api/client.js`.
- G2 (capacidad libre y modo provisional):
  - `projects.is_provisional` con migracion y esquemas: un proyecto no firmado.
  - El motor de capacidad reparte la carga en confirmada y provisional; lo
    provisional no sobrecarga. La celda lleva `hours` y `hours_provisional`, y
    el desglose por proyecto lleva `provisional`.
  - `loadFree` en la escala de carga: la capacidad libre, con su signo.
  - La matriz pinta las horas libres y lo provisional en contorno, con el
    interruptor "Contar lo provisional" en la URL (`?provisional=1`).
  - El formulario de proyecto lleva el interruptor "Provisional" y el feed del
    Gantt lleva el flag, para pintar sus barras en contorno.
- G1 (horas reales), frontend:
  - `client.js`: los cuatro metodos de imputacion.
  - `TaskDetailDialog.vue`: seccion "Horas imputadas" con la lista, el total y
    el formulario; borrar solo las propias, y en solo lectura sin permiso.
  - `CellBreakdown.vue` y `CapacityMatrix.vue`: el plan contra el real, con
    "sin imputar" cuando no hay dato.
- G1 (horas reales), backend:
  - `time_entries` (tarea, persona, dia, horas, nota) con `ON DELETE` explicito.
  - API: alta, listado por tarea, edicion y borrado (solo las propias
    imputaciones), con la bitacora en la misma transaccion.
  - El motor lleva `actual_units` por celda y el informe manda `hours_actual`,
    que es `null` si nadie ha imputado.
- G3 (politica de capacidad), backend y frontend:
  - `capacity_policies`: ambito (persona o departamento), umbral de aviso y
    umbral que exige aprobacion. Configuracion de la empresa, del gerente.
  - `backend/services/capacity_policy.py`: motor puro que evalua las politicas
    y devuelve el veredicto por persona y semana. Persona gana a departamento;
    la comparacion es de enteros.
  - El informe lleva `policy_verdict` y la politica aplicada por celda.
  - `capacity_incidents`: el umbral duro abre un incidente, en la misma
    transaccion que el cambio de tarea que lo provoco. Uno por politica, persona
    y semana; uno resuelto no se reabre.
  - Interfaz: pestana "Politica de capacidad" en Configuracion, marca del
    veredicto en la celda (simbolo y texto, el fondo no cambia) y bloque
    "Necesitan aprobacion" en el panel global.
- G5 (servidor MCP):
  - `backend/mcp_server/`: cliente HTTP de la API + catalogo de tools (solo
    lectura): `whoami`, `projects`, `capacity_matrix`, `overloaded_people`,
    `project_capacity`, `actual_hours`, `tasks`, `capacity_incidents`.
  - El SDK oficial como extra opcional (`pip install -e ".[dev,mcp]"`); la CI
    lo instala para que los tests corran.
  - El paquete se llama `mcp_server` y no `mcp`: con `backend/` en el
    `sys.path` (pytest desde `backend/`), un paquete `mcp` ensombrece el SDK.
  - El catalogo es un contrato: un test fija la lista exacta de tools.
- G4 (dependencias entre tareas), backend y frontend:
  - `task_dependencies` (dependiente, requisito, tipo `precedes`|`relates`), con
    `ON DELETE` explicito y sin duplicados; del mismo proyecto.
  - `backend/services/task_dependencies.py`: ciclos, violaciones, orden topologico
    (`graphlib` de la stdlib), cascada propuesta y ruta critica. Puro.
  - API: alta y borrado de vinculos, los de una tarea y la cascada propuesta
    (`GET /api/tasks/{id}/cascade?delta_days=N`), que no modifica nada.
  - Seccion "Dependencias" en el detalle de tarea.
  - El Gantt dibuja las flechas (las `relates` discontinuas y sin punta), marca
    las barras que violan el orden y, al arrastrar, PROPONE la cascada: nada se
    guarda hasta que se acepta.
- Exportacion `.ics` (cierra la v1):
  - `backend/services/ical.py`: formateador puro RFC 5545. `DTEND` exclusivo,
    `UID` estable, plegado a 75 octetos (bytes UTF-8), escapado y CRLF.
  - `GET /api/projects/{id}/calendar.ics` con `text/calendar` y descarga.
  - Boton "Exportar .ics" en el diagrama del proyecto: el frontend pide el
    calendario con su token y lo baja como fichero.
- Bloque C (Calendario):
  - `WeekLanes.vue`: las barras se arrastran si el proyecto de su tarea esta
    entre los editables, cada semana lleva su `data-semana` y el dia bajo el
    puntero se resalta. `WeekGrid.vue` reemite el gesto.
  - `CalendarView.vue`: el arrastre resuelve el dia por la horizontal y la
    semana por la vertical (la `<y>` del puntero), mueve la tarea conservando
    la duracion con el mismo PATCH que el Gantt, y monta el alta del dia con
    `ModalDialog` + `TaskForm`.
  - `DayDetail.vue`: alta de tarea del dia y edicion inline de horas,
    responsable y estado (el componente emite; la vista guarda).
  - `backend/services/gantt.py` y `schemas.py`: el feed del Gantt (que es
    tambien el del calendario) incluye las horas estimadas de la tarea.
- Motor de Gantt, fase 4: alta y edicion.
  - El doble clic en el hueco de una fila abre el alta (`ModalDialog` +
    `TaskForm`, el patron del desglose de celda), con las fechas precargadas
    y el proyecto destino resuelto (filtro o grupo de la fila).
  - El clic simple en una barra abre el `TaskDetailDialog` que ya existia.
  - Los miembros del proyecto se piden al abrir el alta y se cachean.
  - Corregido un bug de scroll: el cuerpo del diagrama se trasladaba ademas
    del scroll nativo, de modo que las barras se separaban de la columna de
    nombres al desplazarse. El scroll lo hace el panel: ahora solo se
    trasladan el eje (queda clavado arriba) y la pista de la columna de
    nombres.
  - Geometria del diagrama: el cuerpo reserva el alto de la cabecera (48 px),
    como la columna de nombres, para que la fila 0 quede debajo de la
    cabecera pegajosa. El doble clic descarta la banda que el eje tapa,
    `[scroll, scroll + 48)`, y calcula la fila sobre el cuerpo desplazado. El
    lienzo lo estira el CSS (`width: 100%`), sin medirlo en JavaScript, y el
    `min-width` del elemento impide que baje del ancho del rango. La escala se
    adapta al panel: los pixeles por dia suben hasta llenar el ancho
    disponible, sin bajar nunca del natural de la escala (Dia 44, Semana 14,
    Mes 5). El chart mide el ancho del panel y lo informa a la vista, que
    calcula la escala efectiva. El nombre de un festivo se recorta al ancho de
    su celda.
  - Scrolls del Gantt: la vista es una columna flex que ocupa el alto de
    `main` y el diagrama se queda con el espacio sobrante (`max-h-full`, con
    un minimo de 200 px). La columna del armazon y `main` llevan `min-h-0`: la
    pagina (`html` en `h-screen overflow-hidden`) nunca gana scroll y `main`
    se desplaza por dentro. Queda un solo scroll, el del panel del diagrama.
    Un aviso transitorio (por ejemplo "Fechas actualizadas") aprieta el
    diagrama en vez de empujar la pagina.

## Decisiones tecnicas

- **Fechas del motor en UTC a medianoche.** El feed trae cadenas ISO y se
  parsean como UTC: leer los campos locales desplazaria el dia segun el
  desfase horario del cliente. La `toIsoDate` anterior usaba campos locales y
  por eso se sustituye.
- **Unidad = dia.** Una barra cubre `start_date`..`end_date` inclusive; su
  ancho es `(fin - inicio + 1) * pxPorDia`. Desaparece la ambiguedad del
  "ultimo instante" con que la libreria entregaba el final.
- **Semana ISO**: el 31/12/2026 es `2026-W53`. El eje de la escala Semana usa la
  clave ISO de `utils/weeks.js`, sin reimplementarla.
- **Permiso por barra**, no por vista: el Gantt global mezcla proyectos, asi
  que se consulta `ambito.editable_project_ids` de `meApi.get()` y cada barra
  es editable si su proyecto esta en la lista.
- **Rango en la URL** con `?from=` y `?to=` (fechas ISO). Sin ellos, el
  rango es "Completo". La escala (Dia/Semana/Mes) sigue siendo estado local.
- **Festivos**: solo se sombrean los de alcance global. Los de persona o
  departamento se ven en la pantalla Calendario laboral.
- **Arrastre propio del Gantt** (`composables/useGanttDrag.js`). La
  extraccion a un composable compartido con Kanban y Calendario queda para
  cuando el Kanban adopte el contrato (§52, bloque A): tocar el Kanban que
  ya funciona, sin ganancia visible, es riesgo puro.
- **Teclado con un solo camino**: las flechas aplican el movimiento, `Shift` mas
  flechas redimensiona, `Intro` abre el detalle, `Escape` anula. Sin modo de
  previsualizacion pendiente.
- **Color por persona**, sin selector: lo decide el §50 del proyecto. El color
  de proyecto queda para la franja del grupo y el `aria-label`.

- Revision visual con navegador (la primera de la aplicacion): 48 capturas de
  todas las ventanas en `_capturas/` (fuera del repo). Cuatro fallos que
  ninguna suite puede ver: el Gantt no dibujaba barras (el `transform` de SVG
  con unidades CSS), el alta inline del Kanban estaba en las cuatro columnas,
  el calendario abria en una semana vacia y los plurales eran perezosos.
  Todo corregido y con test donde se puede.
- Prueba del servidor MCP en marcha: el catalogo y una llamada por tool con
  datos reales, en `docs/mcp-prueba.md`. La salida de las tools no era
  parseable (una lista se reparte en varios bloques): ahora cada tool devuelve
  un objeto.
- `docs/analisis-interfaces.md`: el analisis de la aplicacion y su ciclo de
  vida, con el indice de capturas.

## Pendientes / Siguiente paso inmediato

- La lista de tareas sin fechas NO es clicable: el feed solo trae identificadores
  y la API no tiene filtro de "sin fechas" (habria que tocar el feed, que el
  §53 declara invariable). Se queda como banner de aviso.
- La retirada de `frappe-gantt` del `package.json` ya esta hecha (la hizo el
  implementador antes de su turno de revision): el usuario tiene que confirmar
  el cambio de dependencia antes del commit.
- Revision visual en navegador: se hizo con Chromium headless por CDP (el
  catalogo no expone el MCP de Playwright, pero el binario de Chromium si esta
  instalado): el Gantt se reviso en Dia/Semana/Mes con la escala estirada al
  panel, las barras alineadas con la columna de nombres y el arrastre de una
  barra (tras soltar queda un solo scroll, el del panel del diagrama). Queda
  pendiente para una sesion con navegador de verdad: modal en movil y
  escritorio y desglose de celda de la matriz.
- Despues del motor: bloque A (Kanban) y bloque C (Calendario) del §51, y
  luego G2 (capacidad libre), G1 (horas reales), G3 (politica), G5 (MCP).
