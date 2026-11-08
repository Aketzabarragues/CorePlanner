/**
 * Semanas ISO.
 *
 * La unidad natural de CorePlanner es la semana ISO: de lunes a domingo, con
 * la semana 1 del ano la que contiene el primer jueves. La clave tiene la
 * forma YYYY-Www.
 */

import { shortMonthName } from './month'

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

/** Titulo de la semana, para las cabeceras de columna: "Sem 46". */
export function weekTitle(key) {
  return `Sem ${key.split('-W')[1]}`
}

/**
 * Clave de la semana, venga como texto o como objeto del informe.
 *
 * El informe de capacidad entrega cada semana como objeto, con sus
 * festivos; otras pantallas usan la clave suelta.
 */
export function weekKey(week) {
  if (typeof week === 'string') return week
  return week?.week ?? ''
}

/**
 * Semanas consecutivas desde la semana dada.
 *
 * El rango por defecto de la matriz son nueve semanas: la actual y las ocho
 * siguientes.
 */
export function weeksFrom(key, count = 9) {
  const weeks = []
  for (let index = 0; index < count; index += 1) {
    weeks.push(shiftWeek(key, index))
  }
  return weeks
}

/** Semanas entre dos claves, ambas incluidas. */
export function weeksBetween(from, to) {
  const weeks = []
  const last = weekMonday(to).getTime()
  let current = weekMonday(from)
  while (current.getTime() <= last) {
    weeks.push(isoWeekKey(current))
    current = new Date(current.getTime() + 7 * DAY_MS)
  }
  return weeks
}

/**
 * Dias laborables de la semana: de lunes a viernes.
 *
 * El motor de capacidad solo reparte horas entre dias laborables, asi que el
 * fin de semana no aporta nada a la vista semanal. Las fechas van en ISO y se
 * calculan en UTC para que no dependan de la zona horaria.
 */
export function weekWorkdays(key) {
  const monday = weekMonday(key)
  const days = []
  for (let offset = 0; offset < 5; offset += 1) {
    const day = new Date(monday.getTime())
    day.setUTCDate(monday.getUTCDate() + offset)
    const month = String(day.getUTCMonth() + 1).padStart(2, '0')
    const date = String(day.getUTCDate()).padStart(2, '0')
    days.push({
      date: `${day.getUTCFullYear()}-${month}-${date}`,
      day: day.getUTCDate(),
      weekday: offset,
    })
  }
  return days
}

/** Rango de la semana en texto: "9 - 13 nov 2026". */
export function weekRangeLabel(key) {
  const days = weekWorkdays(key)
  const first = days[0]
  const last = days[days.length - 1]
  const firstMonth = shortMonthName(Number(first.date.slice(5, 7)))
  const lastMonth = shortMonthName(Number(last.date.slice(5, 7)))
  const year = last.date.slice(0, 4)
  if (firstMonth === lastMonth) {
    return `${first.day} - ${last.day} ${lastMonth} ${year}`
  }
  return `${first.day} ${firstMonth} - ${last.day} ${lastMonth} ${year}`
}
