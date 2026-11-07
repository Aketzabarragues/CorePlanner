/**
 * Formato del calendario laboral.
 *
 * Un dia no laborable tiene un alcance: global, de departamento o de persona.
 * El texto de cada uno y el color con el que se pinta en la rejilla salen de
 * aqui, para que la tabla y el mes hablen el mismo idioma.
 */

import { shortMonthName } from './month'

const SCOPE_LABELS = {
  global: 'Global',
  department: 'Departamento',
  person: 'Persona',
}

/** Texto del alcance: "Global", "Oficina Tecnica" o "Ana". */
export function scopeText(day) {
  if (day.scope === 'person') return day.user_name ?? 'Persona'
  if (day.scope === 'department') return day.department_name ?? 'Departamento'
  return 'Global'
}

/** Etiqueta corta del alcance, para la leyenda. */
export function scopeLabel(scope) {
  return SCOPE_LABELS[scope] ?? 'Global'
}

/** Jornada del dia: completa o de medio dia. */
export function jornadaLabel(halfDay) {
  return halfDay ? 'Media jornada' : 'Jornada completa'
}

/** Fecha corta: "9 nov 2026". */
export function shortDate(date) {
  const [year, month, day] = date.split('-').map(Number)
  return `${day} ${shortMonthName(month)} ${year}`
}

/** Horas con dos decimales: "32.00". */
export function hoursText(value) {
  if (value === null || value === undefined) return '-'
  return Number(value).toFixed(2)
}
