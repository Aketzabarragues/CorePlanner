<script setup>
/**
 * Cabecera de una pantalla.
 *
 * Titulo, insignia de contexto, ayuda, filtros opcionales y acciones,
 * siempre en el mismo orden y con el mismo aspecto en todas las pantallas.
 * Las migas se quedan en el shell, que ya las pinta encima de la vista:
 * repetirlas aqui seria verlas dos veces.
 *
 * La insignia de contexto sale del prop `contexto` ({ texto, punto }) o del
 * slot `contexto`, que gana si se pasa. El texto de ayuda sale del prop
 * `ayuda` y se pinta en el boton `?`.
 *
 * El slot `filters` es aditivo: si no se pasa, no se pinta ni el separador
 * ni el hueco, de modo que las vistas que solo piden titulo/subtitulo y
 * acciones no cambian de aspecto.
 */
import HelpTip from './HelpTip.vue'

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  /** Insignia de contexto: { texto: String, punto: clase de color o null }. */
  contexto: { type: Object, default: null },
  /** Texto del boton de ayuda; sin el, no se pinta el boton. */
  ayuda: { type: String, default: '' },
})
</script>

<template>
  <header class="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-borde pb-3">
    <!-- IZQUIERDA: titulo + contexto + ayuda + separador + filtros -->
    <div class="flex min-w-0 flex-wrap items-center gap-2.5">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="font-titulo text-cp-titulo font-bold tracking-tight text-texto-marca">
            {{ title }}
          </h1>

          <span
            v-if="contexto || $slots.contexto"
            class="hidden items-center gap-1.5 rounded-pastilla border border-borde bg-tarjeta-suave px-2.5 py-1 text-cp-xs font-medium text-texto-suave sm:inline-flex"
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

        <p v-if="subtitle" class="mt-0.5 text-cp-xs text-texto-tenue">{{ subtitle }}</p>
      </div>

      <span
        v-if="$slots.filters"
        class="hidden h-6 w-px flex-none bg-borde md:block"
        aria-hidden="true"
      ></span>

      <div v-if="$slots.filters" class="flex flex-wrap items-end gap-2">
        <slot name="filters" />
      </div>
    </div>

    <!-- DERECHA: acciones -->
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
