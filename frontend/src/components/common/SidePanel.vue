<script setup>
/**
 * Panel lateral de detalle.
 *
 * Entra desde la derecha sobre la pantalla, sin quitar el contenido de
 * fondo: sirve para ver el detalle de algo sin perder de vista la pantalla
 * que lo ha producido. Es un dialogo, asi que se cierra con Esc y el foco no
 * se sale de el.
 */
import { ref } from 'vue'

import { useDialog } from '../../composables/useDialog'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  /**
   * Si el panel es modal.
   *
   * Un panel modal tapa el fondo con un velo y lo deja inactivo. Uno que no lo
   * es se pone al lado: el fondo se sigue viendo y se puede seguir usando, que
   * es lo que necesita la matriz de capacidad para que las celdas de al lado
   * reciban el arrastre de una tarea.
   */
  modal: { type: Boolean, default: true },
})

const emit = defineEmits(['close'])

const panel = ref(null)

useDialog(
  () => props.open,
  panel,
  () => emit('close'),
  { modal: props.modal },
)
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex justify-end"
    :class="modal ? 'bg-slate-900/40' : 'pointer-events-none bg-transparent'"
    @click.self="emit('close')"
  >
    <div
      ref="panel"
      role="dialog"
      :aria-modal="modal ? 'true' : 'false'"
      :aria-label="title"
      tabindex="-1"
      class="pointer-events-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl"
    >
      <div class="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
        <div class="min-w-0">
          <h2 class="text-base font-semibold text-siemens-900">{{ title }}</h2>
          <slot name="subtitle">
            <p v-if="subtitle" class="mt-1 text-sm text-slate-500" data-testid="side-panel-subtitle">
              {{ subtitle }}
            </p>
          </slot>
        </div>
        <button
          type="button"
          class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
          data-testid="side-panel-close"
          @click="emit('close')"
        >
          Cerrar
        </button>
      </div>

      <div class="flex-1 p-4">
        <slot />
      </div>
    </div>
  </div>
</template>
