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
      class="inline-flex min-h-10 w-10 items-center justify-center rounded-control border border-borde-fuerte bg-tarjeta text-texto 2xl:w-auto 2xl:gap-2 2xl:px-3"
      :aria-expanded="abierto"
      aria-label="Columnas del panel de nombres"
      title="Columnas del panel de nombres"
      data-testid="gantt-toggle-columns"
      @click="abierto = !abierto"
    >
      <span class="h-4 w-4 text-texto-tenue"><AppIcon name="columns" /></span>
      <span class="hidden text-cp-sm font-medium 2xl:inline">Columnas</span>
      <span
        v-if="props.seleccionadas.length"
        class="rounded-pastilla bg-primario-fuerte px-1.5 text-cp-micro font-semibold text-sobre-primario"
        data-testid="gantt-columns-count"
      >
        {{ props.seleccionadas.length }}
      </span>
    </button>

    <div
      v-if="abierto"
      class="absolute left-0 z-30 mt-1 w-52 rounded-control bg-tarjeta p-3 shadow-flotante ring-1 ring-borde"
      data-testid="gantt-columns-panel"
    >
      <span class="text-cp-micro font-semibold uppercase tracking-wide text-texto-tenue">
        Columnas
      </span>

      <label
        v-for="columna in props.columnas"
        :key="columna.key"
        class="mt-2 flex items-center gap-2 text-cp-sm text-texto"
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
