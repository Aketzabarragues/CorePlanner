<script setup>
/**
 * Columna fija de nombres del diagrama de Gantt.
 *
 * Es la lista de tareas, no de personas: el titulo de la tarea y debajo
 * `persona · proyecto`. La barra ya va coloreada por persona; repetir el
 * nombre en cada fila seria ruido.
 *
 * La columna no hace scroll vertical propio: su pista interior se traslada
 * con el mismo desplazamiento que el diagrama, para que fila y barra no se
 * despeguen. El contenido es la version HTML de lo que el SVG ya anuncia:
 * por eso la cabecera y la pista van `aria-hidden` y solo el asa de
 * redimension queda expuesta al lector de pantalla.
 *
 * La columna es la otra mitad de la fila: avisa de la fila bajo el puntero
 * (`fila-raton`) y recibe que filas hay que pintar (la del puntero y la de
 * la barra enfocada). El estado lo lleva el chart, que es quien tiene las
 * dos mitades del diagrama.
 *
 * El ancho es redimensionable: un asa en el borde derecho lo cambia, con el
 * raton o con el teclado. El ancho elegido lo guarda el chart; mientras
 * nadie lo toca, la columna conserva el ancho de sus clases (240 px, o
 * 160 px en pantalla estrecha).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { GANTT_METRICS } from '../../utils/ganttMetrics'

const props = defineProps({
  /** Filas del layout, ya enriquecidas: [{ type, rowIndex, ... }]. */
  filas: { type: Array, required: true },
  /** Desplazamiento vertical del diagrama, en pixeles. */
  desplazamiento: { type: Number, default: 0 },
  /** Fila bajo el puntero: la que se pinta como resaltada. */
  filaResaltada: { type: Number, default: null },
  /** Fila de la barra enfocada: se marca aunque el puntero este en otra. */
  filaActiva: { type: Number, default: null },
  /** Ancho elegido por la persona: null = el que dan las clases. */
  ancho: { type: Number, default: null },
  /** Ancho minimo y maximo de la columna, en pixeles. */
  minimo: { type: Number, default: GANTT_METRICS.namesWidthSmall },
  maximo: { type: Number, default: 480 },
})

const emit = defineEmits(['fila-raton', 'redimension'])

/** Raiz de la columna: su ancho es el que se mide. */
const raiz = ref(null)
/**
 * Ancho efectivo de la columna, medido.
 *
 * Solo importa mientras nadie redimensiona: es el ancho que dan las clases
 * (240 px, o 160 px en pantalla estrecha) y el punto de partida del arrastre.
 */
const anchoMedido = ref(GANTT_METRICS.namesWidth)

/** Ancho con el que se trabaja: el elegido o, si no hay, el medido. */
const anchoEfectivo = computed(() => props.ancho ?? anchoMedido.value)

/** Ancho que se anuncia en el asa: siempre en pixeles enteros. */
const anchoAnunciado = computed(() => Math.round(anchoEfectivo.value))

/** Cabecera de la columna: la altura es la del eje, la misma en los dos. */
const cabecera = 'Tarea'

/**
 * Tinte de la fila: el del puntero y el de la barra enfocada.
 *
 * Los dos tintes son los del diagrama (`gantt.css`): la fila se lee igual en
 * las dos mitades. Con el puntero sobre la fila enfocada solo se pinta el
 * tinte de la enfocada, que es mas marcado.
 */
function claseDeFila(fila) {
  return {
    'gantt__nombre-fila--activa': props.filaActiva === fila.rowIndex,
    'gantt__nombre-fila--resaltada':
      props.filaResaltada === fila.rowIndex && props.filaResaltada !== props.filaActiva,
  }
}

/** El puntero entra en una fila: el chart la resalta en las dos mitades. */
function alEntrar(fila) {
  emit('fila-raton', fila.rowIndex)
}

/** El puntero se va: no queda ninguna fila resaltada por raton. */
function alSalir() {
  emit('fila-raton', null)
}

/* ------------------------------------------------------------------ */
/* Ancho redimensionable                                               */
/* ------------------------------------------------------------------ */

/** Paso de las flechas del teclado: 16 px; con Mayus, de golpe mas. */
const PASO = 16
const PASO_GRANDE = 64

/** El asa esta agarrada: el ancho sigue al puntero. */
const arrastrando = ref(false)
/** Puntero y ancho en el momento de agarrar el asa. */
let inicioX = 0
let anchoInicial = 0

/**
 * Agarrar el asa: el ancho sigue al puntero a partir del ancho vigente.
 *
 * El puntero queda capturado en el asa, asi que el gesto sigue aunque el
 * raton se salga de la columna. El ancho inicial es el efectivo: el elegido
 * si la columna se redimensiono antes, el medido si no.
 */
function alAgarrar(event) {
  if (event.button !== undefined && event.button !== 0) return
  event.preventDefault()
  arrastrando.value = true
  inicioX = event.clientX
  anchoInicial = anchoEfectivo.value
  event.currentTarget?.setPointerCapture?.(event.pointerId)
}

/** Arrastrar el asa: el ancho pedido es el inicial mas el desplazamiento. */
function alArrastrar(event) {
  if (!arrastrando.value) return
  emit('redimension', anchoInicial + (event.clientX - inicioX))
}

/** Soltar el asa: el gesto se acaba. */
function alSoltar(event) {
  if (!arrastrando.value) return
  arrastrando.value = false
  const asa = event.currentTarget
  if (asa?.hasPointerCapture?.(event.pointerId)) asa.releasePointerCapture(event.pointerId)
}

/**
 * Teclado del asa: las flechas cambian el ancho, con Mayus de golpe mas.
 *
 * `Home` y `End` van a los limites. El ancho pedido lo acota el chart, que
 * es quien guarda el valor.
 */
function alTecla(event) {
  let ancho = null
  if (event.key === 'ArrowLeft') {
    ancho = anchoEfectivo.value - (event.shiftKey ? PASO_GRANDE : PASO)
  } else if (event.key === 'ArrowRight') {
    ancho = anchoEfectivo.value + (event.shiftKey ? PASO_GRANDE : PASO)
  } else if (event.key === 'Home') {
    ancho = props.minimo
  } else if (event.key === 'End') {
    ancho = props.maximo
  }
  if (ancho === null) return
  event.preventDefault()
  emit('redimension', ancho)
}

/* ------------------------------------------------------------------ */
/* Medida del ancho por defecto                                        */
/* ------------------------------------------------------------------ */

let observador = null

/** Ancho real de la columna: el de las clases mientras nadie lo cambie. */
function medir() {
  const ancho = raiz.value?.clientWidth
  if (ancho) anchoMedido.value = ancho
}

onMounted(() => {
  medir()
  // Sin `ResizeObserver` (por ejemplo en jsdom) el ancho se queda en el que
  // se midio al montar: no se rompe nada por no poder observar.
  if (typeof ResizeObserver === 'undefined') return
  observador = new ResizeObserver(medir)
  if (raiz.value) observador.observe(raiz.value)
})

onBeforeUnmount(() => {
  observador?.disconnect()
  observador = null
})
</script>

<template>
  <div
    ref="raiz"
    class="gantt__nombres relative shrink-0 border-r border-slate-200"
    :class="ancho === null ? 'w-60 max-sm:w-40' : ''"
    :style="ancho === null ? undefined : { width: `${ancho}px` }"
    data-testid="gantt-names"
    @mouseleave="alSalir"
  >
    <!--
      La cabecera reserva el mismo alto que la del eje (`GANTT_METRICS`): el
      numero es el unico, las dos piezas no se descuadran.
    -->
    <div
      class="flex items-center border-b border-slate-200 bg-slate-100 px-3"
      :style="{ height: `${GANTT_METRICS.headerHeight}px` }"
      aria-hidden="true"
    >
      <span class="text-xs font-semibold text-siemens-900">{{ cabecera }}</span>
    </div>

    <div class="gantt__nombres-cuerpo overflow-hidden" aria-hidden="true">
      <div
        class="gantt__nombres-pista"
        :style="{ transform: `translateY(${-desplazamiento}px)` }"
      >
        <!-- Una fila por entrada del layout, en el orden del diagrama. -->
        <template v-for="fila in filas" :key="fila.rowIndex">
          <!-- Fila de grupo: la franja de color, si la hay, y el nombre. -->
          <div
            v-if="fila.type === 'group'"
            class="flex h-9 items-center gap-2 border-b border-slate-200 bg-slate-100 px-3"
            :class="claseDeFila(fila)"
            @mouseenter="alEntrar(fila)"
            @mouseleave="alSalir"
          >
            <span
              v-if="fila.color"
              class="h-4 w-1 shrink-0 rounded-full"
              :style="{ backgroundColor: fila.color }"
            />
            <span class="truncate text-[13px] font-semibold text-siemens-900">
              {{ fila.label }}
            </span>
          </div>

          <!-- Fila de tarea: el titulo y la persona con el proyecto. -->
          <div
            v-else
            class="flex h-9 flex-col justify-center border-b border-slate-100 px-3"
            :class="claseDeFila(fila)"
            @mouseenter="alEntrar(fila)"
            @mouseleave="alSalir"
          >
            <span class="truncate text-xs font-medium text-slate-700" :title="fila.title">
              {{ fila.title }}
            </span>
            <span class="truncate text-[10px] text-slate-400">
              {{ fila.assignedName ?? 'Sin asignar' }} · {{ fila.projectName }}
            </span>
          </div>
        </template>
      </div>
    </div>

    <!--
      Asa de redimension: separa la columna de nombres del diagrama. Es un
      separador con valor (el ancho), asi que el teclado tambien la mueve:
      las flechas cambian el ancho y `Home` y `End` van a los limites.
    -->
    <div
      role="separator"
      aria-orientation="vertical"
      :aria-valuenow="anchoAnunciado"
      :aria-valuemin="minimo"
      :aria-valuemax="maximo"
      aria-label="Ancho de la columna de tareas"
      tabindex="0"
      class="group absolute inset-y-0 right-0 z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-siemens-500"
      data-testid="gantt-names-handle"
      @pointerdown="alAgarrar"
      @pointermove="alArrastrar"
      @pointerup="alSoltar"
      @pointercancel="alSoltar"
      @keydown="alTecla"
    >
      <span
        class="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-300 transition-colors group-hover:bg-siemens-500"
      />
    </div>
  </div>
</template>
