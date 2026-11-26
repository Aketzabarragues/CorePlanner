<script setup>
/**
 * Host global de avisos flotantes (toast).
 *
 * Dibuja la pila del store abajo a la derecha, por encima del velo de
 * ModalDialog (z-50 → z-[60]). Cada aviso reutiliza AlertBanner, el unico
 * patron de aviso de la aplicacion, con la variante `toast` (pastilla oscura
 * `bg-lateral-fondo` con `border-lateral-borde`, texto `text-lateral-texto`
 * y `shadow-flotante`). El contenedor no intercepta el raton donde no hay
 * toast; cada toast si.
 */
import { useToastStore } from '../../stores/toast'
import AlertBanner from './AlertBanner.vue'

const toast = useToastStore()
</script>

<template>
  <div
    data-testid="toast-host"
    aria-live="polite"
    class="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col gap-2 p-4 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96 sm:p-0"
  >
    <AlertBanner
      v-for="item in toast.items"
      :key="item.id"
      variant="toast"
      :alert="item.variant === 'error'"
      dismissible
      data-testid="toast"
      class="pointer-events-auto shadow-flotante"
      @dismiss="toast.dismiss(item.id)"
    >
      {{ item.message }}
    </AlertBanner>
  </div>
</template>
