/**
 * Utilidades de la bitacora de cambios.
 *
 * La bitacora se lee de arriba abajo: quien lo hizo, que hizo, sobre que y
 * cuando. El texto se compone aqui, para que la vista solo tenga que
 * pintarlo.
 */

import { DEFAULT_TASK_STATUSES } from './kanban'

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
 * Etiqueta legible de una clave de estado para la frase de la bitacora.
 *
 * El payload del movimiento solo trae la clave: la etiqueta se resuelve con
 * los estados del proyecto que se pasan, y si la lista no la trae, la clave
 * humanizada ("en_revision" -> "En revision"), nunca la clave cruda.
 */
export function estadoLegible(clave, estados = DEFAULT_TASK_STATUSES) {
  const estado = estados.find((item) => item.key === clave)
  if (estado) return estado.label
  return claveHumanizada(clave)
}

/** Clave de estado en texto legible: "en_revision" -> "En revision". */
export function claveHumanizada(clave) {
  return String(clave ?? '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1))
    .join(' ')
}

/**
 * Que hizo el actor, en una frase.
 *
 * El nombre de la entidad va dentro de la frase, de modo que la lista se lee
 * como una linea de diario y no como una tabla de campos. El estado de un
 * movimiento se etiqueta con los estados que se pasan; sin lista, los cuatro
 * por defecto.
 *
 * La frase lleva la inicial en espacio: la vista la pega tras el nombre del
 * actor, y el hueco entre los dos va ahi, no en la plantilla.
 */
export function actionLabel(entrada, estados = DEFAULT_TASK_STATUSES) {
  const payload = entrada?.payload ?? {}
  const titulo = payload.title ?? ''
  const etiqueta = payload.label ?? ''
  switch (entrada?.action) {
    case 'task.created':
      return ` creó la tarea «${titulo}»`
    case 'task.updated':
      return ` editó la tarea «${titulo}»`
    case 'task.moved':
      return ` movió «${titulo}» de ${estadoLegible(payload.from, estados)} a ${estadoLegible(payload.to, estados)}`
    case 'task.deleted':
      return ` eliminó la tarea «${titulo}»`
    case 'task.commented':
      return ` comentó la tarea «${titulo}»`
    case 'task.checklist_item_added':
      return ` añadió «${etiqueta}» al checklist de «${titulo}»`
    case 'task.checklist_item_done':
      return payload.done
        ? ` marcó «${etiqueta}» como hecho en «${titulo}»`
        : ` desmarcó «${etiqueta}» en «${titulo}»`
    case 'task.checklist_item_updated':
      return ` cambió el texto de «${etiqueta}» en «${titulo}»`
    case 'task.checklist_item_removed':
      return ` quitó «${etiqueta}» del checklist de «${titulo}»`
    case 'member.added':
      return ` añadió a ${payload.name ?? 'alguien'} al proyecto`
    case 'member.removed':
      return ` quitó a ${payload.name ?? 'alguien'} del proyecto`
    case 'member.role_changed':
      return ` cambió el rol de ${payload.name ?? 'alguien'}`
    case 'project.updated':
      return ' cambió los ajustes del proyecto'
    default:
      return ' hizo un cambio'
  }
}

/**
 * Tipo de evento de una entrada, para la insignia de cada linea.
 *
 * Se deduce de la accion: el checklist son cuatro acciones distintas que
 * comparten el prefijo `task.checklist_item`, y el resto son uno a uno. Lo
 * que no esta en el mapa cae al tipo neutro, que es el de "un cambio".
 */
export function tipoDeAccion(entrada) {
  const accion = entrada?.action ?? ''
  if (accion.startsWith('task.checklist_item')) {
    return { label: 'Checklist', clases: 'border-aviso-borde bg-aviso-fondo text-aviso-texto' }
  }
  switch (accion) {
    case 'task.created':
      return { label: 'Alta', clases: 'border-ok-borde bg-ok-fondo text-ok-texto' }
    case 'task.moved':
      return { label: 'Estado', clases: 'border-info-borde bg-info-fondo text-info-texto' }
    case 'task.updated':
      return { label: 'Edición', clases: 'border-borde bg-neutro-fondo text-neutro-texto' }
    case 'task.commented':
      return { label: 'Comentario', clases: 'border-borde bg-neutro-fondo text-neutro-texto' }
    default:
      return { label: 'Cambio', clases: 'border-borde bg-neutro-fondo text-neutro-texto' }
  }
}

/**
 * Repeticiones de cambios consecutivos, en el mismo orden que `entradas`.
 *
 * Consecutivos es lo que la vista tiene: entradas contiguas que son la misma
 * accion sobre la misma entidad. Cada entrada lleva el largo de su racha, y la
 * insignia solo se pinta cuando hay dos o mas.
 */
export function repeticionesConsecutivas(entradas) {
  const cuenta = entradas.map(() => 1)
  for (let i = entradas.length - 2; i >= 0; i -= 1) {
    const anterior = entradas[i]
    const siguiente = entradas[i + 1]
    if (anterior.action === siguiente.action && anterior.entity_id === siguiente.entity_id) {
      cuenta[i] += cuenta[i + 1]
    }
  }
  return cuenta
}

/**
 * Codigo de proyecto y nombre, para el chip mono junto al nombre.
 *
 * El nombre del proyecto empieza por el codigo y un guion
 * ("26009 - FLUID SYSTEM - Pasteurizador"): el chip lleva el codigo y el
 * nombre se queda sin el. Sin ese formato, no hay chip.
 */
export function proyectoCortado(nombre) {
  const limpio = String(nombre ?? '')
  const separador = limpio.indexOf(' - ')
  if (separador > 0 && /^\d+$/.test(limpio.slice(0, separador))) {
    return { codigo: limpio.slice(0, separador), nombre: limpio.slice(separador + 3) }
  }
  return { codigo: null, nombre: limpio }
}

/**
 * Rotulo relativo del dia, para delante de la fecha de la cabecera.
 *
 * "Hoy" o "Ayer" si el dia es el actual o el anterior; sin rotulo si no, que
 * es como ya estaba.
 */
export function diaRelativo(fecha, ahora = new Date()) {
  const momento = new Date(fecha)
  if (Number.isNaN(momento.getTime())) return ''
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  const dia = new Date(momento.getFullYear(), momento.getMonth(), momento.getDate())
  const diferencia = Math.round((hoy - dia) / (24 * 60 * 60 * 1000))
  if (diferencia === 0) return 'Hoy'
  if (diferencia === 1) return 'Ayer'
  return ''
}
