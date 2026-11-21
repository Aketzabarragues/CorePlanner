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
- **frontend**: el Kanban pasa al contrato comun de interaccion. Contadores por
  columna con tareas y horas (los totales los calcula el backend), arrastre
  con posicion dentro de la columna, alta inline al pie de cada columna y
  edicion inline del titulo, las horas y el responsable. Mover y reordenar
  usan `PUT /projects/{id}/tasks/order`.
- **frontend**: el formulario de proyecto lleva un interruptor "Provisional" y la
  lista marca esos proyectos. El feed del Gantt lleva el flag y sus barras se
  distinguen en contorno.
- **frontend**: el Calendario pasa al contrato comun. Arrastrar una barra a otro
  dia mueve la tarea conservando la duracion (el mismo PATCH que el Gantt) y
  la semana de destino se resuelve por donde se suelta; la vista de dia
  permite crear una tarea para ese dia y editar horas, responsable y estado
  en linea.
- **backend**: el feed del Gantt, que es tambien el del calendario, incluye las
  horas estimadas de la tarea. La insignia de horas de la vista de dia salia
  en "0 h" porque el dato noviaja.
- **frontend**: el gesto de arrastre vive en `composables/useArrastre.js`, que
  usan el Kanban y el Gantt. El destino (una columna o un desplazamiento en
  dias) lo resuelve quien invoca el composable.
- **frontend**: el fantasma del arrastre del Gantt se developaba en la
  plantilla como una referencia anidada, que no se desarrolla sola: el cuadro
  del fantasma se veia siempre. Ahora las referencias van en primer nivel.
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

- **backend**: `projects.is_provisional`: un proyecto se puede marcar como no
  firmado. El informe de capacidad separa la carga confirmada de la
  provisional (la celda lleva `hours` y `hours_provisional`, y el desglose por
  proyecto lleva `provisional`), y lo provisional no sobrecarga a nadie:
  `is_overloaded` se calcula con la carga confirmada.
- **frontend**: la matriz y el detalle de celda muestran la **capacidad libre**
  como metrica de primera clase, con `loadFree` en la escala de carga. Un
  interruptor "Contar lo provisional" (que vive en la URL, `?provisional=1`)
  cambia la lectura de la celda: sin el, solo cuenta lo firmado; con el, toda
  la carga planificada. Lo provisional se pinta en contorno, no con un color
  nuevo.
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
