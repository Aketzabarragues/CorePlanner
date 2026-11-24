<script setup>
/**
 * Panel de columnas del panel de nombres del diagrama de Gantt.
 *
 * Es el mismo patron que el de visibilidad: un boton que abre una lista de
 * casillas. Lo que se elige son las columnas que lleva el panel de nombres,
 * y la eleccion se escribe en la URL, no en la vista: recargar deja el panel
 * como estaba.
 */
import { onMounted, onUnmounted, ref } from 'vue'

import AppIcon from '../AppIcon.vue'

const props = defineProps({
  /** Columnas que se pueden elegir, con su etiqueta. */
  columnas: { type: Array, required: true },
  /** Claves de las columnas elegidas. */
  seleccionadas: { type: Array, default: () => [] },
})

const emit = defineEmits(['alternar'])

const abierto = ref(false)
const root = ref(null)

/** Cierra el panel cuando se pulsa fuera. */
function onDocumentClick(event) {
  if (!root.value?.contains(event.target)) abierto.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
      :aria-expanded="abierto"
      data-testid="gantt-toggle-columns"
      @click="abierto = !abierto"
    >
      <span class="h-4 w-4 text-slate-500"><AppIcon name="columns" /></span>
      Columnas
      <span
        v-if="props.seleccionadas.length"
        class="rounded-full bg-siemens-900 px-1.5 text-[10px] font-semibold text-white"
        data-testid="gantt-columns-count"
      >
        {{ props.seleccionadas.length }}
      </span>
    </button>

    <div
      v-if="abierto"
      class="absolute left-0 z-30 mt-1 w-52 rounded-md bg-white p-3 shadow-lg ring-1 ring-slate-200"
      data-testid="gantt-columns-panel"
    >
      <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Columnas
      </span>

      <label
        v-for="columna in props.columnas"
        :key="columna.key"
        class="mt-2 flex items-center gap-2 text-sm text-slate-700"
      >
        <input
          type="checkbox"
          class="h-4 w-4"
          :checked="props.seleccionadas.includes(columna.key)"
          :data-testid="`gantt-column-${columna.key}`"
          @change="emit('alternar', columna.key)"
        />
        {{ columna.label }}
      </label>
    </div>
  </div>
</template>
