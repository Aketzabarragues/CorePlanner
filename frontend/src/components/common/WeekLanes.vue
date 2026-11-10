<script setup>
/**
 * Carriles de una semana: una fila por persona.
 *
 * La semana se lee por filas, no por columnas: cada fila es una persona y sus
 * tareas son barras continuas dentro de la fila, de lunes a viernes. Se ve de un
 * vistazo quien esta ocupado y quien no, sin depender del color de nadie.
 *
 * Las barras se reparten en carriles: dos tareas de la misma persona que se
 * pisan van en sub-filas distintas, de modo que nunca se tapan y la fila solo
 * crece para quien lo necesita.
 *
 * Las tareas que se salen de la semana se recortan a sus dias laborables: una
 * tarea que empieza antes entra el lunes y una que acaba despues sale el
 * viernes.
 *
 * Al pulsar una barra se emite su identificador con `open-task`. Al pulsar un
 * dia de la cabecera, `open-day`.
 */
import { computed } from 'vue'

import { columnLabel } from '../../utils/kanban'
import { localDateKey, weekdayNames } from '../../utils/month'

const props = defineProps({
  /** Dias laborables de la semana: [{date, day, weekday}]. */
  days: { type: Array, required: true },
  /** Personas visibles, ordenadas por departamento y luego por nombre. */
  people: { type: Array, default: () => [] },
  /** Tareas ya filtradas. */
  tasks: { type: Array, default: () => [] },
  /** Dias no laborables. */
  nonWorkingDays: { type: Array, default: () => [] },
})

const emit = defineEmits(['open-day', 'open-task'])

const NOMBRES_DIA = weekdayNames()

/** Fecha de hoy, para marcar el dia en la cabecera. */
const hoy = computed(() => localDateKey())

/** Una columna por dia laborable. */
const columnas = computed(() => `repeat(${Math.max(props.days.length, 1)}, 1fr)`)

/**
 * Rejilla de las barras de una fila.
 *
 * Cada carril es una fila de la rejilla: las barras que se pisan van en
 * carriles distintos y por eso la fila crece solo para quien las tiene.
 */
const estiloCeldas = computed(() => ({
  gridTemplateColumns: columnas.value,
  gridAutoRows: '1.5rem',
}))

/** Dias no laborables de cada dia de la semana. */
const noLaborablesPorFecha = computed(() => {
  const mapa = new Map()
  for (const dia of props.nonWorkingDays) {
    if (!props.days.some((laborable) => laborable.date === dia.date)) continue
    const lista = mapa.get(dia.date) ?? []
    lista.push(dia)
    mapa.set(dia.date, lista)
  }
  return mapa
})

/**
 * Columna del primer dia laborable que no es anterior a la fecha.
 *
 * Sirve para recortar por la izquierda: una tarea que empieza un sabado entra
 * el lunes.
 */
function primeraColumna(date) {
  for (let indice = 0; indice < props.days.length; indice += 1) {
    if (props.days[indice].date >= date) return indice
  }
  return -1
}

/** Columna del ultimo dia laborable que no es posterior a la fecha. */
function ultimaColumna(date) {
  for (let indice = props.days.length - 1; indice >= 0; indice -= 1) {
    if (props.days[indice].date <= date) return indice
  }
  return -1
}

/** Columnas que ocupa una tarea dentro de la semana. */
function barraDe(tarea) {
  const inicio = primeraColumna(tarea.start)
  const fin = ultimaColumna(tarea.end)
  if (inicio === -1 || fin === -1 || fin < inicio) return null
  return { tarea, inicio, fin }
}

/**
 * Reparte las barras de una fila en carriles.
 *
 * Cada carril guarda el ultimo dia que ocupa. Una barra busca el primer
 * carril que ya ha quedado libre; si no hay ninguno, se abre uno nuevo. Asi
 * dos tareas que se pisan nunca se tapan.
 */
function repartir(barras) {
  const ordenadas = [...barras].sort((a, b) => a.inicio - b.inicio || b.fin - a.fin)
  const carriles = []
  const resultado = []
  for (const barra of ordenadas) {
    let carril = carriles.findIndex((fin) => fin < barra.inicio)
    if (carril === -1) {
      carriles.push(barra.fin)
      carril = carriles.length - 1
    } else {
      carriles[carril] = barra.fin
    }
    resultado.push({ ...barra, carril })
  }
  return resultado
}

/**
 * Filas de la semana: una por persona y, si hace falta, la de sin asignar.
 *
 * La fila de sin asignar solo aparece si hay tareas de alguien que no tiene
 * nombre, que es lo unico que la distingue.
 */
const filas = computed(() => {
  const porPersona = new Map()
  for (const persona of props.people) porPersona.set(String(persona.id), [])
  const sueltas = []

  for (const tarea of props.tasks) {
    const asignado = tarea.assigned_to ?? null
    const destino = asignado === null ? sueltas : porPersona.get(String(asignado))
    if (!destino) continue
    const barra = barraDe(tarea)
    if (barra) destino.push(barra)
  }

  const resultado = props.people.map((persona) => ({
    id: persona.id,
    name: persona.name,
    department_name: persona.department_name,
    barras: repartir(porPersona.get(String(persona.id)) ?? []),
  }))

  if (sueltas.length) {
    resultado.push({
      id: null,
      name: 'Sin asignar',
      department_name: null,
      barras: repartir(sueltas),
    })
  }
  return resultado
})

/** Posicion de una barra dentro de la rejilla de su fila. */
function estiloBarra(barra) {
  return {
    gridColumn: `${barra.inicio + 1} / ${barra.fin + 2}`,
    gridRow: `${barra.carril + 1}`,
  }
}

/** Titulo con todos los datos de una tarea, para el aviso al pasar el raton. */
function tituloTarea(tarea) {
  const estado = tarea.status ? ` · ${columnLabel(tarea.status)}` : ''
  return `${tarea.title}${estado} · ${tarea.assigned_name ?? 'sin asignar'} · ${tarea.project_name} · ${tarea.start} - ${tarea.end}`
}
</script>

<template>
  <div class="overflow-x-auto rounded border border-slate-200 bg-white" data-testid="week-lanes">
    <div class="min-w-[38rem]">
      <div class="flex border-b border-slate-200 bg-slate-100">
        <div
          class="w-40 shrink-0 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500"
        >
          Persona
        </div>
        <div class="grid min-w-0 flex-1 items-start" :style="{ gridTemplateColumns: columnas }">
          <div
            v-for="dia in days"
            :key="dia.date"
            class="align-top border-l border-slate-200 px-2 py-1.5"
            :data-testid="`week-lane-head-${dia.date}`"
          >
            <span class="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {{ NOMBRES_DIA[dia.weekday] }}
            </span>
            <button
              type="button"
              class="text-sm font-semibold text-siemens-900 hover:underline"
              :title="`Ver el día ${dia.date}`"
              :data-testid="`week-day-${dia.date}`"
              @click="emit('open-day', dia.date)"
            >
              {{ dia.day }}
            </button>
            <span
              v-if="dia.date === hoy"
              class="mt-0.5 mr-1 inline-block rounded-full bg-siemens-900 px-1.5 py-px text-[10px] font-semibold text-white"
              data-testid="week-lane-today"
            >
              Hoy
            </span>
            <template v-for="festivo in noLaborablesPorFecha.get(dia.date) ?? []" :key="festivo.id">
              <span
                v-if="festivo.scope === 'global'"
                class="mt-0.5 mr-1 inline-block rounded-full border border-slate-300 bg-slate-50 px-1.5 py-px text-[10px] font-medium text-slate-700"
                :title="festivo.name"
                data-testid="week-lane-holiday"
              >
                {{ festivo.name }}
              </span>
              <span
                v-else
                class="mt-0.5 mr-1 inline-block rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-800"
                :title="
                  festivo.department_name
                    ? `${festivo.name} (${festivo.department_name})`
                    : festivo.name
                "
                data-testid="week-lane-holiday"
              >
                {{ festivo.name }}
              </span>
            </template>
          </div>
        </div>
      </div>

      <div
        v-for="fila in filas"
        :key="fila.id ?? 'sin-asignar'"
        class="flex border-b border-slate-100 last:border-b-0"
        :class="fila.id === null ? 'bg-slate-50' : ''"
        :data-testid="fila.id === null ? 'week-lane-unassigned' : `week-lane-person-${fila.id}`"
      >
        <div class="w-40 shrink-0 overflow-hidden px-3 py-1">
          <p
            class="truncate text-xs font-medium text-slate-700"
            :data-testid="
              fila.id === null ? 'week-lane-unassigned-name' : `week-lane-name-${fila.id}`
            "
          >
            {{ fila.name }}
          </p>
          <p v-if="fila.department_name" class="truncate text-[10px] text-slate-400">
            {{ fila.department_name }}
          </p>
        </div>
        <div class="grid min-w-0 flex-1 gap-px p-1" :style="estiloCeldas">
          <div
            v-for="barra in fila.barras"
            :key="barra.tarea.id"
            class="flex min-w-0 items-center overflow-hidden rounded bg-siemens-700 px-1.5 text-[11px] text-white"
            :style="estiloBarra(barra)"
            :title="tituloTarea(barra.tarea)"
            data-testid="week-task"
            @click="emit('open-task', barra.tarea.id)"
          >
            <span class="truncate">{{ barra.tarea.title }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
