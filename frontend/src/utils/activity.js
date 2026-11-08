/**
 * Utilidades de la bitacora de cambios.
 *
 * La bitacora se lee de arriba abajo: quien lo hizo, que hizo, sobre que y
 * cuando. El texto se compone aqui, para que la vista solo tenga que
 * pintarlo.
 */

import { columnLabel } from './kanban'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY

/**
 * Tiempo transcurrido desde una fecha, en palabras.
 *
 * "hace 10 min", "hace 2 h", "hace 3 d". A partir de una semana se cuenta en
 * semanas y a partir de un mes en meses, que es lo que se lee de un vistazo.
 */
export function relativeTime(fecha, ahora = new Date()) {
  const momento = new Date(fecha)
  if (Number.isNaN(momento.getTime())) return ''
  const diferencia = ahora.getTime() - momento.getTime()
  if (diferencia < MINUTE) return 'ahora mismo'
  if (diferencia < HOUR) return `hace ${Math.floor(diferencia / MINUTE)} min`
  if (diferencia < DAY) return `hace ${Math.floor(diferencia / HOUR)} h`
  if (diferencia < WEEK) return `hace ${Math.floor(diferencia / DAY)} d`
  if (diferencia < MONTH) return `hace ${Math.floor(diferencia / WEEK)} sem`
  return `hace ${Math.floor(diferencia / MONTH)} meses`
}

/** Fecha completa en texto, para el title de la entrada. */
export function fullDate(fecha) {
  const momento = new Date(fecha)
  if (Number.isNaN(momento.getTime())) return ''
  const dia = String(momento.getDate()).padStart(2, '0')
  const mes = String(momento.getMonth() + 1).padStart(2, '0')
  const horas = String(momento.getHours()).padStart(2, '0')
  const minutos = String(momento.getMinutes()).padStart(2, '0')
  return `${dia}/${mes}/${momento.getFullYear()} ${horas}:${minutos}`
}

/**
 * Que hizo el actor, en una frase.
 *
 * El nombre de la entidad va dentro de la frase, de modo que la lista se lee
 * como una linea de diario y no como una tabla de campos.
 */
export function actionLabel(entrada) {
  const payload = entrada?.payload ?? {}
  const titulo = payload.title ?? ''
  switch (entrada?.action) {
    case 'task.created':
      return `creó la tarea «${titulo}»`
    case 'task.updated':
      return `editó la tarea «${titulo}»`
    case 'task.moved':
      return `movió «${titulo}» de ${columnLabel(payload.from)} a ${columnLabel(payload.to)}`
    case 'task.deleted':
      return `eliminó la tarea «${titulo}»`
    case 'member.added':
      return `añadió a ${payload.name ?? 'alguien'} al proyecto`
    case 'member.removed':
      return `quitó a ${payload.name ?? 'alguien'} del proyecto`
    case 'member.role_changed':
      return `cambió el rol de ${payload.name ?? 'alguien'}`
    case 'project.updated':
      return 'cambió los ajustes del proyecto'
    default:
      return 'hizo un cambio'
  }
}
