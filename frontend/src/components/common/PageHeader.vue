<script setup>
/**
 * Cabecera de una pantalla.
 *
 * Titulo a la izquierda y acciones a la derecha, siempre en la primera linea
 * (las acciones se separan del titulo con `ml-auto` y ceden sitio en cascada:
 * icono antes que desaparecer). Los filtros van en linea tras el titulo
 * cuando caben a su lado; por debajo de `xl` no caben junto al titulo, así
 * que ocupan una fila propia debajo (con `w-full`) y se envuelven dentro de
 * si.
 *
 * La regla vertical marca el hueco solo cuando los filtros van en linea.
 *
 * Los slots `filters` y `actions` son aditivos: si no se pasan, no se pinta ni
 * el separador ni el hueco.
 */
import HelpTip from './HelpTip.vue'

defineProps({
  title: { type: String, required: true },
  /** Insignia de contexto: { texto: String, punto: clase de color o null }. */
  contexto: { type: Object, default: null },
  /** Texto del boton de ayuda; sin el, no se pinta el boton. */
  ayuda: { type: String, default: '' },
  /** `data-testid` del contenedor de filtros (para las vistas que lo tenian). */
  filtersTestid: { type: String, default: '' },
})
</script>

<template>
  <header
    class="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-borde pb-3"
  >
    <!-- Titulo: siempre a la izquierda, en la primera linea -->
    <div class="flex min-w-0 shrink items-center gap-2">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="truncate font-titulo text-cp-titulo font-bold tracking-tight text-texto-marca">
            {{ title }}
          </h1>

          <span
            v-if="contexto || $slots.contexto"
            class="inline-flex flex-none items-center gap-1.5 rounded-pastilla border border-borde bg-tarjeta-suave px-2.5 py-1 text-cp-xs font-medium text-texto-suave"
          >
            <slot name="contexto">
              <span
                v-if="contexto.punto"
                class="h-1.5 w-1.5 flex-none rounded-full"
                :class="contexto.punto"
                aria-hidden="true"
              ></span>
              <span>{{ contexto.texto }}</span>
            </slot>
          </span>

          <HelpTip v-if="ayuda" :texto="ayuda" />
        </div>
      </div>
    </div>

    <!--
      Filtros: en linea tras el titulo cuando caben a su lado (y la regla
      vertical marca el hueco). A `xl` van antes que las acciones (fila del
      titulo + acciones abajo); por debajo de `xl` no caben junto al titulo,
      así que `w-full` les da la fila de abajo y van tras las acciones.
    -->
    <div
      v-if="$slots.filters"
      class="flex min-w-0 flex-wrap items-center gap-2 max-xl:order-2 max-xl:w-full xl:order-1"
      :data-testid="filtersTestid || undefined"
    >
      <span class="hidden h-6 w-px flex-none bg-borde xl:block"></span>
      <slot name="filters" />
    </div>

    <!-- Acciones: a la derecha. A `xl` bajan a la segunda linea; por debajo
         de `xl` se quedan en la linea del titulo y los filtros bajan -->
    <div
      v-if="$slots.actions"
      class="flex shrink-0 flex-wrap items-center justify-end gap-2 max-xl:order-1 xl:order-2"
    >
      <slot name="actions" />
    </div>
  </header>
</template>
