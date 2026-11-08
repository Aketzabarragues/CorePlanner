<script setup>
/**
 * Grafico de barras de carga por semana.
 *
 * Cada barra es una semana: su altura es el porcentaje de uso de la capacidad y
 * la linea discontinua marca el 100 %. El color no es la unica senal: la barra
 * lleva su porcentaje en texto y la sobrecarga, un triangulo.
 *
 * El grafico es una imagen con su descripcion: el contenedor lleva role="img"
 * y el aria-label resume las cifras de todas las semanas.
 */
import { computed } from 'vue'

import AppIcon from './AppIcon.vue'
import { loadAspect, loadRatio, loadState } from '../utils/load'
import { currentWeekKey, weekTitle } from '../utils/weeks'

const props = defineProps({
  weeks: { type: Array, required: true },
  title: { type: String, default: 'Carga por semana' },
  height: { type: Number, default: 136 },
  testId: { type: String, default: 'load-bars' },
})

/** Escala del grafico: la barra llena es el tope y la linea marca el 100 %. */
const MAX_SCALE = 136
const LINE = 100
/** Alto minimo de una barra, para que una semana sin carga se vea igual. */
const MIN_BAR = 2.2

const hoy = currentWeekKey()

/**
 * Etiqueta del festivo de la semana.
 *
 * Se enseño el primero, y cuantos hay mas. Un festivo de medio dia va marcado
 * con "1/2".
 */
function festivoEtiqueta(holidays) {
  if (!holidays?.length) return ''
  const primero = holidays[0]
  const marca = primero.half_day ? '1/2 ' : ''
  const extra = holidays.length > 1 ? ` +${holidays.length - 1}` : ''
  return `${marca}${primero.name}${extra}`
}

/** Todos los festivos de la semana, para el texto que aparece al pasar. */
function festivoTitulo(holidays) {
  return (holidays ?? []).map((festivo) => festivo.name).join(', ')
}

const items = computed(() =>
  props.weeks.map((semana) => {
    const state = loadState(semana.hours, semana.capacity)
    const aspect = loadAspect(state)
    const ratio = loadRatio(semana.hours, semana.capacity)
    const alto = ratio === null ? 0 : Math.min(ratio, MAX_SCALE)
    const vacia = !(Number(semana.hours ?? 0) > 0)
    return {
      week: semana.week,
      horas: Number(semana.hours ?? 0),
      ratio,
      vacia,
      sobrecargada: Boolean(semana.is_overloaded),
      // Una semana sin carga se pinta con el color de la escala, no con el
      // borde invisible que tiene la celda vacia.
      clases: vacia
        ? [aspect.bar, 'border', 'border-transparent'].join(' ')
        : [aspect.cell, aspect.border, 'border'].join(' '),
      altura: `${Math.max(MIN_BAR, (alto / MAX_SCALE) * 100)}%`,
      texto: ratio === null ? `${semana.hours ?? 0} h` : `${ratio} %`,
      festivo: festivoEtiqueta(semana.holidays),
      tituloFestivo: festivoTitulo(semana.holidays),
    }
  }),
)

/** Lo que se lee en voz alta: las cifras de todas las semanas. */
const ariaLabel = computed(() => {
  const partes = items.value.map((item) => {
    const cifra = item.ratio === null ? `${item.horas} h` : `${item.ratio} %`
    return `semana ${item.week.split('-W')[1]}: ${cifra}`
  })
  return `${props.title}: ${partes.join('; ')}`
})

/** Altura de la linea del 100 %, en tanto por ciento de la caja. */
const alturaLinea = `${(LINE / MAX_SCALE) * 100}%`
</script>

<template>
  <div
    role="img"
    :aria-label="ariaLabel"
    class="flex items-end gap-2"
    :data-testid="testId"
  >
    <div
      v-for="item in items"
      :key="item.week"
      class="flex min-w-0 flex-1 flex-col items-center gap-1"
    >
      <div class="relative w-full" :style="{ height: `${height}px` }">
        <div
          class="absolute inset-x-[-5px] border-t border-dashed border-slate-500"
          :style="{ bottom: alturaLinea }"
        />
        <div
          class="absolute inset-x-0 bottom-0 rounded-t"
          :class="item.clases"
          :style="{ height: item.altura }"
          :data-testid="`${testId}-bar`"
        />
        <span
          v-if="item.sobrecargada"
          class="absolute -top-1 left-1/2 inline-flex -translate-x-1/2 text-red-700"
          aria-hidden="true"
        >
          <AppIcon name="warning" />
        </span>
      </div>
      <span class="text-xs font-semibold tabular-nums text-slate-700">
        {{ item.texto }}
      </span>
      <span class="text-[11px] text-slate-500">{{ weekTitle(item.week) }}</span>
      <span
        v-if="item.week === hoy"
        class="rounded-full bg-siemens-900 px-1.5 py-px text-[10px] font-semibold text-white"
      >
        Hoy
      </span>
      <span
        v-if="item.festivo"
        class="rounded-full border border-slate-300 bg-slate-50 px-1.5 py-px text-[10px] font-medium text-slate-700"
        :title="item.tituloFestivo"
        data-testid="holiday-badge"
      >
        {{ item.festivo }}
      </span>
    </div>
  </div>
</template>
