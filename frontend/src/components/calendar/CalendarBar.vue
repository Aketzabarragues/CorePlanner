<script setup>
/**
 * La barra de una tarea dentro de sus sub-filas.
 *
 * Pinta el cuerpo de la barra con el color del proyecto y los datos de la
 * celda en los atributos `data-*` que el arrastre y los tests leen:
 * `data-task-id`, `data-lane` y, de la celda, `data-inicio` y
 * `data-columnas`. El color de fondo es el del proyecto, nunca la paleta
 * por persona.
 *
 * La barra se agarra con `mousedown` (boton izquierdo, fuera de controles):
 * el cuerpo emite `drag-start` con `zona: 'body'` y cada asa de redimension
 * emite su `zona` ('start' o 'end') sin propagar al cuerpo. La zona la da el
 * `data-zona` del elemento agarrado. Los handlers son funciones nombradas,
 * no llamadas: el compilador de plantillas solo llama a un handler nombrado
 * (`@mousedown="alAgarrar('body')"` compila a un handler que devuelve la
 * funcion sin llamarla). Solo emite si `editable` dice que el proyecto se
 * puede escribir; el destino de la soltura lo resuelve quien la usa. El clic
 * emite `abrir` con el id de la tarea, con y sin permiso.
 *
 * Las asas solo se ven si la semana en pantalla deja ver el extremo real de
 * la tarea (`puedeRedimensionarInicio` / `puedeRedimensionarFin`): una barra
 * recortada por la semana no se redimensiona por el extremo que no se ve.
 *
 * El teclado se opera igual que la barra del Gantt: roving tabindex, la
 * unica barra con `tabindex` 0 es la enfocada (`seleccionada`), el foco la
 * emite con `seleccionar` y cada tecla se sube con `tecla`. El `aria-label`
 * es la descripcion completa de la tarea; sin permiso de escritura la barra
 * se anuncia deshabilitada, pero sigue enfocable para leerse.
 */
const props = defineProps({
  /** Barra con su celda: {tarea, inicio, fin, carril, span}. */
  barra: { type: Object, required: true },
  /** Si el proyecto de la tarea se puede escribir: con eso, arrastre. */
  editable: { type: Boolean, default: false },
  /** Si la fecha de inicio real de la tarea cae en la semana visible. */
  puedeRedimensionarInicio: { type: Boolean, default: false },
  /** Si la fecha de fin real de la tarea cae en la semana visible. */
  puedeRedimensionarFin: { type: Boolean, default: false },
  /** Titulo con todos los datos de la tarea, para el aviso del raton. */
  title: { type: String, default: '' },
  /** Barra enfocada: lleva el `tabindex` 0 y el `aria-current`. */
  seleccionada: { type: Boolean, default: false },
  /** Etiqueta aria completa: titulo, persona, fechas, avance, permiso. */
  etiquetaAria: { type: String, default: '' },
})

const emit = defineEmits(['drag-start', 'abrir', 'seleccionar', 'tecla', 'contexto', 'entrar', 'salir'])

/**
 * Agarrar la barra: solo boton izquierdo, fuera de controles y con permiso de
 * escritura. La zona la da el `data-zona` del elemento agarrado: el asa marca
 * la suya y el cuerpo, sin `data-zona`, cae a 'body'.
 */
function alAgarrar(event) {
  if (event.button !== 0) return
  if (event.target.closest('select, button, input, a')) return
  if (!props.editable) return
  // Sin esto el navegador sigue con su seleccion de texto mientras se
  // arrastra y el resaltado azul compite con el gesto.
  event.preventDefault()
  const zona = event.target.closest('[data-zona]')?.dataset.zona ?? 'body'
  emit('drag-start', { tarea: props.barra.tarea, zona, event })
}

/**
 * Clic derecho sobre la barra: el menu contextual de la tarea.
 *
 * Se detiene aqui (no llega al hueco de la celda, que tiene su propio menu)
 * y sube la tarea, la posicion del puntero y el elemento que lo abrio, para
 * que el foco vuelva a la barra al cerrarse.
 */
function alMenuContexto(event) {
  event.preventDefault()
  event.stopPropagation()
  emit('contexto', {
    tipo: 'barra',
    tarea: props.barra.tarea,
    x: event.clientX,
    y: event.clientY,
    abridor: event.currentTarget,
  })
}
</script>

<template>
  <div
    class="relative flex min-w-0 flex-col justify-center overflow-hidden rounded px-1.5 py-0.5"
    :class="[
      barra.tarea.is_provisional
        ? 'border border-dashed border-slate-500 text-slate-700'
        : 'text-white',
      editable ? 'cursor-grab' : 'cursor-pointer',
    ]"
    :style="{
      backgroundColor:
        barra.tarea.is_provisional ? 'transparent' : barra.tarea.project_color,
    }"
    :title="title"
    :data-task-id="barra.tarea.id"
    :data-lane="barra.carril"
    :data-inicio="barra.inicio"
    :data-columnas="barra.span"
    data-testid="week-task"
    :tabindex="seleccionada ? 0 : -1"
    :aria-label="etiquetaAria"
    :aria-disabled="editable ? undefined : 'true'"
    :aria-current="seleccionada ? 'true' : undefined"
    @mousedown="alAgarrar"
    @click="emit('abrir', barra.tarea.id)"
    @focus="emit('seleccionar', { id: barra.tarea.id })"
    @keydown="emit('tecla', { event: $event, id: barra.tarea.id })"
    @contextmenu="alMenuContexto"
    @mouseenter="emit('entrar', $event)"
    @mouseleave="emit('salir')"
  >
    <span class="truncate text-[11px] font-medium leading-tight">
      {{ barra.tarea.title }}
    </span>
    <span class="truncate text-[10px] leading-tight opacity-80">
      {{ barra.tarea.project_name }}
    </span>

    <!--
      Asas de redimension: solo con permiso y solo si el extremo real de la
      tarea cae en la semana visible. El `data-zona` marca la zona del
      mousedown que burbujea al cuerpo; sin handler propio.
    -->
    <div
      v-if="editable && puedeRedimensionarInicio"
      class="absolute left-0 top-0 h-full w-2 cursor-ew-resize"
      data-testid="calendar-handle-start"
      data-zona="start"
    ></div>
    <div
      v-if="editable && puedeRedimensionarFin"
      class="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
      data-testid="calendar-handle-end"
      data-zona="end"
    ></div>
  </div>
</template>
