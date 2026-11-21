# Estado de la sesion

## Objetivo actual

Motor de Gantt propio (bloque B de `docs/especificaciones.md` §51), sobre el
contrato comun de interaccion de la §52 y el contrato del motor de la §53.
Fases 0 a 4 hechas y auditadas (nucleo puro, render, arrastre, alta y
edicion); `frappe-gantt` fuera del `package.json`. El bloque B queda cerrado
en codigo: solo falta la revision visual en navegador, que esta sesion no
puede hacer.

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
- Motor de Gantt, fase 4: alta y edicion.
  - El doble clic en el hueco de una fila abre el alta (`ModalDialog` +
    `TaskForm`, el patron del desglose de celda), con las fechas precargadas
    y el proyecto destino resuelto (filtro o grupo de la fila).
  - El clic simple en una barra abre el `TaskDetailDialog` que ya existia.
  - Los miembros del proyecto se piden al abrir el alta y se cachean.
  - Corregido un bug de scroll: el cuerpo del diagrama se trasladaba ademas
    del scroll nativo, de modo que las barras se separaban de la columna de
    nombres al desplazarse. Ahora solo se traslada el eje (queda clavado
    arriba) y la pista de la columna de nombres.

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

## Pendientes / Siguiente paso inmediato

- La lista de tareas sin fechas NO es clicable: el feed solo trae identificadores
  y la API no tiene filtro de "sin fechas" (habria que tocar el feed, que el
  §53 declara invariable). Se queda como banner de aviso.
- La retirada de `frappe-gantt` del `package.json` ya esta hecha (la hizo el
  implementador antes de su turno de revision): el usuario tiene que confirmar
  el cambio de dependencia antes del commit.
- Revision visual en navegador: esta sesion no tiene Playwright (el catalogo de
  herramientas lo retiro), asi que no se pudo hacer. Queda pendiente para una
  sesion con navegador: modal en movil y escritorio, desglose de celda de la
  matriz y el Gantt nuevo en las tres escalas.
- Despues del motor: bloque A (Kanban) y bloque C (Calendario) del §51, y
  luego G2 (capacidad libre), G1 (horas reales), G3 (politica), G5 (MCP).
