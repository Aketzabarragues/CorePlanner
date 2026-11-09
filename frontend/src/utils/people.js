/** Utilidades de personas compartidas por los listados. */

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
