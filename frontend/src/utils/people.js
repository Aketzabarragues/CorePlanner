/** Utilidades de personas compartidas por los listados. */

/**
 * Ordena a las personas por departamento y, dentro de cada departamento, por
 * nombre.
 *
 * Las que no tienen departamento van al final. La lista que devuelve es una
 * copia: la de origen no se toca.
 */
export function sortByDepartment(people) {
  return [...people].sort((a, b) => {
    const departamentoA = a.department_name ?? ''
    const departamentoB = b.department_name ?? ''
    if (departamentoA !== departamentoB) {
      if (!departamentoA) return 1
      if (!departamentoB) return -1
      return departamentoA.localeCompare(departamentoB, 'es')
    }
    return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'es')
  })
}

/**
 * Iniciales de una persona, para el avatar.
 *
 * Coge la primera letra de las dos primeras palabras. Con una sola palabra, la
 * letra es la unica que hay.
 */
export function initials(name) {
  return String(name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}
