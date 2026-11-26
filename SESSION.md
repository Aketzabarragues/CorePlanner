# Estado de la sesion

## Objetivo actual

Motor propio del calendario de la planificacion: el calendario deja de ser un
par de componentes que pintan una tabla y pasa a tener la misma arquitectura y
el mismo juego de interacciones que el diagrama de Gantt (mover, redimensionar,
teclado, menu contextual, globo, alta en un dia concreto).

**Implementado y verificado** en el frontend. El backend no cambia: el
calendario sigue leyendo el feed del Gantt y los dias no laborables.

Sin commit: el trabajo esta en el arbol, pendiente de que el usuario lo
apruebe.

## Cambios realizados

### Modulos puros (nuevos)

- `frontend/src/utils/calendarLayout.js`: el reparto de la rejilla.
  `buildWeekLayout` reparte las tareas de una semana en filas por persona y en
  carriles; `celdasDeCarril` convierte un carril en las celdas de la fila.
  `celdasDeCarril` cubre las siete columnas sin huecos ni solapes.
- `frontend/src/utils/calendarGeometry.js`: el hit-test sobre geometria ya
  medida. `hitTestDia` (semana, columna, fecha), `columnaDesdeX`,
  `esLaborable` y `diaLaborable` (sabado -> viernes, domingo -> lunes).
- `frontend/src/utils/calendarMetrics.js`: medidas fijas de la rejilla.

### Composables (nuevos)

- `frontend/src/composables/useCalendarioDrag.js`: mover y redimensionar, sobre
  `useArrastre`. El destino sale de la geometria (medida al empezar el gesto y
  fija durante el) y siempre cae en dia laborable.
- `frontend/src/composables/useCalendarioEstado.js`: el estado de la vista
  (mes, semana, dia) y su ida y vuelta con la URL.

### Componentes (nuevos)

- `frontend/src/components/calendar/`: `CalendarGrid.vue` (la tabla, un
  `<tbody>` por semana, `medir()` y el roving tabindex), `CalendarWeek.vue`
  (filas de una semana), `CalendarDayHeader.vue` (cabecera de dias, hoy y
  festivos), `CalendarBar.vue` (la barra, con asas de redimension, `tabindex`,
  `aria-label` y menu contextual) y `CalendarTooltip.vue` (el globo).
- Borrados `frontend/src/components/common/WeekLanes.vue` y
  `frontend/src/components/WeekGrid.vue`. Sin alias ni envoltorios.

### Vista

- `frontend/src/views/CalendarView.vue`: consume el motor; el hit-test que
  consultaba el DOM por selector desaparece; el estado de la vista pasa al
  composable; el menu contextual y el globo se montan; el guardado de fechas se
  confirma con un aviso flotante y el fallo sigue en el banner de la vista.

### Tests (nuevos)

`calendarLayout.spec.js`, `calendarGeometry.spec.js`,
`useCalendarioDrag.spec.js`, `useCalendarioEstado.spec.js`, mas el bloque de
teclado, menu, globo y alta en `CalendarView.spec.js`. Suite completa: 56
ficheros y 1024 tests.

### Documentacion

- `docs/especificaciones.md`: §14-§16 al dia (el calendario ya no es de
  lectura) y nueva §60 "Motor de calendario propio".
- `CHANGELOG.md`: entrada en `[Unreleased]`.
- `README.md`: la seccion del calendario y el arbol de ficheros.

## Decisiones tecnicas

- **HTML, no SVG**: la rejilla es una tabla con celdas fusionadas (`colspan`);
  el Gantt dibuja barras sobre una linea de tiempo y el calendario no tiene
  eje ni escala.
- **Se mide en el componente, se decide en un modulo puro**: la tabla mide su
  caja, el ancho de la columna de nombres, el ancho de columna de dia y el
  rango vertical de cada semana; `hitTestDia` decide que dia cae bajo el
  puntero. La vista no consulta el DOM por selector.
- **El fin de semana se ve y no lleva barras**: las barras se recortan a los
  dias laborables y el destino de un arrastre cae siempre en uno de ellos.
- **Permiso por barra**: sin permiso de escritura en el proyecto de la tarea no
  hay arrastre, ni asas, ni movimientos con el teclado; el clic sigue abriendo
  el detalle.
- **Un solo camino de teclado**: las flechas mueven un dia, `Mayus` con las
  flechas redimensiona, `Intro` abre el detalle, arriba y abajo cambian de
  barra. Sin modo de previsualizacion pendiente.
- **El estado de la vista vive en la URL** (`view`, `month`, `day`): los valores
  por defecto no se escriben, los parametros invalidos se ignoran y los filtros
  de proyecto y departamento no se tocan.
- **Un fallo, un aviso**: el exito se confirma con toast y el fallo sale en el
  banner de la vista. Ningun error cierra la sesion.

## Pendientes / Siguiente paso inmediato

1. Commit pendiente de aprobacion: `feat(calendario): motor propio con mover,
   redimensionar, teclado, menu y globo`.
2. Sin smoker en navegador (no hay herramienta de navegador en esta sesion):
   la evidencia es la suite de Vitest (1024 tests), `npm run verify:css` y
   `npm run build`. Conviene una prueba manual con `python iniciar.py` y la
   semilla: mover una barra en el mes, redimensionarla, usar el teclado, abrir
   el menu y crear una tarea con doble clic.
3. El `.ics` sigue pendiente (esta planificado y fuera del alcance de v1).
