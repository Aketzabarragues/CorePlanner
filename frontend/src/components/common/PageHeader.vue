<script setup>
/**
 * Cabecera de una pantalla.
 *
 * Titulo, subtitulo y acciones, siempre en el mismo orden y con el mismo
 * aspecto en todas las pantallas. Las migas se quedan en el shell, que ya las
 * pinta encima de la vista: repetirlas aqui seria verlas dos veces.
 */
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
})
</script>

<template>
  <header class="mb-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-siemens-900">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1 text-sm text-slate-500">{{ subtitle }}</p>
      </div>

      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
