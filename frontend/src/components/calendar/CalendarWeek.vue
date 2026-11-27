<script setup>
/**
 * El grupo de filas de una semana del calendario: la fila de cabecera y una
 * fila por persona.
 *
 * La semana se lee por filas, no por columnas: cada fila es una persona y
 * sus tareas son barras continuas dentro de la fila. Se ve de un vistazo
 * quien esta ocupado y quien no.
 *
 * El componente pinta un `<tbody>`; quien lo usa pone la tabla alrededor.
 * En el mes, una sola tabla con un grupo de filas por semana, de modo que
 * las semanas se continuen una en otra sin huecos.
 *
 * Las barras se reparten en carriles: dos tareas de la misma persona que se
 * pisan van en sub-filas distintas, de modo que nunca se tapan y la fila solo
 * crece para quien lo necesita. El reparto ya lo hizo `buildWeekLayout`
 * (utils/calendarLayout.js); aqui solo se pinta.
 *
 * Las tareas que se salen de la semana se recortan a sus dias laborables:
 * una tarea que empieza antes entra el lunes y una que acaba despues sale el
 * viernes. El fin de semana se ve, atenuado, pero no lleva barras: el motor
 * de capacidad no reparte horas ahi.
 *
 * Al pulsar una barra se emite su identificador con `open-task`. Al pulsar
 * un dia de la cabecera, `open-day`.
 *
 * La barra se agarra con `mousedown` y el arrastre lo resuelve quien lo
 * usa: si el proyecto de la tarea esta entre los editables, la barra se
 * puede arrastrar y se emite `drag-start` con la tarea, la zona agarrada y
 * el evento; si no, solo se puede pulsar. Cada celda de dia lleva su
 * `data-day` con el primer dia que cubre, para que la soltura se resuelva
 * contra el cuerpo de la tabla.
 *
 * Las asas de redimension se muestran segun si el extremo real de la tarea
 * cae en la semana visible: una barra que empieza antes de la semana no se
 * redimensiona por el inicio y una que se sale por el fin tampoco por el fin.
 */
import { computed } from 'vue'

import { useTaskStatusesStore } from '../../stores/taskStatuses'
import { parseIsoDate } from '../../utils/ganttScale'
import { shortMonthName } from '../../utils/month'
import { DEFAULT_TASK_STATUSES, columnLabel } from '../../utils/kanban'
import { celdasDeCarril } from '../../utils/calendarLayout'
import CalendarBar from './CalendarBar.vue'
import CalendarDayHeader from './CalendarDayHeader.vue'

const props = defineProps({
  /** Los siete dias de la semana: [{date, day, weekday, weekend}]. */
  days: { type: Array, required: true },
  /** Filas ya repartidas por `buildWeekLayout`: [{id, name, department_name, carriles}]. */
  filas: { type: Array, required: true },
  /** Dias no laborables. */
  nonWorkingDays: { type: Array, default: () => [] },
  /** Proyectos en los que quien entra puede escribir: con esa barra, arrastre. */
  editableProjectIds: { type: Array, default: () => [] },
  /**
   * Semana que ocupa esta rejilla dentro del mes. Marca el <tbody> con
   * `data-semana`, de modo que la soltura del arrastre sepa en que semana cae.
   */
  semanaIndice: { type: Number, default: 0 },
  /**
   * Banda de destino del arrastre: {taskId, start, end, personaId}. La semana
   * sombrea los dias del rango que caen en la fila de la persona del destino;
   * el resto de filas no se sombrea.
   */
  destino: { type: Object, default: null },
  /** Barra enfocada (id de tarea): la unica con `tabindex` 0 de la rejilla. */
  barraEnfocada: { type: [Number, String, null], default: null },
  /**
   * Departamentos con su color, para el avatar de la celda de persona. El
   * color es dato del backend; la fila solo lleva el nombre, asi que la
   * busqueda va por nombre de departamento.
   */
  departamentos: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'open-day',
  'open-task',
  'drag-start',
  'seleccionar',
  'tecla',
  'contexto',
  'entrar',
  'salir',
  'crear',
])

/**
 * Estados por proyecto: el componente no pide al servidor, la carga la hace
 * quien lo contiene. Sin carga, los cuatro por defecto.
 */
const statusStore = useTaskStatusesStore()
function estadosDe(projectId) {
  const lista = statusStore.statesOf(projectId)
  return lista.length ? lista : DEFAULT_TASK_STATUSES
}

/**
 * Celdas de una sub-fila: las barras del carril y los huecos que dejan,
 * cubriendo las siete columnas de la semana sin huecos ni solapes.
 */
function celdasDe(carril) {
  return celdasDeCarril(props.days, carril)
}

/** Si una columna es de fin de semana, que se pinta atenuada. */
function esFinDeSemana(indice) {
  return Boolean(props.days[indice]?.weekend)
}

/**
 * Si la celda cae en la banda de destino: la fila es la de la persona del
 * destino y alguno de los dias que cubre la celda esta dentro del rango nuevo.
 *
 * Un solo criterio para la banda: la semana sombrea los dias del rango que le
 * tocan, de modo que un rango que abarca dos semanas se ve completo en cada
 * una. Sin destino no hay banda.
 */
function dentroDeLaBanda(fila, inicio, span) {
  const destino = props.destino
  if (!destino || fila.id !== destino.personaId) return false
  for (let offset = 0; offset < span; offset += 1) {
    const fecha = props.days[inicio + offset]?.date
    if (fecha && fecha >= destino.start && fecha <= destino.end) return true
  }
  return false
}

/** Titulo con todos los datos de una tarea, para el aviso al pasar el raton. */
function tituloTarea(tarea) {
  const estado = tarea.status
    ? ` · ${columnLabel(tarea.status, estadosDe(tarea.project_id))}`
    : ''
  const provisional = tarea.is_provisional ? ' (provisional)' : ''
  return `${tarea.title}${estado} · ${tarea.project_name}${provisional} · ${tarea.start} - ${tarea.end}`
}

/**
 * Si la barra se puede arrastrar: el proyecto de la tarea esta entre los
 * editables de quien entra, el mismo criterio que el Gantt por barra. Sin
 * permiso no hay arrastre, pero el clic sigue abriendo la tarea.
 */
function esEditable(tarea) {
  return props.editableProjectIds.includes(Number(tarea.project_id))
}

/**
 * Si el extremo real de la tarea cae en la semana visible, para la asa.
 *
 * La barra se recorta a la semana, de modo que el inicio pintado no es el
 * inicio real: el asa de inicio solo se ve si la `start` real de la tarea es
 * un dia de esta semana, y el asa de fin si lo es la `end` real. Asi una
 * tarea que empieza antes o acaba despues no se redimensiona por el extremo
 * que no se ve.
 */
function extremoVisible(tarea, campo) {
  return props.days.some((dia) => dia.date === tarea[campo])
}

/**
 * Etiqueta aria de la barra: titulo, persona, fechas y avance, en el mismo
 * criterio que el Gantt. Sin permiso de escritura termina en "Solo lectura.".
 */
function etiquetaAriaDe(tarea, editable) {
  if (!tarea) return ''
  const partes = [tarea.title]
  if (tarea.assigned_name) partes.push(tarea.assigned_name)
  const desde = parseIsoDate(tarea.start)
  const hasta = parseIsoDate(tarea.end)
  partes.push(
    `Del ${desde.getUTCDate()} de ${shortMonthName(desde.getUTCMonth() + 1)} al ${hasta.getUTCDate()} de ${shortMonthName(hasta.getUTCMonth() + 1)} de ${hasta.getUTCFullYear()}.`,
  )
  if (tarea.progress > 0) partes.push(`${tarea.progress} % de avance.`)
  return partes.join(' ') + (editable ? '' : ' Solo lectura.')
}

/**
 * Iniciales del avatar de la fila: una por nombre de la persona. Sin nombre
 * (fila de sin asignar) no se pinta inicial.
 */
function inicialesDe(fila) {
  if (fila.id === null) return ''
  const partes = (fila.name ?? '').trim().split(/\s+/)
  return partes.length ? partes[0][0].toUpperCase() : ''
}

/**
 * Estilo en linea del avatar: el color del departamento (dato del backend)
 * con el texto calculado contra el fondo. Sin departamento, tarjeta suave
 * con texto suave. En linea porque el color llega en hex.
 */
function estiloAvatar(fila) {
  const color = fila.department_name
    ? colorPorDepartamento.value.get(fila.department_name)
    : null
  if (!color) {
    return {
      backgroundColor: 'rgb(var(--cp-tarjeta-suave))',
      color: 'rgb(var(--cp-texto-suave))',
    }
  }
  return { backgroundColor: color, color: contrasteSobre(color) }
}

/** Color de cada departamento, por nombre: la fila solo lleva el nombre. */
const colorPorDepartamento = computed(() => {
  const mapa = new Map()
  for (const departamento of props.departamentos) {
    if (departamento.name && departamento.color) mapa.set(departamento.name, departamento.color)
  }
  return mapa
})

/**
 * Color del punto del departamento de la fila: el dato del backend o el
 * punto neutro por token si el departamento no trae color.
 */
function colorDeDepartamento(fila) {
  const color = fila.department_name
    ? colorPorDepartamento.value.get(fila.department_name)
    : null
  return color ?? 'rgb(var(--cp-neutro-punto))'
}

/** Texto legible sobre un hex de fondo: blanco u oscuro por luminancia. */
function contrasteSobre(hex) {
  const limpio = (hex ?? '').replace('#', '')
  const r = parseInt(limpio.slice(0, 2), 16)
  const g = parseInt(limpio.slice(2, 4), 16)
  const b = parseInt(limpio.slice(4, 6), 16)
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminancia >= 0.6 ? 'rgb(var(--cp-texto))' : 'rgb(var(--cp-sobre-primario))'
}

/**
 * Clic derecho sobre el hueco de un dia: el menu del dia.
 *
 * El menu de la barra se detiene en la barra, aqui solo llegan los huecos
 * (y el margen de la celda de barra). Sube la fecha del primer dia que
 * cubre la celda y la posicion del puntero.
 */
function alMenuHueco(event) {
  event.preventDefault()
  emit('contexto', {
    tipo: 'hueco',
    fecha: event.currentTarget.dataset.day,
    x: event.clientX,
    y: event.clientY,
  })
}

/** Doble clic sobre un hueco: alta de tarea en ese dia. */
function alCrearHueco(event) {
  emit('crear', event.currentTarget.dataset.day)
}
</script>

<template>
  <tbody data-testid="week-lanes" :data-semana="semanaIndice">
    <CalendarDayHeader
      :days="days"
      :non-working-days="nonWorkingDays"
      :destino="destino"
      @open-day="emit('open-day', $event)"
    />

    <template v-for="fila in filas" :key="fila.id ?? 'sin-asignar'">
      <tr
        v-for="(carril, indiceCarril) in fila.carriles"
        :key="`${fila.id ?? 'sin-asignar'}-${indiceCarril}`"
        class="border-b border-borde-suave"
        :class="fila.id === null ? 'bg-tarjeta-suave' : ''"
        :data-testid="`week-lane-row-${fila.id ?? 'sin-asignar'}-${indiceCarril}`"
      >
        <th
          v-if="indiceCarril === 0"
          class="sticky left-0 z-10 w-40 border-r border-borde bg-tarjeta px-3 py-1.5 text-left align-top"
          :rowspan="fila.carriles.length"
          scope="row"
          :data-testid="
            fila.id === null ? 'week-lane-unassigned-name' : `week-lane-name-${fila.id}`
          "
        >
          <div class="flex items-center gap-2">
            <span
              class="flex h-6 w-6 flex-none items-center justify-center rounded-avatar text-cp-micro font-bold"
              :style="estiloAvatar(fila)"
              aria-hidden="true"
            >
              {{ inicialesDe(fila) }}
            </span>
            <span class="min-w-0">
              <span class="block truncate text-cp-xs font-semibold text-texto">{{ fila.name }}</span>
              <span
                v-if="fila.department_name"
                class="flex min-w-0 items-center gap-1 text-cp-micro text-texto-tenue"
              >
                <span
                  class="h-1.5 w-1.5 flex-none rounded-full"
                  :style="{ backgroundColor: colorDeDepartamento(fila) }"
                  aria-hidden="true"
                ></span>
                <span class="truncate">{{ fila.department_name }}</span>
              </span>
            </span>
          </div>
        </th>

        <td
          v-for="celda in celdasDe(carril)"
          :key="`${celda.tipo}-${celda.inicio}`"
          class="border-l border-borde-suave p-0.5 align-middle transition-colors hover:bg-tarjeta-suave/70"
          :class="
            esFinDeSemana(celda.inicio)
              ? 'cp-trama-fin-semana'
              : dentroDeLaBanda(fila, celda.inicio, celda.span)
                ? 'bg-aviso-fondo/60'
                : ''
          "
          :colspan="celda.span"
          :data-day="days[celda.inicio]?.date"
          @contextmenu="alMenuHueco"
          @dblclick="alCrearHueco"
        >
          <CalendarBar
            v-if="celda.tipo === 'barra'"
            :barra="{ ...celda.barra, inicio: celda.inicio, span: celda.span }"
            :editable="esEditable(celda.barra.tarea)"
            :puede-redimensionar-inicio="extremoVisible(celda.barra.tarea, 'start')"
            :puede-redimensionar-fin="extremoVisible(celda.barra.tarea, 'end')"
            :title="tituloTarea(celda.barra.tarea)"
            :previsualizada="destino !== null && destino.taskId === celda.barra.tarea.id"
            :seleccionada="barraEnfocada === celda.barra.tarea.id"
            :etiqueta-aria="etiquetaAriaDe(celda.barra.tarea, esEditable(celda.barra.tarea))"
            @drag-start="emit('drag-start', { ...$event, dias: days })"
            @abrir="emit('open-task', $event)"
            @seleccionar="emit('seleccionar', { ...$event, dias: days })"
            @tecla="emit('tecla', { ...$event, dias: days })"
            @contexto="emit('contexto', { ...$event })"
            @entrar="emit('entrar', { event: $event, tarea: celda.barra.tarea })"
            @salir="emit('salir')"
          />
        </td>
      </tr>
    </template>
  </tbody>
</template>
