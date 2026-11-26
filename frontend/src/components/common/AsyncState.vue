<script setup>
/**
 * Los tres estados de una vista que carga datos.
 *
 * Una vista que pide datos al servidor pasa por tres estados: cargando, con
 * error o con el contenido. El componente los cubre para que cada pantalla no
 * los escriba otra vez.
 *
 * Cargando, sale un esqueleto con la forma de la pantalla, no un texto suelto:
 * se anuncia con `role="status"` y respeta la preferencia de reducir el
 * movimiento. Con error, sale un banner con el mensaje y un boton para
 * reintentar, pero solo si reintentar puede servir. Vacio, sale un texto y
 * una accion.
 *
 * El contenido va en el slot y solo se pinta cuando no hay ni error ni
 * estado vacio.
 */
import { computed } from 'vue'

import AlertBanner from './AlertBanner.vue'

const props = defineProps({
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  empty: { type: Boolean, default: false },
  loadingLabel: { type: String, default: 'Cargando' },
  errorTitle: { type: String, default: '' },
  errorTestId: { type: String, default: '' },
  retryLabel: { type: String, default: 'Reintentar' },
  emptyTitle: { type: String, default: '' },
  emptyText: { type: String, default: '' },
  emptyAction: { type: String, default: '' },
  /**
   * Codigo HTTP del error, para decidir si el aviso puede reintentarse.
   *
   * Lo da la vista, que es quien ha visto el fallo. Sin codigo (null) se
   * asume un fallo de red, que si se puede reintentar.
   */
  errorStatus: { type: Number, default: null },
})

/**
 * Si el aviso de error puede ofrecer reintentar.
 *
 * Un 4xx no: es un permiso que falta o un proyecto que no existe, y volver a
 * pedirlo dara el mismo fallo. Un 5xx o un fallo sin respuesta (la red caida)
 * si: la peticion puede salir bien la proxima vez.
 */
const puedeReintentar = computed(
  () => props.errorStatus === null || props.errorStatus >= 500,
)

const emit = defineEmits(['retry', 'empty-action'])
</script>

<template>
  <div>
    <div
      v-if="loading"
      role="status"
      aria-live="polite"
      class="rounded-tarjeta border border-borde bg-tarjeta p-4"
    >
      <slot name="loading">
        <div class="animate-pulse space-y-3 motion-reduce:animate-none">
          <div class="h-4 w-1/3 rounded-control bg-borde"></div>
          <div class="h-11 rounded-control bg-neutro-fondo"></div>
          <div class="h-11 rounded-control bg-neutro-fondo"></div>
          <div class="h-11 rounded-control bg-neutro-fondo"></div>
        </div>
      </slot>
      <span class="sr-only">{{ loadingLabel }}</span>
    </div>

    <AlertBanner
      v-else-if="error"
      variant="error"
      :title="errorTitle"
      :action-label="puedeReintentar ? retryLabel : ''"
      :data-testid="errorTestId"
      @action="emit('retry')"
    >
      {{ error }}
    </AlertBanner>

    <div
      v-else-if="empty"
      class="rounded-tarjeta border border-dashed border-borde-fuerte bg-tarjeta p-6 text-center"
    >
      <slot name="empty">
        <p class="font-semibold text-primario-fuerte">{{ emptyTitle }}</p>
        <p v-if="emptyText" class="mt-1 text-sm text-texto-tenue">{{ emptyText }}</p>
        <button
          v-if="emptyAction"
          type="button"
          class="mt-4 rounded-control bg-primario-fuerte px-4 py-2 text-sm font-medium text-texto-inverso"
          @click="emit('empty-action')"
        >
          {{ emptyAction }}
        </button>
      </slot>
    </div>

    <template v-else>
      <slot />
    </template>
  </div>
</template>
