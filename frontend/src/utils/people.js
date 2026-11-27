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
 * Coge la primera letra de las dos primeras palabras. Con una sola palabra,
 * sus dos primeras letras ("Aketza" -> "AK").
 */
export function initials(name) {
  const partes = String(name ?? '').split(' ').filter(Boolean)
  const texto = partes.length > 1 ? partes[0][0] + partes[1][0] : (partes[0] ?? '').slice(0, 2)
  return texto.toUpperCase()
}

/**
 * Etiqueta de cada nivel de competencia, del 1 al 3.
 *
 * El nivel es un numero de 1 a 3 (lo da el backend). Las etiquetas son copy
 * del frontend: no existen en el backend.
 */
export const NIVEL_COMPETENCIA = {
  1: 'Básico',
  2: 'Intermedio',
  3: 'Experto',
}

/**
 * Nivel de competencia en texto, para leerse sin depender de los puntos.
 *
 * El texto va siempre con el numero: "3 · Experto". El numero es el dato y la
 * etiqueta es la lectura. Sin nivel, "0 · Sin asignar".
 */
export function nivelTexto(level) {
  const etiqueta = NIVEL_COMPETENCIA[level]
  return etiqueta ? `${level} · ${etiqueta}` : '0 · Sin asignar'
}
