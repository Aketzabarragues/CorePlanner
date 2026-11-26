<script setup>
/**
 * Globo de datos de una tarea del calendario.
 *
 * Es decorativo: los mismos datos ya estan en el `aria-label` de la barra, asi
 * que va con `aria-hidden` y el lector de pantalla no los lee dos veces.
 * Tampoco captura el puntero (`pointer-events-none`), para no estorbar ni al
 * arrastre ni a la seleccion de texto.
 *
 * Sigue al puntero como el del Gantt: posicion `fixed` en pixeles del
 * viewport. Si a la derecha o abajo no cabe, se coloca al otro lado, para que
 * no se salga de la ventana.
 */
import { computed } from 'vue'

import { shortMonthName } from '../../utils/month'
import { parseIsoDate } from '../../utils/ganttScale'

const props = defineProps({
  /**
   * Datos de la tarea: { titulo, proyecto, persona, inicio, fin, estado,
   * avance }. `persona` y `estado` pueden ser null: la fila no se pinta.
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
    class="pointer-events-none fixed z-50 w-64 rounded-control bg-lateral-fondo p-3 text-cp-xs text-lateral-texto shadow-flotante"
    :style="estilo"
    aria-hidden="true"
    data-testid="calendar-tooltip"
  >
    <p class="text-cp-micro font-semibold uppercase tracking-wide text-lateral-texto-tenue">Tarea</p>
    <p class="text-cp-sm font-semibold leading-tight text-lateral-activo-texto">{{ datos.titulo }}</p>

    <dl class="mt-1.5 space-y-0.5 text-cp-xs leading-tight">
      <div class="flex gap-1.5">
        <dt class="w-16 shrink-0 text-lateral-texto-tenue">Proyecto</dt>
        <dd class="text-lateral-texto">{{ datos.proyecto }}</dd>
      </div>
      <div v-if="datos.persona" class="flex gap-1.5">
        <dt class="w-16 shrink-0 text-lateral-texto-tenue">Persona</dt>
        <dd class="text-lateral-texto">{{ datos.persona }}</dd>
      </div>
      <div class="flex gap-1.5">
        <dt class="w-16 shrink-0 text-lateral-texto-tenue">Rango</dt>
        <dd class="text-lateral-texto">Del {{ fecha(datos.inicio) }} al {{ fecha(datos.fin) }}</dd>
      </div>
      <div v-if="datos.estado" class="flex gap-1.5">
        <dt class="w-16 shrink-0 text-lateral-texto-tenue">Estado</dt>
        <dd class="text-lateral-texto">{{ datos.estado }}</dd>
      </div>
      <div v-if="datos.avance > 0" class="flex gap-1.5">
        <dt class="w-16 shrink-0 text-lateral-texto-tenue">Avance</dt>
        <dd class="text-lateral-texto">{{ datos.avance }} %</dd>
      </div>
    </dl>
  </div>
</template>
