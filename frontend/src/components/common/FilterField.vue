<script setup>
/**
 * Campo de filtro: una etiqueta y su desplegable.
 *
 * El `label` envuelve al `select`, asi que el control que lleva el valor es
 * el que nombra la etiqueta. El marcado es el que tienen los filtros de las
 * tres vistas de planificacion (Gantt, matriz de capacidad y calendario):
 * select con fondo `bg-tarjeta-suave`, borde `border-borde-fuerte` y chevron
 * decorativo a la derecha.
 *
 * El valor viaja por `update:modelValue`: la vista decide que hacer con el
 * (escribirlo en la URL, cambiar su estado).
 */
defineProps({
  /** Texto de la etiqueta del campo. */
  label: { type: String, required: true },
  /** Opciones: `{ value, label }`. */
  options: { type: Array, required: true },
  /** Valor seleccionado. */
  modelValue: { type: String, default: '' },
  /** `data-testid` del desplegable. */
  testid: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <label class="inline-flex flex-col gap-1">
    <span class="text-cp-xs font-medium text-texto-suave">{{ label }}</span>
    <span class="relative inline-flex items-center">
      <select
        class="min-h-10 cursor-pointer appearance-none rounded-control border border-borde-fuerte bg-tarjeta-suave py-1.5 pl-3 pr-8 text-cp-sm font-medium text-texto transition-colors hover:border-foco hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
        :value="modelValue"
        :data-testid="testid || undefined"
        @change="emit('update:modelValue', $event.target.value)"
      >
        <option v-for="item in options" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
      <svg
        class="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-texto-tenue"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </span>
  </label>
</template>
