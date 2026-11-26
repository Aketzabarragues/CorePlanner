<script setup>
/**
 * Grupo de botones que eligen una opcion entre varias.
 *
 * Es el control de una sola eleccion de la aplicacion: el contenedor lleva
 * `role="group"` con su nombre accesible y cada boton, `aria-pressed`, para que
 * un lector de pantalla sepa cual es el activo. El aspecto es el mismo en
 * todos los usos (escala del Gantt, modo de la celda, vista del calendario):
 * pastilla agrupada, pista `bg-tarjeta-suave` y opcion activa en `bg-tarjeta`
 * con `shadow-control`.
 *
 * Altura: las opciones miden 40 px (`min-h-10`) y la pista completa 44 px
 * (`p-1`): la zona tactil es la cabecera entera.
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
  <div class="inline-flex items-center gap-0.5 rounded-control bg-tarjeta-suave p-1" role="group" :aria-label="label">
    <button
      v-for="item in options"
      :key="item.value"
      type="button"
      class="min-h-10 rounded-control px-3 py-1.5 text-cp-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
      :class="
        modelValue === item.value
          ? 'bg-tarjeta text-texto-marca font-semibold shadow-control'
          : 'text-texto-suave hover:bg-tarjeta/70 hover:text-texto'
      "
      :aria-pressed="modelValue === item.value"
      :data-testid="testidPrefix ? `${testidPrefix}-${item.value}` : undefined"
      @click="emit('update:modelValue', item.value)"
    >{{ item.label }}</button>
  </div>
</template>
