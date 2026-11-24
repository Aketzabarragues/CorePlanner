<script setup>
/**
 * Grupo de botones que eligen una opcion entre varias.
 *
 * Es el control de una sola eleccion de la aplicacion: el contenedor lleva
 * `role="group"` con su nombre accesible y cada boton, `aria-pressed`, para que
 * un lector de pantalla sepa cual es el activo. El aspecto es el mismo en
 * todos los usos (escala del Gantt, modo de la celda, vista del calendario).
 *
 * `testidPrefix` existe para que el boton conserve el `data-testid` que ya
 * buscan las pruebas de la vista que lo usa.
 */
defineProps({
  /** Opciones: `{ value, label }`. */
  options: { type: Array, required: true },
  /** Valor seleccionado. */
  modelValue: { type: String, default: '' },
  /** Nombre accesible del grupo. */
  label: { type: String, required: true },
  /** Prefijo del `data-testid` de cada boton: `${prefijo}-${value}`. */
  testidPrefix: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <div class="flex items-center gap-1" role="group" :aria-label="label">
    <button
      v-for="item in options"
      :key="item.value"
      type="button"
      class="rounded border px-3 py-1.5 text-sm"
      :class="
        modelValue === item.value
          ? 'border-siemens-900 bg-siemens-900 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      "
      :aria-pressed="modelValue === item.value"
      :data-testid="testidPrefix ? `${testidPrefix}-${item.value}` : undefined"
      @click="emit('update:modelValue', item.value)"
    >{{ item.label }}</button>
  </div>
</template>
