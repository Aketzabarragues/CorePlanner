<script setup>
/**
 * Globo de datos de una tarea del diagrama de Gantt.
 *
 * Es decorativo: los mismos datos ya estan en el `aria-label` de la barra, asi
 * que va con `aria-hidden` y el lector de pantalla no los lee dos veces. Tampoco
 * captura el puntero (`pointer-events-none`), para no estorbar ni al arrastre
 * ni a la seleccion de texto.
 *
 * Sigue al puntero como el fantasma del arrastre: posicion `fixed` en pixeles
 * del viewport. Si a la derecha o abajo no cabe, se coloca al otro lado, para
 * que no se salga de la ventana.
 */
import { computed } from 'vue'

import { shortMonthName } from '../../utils/month'
import { parseIsoDate } from '../../utils/ganttScale'

const props = defineProps({
  /**
   * Datos de la tarea: { titulo, inicio, fin, duracion, avance, dependencias,
   * critica }.
   *
   * Las dependencias son { titulo, tipo, sentido }, con el tipo del vinculo
   * (`precedes` o `relates`) y el sentido desde la tarea: `requisito` (de
   * esta depende), `dependiente` (esta es requisito) o `relacionada`.
   *
   * `critica` dice que la tarea es de la ruta critica: solo llega con el
   * interruptor encendido.
   */
  datos: { type: Object, default: null },
  /** Posicion del puntero en el viewport, en pixeles. */
  x: { type: Number, default: 0 },
  /** Posicion del puntero en el viewport, en pixeles. */
  y: { type: Number, default: 0 },
})

/** Ancho de la tarjeta: fijo, para saber cuando hay que girarla. */
const ANCHO = 256
/** Alto estimado de la tarjeta: para saber cuando hay que subirla. */
const ALTO = 220

/** Fecha en espanol, corta: "5 mar 2025". */
function fecha(iso) {
  const dia = parseIsoDate(iso)
  return `${dia.getUTCDate()} ${shortMonthName(dia.getUTCMonth() + 1)} ${dia.getUTCFullYear()}`
}

/**
 * Dependencias agrupadas por sentido.
 *
 * Cada grupo sale solo si tiene entradas: la tarjeta no deja huecos vacios.
 */
const grupos = computed(() => {
  const entradas = props.datos?.dependencias ?? []
  const porSentido = { requisito: [], dependiente: [], relacionada: [] }
  for (const entrada of entradas) {
    const destino = porSentido[entrada.sentido]
    if (destino) destino.push(entrada)
  }
  return [
    { titulo: 'Depende de', entradas: porSentido.requisito },
    { titulo: 'Requerida por', entradas: porSentido.dependiente },
    { titulo: 'Relacionada con', entradas: porSentido.relacionada },
  ].filter((grupo) => grupo.entradas.length)
})

/** Posicion de la tarjeta: pegada al puntero y girada si no cabe. */
const estilo = computed(() => {
  const anchoVentana = typeof window === 'undefined' ? 0 : window.innerWidth
  const altoVentana = typeof window === 'undefined' ? 0 : window.innerHeight
  const aLaDerecha = props.x + 16 + ANCHO > anchoVentana
  const aLaBaja = props.y + 16 + ALTO > altoVentana
  return {
    left: `${aLaDerecha ? Math.max(8, props.x - ANCHO - 12) : props.x + 16}px`,
    top: `${aLaBaja ? Math.max(8, props.y - ALTO - 12) : props.y + 16}px`,
  }
})
</script>

<template>
  <div
    v-if="datos"
    class="pointer-events-none fixed z-50 w-64 rounded-control border border-borde bg-tarjeta px-2.5 py-2 shadow-flotante"
    :style="estilo"
    aria-hidden="true"
    data-testid="gantt-tooltip"
  >
    <p class="text-cp-micro font-semibold uppercase tracking-wide text-texto-tenue">Tarea</p>
    <p class="text-cp-xs font-semibold leading-tight text-texto">{{ datos.titulo }}</p>

    <dl class="mt-1.5 space-y-0.5 text-cp-xs leading-tight">
      <div class="flex gap-1.5">
        <dt class="w-16 shrink-0 text-texto-tenue">Inicio</dt>
        <dd class="text-texto-suave">{{ fecha(datos.inicio) }}</dd>
      </div>
      <div class="flex gap-1.5">
        <dt class="w-16 shrink-0 text-texto-tenue">Fin</dt>
        <dd class="text-texto-suave">{{ fecha(datos.fin) }}</dd>
      </div>
      <div class="flex gap-1.5">
        <dt class="w-16 shrink-0 text-texto-tenue">Duración</dt>
        <dd class="text-texto-suave">
          {{ datos.duracion }} {{ datos.duracion === 1 ? 'día' : 'días' }}
        </dd>
      </div>
      <div v-if="datos.avance > 0" class="flex gap-1.5">
        <dt class="w-16 shrink-0 text-texto-tenue">Avance</dt>
        <dd class="text-texto-suave">{{ datos.avance }} %</dd>
      </div>
      <div v-if="datos.critica" class="flex gap-1.5">
        <dt class="w-16 shrink-0 text-texto-tenue">Ruta</dt>
        <dd class="text-texto-suave">Crítica</dd>
      </div>
    </dl>

    <div v-for="grupo in grupos" :key="grupo.titulo" class="mt-1.5">
      <p class="text-cp-micro font-semibold uppercase tracking-wide text-texto-tenue">
        {{ grupo.titulo }}
      </p>
      <ul class="mt-0.5 space-y-0.5">
        <li
          v-for="(entrada, indice) in grupo.entradas"
          :key="`${grupo.titulo}-${indice}`"
          class="flex items-baseline gap-1.5 text-cp-xs leading-tight text-texto-suave"
        >
          <span class="min-w-0 flex-1 truncate">{{ entrada.titulo }}</span>
          <!-- El tipo del vinculo: FS es fin a inicio, el unico que hay. -->
          <span
            v-if="entrada.tipo === 'precedes'"
            class="shrink-0 rounded-pastilla bg-tarjeta-suave px-1 text-cp-micro font-medium text-texto-tenue"
          >FS</span>
        </li>
      </ul>
    </div>
  </div>
</template>
