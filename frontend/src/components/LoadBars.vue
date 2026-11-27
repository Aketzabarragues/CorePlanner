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
  // Personas de la matriz; con ellas la nota dice de cuantas es la capacidad
  // conocida. Opcional: sin total no hay nota.
  totalPersonas: { type: Number, default: null },
})

/** Escala del grafico: la barra llena es el tope y la linea marca el 100 %. */
const MAX_SCALE = 136
const LINE = 100
/** Alto minimo de una barra, en px, para que una semana sin carga se vea. */
const MIN_BAR = 3

const hoy = currentWeekKey()

/**
 * Nota de las personas sin capacidad conocida en la semana.
 *
 * El campo es opcional: sin dato (o sin total de personas) no hay nota. El
 * grafico publica la suma de lo conocido, asi que la nota dice de cuantas
 * personas es esa capacidad.
 */
function desconocidasNota(semana) {
  const desconocidas = Number(semana.unknown_capacity_users)
  if (!Number.isInteger(desconocidas) || desconocidas <= 0) return ''
  if (!Number.isInteger(props.totalPersonas) || props.totalPersonas <= desconocidas) return ''
  const conocidas = props.totalPersonas - desconocidas
  const plural = conocidas === 1 ? 'persona' : 'personas'
  return `capacidad conocida de ${conocidas} de ${props.totalPersonas} ${plural}`
}

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
    const nota = desconocidasNota(semana)
    const cifra = ratio === null ? `${semana.hours ?? 0} h` : `${ratio} %`
    return {
      week: semana.week,
      horas: Number(semana.hours ?? 0),
      ratio,
      sobrecargada: Boolean(semana.is_overloaded),
      // La barra lleva el color de la escala; sin estado (imposible en la
      // practica) la pista de la barra vacia.
      clases: aspect.bar || 'bg-carga-vacio-barra',
      altura: `${Math.max(MIN_BAR, (alto / MAX_SCALE) * 100)}%`,
      texto: cifra,
      festivo: festivoEtiqueta(semana.holidays),
      tituloFestivo: festivoTitulo(semana.holidays),
      // Quien queda fuera del denominador, si el backend lo dice.
      nota,
      // Tooltip por semana: la cifra y, si hay, la nota de capacidad.
      titulo: nota ? `${cifra} (${nota})` : cifra,
    }
  }),
)

/** Lo que se lee en voz alta: las cifras de todas las semanas. */
const ariaLabel = computed(() => {
  const partes = items.value.map((item) => {
    const numero = item.week.split('-W')[1]
    const cifra = item.ratio === null ? `${item.horas} h` : `${item.ratio} %`
    const nota = item.nota ? ` (${item.nota})` : ''
    return `semana ${numero}: ${cifra}${nota}`
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
    class="flex items-start gap-2"
    :data-testid="testId"
  >
    <div
      v-for="item in items"
      :key="item.week"
      class="flex min-w-0 flex-1 flex-col items-center gap-1"
      :title="item.titulo"
    >
      <div class="relative w-full" :style="{ height: `${height}px` }">
        <div
          class="absolute inset-x-[-5px] border-t border-dashed border-texto-tenue"
          :style="{ bottom: alturaLinea }"
        />
        <div
          class="absolute inset-x-0 bottom-0 rounded-t-control"
          :class="item.clases"
          :style="{ height: item.altura }"
          :data-testid="`${testId}-bar`"
        />
        <span
          v-if="item.sobrecargada"
          class="absolute -top-1 left-1/2 inline-flex h-3.5 w-3.5 -translate-x-1/2 text-peligro-texto"
          aria-hidden="true"
        >
          <AppIcon name="warning" />
        </span>
      </div>
      <span class="font-mono text-cp-sm font-bold tabular-nums text-texto">
        {{ item.texto }}
      </span>
      <span class="text-cp-xs text-texto-tenue">{{ weekTitle(item.week) }}</span>
      <span
        v-if="item.week === hoy"
        class="rounded-pastilla bg-primario-fuerte px-1.5 py-px text-[10px] font-semibold text-sobre-primario"
      >
        Hoy
      </span>
      <span
        v-if="item.festivo"
        class="max-w-[112px] truncate rounded-pastilla border border-borde bg-tarjeta-suave px-1.5 py-px text-[10px] font-medium text-texto-suave"
        :title="item.tituloFestivo"
        data-testid="holiday-badge"
      >
        {{ item.festivo }}
      </span>
    </div>
  </div>
</template>
