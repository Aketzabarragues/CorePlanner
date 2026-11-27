<script setup>
/**
 * Boton de ayuda de la cabecera de vista.
 *
 * Boton `?` de 20 px con tooltip oscuro. Se abre al pasar por encima, al
 * recibir foco (teclado) y al hacer clic; se cierra con Escape. El lector
 * de pantalla lee el nombre del boton ("Ayuda"); el tooltip lleva
 * role="tooltip" y el boton le apunta con aria-controls.
 */
import { ref } from 'vue'

defineProps({
  texto: { type: String, required: true },
})

const abierto = ref(false)
</script>

<template>
  <span class="relative inline-flex">
    <button
      type="button"
      class="flex h-5 w-5 items-center justify-center rounded-pastilla bg-tarjeta-suave text-cp-xs font-semibold text-texto-suave transition-colors hover:bg-tarjeta hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
      aria-label="Ayuda"
      :aria-expanded="abierto ? 'true' : 'false'"
      aria-controls="cp-help-tip"
      @click="abierto = !abierto"
      @keydown.esc="abierto = false"
      @focus="abierto = true"
      @blur="abierto = false"
      @mouseenter="abierto = true"
      @mouseleave="abierto = false"
    >
      <span aria-hidden="true">?</span>
    </button>

    <span
      v-show="abierto"
      id="cp-help-tip"
      role="tooltip"
      class="absolute right-0 top-7 z-50 w-72 rounded-control bg-lateral-fondo p-3 text-cp-xs leading-relaxed text-lateral-texto shadow-flotante"
    >
      {{ texto }}
    </span>
  </span>
</template>
