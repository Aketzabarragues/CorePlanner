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
 * reintentar. Vacio, sale un texto y una accion.
 *
 * El contenido va en el slot y solo se pinta cuando no hay ni error ni
 * estado vacio.
 */
import AlertBanner from './AlertBanner.vue'

defineProps({
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
})

const emit = defineEmits(['retry', 'empty-action'])
</script>

<template>
  <div>
    <div
      v-if="loading"
      role="status"
      aria-live="polite"
      class="rounded-lg border border-slate-200 bg-white p-4"
    >
      <slot name="loading">
        <div class="animate-pulse space-y-3 motion-reduce:animate-none">
          <div class="h-4 w-1/3 rounded bg-slate-200"></div>
          <div class="h-11 rounded bg-slate-100"></div>
          <div class="h-11 rounded bg-slate-100"></div>
          <div class="h-11 rounded bg-slate-100"></div>
        </div>
      </slot>
      <span class="sr-only">{{ loadingLabel }}</span>
    </div>

    <AlertBanner
      v-else-if="error"
      variant="error"
      :title="errorTitle"
      :action-label="retryLabel"
      :data-testid="errorTestId"
      @action="emit('retry')"
    >
      {{ error }}
    </AlertBanner>

    <div
      v-else-if="empty"
      class="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center"
    >
      <slot name="empty">
        <p class="font-semibold text-siemens-900">{{ emptyTitle }}</p>
        <p v-if="emptyText" class="mt-1 text-sm text-slate-500">{{ emptyText }}</p>
        <button
          v-if="emptyAction"
          type="button"
          class="mt-4 rounded bg-siemens-900 px-4 py-2 text-sm font-medium text-white"
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
