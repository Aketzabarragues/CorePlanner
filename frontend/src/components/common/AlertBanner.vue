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
 * Variantes: `success`, `warning`, `info`, `error` (bloques en linea de tono
 * claro, fondo/texto/borde del estado e icono del color del texto) y `toast`
 * (pastilla oscura `bg-lateral-fondo` con `border-lateral-borde`, texto
 * `text-lateral-texto` e icono en el `punto` del estado: el punto es el unico
 * color de estado que aguanta un fondo oscuro).
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
const TOAST = 'toast'

const props = defineProps({
  variant: {
    type: String,
    default: INFO,
    validator: (valor) => [SUCCESS, WARNING, INFO, ERROR, TOAST].includes(valor),
  },
  /** Fuerza `role="alert"` para toasts de error: el toast oscurece la
   *  variante, pero un fallo sigue anunciandose de inmediato. */
  alert: { type: Boolean, default: false },
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

const ICONO_PUNTO = {
  [SUCCESS]: 'bg-ok-punto',
  [WARNING]: 'bg-aviso-punto',
  [INFO]: 'bg-info-punto',
  [ERROR]: 'bg-peligro-punto',
}

const TONOS = {
  [SUCCESS]: 'border-ok-borde bg-ok-fondo text-ok-texto',
  [WARNING]: 'border-aviso-borde bg-aviso-fondo text-aviso-texto',
  [ERROR]: 'border-peligro-borde bg-peligro-fondo text-peligro-texto',
  [INFO]: 'border-info-borde bg-info-fondo text-info-texto',
  [TOAST]: 'border-lateral-borde bg-lateral-fondo text-lateral-texto',
}

const icono = computed(() => ICONES[props.variant] ?? 'info')
const colorIcono = computed(() =>
  props.variant === TOAST ? (ICONO_PUNTO[props.variant] ?? 'bg-info-punto') : undefined,
)
</script>

<template>
  <div
    :role="variant === ERROR || alert ? 'alert' : 'status'"
    class="flex items-start gap-2 rounded-control border px-3.5 py-2.5 text-cp-sm"
    :class="TONOS[variant]"
  >
    <span class="mt-0.5 h-4 w-4 flex-none" :class="colorIcono">
      <AppIcon :name="icono" />
    </span>

    <div class="min-w-0 flex-1">
      <p v-if="title" class="font-medium">{{ title }}</p>
      <p><slot /></p>
    </div>

    <button
      v-if="actionLabel"
      type="button"
      class="flex-none self-center rounded-control px-2 py-1 font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </button>

    <button
      v-if="dismissible"
      type="button"
      class="flex-none self-center rounded-control px-1 text-lg leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
      title="Cerrar aviso"
      aria-label="Cerrar aviso"
      @click="emit('dismiss')"
    >
      <span aria-hidden="true">&times;</span>
    </button>
  </div>
</template>
