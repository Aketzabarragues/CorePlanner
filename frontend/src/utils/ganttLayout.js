/**
 * Construccion del modelo del diagrama de Gantt.
 *
 * El layout es puro: recibe los datos ya preparados por la vista (items
 * ordenados, escala, rango) y devuelve filas, barras, sombreado y eje. No
 * reordena ni toca el DOM; la vista decide que se ve y como se pinta.
 */

import { shortMonthName } from './month'
import { addDays, dayIndex, diffDays, inclusiveDays, parseIsoDate, toIsoDate } from './ganttScale'
import { daysRangeLabel, isoWeekKey, weekLabel, weekDays } from './weeks'

/** Alto en pixeles de cada fila, de barra o de cabecera de grupo. */
export const GANTT_ROW_HEIGHT = 36

/** Inicial del dia de la semana en espanol, por `getUTCDay`: 0 es domingo. */
const DIA_SEMANA_INICIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

/**
 * Eje temporal del rango, en pixeles.
 *
 * `start` y `end` son fechas UTC que delimitan un rango inclusivo. Las celdas
 * son las cabeceras segun la escala y los ticks las lineas de rejilla.
 *
 * Ademas devuelve dos cosas para afinar la rejilla y la cabecera:
 * - `subticks`: las lineas secundarias, mas claras que las de celda. Dias
 *   dentro de la semana (escala de semana) y semanas dentro del mes (escala de
 *   mes). Solo las que caen dentro del rango visible.
 * - `bands`: los grupos de la banda 1 de la cabecera. Solo la escala de dia
 *   los usa: uno por mes, con todos sus dias visibles. En las demas escalas la
 *   lista va vacia.
 */
export function buildTimeAxis({ start, end, scale }) {
  const days = diffDays(start, end) + 1
  const width = days * scale.pxPerDay
  const cells = []
  const ticks = []
  const subticks = []
  const bands = []
  const first = parseIsoDate(start)
  const last = parseIsoDate(end)
  const tickX = (day) => dayIndex(day, first) * scale.pxPerDay

  if (scale.header === 'day') {
    for (let index = 0; index < days; index += 1) {
      const day = addDays(first, index)
      cells.push({
        key: toIsoDate(day),
        label: String(day.getUTCDate()),
        sublabel: DIA_SEMANA_INICIAL[day.getUTCDay()],
        x: index * scale.pxPerDay,
        width: scale.pxPerDay,
        kind: 'day',
      })
      ticks.push({ x: index * scale.pxPerDay, kind: 'day' })
    }
    // Banda del mes: agrupa todos los dias visibles del mes. La banda
    // empieza en el primer dia visible, asi que nunca sale del rango.
    const bandaPorMes = new Map()
    for (let index = 0; index < days; index += 1) {
      const day = addDays(first, index)
      const key = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}`
      const banda = bandaPorMes.get(key)
      if (banda) {
        banda.width += scale.pxPerDay
        continue
      }
      bandaPorMes.set(key, {
        key,
        label: `${shortMonthName(day.getUTCMonth() + 1)} ${day.getUTCFullYear()}`,
        x: index * scale.pxPerDay,
        width: scale.pxPerDay,
      })
    }
    bands.push(...bandaPorMes.values())
  } else if (scale.header === 'week') {
    let monday = addDays(first, -((first.getUTCDay() + 6) % 7))
    while (monday <= last) {
      const key = isoWeekKey(monday)
      const x = tickX(monday)
      cells.push({
        key,
        label: weekLabel(key),
        sublabel: daysRangeLabel(weekDays(key)),
        x,
        width: 7 * scale.pxPerDay,
        kind: 'week',
      })
      ticks.push({ x, kind: 'week' })
      // Sublineas: un dia dentro de la semana. El limite de la semana es una
      // linea de celda, asi que aqui solo va el interior.
      for (let offset = 1; offset < 7; offset += 1) {
        const subX = x + offset * scale.pxPerDay
        if (subX > 0 && subX < width) subticks.push({ x: subX, kind: 'day' })
      }
      monday = addDays(monday, 7)
    }
  } else if (scale.header === 'month') {
    let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1))
    while (cursor <= last) {
      // Los dias que tiene el mes, por `Date.UTC(year, mes siguiente, 0)`:
      // el dia 0 del mes siguiente es el ultimo del que se mide.
      const daysInMonth =
        new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate()
      const x = tickX(cursor)
      cells.push({
        key: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
        label: shortMonthName(cursor.getUTCMonth() + 1),
        sublabel: String(cursor.getUTCFullYear()),
        x,
        width: daysInMonth * scale.pxPerDay,
        kind: 'month',
      })
      ticks.push({ x, kind: 'month' })
      // Sublineas: las semanas del mes, que empiezan en lunes.
      for (let day = 1; day <= daysInMonth; day += 1) {
        const fecha = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), day))
        if (fecha.getUTCDay() !== 1) continue
        const subX = x + (day - 1) * scale.pxPerDay
        if (subX > 0 && subX < width) subticks.push({ x: subX, kind: 'week' })
      }
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
    }
  }

  return { days, width, cells, ticks, subticks, bands }
}

/**
 * Modelo completo del diagrama: filas, barras, sombreado y eje.
 *
 * `items` ya van ordenados por grupo y fecha de inicio: la vista ordena, el
 * layout no. `today` es la fecha de hoy para la linea del dia; por defecto la
 * del cliente, que en el motor solo se usa cuando no se le pasa ninguna.
 */
export function buildLayout({ items, groupMode, scale, start, end, nonWorkingDays, today = new Date() }) {
  const axis = buildTimeAxis({ start, end, scale })
  const first = parseIsoDate(start)
  const last = parseIsoDate(end)
  const nonLaborables = new Set(nonWorkingDays.map((day) => toIsoDate(day)))

  const rows = []
  const bars = []
  let grupoVigente = null

  for (const item of items) {
    const { task, grupo } = item
    if (groupMode !== 'sin' && grupo !== grupoVigente) {
      grupoVigente = grupo
      rows.push({ type: 'group', label: grupo, rowIndex: rows.length })
    }
    const inicio = parseIsoDate(task.start)
    const fin = parseIsoDate(task.end)
    const rowIndex = rows.length
    rows.push({ type: 'bar', rowIndex })
    bars.push({
      taskId: task.id,
      x: dayIndex(inicio, first) * scale.pxPerDay,
      width: inclusiveDays(inicio, fin) * scale.pxPerDay,
      rowIndex,
      label: task.title ?? task.name ?? '',
      color: task.custom_class ?? '',
      projectColor: task.project_color ?? null,
      provisional: task.is_provisional === true,
      status: task.status ?? null,
      title: task.title ?? task.name ?? '',
      startIso: toIsoDate(inicio),
      endIso: toIsoDate(fin),
      assignedName: task.assigned_name ?? null,
    })
  }

  const shaded = []
  for (let index = 0; index < axis.days; index += 1) {
    const day = addDays(first, index)
    const weekend = weekendIndex(day.getUTCDay())
    const key = toIsoDate(day)
    if (weekend) {
      shaded.push({ x: index * scale.pxPerDay, width: scale.pxPerDay, kind: 'weekend' })
    } else if (nonLaborables.has(key)) {
      shaded.push({ x: index * scale.pxPerDay, width: scale.pxPerDay, kind: 'festivo' })
    }
  }

  const todayDate = parseIsoDate(today)
  let todayIndex = null
  if (todayDate >= first && todayDate <= last) {
    todayIndex = dayIndex(todayDate, first)
  }

  return {
    scale,
    pxPerDay: scale.pxPerDay,
    start: toIsoDate(first),
    end: toIsoDate(last),
    days: axis.days,
    width: axis.width,
    axis,
    rows,
    bars,
    shaded,
    todayIndex,
  }
}

/** Dias enteros que corresponden a un desplazamiento en pixeles, al arrastrar. */
export function snapDelta(pixels, pxPerDay) {
  return Math.round(pixels / pxPerDay)
}

/**
 * Geometria de la flecha de un vinculo de dependencias.
 *
 * Sale del fin de la barra del requisito al inicio de la barra dependiente.
 * En la misma fila es un trazo horizontal; en filas distintas, una polilinea
 * con un quiebre en el punto medio, para no atravesar las barras. La y de
 * cada fila es el centro de su barra. Si falta alguna de las dos barras
 * (filtrada) no hay flecha: se devuelve null.
 *
 * `barraPorId` mapea identificador de tarea a barra del layout (`x`, `width`,
 * `rowIndex`). `conPunta` solo lleva los `precedes`: los `relates` son linea
 * discontinua sin punta.
 */
export function flechaDe(vinculo, barraPorId) {
  const requisito = barraPorId.get(vinculo.depends_on_id)
  const dependiente = barraPorId.get(vinculo.task_id)
  if (!requisito || !dependiente) return null
  const y1 = requisito.rowIndex * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2
  const y2 = dependiente.rowIndex * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2
  const x1 = requisito.x + requisito.width
  const x2 = dependiente.x
  const puntos =
    requisito.rowIndex === dependiente.rowIndex
      ? [[x1, y1], [x2, y2]]
      : [[x1, y1], [(x1 + x2) / 2, y1], [(x1 + x2) / 2, y2], [x2, y2]]
  return { ...vinculo, puntos, conPunta: vinculo.type === 'precedes' }
}

/**
 * Rango desplazado delta dias, conservando la duracion.
 *
 * Acepta y devuelve cadenas ISO.
 */
export function moveRange(startIso, endIso, deltaDays) {
  const delta = deltaDays * 24 * 60 * 60 * 1000
  return {
    start: toIsoDate(new Date(parseIsoDate(startIso).getTime() + delta)),
    end: toIsoDate(new Date(parseIsoDate(endIso).getTime() + delta)),
  }
}

/**
 * Rango con un extremo desplazado, respetando que el rango dura al menos 1 dia.
 *
 * `edge` es 'start' o 'end'. Al mover el inicio no puede pasar de la fecha de
 * fin y viceversa: el exceso de delta se recorta al otro extremo.
 */
export function resizeRange(startIso, endIso, edge, deltaDays) {
  const start = parseIsoDate(startIso)
  const end = parseIsoDate(endIso)
  if (edge === 'start') {
    const moved = addDays(start, deltaDays)
    const limited = moved > end ? end : moved
    return { start: toIsoDate(limited), end: toIsoDate(end) }
  }
  if (edge === 'end') {
    const moved = addDays(end, deltaDays)
    const limited = moved < start ? start : moved
    return { start: toIsoDate(start), end: toIsoDate(limited) }
  }
  throw new Error(`Lado desconocido: ${edge}`)
}

/** Fin de semana: sabado (6) y domingo (0), por `getUTCDay`. */
export function weekendIndex(dayOfWeek) {
  return dayOfWeek === 6 || dayOfWeek === 0
}
