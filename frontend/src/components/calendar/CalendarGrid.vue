<script setup>
/**
 * La tabla del calendario: un `<tbody>` por semana.
 *
 * En el mes se usa una sola tabla con un grupo de filas por semana, de modo
 * que las semanas se continuen una en otra sin huecos y la soltura del
 * arrastre sepa en que semana cae por el `data-semana` de cada `<tbody>`. En
 * la vista semanal la misma tabla lleva una sola semana.
 *
 * El componente no pide datos al servidor: recibe las personas y las tareas
 * ya filtradas y reparte cada semana con `buildWeekLayout`
 * (utils/calendarLayout.js). Los eventos `open-day`, `open-task` y
 * `drag-start` se reemiten tal cual desde las semanas.
 *
 * La geometria del arrastre la mide el componente con `medir()`, que expone
 * para que quien arrastre lea el DOM una sola vez al empezar el gesto:
 * `table-fixed` deja las siete columnas de dia iguales y cada semana es un
 * `<tbody>` con su `data-semana`.
 *
 * El grid lleva el foco de teclado (roving tabindex, como el Gantt): es
 * quien ve todas las barras, de modo que una sola lleva `tabindex` 0 y el
 * resto -1. `ArrowUp`/`ArrowDown` mueven el foco entre barras visibles y el
 * resto de teclas (`ArrowLeft`/`ArrowRight`, `Enter`) se suben a la vista
 * con `tecla`, que es quien decide el efecto (permiso y PATCH).
 */
import { computed, nextTick, ref } from 'vue'

import { useTaskStatusesStore } from '../../stores/taskStatuses'
import { DEFAULT_TASK_STATUSES, columnLabel } from '../../utils/kanban'
import { buildWeekLayout, celdasDeCarril } from '../../utils/calendarLayout'
import CalendarTooltip from './CalendarTooltip.vue'
import CalendarWeek from './CalendarWeek.vue'

/**
 * Estados por proyecto: el componente no pide al servidor, la carga la hace
 * quien lo contiene. Sin carga, los cuatro por defecto.
 */
const statusStore = useTaskStatusesStore()
function estadosDe(projectId) {
  const lista = statusStore.statesOf(projectId)
  return lista.length ? lista : DEFAULT_TASK_STATUSES
}

const props = defineProps({
  /** Semanas a pintar: array de semanas, cada una sus siete dias. */
  weeks: { type: Array, required: true },
  /** Personas visibles, ordenadas por departamento y luego por nombre. */
  people: { type: Array, default: () => [] },
  /** Tareas ya filtradas. */
  tasks: { type: Array, default: () => [] },
  /** Dias no laborables. */
  nonWorkingDays: { type: Array, default: () => [] },
  /** Proyectos en los que quien entra puede escribir: con esa barra, arrastre. */
  editableProjectIds: { type: Array, default: () => [] },
  /**
   * Banda de destino del arrastre: {taskId, start, end, personaId}, o null si
   * no hay arrastre. Se sombrea solo en la fila de la persona de la tarea.
   */
  destino: { type: Object, default: null },
  /** Arrastre en curso: con el, el globo no se pinta, que estorba al arrastre. */
  arrastrando: { type: Boolean, default: false },
  /** Testid de la tabla; sin el, la tabla no lleva testid. */
  testid: { type: String, default: null },
  /** Departamentos con su color, para el avatar de la celda de persona. */
  departamentos: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'open-day',
  'open-task',
  'drag-start',
  'seleccionar',
  'tecla',
  'contexto',
  'crear',
])

/** Tabla, para medir la geometria del arrastre al vuelo. */
const tabla = ref(null)

/** Rejilla de cada semana: dias tal cual y filas repartidas en carriles. */
const layouts = computed(() =>
  props.weeks.map((days) => buildWeekLayout({ days, people: props.people, tasks: props.tasks })),
)

/**
 * Barra enfocada (roving tabindex): la unica con `tabindex` 0. Si la que
 * estaba enfocada ya no se ve (filtro, cambio de mes), cae a la primera barra
 * visible, para que la rejilla siga alcanzable con `Tab`.
 */
const barraEnfocada = ref(null)

/** Barras visibles en orden de pintura: persona y carril, semana a semana. */
const barrasVisibles = computed(() =>
  layouts.value.flatMap((layout) =>
    layout.filas.flatMap((fila) =>
      fila.carriles.flatMap((carril) =>
        celdasDeCarril(layout.days, carril)
          .filter((celda) => celda.tipo === 'barra')
          .map((celda) => celda.barra.tarea),
      ),
    ),
  ),
)

/** La barra enfocada, o la primera visible si la enfocada ya no se ve. */
const idEnfocado = computed(() => {
  const visibles = barrasVisibles.value
  if (!visibles.length) return null
  if (visibles.some((tarea) => tarea.id === barraEnfocada.value)) return barraEnfocada.value
  return visibles[0].id
})

/**
 * Datos del globo de la tarea bajo el puntero, o null si no hay.
 *
 * El globo es decorativo (los mismos datos estan en el `aria-label` de la
 * barra) y no intercede con el puntero, para no estorbar al arrastre.
 */
const globo = ref(null)

/**
 * El puntero entra en una barra: se arma el globo con los datos de la tarea y
 * la posicion del puntero. El estado sale por etiqueta, con el store que ya
 * usan la semana y la barra.
 */
function alEntrar({ event, tarea }) {
  const estado = tarea.status
    ? columnLabel(tarea.status, estadosDe(tarea.project_id))
    : null
  globo.value = {
    titulo: tarea.title,
    proyecto: tarea.project_name,
    persona: tarea.assigned_name ?? null,
    inicio: tarea.start,
    fin: tarea.end,
    estado,
    avance: tarea.progress,
    x: event.clientX,
    y: event.clientY,
  }
}

/** El puntero sale de la barra: el globo se oculta. */
function alSalir() {
  globo.value = null
}

/** Foco de la barra: el grid es quien lo mueve con las flechas verticales. */
function alSeleccionar(payload) {
  barraEnfocada.value = payload.id
}

/** `Mayus+F10` o la tecla `Menu`: las dos abren el menu contextual. */
function esAperturaDeMenu(event) {
  if (event.key === 'F10') return event.shiftKey
  return event.key === 'ContextMenu' || event.key === 'Menu'
}

/**
 * Abre el menu contextual de la barra enfocada sin puntero, como el Gantt.
 *
 * El menu sale pegado a la barra (su esquina inferior izquierda en el
 * viewport) y el foco vuelve a la barra al cerrarse. Sin barra en el DOM no
 * hay menu: `abridor` queda null y el menu pierde el retorno del foco.
 */
function abrirMenuDeBarra(id) {
  const tarea = props.tasks.find((item) => item.id === id)
  if (!tarea) return
  const barra = document.querySelector(
    `[data-testid="week-task"][data-task-id="${id}"]`,
  )
  const caja = barra?.getBoundingClientRect()
  emit('contexto', {
    tipo: 'barra',
    tarea,
    x: caja ? caja.left : 0,
    y: caja ? caja.bottom : 0,
    abridor: barra ?? null,
  })
}

/**
 * Tecla sobre la barra enfocada.
 *
 * `ArrowUp`/`ArrowDown` (sin `Mayus`) mueven el foco a la barra visible
 * anterior o siguiente y saltan el foco real del DOM a ella, como el Gantt.
 * Con `Mayus` la combinacion la usa la vista para redimensionar, no para
 * mover el foco. `Mayus+F10` y la tecla `Menu` abren el menu de la barra
 * enfocada. El resto de teclas sube a la vista con el id de la barra.
 */
async function alTecla(payload) {
  const { event, id } = payload
  if (esAperturaDeMenu(event)) {
    event.preventDefault()
    event.stopPropagation()
    abrirMenuDeBarra(id)
    return
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    if (event.shiftKey) {
      // Con Mayus la combinacion la usa la vista para redimensionar: no se
      // mueve el foco, se sube tal cual.
      emit('tecla', event, id)
      return
    }
    event.preventDefault()
    const orden = barrasVisibles.value.map((tarea) => tarea.id)
    const indice = orden.indexOf(id)
    const destino = event.key === 'ArrowUp' ? indice - 1 : indice + 1
    if (destino >= 0 && destino < orden.length) {
      barraEnfocada.value = orden[destino]
      await nextTick()
      // El foco real debe saltar a la barra nueva: sin esto el teclado se
      // queda en la barra anterior y las flechas siguen moviendo la misma.
      document
        .querySelector(`[data-testid="week-task"][data-task-id="${barraEnfocada.value}"]`)
        ?.focus()
    }
    return
  }
  emit('tecla', event, id)
}

/**
 * Geometria de la rejilla, medida al vuelo contra el DOM.
 *
 * `table-fixed` deja las siete columnas de dia iguales, de modo que el ancho
 * de dia sale de restar la columna de nombres al ancho de la tabla. Cada
 * semana es un `<tbody>` con su `data-semana`, medido en coordenadas del
 * viewport: el hit-test solo necesita el rectangulo, las semanas y los dias.
 * Sin tabla montada, null.
 */
function medir() {
  const elemento = tabla.value
  if (!elemento) return null
  const caja = elemento.getBoundingClientRect()
  const nombre = elemento.querySelector('th')
  const anchoNombres = nombre ? nombre.getBoundingClientRect().right - caja.left : 0
  const anchoDia = (caja.right - caja.left - anchoNombres) / 7
  const semanas = [...elemento.querySelectorAll('tbody[data-semana]')].map((tbody) => {
    const recta = tbody.getBoundingClientRect()
    return {
      indice: Number(tbody.dataset.semana),
      top: recta.top,
      bottom: recta.bottom,
    }
  })
  return {
    izquierda: caja.left,
    derecha: caja.right,
    arriba: caja.top,
    abajo: caja.bottom,
    anchoNombres,
    anchoDia,
    semanas,
    dias: props.weeks,
  }
}

defineExpose({ medir })
</script>

<template>
  <table
    ref="tabla"
    class="w-full min-w-[42rem] table-fixed border-collapse text-cp-base"
    :data-testid="testid || undefined"
  >
    <CalendarWeek
      v-for="(layout, indice) in layouts"
      :key="indice"
      :days="layout.days"
      :filas="layout.filas"
      :non-working-days="nonWorkingDays"
      :editable-project-ids="editableProjectIds"
      :destino="destino"
      :semana-indice="indice"
      :barra-enfocada="idEnfocado"
      :departamentos="departamentos"
      @open-day="emit('open-day', $event)"
      @open-task="emit('open-task', $event)"
      @drag-start="emit('drag-start', $event)"
      @seleccionar="alSeleccionar"
      @tecla="alTecla"
      @contexto="emit('contexto', $event)"
      @entrar="alEntrar"
      @salir="alSalir"
      @crear="emit('crear', $event)"
    />
  </table>

  <!--
    Globo de la tarea bajo el puntero: decorativo, no intercede con el
    arrastre. No se pinta mientras dura el arrastre, que estorba, como en el
    Gantt. Vive aqui, no en la vista, porque es quien ve las barras.
  -->
  <CalendarTooltip
    v-if="!arrastrando"
    :datos="globo"
    :x="globo?.x ?? 0"
    :y="globo?.y ?? 0"
  />
</template>
