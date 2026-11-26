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
      class="mb-3 flex flex-wrap items-center justify-between gap-2"
    >
      <h2 v-if="title" class="font-titulo text-cp-titulo font-bold text-texto-marca">
        {{ title }}
      </h2>
      <span v-if="nota" class="text-cp-xs text-texto-tenue">{{ nota }}</span>
      <slot name="header-extra" />
    </div>
    <slot />
  </section>
</template>
