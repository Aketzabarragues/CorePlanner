# Changelog

Formato [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Versionado segun [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Changed

- **frontend**: el diagrama de Gantt deja de llevar los colores a mano: sus
  ~30 hexadecimales pasan a clases del sistema de diseño (`gantt.css` con
  `@apply` de Tailwind) y la tipografia del SVG sale tambien de las clases. La
  paleta de personas sigue siendo dato, no estilo. Las filas se resaltan a la
  vez en la columna de nombres y en el diagrama, y la fila de la barra
  enfocada se marca con su propio tinte.
- **frontend**: el selector segmentado (escala del Gantt, modo de la celda,
  vista del calendario) y los campos de filtro de las tres vistas pasan a dos
  componentes comunes (`SegmentedControl` y `FilterField`). Se conserva el
  marcado y los `data-testid` de antes, y los selectores que no exponian estado
  accesible (`aria-pressed`, `role="group"`) ahora lo hacen.
- **frontend**: la cabecera del eje del Gantt se afina. En la escala de dia, una banda
  agrupa todos los dias del mes ("nov 2026") y debajo van el numero del dia y la inicial
  del dia de la semana. La rejilla muestra los dias dentro de la semana (escala de
  semana) y las semanas dentro del mes (escala de mes), con un trazo mas claro que el
  del limite de celda. El alto de la cabecera pasa a 64 px en el eje y en la columna de
  nombres.
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
- **frontend**: el cuerpo del diagrama reserva el alto de la cabecera (48 px),
  como la columna de nombres, y no se mueve al desplazar: el scroll lo hace el
  panel. Antes las barras no cuadraban con su fila.
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

- **frontend**: el panel de nombres del Gantt admite columnas elegibles (persona,
  inicio, fin, duracion, horas y estado) y ordenables por cabecera. La eleccion
  y la orden van en la URL (`?cols=`, `?sort=`) y la ordenacion se aplica dentro
  de cada grupo, sin mover los grupos.
- **frontend**: la fila de cada grupo del Gantt lleva una barra de resumen, de la
  primera a la ultima fecha de sus tareas, y los grupos se pueden colapsar: la
  cabecera de grupo es un boton con `aria-expanded` y el estado vive en la URL
  (`?collapsed=`), con claves por identificador y no por nombre.
- **frontend**: el diagrama de Gantt tiene zoom continuo (Ctrl+rueda sobre el
  diagrama, mas botones de detalle y "Ajustar al ancho"), con el dia que esta
  bajo el puntero siempre en su sitio; panel de nombres redimensionable con un
  asa; modo ampliado a pantalla completa, que se sale con `Escape`; y el boton
  "Hoy" ademas de mover el rango, centra la columna de hoy.
- **frontend**: el diagrama de Gantt marca la columna del raton con una cruz
  vertical y la fecha de ese dia, y al pasar por encima de una barra muestra un
  globo con sus datos: inicio, fin, duracion, avance y sus dependencias (que
  tareas requiere y que tareas dependen de ella).
- **backend**: la exportacion `.ics` del proyecto. Un formateador puro escribe el
  calendario segun RFC 5545 (`DTEND` exclusivo, `UID` estable por tarea,
  plegado a 75 octetos contando bytes UTF-8, escapado del texto y fin de linea
  CRLF) y el endpoint `GET /api/projects/{id}/calendar.ics` lo sirve como
  fichero adjunto. Las tareas sin fechas no se exportan.
- **frontend**: el diagrama de Gantt dibuja las flechas de dependencia (del fin del
  requisito al inicio de la dependiente; los vinculos `relates` van discontinuos
  y sin punta) y marca las barras que violan el orden. Al arrastrar una barra, si
  el movimiento arrastra otras tareas, se propone la cascada y se decide: nada
  se guarda solo.
- **frontend**: el detalle de una tarea lleva una seccion "Dependencias" con sus
  requisitos y sus dependientes, y un formulario para anadir un vinculo (el
  selector ofrece las tareas del proyecto menos la propia). Un ciclo rechazado
  por el backend se ve en el banner de la seccion.
- **backend**: dependencias entre tareas. La tabla `task_dependencies` une una tarea
  dependiente con su requisito (`precedes`, que restringe, o `relates`, que no).
  Un modulo puro resuelve el ciclo, las violaciones de orden, el orden topologico
  (`graphlib` de la stdlib), la cascada PROPUESTA y la ruta critica. La API
  permite anadir y quitar vinculos, consultar los de una tarea y pedir la
  propuesta de cascada sin modificar nada.
- **backend**: servidor MCP. `backend/mcp_server/` expone la API a un agente por
  stdio con ocho tools de solo lectura: quien es el token, los proyectos
  visibles, la matriz de capacidad, quien esta sobrecargado, la capacidad de un
  proyecto, las horas reales, las tareas de un proyecto y los incidentes que
  necesitan aprobacion. El servidor es un cliente HTTP de la propia API, asi
  que el agente ve exactamente lo que ve la persona de su token. El SDK va como
  extra opcional y el catalogo de tools es un contrato con test.
- **backend**: los incidentes de capacidad. El umbral que exige aprobacion no es una
  alerta: abre un incidente que alguien tiene que resolver, en la misma
  transaccion que el cambio de tarea que lo provoco. Uno por politica, persona
  y semana, y uno resuelto no se reabre. El gerente ve todos, el jefe de
  departamento los de su departamento y el tecnico solo los suyos.
- **backend**: la politica de capacidad. La tabla `capacity_policies` define, para una
  persona o un departamento, el umbral de aviso y el que exige aprobacion; el
  motor puro `capacity_policy.py` evalua las politicas sobre las celdas y el
  informe de capacidad lleva por celda el veredicto (`policy_verdict`) y la
  politica aplicada. Sin politica no hay veredicto y la celda se comporta como
  hasta ahora.
- **backend**: horas reales. La tabla `time_entries` registra, por persona, tarea
  y dia, las horas imputadas; el informe de capacidad lleva `hours_actual` por
  celda, que es `null` cuando nadie ha imputado (un cero afirmaria algo que el
  dato no sostiene). Cada persona imputa sobre si misma y las mutaciones van a
  la bitacora.
- **frontend**: el panel global lleva un bloque "Necesitan aprobacion" con los
  incidentes pendientes: quien es, la semana, la carga frente a la capacidad y
  el umbral superado. Aprobar y rechazar, con nota opcional, y solo si quien
  entra puede resolverlos.
- **frontend**: la politica de capacidad se configura en una pestana nueva de
  Configuracion (solo el gerente) y la matriz marca el veredicto de cada celda
  con un simbolo y un texto, no solo con color. El fondo de la celda no
  cambia: el veredicto es ortogonal al estado de carga. El detalle de celda
  explica que umbral se ha superado y que hace falta.
- **frontend**: se imputan horas desde el detalle de la tarea (seccion "Horas
  imputadas", con la lista, el total y el formulario) y el desglose de celda
  lee el plan contra el real: "registrado 6 h · plan 12 h · -6 h", o "sin
  imputar" cuando nadie ha registrado, que no es lo mismo que cero.
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

### Fixed

- **frontend**: al arrastrar o redimensionar una barra del Gantt, el azul de destino ya no
  es un recuadro que tapa todo el diagrama: es la fila de la tarea, con el ancho del rango
  nuevo, de modo que se ve cuanto crece o se encoge.
- **frontend**: el nombre del festivo ya no pisa las fechas en la cabecera del Gantt. La
  cabecera pasa a tres bandas (numero o nombre, rango o ano, festivo) y el festivo
  lleva su insignia en la tercera, con la etiqueta recortada al ancho de la celda.
- **frontend**: arrastrar y soltar una barra del Gantt ya no deja tres scrollbars.
  El aviso "Fechas actualizadas" empujaba la vista, que hacia crecer la pagina.
  Ahora la columna del armazon y `main` llevan `min-h-0` (la pagina nunca
  crece), la vista del Gantt es una columna flex que ocupa el alto de `main` y
  el diagrama se queda con el espacio sobrante con `max-h-full`, en vez del tope
  fijo de pantalla. Queda un solo scroll: el del panel del diagrama.
- **frontend**: el diagrama de Gantt ocupa todo el ancho del panel. La escala
  de tiempo se estira: los pixeles por dia suben hasta llenar el ancho
  disponible, sin bajar nunca del valor natural de la escala (Dia 44, Semana
  14, Mes 5), asi que el rango ya no deja un hueco a la derecha. El lienzo lo
  estira el CSS, sin medirlo en JavaScript.
- **frontend**: las flechas verticales del Gantt mueven el foco real del teclado
  a la barra siguiente, no solo el estado interno: sin eso el teclado se
  quedaba en la barra anterior.
- **frontend**: el nombre de un festivo se recorta al ancho de su celda en la
  cabecera del Gantt, con puntos suspensivos, en vez de desbordarse sobre la
  columna siguiente.
