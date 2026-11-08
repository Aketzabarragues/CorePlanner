<script setup>
/**
 * Aviso en linea.
 *
 * Es el unico patron de aviso de la aplicacion: sustituye a los bloques de
 * error copiados en cada vista y al aviso flotante del shell. El mensaje va en
 * el slot y la accion, si la hay, en el boton de la derecha.
 *
 * El error se anuncia con `role="alert"`, que se lee de inmediato. Los demas
 * avisos usan `role="status"`, que espera a que el lector termine la frase
 * que este leyendo.
 *
 * Los nombres de las variantes se guardan en constantes y no en el atributo
 * `class`, porque el guard del CSS toma cualquier texto entre comillas de ahi
 * como si fuera una clase de Tailwind.
 */
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'

const SUCCESS = 'success'
const WARNING = 'warning'
const INFO = 'info'
const ERROR = 'error'

const props = defineProps({
  variant: {
    type: String,
    default: INFO,
    validator: (valor) => [SUCCESS, WARNING, INFO, ERROR].includes(valor),
  },
  title: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
  dismissible: { type: Boolean, default: false },
})

const emit = defineEmits(['action', 'dismiss'])

const ICONES = {
  [SUCCESS]: 'check',
  [WARNING]: 'warning',
  [INFO]: 'info',
  [ERROR]: 'error',
}

const icono = computed(() => ICONES[props.variant] ?? 'info')
</script>

<template>
  <div
    :role="variant === ERROR ? 'alert' : 'status'"
    class="flex items-start gap-2 rounded border px-3 py-2 text-sm"
    :class="
      variant === SUCCESS
        ? 'border-green-200 bg-green-50 text-green-800'
        : variant === WARNING
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : variant === ERROR
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-blue-200 bg-blue-50 text-blue-800'
    "
  >
    <span class="mt-0.5 h-4 w-4 flex-none">
      <AppIcon :name="icono" />
    </span>

    <div class="min-w-0 flex-1">
      <p v-if="title" class="font-medium">{{ title }}</p>
      <p><slot /></p>
    </div>

    <button
      v-if="actionLabel"
      type="button"
      class="flex-none self-center rounded px-2 py-1 font-medium underline"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </button>

    <button
      v-if="dismissible"
      type="button"
      class="flex-none self-center rounded px-1 text-lg leading-none"
      title="Cerrar aviso"
      aria-label="Cerrar aviso"
      @click="emit('dismiss')"
    >
      &times;
    </button>
  </div>
</template>
