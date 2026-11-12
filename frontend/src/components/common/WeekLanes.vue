<script setup>
/**
 * Las filas de una semana: una por persona.
 *
 * La semana se lee por filas, no por columnas: cada fila es una persona y sus
 * tareas son barras continuas dentro de la fila. Se ve de un vistazo quien
 * esta ocupado y quien no.
 *
 * El componente pinta el grupo de filas de una semana (un `tbody`): la
 * cabecera con los siete dias y una fila por persona. Quien lo usa pone la
 * tabla alrededor: en el mes, una sola tabla con un grupo de filas por semana,
 * de modo que las semanas se continuen una en otra sin huecos.
 *
 * Las barras se reparten en carriles: dos tareas de la misma persona que se
 * pisan van en sub-filas distintas, de modo que nunca se tapan y la fila solo
 * crece para quien lo necesita.
 *
 * Las tareas que se salen de la semana se recortan a sus dias laborables: una
 * tarea que empieza antes entra el lunes y una que acaba despues sale el
 * viernes. El fin de semana se ve, atenuado, pero no lleva barras: el motor de
 * capacidad no reparte horas ahi.
 *
 * Al pulsar una barra se emite su identificador con `open-task`. Al pulsar un
 * dia de la cabecera, `open-day`.
 */
import { computed } from 'vue'

import { columnLabel } from '../../utils/kanban'
import { localDateKey, weekdayNames } from '../../utils/month'
import { daysRangeLabel, isoWeekKey } from '../../utils/weeks'

const props = defineProps({
  /** Los siete dias de la semana: [{date, day, weekday, weekend}]. */
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

/** Rango de la semana: "9 - 15 nov". */
const rango = computed(() => daysRangeLabel(props.days))

/** Clave ISO de la semana: "2026-W46". */
const claveSemana = computed(() => {
  const primero = props.days[0]
  if (!primero) return ''
  return isoWeekKey(new Date(`${primero.date}T00:00:00Z`))
})

/** Dias no laborables de cada dia de la semana. */
const noLaborablesPorFecha = computed(() => {
  const mapa = new Map()
  for (const dia of props.nonWorkingDays) {
    if (!props.days.some((deLaSemana) => deLaSemana.date === dia.date)) continue
    const lista = mapa.get(dia.date) ?? []
    lista.push(dia)
    mapa.set(dia.date, lista)
  }
  return mapa
})

/**
 * Columna del primer dia laborable que no es anterior a la fecha.
 *
 * El fin de semana se salta: una barra nunca lo ocupa. Sirve para recortar por
 * la izquierda, de modo que una tarea que empieza un sabado entra el lunes.
 */
function primeraColumna(date) {
  for (let indice = 0; indice < props.days.length; indice += 1) {
    const dia = props.days[indice]
    if (dia.weekend) continue
    if (dia.date >= date) return indice
  }
  return -1
}

/** Columna del ultimo dia laborable que no es posterior a la fecha. */
function ultimaColumna(date) {
  for (let indice = props.days.length - 1; indice >= 0; indice -= 1) {
    const dia = props.days[indice]
    if (dia.weekend) continue
    if (dia.date <= date) return indice
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
 * Agrupa las barras de una persona en carriles: una lista por sub-fila.
 *
 * Una persona sin tareas tiene un carril vacio, para que su fila salga igual.
 */
function carrilesDe(barras) {
  if (!barras.length) return [[]]
  const carriles = []
  for (const barra of repartir(barras)) {
    if (!carriles[barra.carril]) carriles[barra.carril] = []
    carriles[barra.carril].push(barra)
  }
  return carriles
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
    carriles: carrilesDe(porPersona.get(String(persona.id)) ?? []),
  }))

  if (sueltas.length) {
    resultado.push({
      id: null,
      name: 'Sin asignar',
      department_name: null,
      carriles: carrilesDe(sueltas),
    })
  }
  return resultado
})

/**
 * Celdas de una fila: las barras y los huecos que dejan.
 *
 * Las columnas libres se emiten de una en una, para poder atenuar las del fin
 * de semana, que nunca llevan barra.
 */
function celdasDe(carril) {
  const celdas = []
  let cursor = 0
  for (const barra of carril) {
    if (barra.inicio > cursor) {
      celdas.push({ tipo: 'hueco', span: barra.inicio - cursor, inicio: cursor })
      cursor = barra.inicio
    }
    celdas.push({
      tipo: 'barra',
      span: barra.fin - barra.inicio + 1,
      inicio: barra.inicio,
      barra,
    })
    cursor = barra.fin + 1
  }
  for (let indice = cursor; indice < props.days.length; indice += 1) {
    celdas.push({ tipo: 'hueco', span: 1, inicio: indice })
  }
  return celdas
}

/** Si una columna es de fin de semana, que se pinta atenuada. */
function esFinDeSemana(indice) {
  return Boolean(props.days[indice]?.weekend)
}

/** Titulo con todos los datos de una tarea, para el aviso al pasar el raton. */
function tituloTarea(tarea) {
  const estado = tarea.status ? ` · ${columnLabel(tarea.status)}` : ''
  return `${tarea.title}${estado} · ${tarea.project_name} · ${tarea.start} - ${tarea.end}`
}
</script>

<template>
  <tbody data-testid="week-lanes">
    <tr class="bg-slate-100" data-testid="week-lane-header">
      <th
        class="w-40 border-b border-slate-200 px-2 py-1.5 text-left align-top"
        scope="col"
      >
        <span class="block text-xs font-semibold text-siemens-900" data-testid="week-lane-range">
          {{ rango }}
        </span>
        <span class="block text-[10px] text-slate-400">{{ claveSemana }}</span>
      </th>
      <th
        v-for="dia in days"
        :key="dia.date"
        class="border-b border-l border-slate-200 px-2 py-1.5 text-left align-top"
        :class="esFinDeSemana(dia.weekday) ? 'bg-slate-50' : ''"
        scope="col"
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
            class="mt-0.5 mr-1 inline-block rounded-full border border-slate-300 bg-white px-1.5 py-px text-[10px] font-medium text-slate-700"
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
      </th>
    </tr>

    <template v-for="fila in filas" :key="fila.id ?? 'sin-asignar'">
      <tr
        v-for="(carril, indiceCarril) in fila.carriles"
        :key="`${fila.id ?? 'sin-asignar'}-${indiceCarril}`"
        class="border-b border-slate-100"
        :class="fila.id === null ? 'bg-slate-50' : ''"
        :data-testid="`week-lane-row-${fila.id ?? 'sin-asignar'}-${indiceCarril}`"
      >
        <th
          v-if="indiceCarril === 0"
          class="w-40 border-r border-slate-100 px-2 py-1 text-left align-top"
          :rowspan="fila.carriles.length"
          scope="row"
          :data-testid="
            fila.id === null ? 'week-lane-unassigned-name' : `week-lane-name-${fila.id}`
          "
        >
          <span class="block truncate text-xs font-medium text-slate-700">{{ fila.name }}</span>
          <span v-if="fila.department_name" class="block truncate text-[10px] text-slate-400">
            {{ fila.department_name }}
          </span>
        </th>

        <td
          v-for="celda in celdasDe(carril)"
          :key="`${celda.tipo}-${celda.inicio}`"
          class="border-l border-slate-100 p-0.5 align-middle"
          :class="esFinDeSemana(celda.inicio) ? 'bg-slate-50' : ''"
          :colspan="celda.span"
        >
          <div
            v-if="celda.tipo === 'barra'"
            class="flex min-w-0 cursor-pointer flex-col justify-center overflow-hidden rounded px-1.5 py-0.5 text-white"
            :style="{ backgroundColor: celda.barra.tarea.project_color }"
            :title="tituloTarea(celda.barra.tarea)"
            :data-task-id="celda.barra.tarea.id"
            :data-lane="celda.barra.carril"
            :data-inicio="celda.inicio"
            :data-columnas="celda.span"
            data-testid="week-task"
            @click="emit('open-task', celda.barra.tarea.id)"
          >
            <span class="truncate text-[11px] font-medium leading-tight">
              {{ celda.barra.tarea.title }}
            </span>
            <span class="truncate text-[10px] leading-tight opacity-80">
              {{ celda.barra.tarea.project_name }}
            </span>
          </div>
        </td>
      </tr>
    </template>
  </tbody>
</template>
