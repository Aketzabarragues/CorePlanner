/**
 * Semanas ISO.
 *
 * La unidad natural de CorePlanner es la semana ISO: de lunes a domingo, con
 * la semana 1 del ano la que contiene el primer jueves. La clave tiene la
 * forma YYYY-Www.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Clave de semana ISO de una fecha: "2026-W46". */
export function isoWeekKey(date) {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
  const dayNumber = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNumber + 3)
  const year = target.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(year, 0, 4))
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3)
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS))
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** Lunes de la semana ISO con clave YYYY-Www. */
export function weekMonday(key) {
  const [year, week] = key.split('-W').map(Number)
  const january4 = new Date(Date.UTC(year, 0, 4))
  const dayNumber = (january4.getUTCDay() + 6) % 7
  const monday = new Date(january4.getTime())
  monday.setUTCDate(january4.getUTCDate() - dayNumber + (week - 1) * 7)
  return monday
}

/** Clave de la semana ISO en curso. */
export function currentWeekKey(now = new Date()) {
  return isoWeekKey(now)
}

/** Semana ISO que esta delta semanas mas adelante, o antes si delta es negativo. */
export function shiftWeek(key, delta) {
  const monday = weekMonday(key)
  monday.setUTCDate(monday.getUTCDate() + delta * 7)
  return isoWeekKey(monday)
}

/** Etiqueta corta de la semana: "S46". */
export function weekLabel(key) {
  return `S${key.split('-W')[1]}`
}
