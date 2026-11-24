<script setup>
/**
 * Campo de filtro: una etiqueta y su desplegable.
 *
 * El `label` envuelve al `select`, asi que el control que lleva el valor es
 * el que nombra la etiqueta. El marcado es el que tienen los filtros de las
 * tres vistas de planificacion (Gantt, matriz de capacidad y calendario).
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
  <label class="text-xs font-medium text-slate-600">
    <span class="mb-1 block">{{ label }}</span>
    <select
      class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
      :value="modelValue"
      :data-testid="testid || undefined"
      @change="emit('update:modelValue', $event.target.value)"
    >
      <option v-for="item in options" :key="item.value" :value="item.value">{{ item.label }}</option>
    </select>
  </label>
</template>
