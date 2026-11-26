<script setup>
/**
 * Panel de rango de fechas del diagrama de Gantt.
 *
 * Es el patron del panel de columnas: un boton que abre un desplegable
 * absoluto, que se cierra al pulsar fuera. El rango vive en la URL (`?from=`
 * y `?to=`), asi que el panel solo propone el rango y la vista lo escribe.
 *
 * Los dos campos son de fecha y llevan las mismas clases que los del
 * formulario de tarea, para que el control se ve igual que los demas de la
 * aplicacion. Los atajos escriben el rango de inmediato; "Aplicar" escribe el
 * de los campos. Un rango a medias no se escribe: para borrar el rango esta
 * el atajo "Todo el plan" y, en la barra, el boton "Completo".
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import AppIcon from '../AppIcon.vue'
import { addDays, diffDays, parseIsoDate, toIsoDate } from '../../utils/ganttScale'
import { localDateKey } from '../../utils/month'
import { isoWeekKey, weekMonday } from '../../utils/weeks'

const props = defineProps({
  /** Fecha inicial elegida, en ISO; vacia si no hay rango elegido. */
  desde: { type: String, default: '' },
  /** Fecha final elegida, en ISO; vacia si no hay rango elegido. */
  hasta: { type: String, default: '' },
  /** Rango vigente, en texto largo: "Del 23 de noviembre al 3 de enero". */
  texto: { type: String, default: '' },
})

const emit = defineEmits(['aplicar'])

const abierto = ref(false)
const desdeInput = ref('')
const hastaInput = ref('')
const error = ref('')
const root = ref(null)

/** Dias del rango elegido: el contador del boton. */
const diasElegidos = computed(() => {
  if (!props.desde || !props.hasta) return 0
  return diffDays(parseIsoDate(props.desde), parseIsoDate(props.hasta)) + 1
})

/** Si lo que se ve es el plan entero: no hay rango elegido. */
const esPlan = computed(() => !props.desde && !props.hasta)

/**
 * Los campos se rellenan con el rango de la URL.
 *
 * Se sincronizan al abrir el panel y cada vez que cambia el rango: asi el
 * panel nunca propone unas fechas que ya no son las que se ven.
 */
function sincronizar() {
  desdeInput.value = props.desde
  hastaInput.value = props.hasta
  error.value = ''
}

watch(() => [props.desde, props.hasta], sincronizar)

/** Abre y cierra el panel. */
function alternar() {
  abierto.value = !abierto.value
  if (abierto.value) sincronizar()
}

/** Cierra el panel cuando se pulsa fuera. */
function onDocumentClick(event) {
  if (!root.value?.contains(event.target)) abierto.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))

/**
 * Escribe un rango y cierra el panel.
 *
 * Las fechas van en ISO: en la URL son `from` y `to`, y el rango se amplia
 * al borde de la escala al pintarse.
 */
function escribir(desde, hasta) {
  desdeInput.value = desde
  hastaInput.value = hasta
  error.value = ''
  emit('aplicar', { desde, hasta })
  abierto.value = false
}

/**
 * Escribe el rango de los campos.
 *
 * Los dos extremos hacen falta y no pueden estar al reves: con un rango
 * imposible no se escribe la URL, y el motivo sale en el panel.
 */
function aplicar() {
  const desde = desdeInput.value
  const hasta = hastaInput.value
  if (!desde || !hasta) {
    error.value = 'Elige las dos fechas del rango.'
    return
  }
  if (desde > hasta) {
    error.value = 'El rango está al revés: la fecha inicial es posterior a la final.'
    return
  }
  escribir(desde, hasta)
}

/** Atajo "Todo el plan": borra `from` y `to`, como el boton "Completo". */
function atajoPlan() {
  escribir('', '')
}

/** Atajo "Esta semana": la semana ISO en curso, de lunes a domingo. */
function atajoSemana() {
  const lunes = weekMonday(isoWeekKey(parseIsoDate(localDateKey())))
  escribir(toIsoDate(lunes), toIsoDate(addDays(lunes, 6)))
}

/** Atajo "Este mes": el mes natural en curso, del dia 1 al ultimo. */
function atajoMes() {
  const hoy = parseIsoDate(localDateKey())
  const primero = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1))
  const ultimo = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 0))
  escribir(toIsoDate(primero), toIsoDate(ultimo))
}

/** Atajo "Proximas 4 semanas": desde hoy, 28 dias naturales. */
function atajoCuatroSemanas() {
  const hoy = parseIsoDate(localDateKey())
  escribir(toIsoDate(hoy), toIsoDate(addDays(hoy, 27)))
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="inline-flex h-10 w-10 items-center justify-center rounded-control border border-borde-fuerte bg-tarjeta text-texto 2xl:h-8 2xl:w-auto 2xl:justify-start 2xl:gap-2 2xl:px-3"
      :aria-expanded="abierto"
      aria-label="Elegir el rango de fechas"
      title="Elegir el rango de fechas"
      data-testid="gantt-toggle-range"
      @click="alternar"
    >
      <span class="h-4 w-4 text-texto-tenue"><AppIcon name="calendar" /></span>
      <span class="hidden text-cp-sm font-medium 2xl:inline">Rango</span>
      <span
        v-if="diasElegidos"
        class="rounded-pastilla bg-primario-fuerte px-1.5 text-cp-micro font-semibold text-sobre-primario"
        data-testid="gantt-range-days"
      >
        {{ diasElegidos }}
      </span>
    </button>

    <div
      v-if="abierto"
      class="absolute left-0 z-30 mt-1 w-72 rounded-control bg-tarjeta p-3 shadow-flotante ring-1 ring-borde"
      data-testid="gantt-range-panel"
    >
      <span class="text-cp-micro font-semibold uppercase tracking-wide text-texto-tenue">
        Rango de fechas
      </span>

      <p class="mt-1 text-cp-sm text-texto" data-testid="gantt-range-texto">
        {{ props.texto }}
      </p>
      <p class="mt-1 text-cp-micro text-texto-tenue" data-testid="gantt-range-modo">
        {{ esPlan ? 'Todo el plan' : 'Rango elegido' }}
      </p>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <label class="block">
          <span class="text-cp-sm font-medium">Desde</span>
          <input
            v-model="desdeInput"
            type="date"
            class="mt-1 w-full rounded-control border border-borde-fuerte px-3 py-2 text-cp-sm"
            data-testid="gantt-range-from"
          />
        </label>
        <label class="block">
          <span class="text-cp-sm font-medium">Hasta</span>
          <input
            v-model="hastaInput"
            type="date"
            class="mt-1 w-full rounded-control border border-borde-fuerte px-3 py-2 text-cp-sm"
            data-testid="gantt-range-to"
          />
        </label>
      </div>

      <p v-if="error" class="mt-2 text-cp-sm text-peligro-texto" data-testid="gantt-range-error">
        {{ error }}
      </p>

      <div class="mt-3 flex flex-wrap gap-1">
        <button
          type="button"
          class="h-8 rounded-control border border-borde-fuerte bg-tarjeta px-2 text-cp-micro font-medium text-texto hover:bg-tarjeta-suave"
          data-testid="gantt-range-shortcut-plan"
          @click="atajoPlan"
        >
          Todo el plan
        </button>
        <button
          type="button"
          class="h-8 rounded-control border border-borde-fuerte bg-tarjeta px-2 text-cp-micro font-medium text-texto hover:bg-tarjeta-suave"
          data-testid="gantt-range-shortcut-week"
          @click="atajoSemana"
        >
          Esta semana
        </button>
        <button
          type="button"
          class="h-8 rounded-control border border-borde-fuerte bg-tarjeta px-2 text-cp-micro font-medium text-texto hover:bg-tarjeta-suave"
          data-testid="gantt-range-shortcut-month"
          @click="atajoMes"
        >
          Este mes
        </button>
        <button
          type="button"
          class="h-8 rounded-control border border-borde-fuerte bg-tarjeta px-2 text-cp-micro font-medium text-texto hover:bg-tarjeta-suave"
          data-testid="gantt-range-shortcut-4weeks"
          @click="atajoCuatroSemanas"
        >
          Próximas 4 semanas
        </button>
      </div>

      <button
        type="button"
        class="mt-3 w-full rounded-control bg-primario-fuerte px-3 py-2 text-cp-sm font-medium text-sobre-primario hover:bg-primario-medio"
        data-testid="gantt-range-apply"
        @click="aplicar"
      >
        Aplicar
      </button>
    </div>
  </div>
</template>
