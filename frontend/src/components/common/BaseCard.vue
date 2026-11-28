<script setup>
/**
 * Tarjeta base de seccion.
 *
 * Caja redondeada con borde, fondo y sombra. Cabecera opcional (titulo y
 * nota) y cuerpo en el slot por defecto.
 */
defineProps({
  title: { type: String, default: '' },
  nota: { type: String, default: '' },
})
</script>

<template>
  <section class="rounded-tarjeta border border-borde bg-tarjeta p-5 shadow-tarjeta">
    <div
      v-if="title || nota || $slots['header-extra']"
      class="mb-3 flex flex-wrap items-start justify-between gap-x-2 gap-y-1"
    >
      <div class="min-w-0">
        <h2 v-if="title" class="font-titulo text-cp-titulo font-bold text-texto-marca">
          {{ title }}
        </h2>
        <p v-if="nota" class="mt-0.5 text-cp-xs text-texto-tenue">{{ nota }}</p>
      </div>
      <div
        v-if="$slots['header-extra']"
        class="flex flex-wrap items-center justify-end gap-2"
      >
        <slot name="header-extra" />
      </div>
    </div>
    <slot />
  </section>
</template>
