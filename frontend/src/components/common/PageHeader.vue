<script setup>
/**
 * Cabecera de una pantalla.
 *
 * El contenido de la cabecera (titulo, insignia, ayuda, filtros y acciones) se
 * publica en la barra superior del shell con un Teleport: asi la vista y la
 * barra son la misma cosa y no hay dos cabeceras.
 *
 * Si no hay destino (una vista montada fuera del shell, o un test que monta
 * el componente suelto), el Teleport se desactiva y el contenido se dibuja
 * donde esta: la vista no se rompe, se ve como antes.
 *
 * `en-barra` es la via explicita para lo mismo: en false el Teleport se
 * desactiva aunque haya barra. Lo usa la vista ampliada del Gantt y del
 * calendario, que se sale del armazon con `fixed inset-0`: su cabecera tiene
 * que seguir viendose dentro de la ventana ampliada, no detras de ella.
 *
 * Los slots `filters` y `actions` son aditivos.
 */
import { onMounted, ref } from 'vue'

import HelpTip from './HelpTip.vue'

const props = defineProps({
  title: { type: String, required: true },
  /** Insignia de contexto: { texto: String, punto: clase de color o null }. */
  contexto: { type: Object, default: null },
  /** Texto del boton de ayuda; sin el, no se pinta el boton. */
  ayuda: { type: String, default: '' },
  /** `data-testid` del contenedor de filtros. */
  filtersTestid: { type: String, default: '' },
  /** En false no se publica en la barra: el contenido se dibuja en su sitio. */
  enBarra: { type: Boolean, default: true },
})

/**
 * Destino del Teleport.
 *
 * Se busca al montar: el shell ya esta en el DOM cuando la vista se pinta.
 * Si no aparece (vista suelta en un test), `destino` queda sin valor y el
 * Teleport se desactiva. `null` y no cadena vacia: un selector vacio en el
 * atributo `to` hace que el Teleport falle al montar.
 */
const DESTINO = '#cp-barra-vista'
const destino = ref(null)

onMounted(() => {
  if (document.querySelector(DESTINO)) destino.value = DESTINO
})
</script>

<template>
  <Teleport :to="destino" :disabled="!props.enBarra || !destino">
    <div
      class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2"
      :data-testid="'vista-cabecera'"
    >
      <!-- Titulo + insignia + ayuda -->
      <div class="flex min-w-0 shrink items-center gap-2">
        <h1 class="truncate font-titulo text-cp-titulo font-bold tracking-tight text-texto-marca">
          {{ title }}
        </h1>

        <span
          v-if="contexto || $slots.contexto"
          class="inline-flex min-w-0 max-w-[280px] flex-none items-center gap-1.5 rounded-pastilla border border-borde bg-tarjeta-suave px-2.5 py-1 text-cp-xs font-medium text-texto-suave"
        >
          <span
            v-if="contexto?.punto"
            class="h-1.5 w-1.5 flex-none rounded-full"
            :class="contexto.punto"
            aria-hidden="true"
          ></span>
          <span class="truncate"><slot name="contexto">{{ contexto?.texto }}</slot></span>
        </span>

        <HelpTip v-if="ayuda" :texto="ayuda" />
      </div>

      <!-- Separador vertical: solo cuando los filtros van en linea -->
      <span
        v-if="$slots.filters"
        class="hidden h-6 w-px flex-none bg-borde xl:block"
        aria-hidden="true"
      ></span>

      <!-- Filtros -->
      <div
        v-if="$slots.filters"
        class="flex min-w-0 flex-wrap items-center gap-2 max-xl:order-3 max-xl:w-full xl:order-2"
        :data-testid="filtersTestid || undefined"
      >
        <slot name="filters" />
      </div>

      <!-- Acciones -->
      <div
        v-if="$slots.actions"
        class="flex shrink-0 flex-wrap items-center justify-end gap-2 max-xl:order-2 xl:order-3"
      >
        <slot name="actions" />
      </div>
    </div>
  </Teleport>
</template>
