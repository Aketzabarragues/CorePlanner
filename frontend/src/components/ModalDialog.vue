<script setup>
/**
 * Dialogo modal unificado — el unico overlay de la aplicacion.
 *
 * Contrato: el unico dialogo de la aplicacion. Todo formulario de
 * alta/edicion, el detalle de tarea y la ficha de persona pasan por aqui.
 * SidePanel no se migra: sobrevive como excepcion, como columna lateral
 * no modal del desglose de celda de la matriz.
 *
 * Slots:
 *   default  — cuerpo del dialogo (con scroll independiente).
 *   footer   — barra de acciones fija al pie; si no se pasa, no se pinta barra.
 *              Recibe `{ submit }`: envia el `<form>` del cuerpo. Los
 *              botones de accion van `type="button" @click="submit"`.
 *
 * Tamanios (prop `size`):
 *   sm  → max-w-md   formulario simple.
 *   md  → max-w-lg   formulario con rejilla de 3 campos (valor por defecto).
 *   lg  → max-w-3xl  detalle de tarea.
 *   xl  → max-w-5xl  ficha de persona con perfil profesional y horario.
 */
import { ref, useId } from 'vue'

import { useDialog } from '../composables/useDialog'

const props = defineProps({
  open:     { type: Boolean, default: false },
  title:    { type: String,  required: true },
  subtitle: { type: String,  default: '' },
  size:     { type: String,  default: 'md' },
})

const emit = defineEmits(['close'])

const panel = ref(null)

useDialog(
  () => props.open,
  panel,
  () => emit('close'),
)

const titleId    = useId()
const subtitleId = useId()

/**
 * Envio del formulario del cuerpo, para los botones del slot `footer`.
 *
 * El boton del pie queda fuera del `<form>`, asi que ni el atributo `form`
 * (no lo respeta jsdom) ni `type="submit"` le llegan. El componente localiza
 * el form del cuerpo y lo envia desde aqui: `requestSubmit()` cuando el
 * entorno lo soporta (valida y envia), y si no, un evento `submit`
 * cancelable que dispara el mismo handler de siempre.
 */
function enviarForm() {
  const form = panel.value?.querySelector('form')
  if (!form) return
  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit()
    return
  }
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

const SIZE_CLASS = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
    @click.self="emit('close')"
  >
    <div
      ref="panel"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="subtitle ? subtitleId : undefined"
      tabindex="-1"
      class="flex w-full flex-col rounded-t-lg bg-white shadow-xl sm:rounded-lg"
      :class="[SIZE_CLASS[size] ?? SIZE_CLASS.md, 'max-h-[90vh]']"
    >
      <!-- Cabecera fija -->
      <div class="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div class="min-w-0">
          <h2
            :id="titleId"
            class="text-base font-semibold text-siemens-900"
          >
            {{ title }}
          </h2>
          <p
            v-if="subtitle"
            :id="subtitleId"
            class="mt-0.5 text-sm text-slate-500"
            data-testid="modal-subtitle"
          >
            {{ subtitle }}
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
          aria-label="Cerrar"
          data-testid="modal-close"
          @click="emit('close')"
        >
          Cerrar
        </button>
      </div>

      <!-- Cuerpo con scroll -->
      <div class="flex-1 overflow-y-auto p-5">
        <slot />
      </div>

      <!-- Pie fijo (solo si se pasa el slot) -->
      <div
        v-if="$slots.footer"
        data-testid="modal-footer"
        class="shrink-0 border-t border-slate-200 bg-white px-5 py-3"
      >
        <div class="flex justify-end gap-2">
          <slot name="footer" :submit="enviarForm" />
        </div>
      </div>
    </div>
  </div>
</template>
