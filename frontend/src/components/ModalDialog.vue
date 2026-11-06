<script setup>
/**
 * Dialogo modal centrado.
 *
 * Los formularios de configuracion se muestran aqui en lugar de ocupar sitio
 * en la pagina: se abren con un boton y se cierran con ESC, con el boton o
 * pulsando fuera de la caja.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
})

const emit = defineEmits(['close'])

const panel = ref(null)

function close() {
  emit('close')
}

function onKeydown(event) {
  if (props.open && event.key === 'Escape') close()
}

watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) {
      requestAnimationFrame(() => {
        panel.value?.querySelector('input, select, textarea')?.focus()
      })
    }
  },
)

onMounted(() => document.addEventListener('keydown', onKeydown))

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    @click.self="close"
  >
    <div
      ref="panel"
      class="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
    >
      <div class="mb-4 flex items-start justify-between gap-4">
        <h2 class="text-base font-semibold text-siemens-900">{{ title }}</h2>
        <button
          type="button"
          class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
          data-testid="modal-close"
          @click="close"
        >
          Cerrar
        </button>
      </div>
      <slot />
    </div>
  </div>
</template>
