/**
 * Plural en espanol.
 *
 * `plural(1, 'tarea', 'tareas')` devuelve "1 tarea" y `plural(3, ...)` devuelve
 * "3 tareas". Los numeros de la interfaz se muestran con su palabra en el
 * plural que toca: escribir "tarea(s)" en un producto que se quiere ver
 * cuidado se nota.
 */
export function plural(cantidad, singular, plural_forma) {
  const numero = Number(cantidad)
  const palabra = numero === 1 ? singular : plural_forma
  return `${numero} ${palabra}`
}
