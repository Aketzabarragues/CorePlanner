<script setup>
/**
 * Tarjeta KPI.
 *
 * La tarjeta entera es pulsable: con destino se renderiza como RouterLink,
 * sin destino como div. La insignia de estado va arriba a la derecha y lleva
 * punto opcional. Con barra null no se pinta barra: sin limite definido no
 * se inventa un progreso.
 *
 * El slot `valor` sustituye la cifra si la vista la lleva con test id propio
 * o con un color que no sale de la plantilla; el prop `valor` sigue mandando
 * el caso "sin capacidad" (atenuado y sin barra).
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
  etiqueta: { type: String, required: true },
  valor: { type: [String, Number], required: true },
  detalle: { type: String, default: '' },
  insignia: {
    type: Object,
    default: null,
    // { tono: 'ok' | 'aviso' | 'peligro' | 'info' | 'neutro', texto: String, punto: Boolean }
  },
  barra: { type: Number, default: null },
  nota: { type: String, default: '' },
  to: { type: String, default: '' },
  testId: { type: String, default: '' },
})

const TONOS = {
  ok: 'bg-ok-fondo text-ok-texto',
  aviso: 'bg-aviso-fondo text-aviso-texto',
  peligro: 'bg-peligro-fondo text-peligro-texto',
  info: 'bg-info-fondo text-info-texto',
  neutro: 'bg-neutro-fondo text-neutro-texto',
}
const PUNTOS = {
  ok: 'bg-ok-punto',
  aviso: 'bg-aviso-punto',
  peligro: 'bg-peligro-punto',
  info: 'bg-info-punto',
  neutro: 'bg-neutro-punto',
}

/** El valor "sin capacidad" no es una cifra: va atenuado y sin barra. */
const sinCapacidad = computed(() => props.valor === 'sin capacidad')
const claseInsignia = computed(() =>
  props.insignia ? TONOS[props.insignia.tono] ?? TONOS.neutro : '',
)
const puntoInsignia = computed(() =>
  props.insignia?.punto ? PUNTOS[props.insignia.tono] ?? PUNTOS.neutro : '',
)
</script>

<template>
  <component
    :is="to ? RouterLink : 'div'"
    :to="to || undefined"
    class="group block rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-tarjeta transition-colors hover:border-primario/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
    :data-testid="testId || undefined"
  >
    <div class="flex items-start justify-between gap-2">
      <span class="text-cp-micro font-semibold uppercase tracking-wider text-texto-tenue">
        {{ etiqueta }}
      </span>
      <span
        v-if="insignia"
        class="inline-flex items-center gap-1.5 rounded-pastilla px-2 py-0.5 font-mono text-cp-micro font-semibold"
        :class="claseInsignia"
      >
        <span
          v-if="puntoInsignia"
          class="h-1.5 w-1.5 flex-none rounded-full"
          :class="puntoInsignia"
          aria-hidden="true"
        ></span>
        {{ insignia.texto }}
      </span>
    </div>

    <div class="mt-2 flex items-baseline gap-2">
      <slot name="valor">
        <span
          class="whitespace-nowrap font-mono text-cp-kpi font-bold tabular-nums"
          :class="sinCapacidad ? 'text-texto-tenue' : 'text-texto-marca'"
        >
          {{ valor }}
        </span>
      </slot>
      <span v-if="detalle" class="truncate font-mono text-cp-sm text-texto-tenue" :title="detalle">{{ detalle }}</span>
    </div>

    <div
      v-if="barra !== null && barra !== undefined && !sinCapacidad"
      class="mt-3 h-1.5 w-full overflow-hidden rounded-pastilla bg-tarjeta-suave"
    >
      <div class="h-full rounded-pastilla bg-primario" :style="{ width: `${barra}%` }"></div>
    </div>

    <p v-if="nota" class="mt-2.5 text-cp-xs text-texto-tenue">{{ nota }}</p>
  </component>
</template>
