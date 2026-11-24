/**
 * Columnas del panel de nombres del diagrama de Gantt.
 *
 * El panel de nombres lleva siempre la columna de la tarea (el titulo y debajo
 * `persona · proyecto`) y, a su derecha, las columnas que la persona elija:
 * persona, inicio, fin, duracion, horas y estado. Las elegidas y la
 * ordenacion viven en la URL (`?cols=` y `?sort=`), asi que recargar deja el
 * panel como estaba.
 *
 * Este modulo es puro: define las columnas, dice que valor tiene cada una
 * (el que se compara al ordenar) y que texto se pinta (el que se lee). El
 * frontend no calcula horas: las de la columna son las del feed, sin sumar
 * nada.
 */

import { columnLabel } from './kanban'
import { inclusiveDays, parseIsoDate } from './ganttScale'
import { shortMonthName } from './month'

/** Columnas elegibles del panel de nombres, en el orden en que se ofrecen. */
export const COLUMNAS_GANTT = [
  { key: 'persona', label: 'Persona', ancho: 110 },
  { key: 'inicio', label: 'Inicio', ancho: 80 },
  { key: 'fin', label: 'Fin', ancho: 80 },
  { key: 'duracion', label: 'Duración', ancho: 88 },
  { key: 'horas', label: 'Horas', ancho: 72 },
  { key: 'estado', label: 'Estado', ancho: 120 },
]

/** Claves de columna que existen: la de la tarea y las elegibles. */
const CLAVES = new Set(['tarea', ...COLUMNAS_GANTT.map((columna) => columna.key)])

/**
 * Columnas elegidas de la URL (`?cols=`, con las claves separadas por comas).
 *
 * Las claves que no existen se ignoran y las repetidas cuentan una sola vez.
 * El orden es el del catalogo, no el del enlace: dos personas que eligen las
 * mismas columnas venlas en el mismo sitio.
 */
export function columnasDeUrl(valor) {
  const bruto = Array.isArray(valor) ? valor.join(',') : (valor ?? '')
  const pedidas = new Set(
    String(bruto)
      .split(',')
      .map((clave) => clave.trim())
      .filter((clave) => CLAVES.has(clave) && clave !== 'tarea'),
  )
  return COLUMNAS_GANTT.filter((columna) => pedidas.has(columna.key)).map(
    (columna) => columna.key,
  )
}

/**
 * Ordenacion de la URL (`?sort=columna:sentido`).
 *
 * La columna puede ser la de la tarea o cualquiera de las elegibles; el
 * sentido es `asc` o `desc`. Lo que no encaja devuelve null: el diagrama
 * queda como estaba.
 */
export function ordenDeUrl(valor) {
  const bruto = Array.isArray(valor) ? valor[0] : valor
  const [columna, sentido] = String(bruto ?? '').split(':')
  if (!CLAVES.has(columna)) return null
  if (sentido !== 'asc' && sentido !== 'desc') return null
  return { columna, sentido }
}

/** Dias del rango de una tarea, con los dos extremos incluidos. */
function duracionDe(tarea) {
  if (!tarea?.start || !tarea?.end) return 0
  return inclusiveDays(tarea.start, tarea.end)
}

/** Fecha corta: "5 nov". */
function fechaCorta(iso) {
  if (!iso) return ''
  const dia = parseIsoDate(iso)
  return `${dia.getUTCDate()} ${shortMonthName(dia.getUTCMonth() + 1)}`
}

/**
 * Valor de una columna para una tarea: el que se compara al ordenar.
 *
 * Las fechas van en ISO, asi que se comparan como texto y el resultado no
 * depende de la zona horaria. Las horas son las del feed: el frontend no las
 * suma ni las recalcula.
 */
export function valorDeColumna(clave, tarea) {
  switch (clave) {
    case 'tarea':
      return tarea?.title ?? ''
    case 'persona':
      return tarea?.assigned_name ?? ''
    case 'inicio':
      return tarea?.start ?? ''
    case 'fin':
      return tarea?.end ?? ''
    case 'duracion':
      return duracionDe(tarea)
    case 'horas':
      return Number(tarea?.estimated_hours ?? 0)
    case 'estado':
      return columnLabel(tarea?.status ?? '')
    default:
      return ''
  }
}

/** Texto que se pinta en la celda de una columna. */
export function textoDeColumna(clave, tarea) {
  switch (clave) {
    case 'persona':
      return tarea?.assigned_name ?? 'Sin asignar'
    case 'inicio':
      return fechaCorta(tarea?.start)
    case 'fin':
      return fechaCorta(tarea?.end)
    case 'duracion':
      return `${duracionDe(tarea)} d`
    case 'horas':
      return Number(tarea?.estimated_hours ?? 0).toFixed(2)
    case 'estado':
      return columnLabel(tarea?.status ?? '')
    default:
      return ''
  }
}

/**
 * Comparador de tareas por una columna, en el sentido pedido.
 *
 * Devuelve null si no hay ordenacion: el diagrama queda en su orden natural
 * (por fecha de inicio dentro del grupo).
 */
export function comparadorDeOrden(orden) {
  if (!orden) return null
  const signo = orden.sentido === 'desc' ? -1 : 1
  return (a, b) => {
    const va = valorDeColumna(orden.columna, a)
    const vb = valorDeColumna(orden.columna, b)
    const base =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'es')
    return base === 0 ? 0 : base * signo
  }
}
