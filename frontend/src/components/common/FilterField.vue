<script setup>
/**
 * Campo de filtro: su etiqueta y su desplegable.
 *
 * El `label` envuelve al `select`, asi que el control que lleva el valor es el
 * que nombra la etiqueta: el nombre accesible no depende de si la etiqueta se
 * ve o no.
 *
 * La etiqueta va **en linea** a la izquierda del desplegable, nunca encima:
 * encima el grupo de filtros mide 64 px y empuja la cabecera a dos lineas.
 * Con `etiquetaVisible` a `false` la etiqueta queda para el lector de pantalla
 * (`sr-only`) y el valor seleccionado, que se nombra solo, dice que es.
 *
 * El desplegable va acotado (`ancho`, con la clase literal en la plantilla del
 * padre para que Tailwind la compile) y lleva el `title` con la etiqueta y el
 * valor: el texto se recorta y hay que poder leerlo entero.
 */
import { computed } from 'vue'

const props = defineProps({
  /** Texto de la etiqueta del campo. */
  label: { type: String, required: true },
  /** Opciones: `{ value, label }`. */
  options: { type: Array, required: true },
  /** Valor seleccionado. */
  modelValue: { type: String, default: '' },
  /** `data-testid` del desplegable. */
  testid: { type: String, default: '' },
  /** Clase de ancho maximo del desplegable. Literal, no se construye. */
  ancho: { type: String, default: 'max-w-[176px]' },
  /** Etiqueta visible a la izquierda del desplegable. */
  etiquetaVisible: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

/** Lo que se ve en el desplegable, para el `title`. */
const textoSeleccionado = computed(
  () => props.options.find((item) => item.value === props.modelValue)?.label ?? '',
)
</script>

<template>
  <label class="inline-flex min-w-0 items-center gap-1.5">
    <span
      class="text-cp-xs font-medium text-texto-suave"
      :class="etiquetaVisible ? 'shrink-0' : 'sr-only'"
    >
      {{ label }}
    </span>

    <span class="relative inline-flex min-w-0 items-center">
      <select
        class="min-h-10 w-full min-w-0 cursor-pointer appearance-none truncate rounded-control border border-borde-fuerte bg-tarjeta-suave py-1.5 pl-3 pr-8 text-cp-sm font-medium text-texto transition-colors hover:border-foco hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
        :class="ancho"
        :value="modelValue"
        :title="`${label}: ${textoSeleccionado}`"
        :data-testid="testid || undefined"
        @change="emit('update:modelValue', $event.target.value)"
      >
        <option v-for="item in options" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select>

      <svg
        class="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-texto-tenue"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </span>
  </label>
</template>
