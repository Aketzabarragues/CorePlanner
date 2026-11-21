# Changelog

Formato [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Versionado segun [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Changed

- **frontend**: el diagrama de Gantt deja de depender de la libreria
  `frappe-gantt`. Lo dibuja un motor propio (`frontend/src/components/gantt/`:
  grafico, eje, barra, cabecera de grupo y columna de nombres) sobre el mismo
  feed del backend, que no cambia. El rango visible pasa a vivir en la URL
  (`?from=` y `?to=`), el permiso de escritura se resuelve por barra (el del
  proyecto de cada tarea), los dias no laborables globales se sombrean en la
  rejilla, el teclado mueve y redimensiona, y soltar una barra fuera del
  diagrama cancela en vez de guardar.
- **frontend**: agrupar por persona, proyecto o departamento usa el
  identificador como clave, no el nombre: dos personas homonimas ya no se
  fusionan en un mismo grupo.
- **frontend**: el aviso de tareas sin fechas pasa a un banner con el plural
  correcto.
- **frontend**: el Gantt abre el alta de tarea con doble clic en el hueco de una
  fila y el detalle con clic en la barra. El alta usa el mismo `ModalDialog` y
  `TaskForm` del desglose de celda, con las fechas precargadas, y solo se
  ofrece cuando hay un proyecto en contexto y permiso de escritura en el.
- **frontend**: el cuerpo del diagrama no se traslada al desplazar: el scroll lo
  hace el panel. Antes las barras se separaban de la columna de nombres al
  desplazarse.
- **frontend**: todos los dialogos de la aplicacion pasan por `ModalDialog`:
  altas y ediciones (tarea, persona, competencia, departamento, proyecto,
  miembro y dia no laborable), detalle de tarea y ficha de persona. El
  componente gana `size`, `subtitle` y pie de acciones fijo; el boton del pie
  envia el formulario del cuerpo con la funcion `submit` que expone el dialogo.
- **frontend**: el detalle de tarea pasa de `TaskDetailPanel.vue` a
  `TaskDetailDialog.vue` y la ficha de persona de `PersonDrawer.vue` a
  `PersonDialog.vue`, ambos sobre `ModalDialog`.
- **frontend**: el alta de dia no laborable deja de ser un formulario embebido en
  la pagina de configuracion y se abre en un modal.
- **frontend**: `TaskForm.vue` queda como puro cuerpo de formulario, sin cabecera
  ni botones; la accion principal vive en el pie del dialogo.
- **docs**: `README.md` y `docs/especificaciones.md` describen ya el dialogo
  unico. `SidePanel` queda documentado como excepcion: la columna lateral no
  modal del desglose de celda de la matriz.

### Added

- **frontend**: `utils/ganttScale.js` (escalas y aritmetica de dias en UTC),
  `utils/ganttLayout.js` (modelo del diagrama y operaciones de arrastre),
  `utils/ganttMetrics.js` (medidas) y `composables/useGanttDrag.js`
  (arrastre y redimension). Todo con tests unitarios.
- **frontend**: tests de `GanttChart`, `useGanttDrag` y de la vista del Gantt
  sobre el motor propio.
- **frontend**: `frontend/src/tests/TaskForm.spec.js` y
  `frontend/src/tests/ModalDialog.spec.js`, con cobertura del formulario de tarea
  y del envio desde el pie del dialogo.

### Removed

- **frontend**: la dependencia `frappe-gantt` del `package.json`.
- **frontend**: `TaskDetailPanel.vue`, `PersonDrawer.vue` y sus specs, ya sin uso
  tras la migracion.
