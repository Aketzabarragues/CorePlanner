<script setup>
/**
 * Boton de ayuda de la cabecera de vista.
 *
 * Boton `?` de 20 px con tooltip oscuro hacia abajo, centrado en el boton.
 * Se abre al pulsar y al recibir foco (teclado); se cierra con Escape. El
 * lector de pantalla lee el nombre del boton ("Ayuda"); el tooltip lleva
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
      class="relative flex h-5 w-5 items-center justify-center rounded-pastilla bg-tarjeta-suave text-cp-sm font-semibold text-texto-suave transition-colors hover:bg-tarjeta hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco after:absolute after:-inset-y-2.5 after:left-0 after:right-0 after:content-['']"
      aria-label="Ayuda"
      :aria-expanded="abierto ? 'true' : 'false'"
      aria-controls="cp-help-tip"
      @click="abierto = !abierto"
      @focus="abierto = true"
      @keydown.esc="abierto = false"
    >
      <span aria-hidden="true">?</span>
      <span class="sr-only">Ayuda</span>
    </button>

    <!--
      Hacia abajo y centrado en el boton: se abre sobre el contenido de la
      vista y no pisa los filtros ni el lateral. `z-40` dentro de la barra,
      que es `relative z-30`: el tooltip no puede salirse de su contexto de
      apilamiento, asi que nunca puede tapar el cajon del movil (`z-50`).
    -->
    <span
      v-show="abierto"
      id="cp-help-tip"
      role="tooltip"
      class="absolute left-1/2 top-full z-40 mt-2 w-72 -translate-x-1/2 rounded-control bg-lateral-fondo p-3 text-cp-xs leading-relaxed text-lateral-texto shadow-flotante"
    >
      {{ texto }}
    </span>
  </span>
</template>
