/**
 * Colores de los estados de tarea.
 *
 * El color es un dato: el hex lo trae el backend y se pinta con estilos en
 * linea (`:style`), nunca con clases Tailwind dinamicas, que nadie podria
 * compilar. La lista de estados de cada proyecto vive en la tienda
 * `taskStatuses`; aqui solo hay matematica de color.
 *
 * El texto de la pildora se oscurece hasta tener contraste de 4.5:1 contra su
 * propio fondo (WCAG 2.1 AA, texto normal): cualquier color de la paleta
 * cerrada queda legible.
 *
 * La misma matematica sirve para el texto sobre el color de un proyecto
 * (la barra del Gantt y la del calendario): `textoSobre` elige el color del
 * texto para que llegue a 4.5:1 contra el fondo, que es dato del backend.
 */

/**
 * Neutro para un estado sin color.
 *
 * Toma el par neutro del sistema de tokens (`--cp-neutro-fondo` y
 * `--cp-neutro-texto`), que da 7.4:1 de contraste.
 */
export const NEUTRO_PILDORA = {
  backgroundColor: 'rgb(var(--cp-neutro-fondo))',
  color: 'rgb(var(--cp-neutro-texto))',
}

/** Neutro de la barra: el punto neutro del sistema de tokens. */
export const NEUTRO_BARRA = { backgroundColor: 'rgb(var(--cp-neutro-punto))' }

function hexACanal(hex) {
  const limpio = String(hex ?? '').trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) return null
  return parseInt(limpio, 16)
}

/** Mezcla un color con blanco: `fraccion` del color y el resto blanco. */
function conBlanco(hex, fraccion) {
  const color = hexACanal(hex)
  if (color === null) return null
  const canal = (n) =>
    Math.round(((color >> n) & 0xff) * fraccion + 0xff * (1 - fraccion))
      .toString(16)
      .padStart(2, '0')
  return `#${canal(16)}${canal(8)}${canal(0)}`
}

/**
 * Mezcla un color con negro: `fraccion` del color y el resto negro.
 *
 * Es el oscuro que recibe el texto de la pildora para llegar al contraste.
 */
function conNegro(hex, fraccion) {
  const color = hexACanal(hex)
  if (color === null) return null
  const canal = (n) =>
    Math.round(((color >> n) & 0xff) * (1 - fraccion))
      .toString(16)
      .padStart(2, '0')
  return `#${canal(16)}${canal(8)}${canal(0)}`
}

/** Luminancia relativa de WCAG 2.1 de un color hex. */
export function luminancia(hex) {
  const color = hexACanal(hex)
  if (color === null) return null
  const canal = (n) => {
    const v = (((color >> n) & 0xff) / 255)
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(16) + 0.7152 * canal(8) + 0.0722 * canal(0)
}

/** Ratio de contraste de WCAG 2.1 entre dos colores hex. */
export function contraste(hexA, hexB) {
  const a = luminancia(hexA)
  const b = luminancia(hexB)
  if (a === null || b === null) return null
  const [alta, baja] = a > b ? [a, b] : [b, a]
  return (alta + 0.05) / (baja + 0.05)
}

/**
 * Estilos en linea de la pildora de un estado.
 *
 * Fondo: el color mezclado con blanco en torno al 12 %. Texto: el color
 * oscurecido en pasos del 5 % (mezclando con negro) hasta que el contraste
 * contra el fondo es de 4.5:1 o mas; si ya basta, se deja como esta. Sin
 * borde: ninguna plantilla lo pinta.
 */
export function pildora(hex) {
  if (hexACanal(hex) === null) return NEUTRO_PILDORA
  const fondo = conBlanco(hex, 0.12)
  let texto = hex
  // El color ya puede bastar (oscuro de origen); si no, se oscurece a pasos.
  for (let paso = 0; paso <= 0.96; paso += 0.05) {
    const oscuro = paso === 0 ? hex : conNegro(hex, paso)
    if ((contraste(oscuro, fondo) ?? 0) >= 4.5) {
      texto = oscuro
      break
    }
  }
  return { backgroundColor: fondo, color: texto }
}

/** Estilo en linea de la barra de un estado: el color tal cual. */
export function barra(hex) {
  return hexACanal(hex) === null ? NEUTRO_BARRA : { backgroundColor: hex }
}

function canalAHex(canal) {
  return canal.toString(16).padStart(2, '0')
}

/**
 * Color del texto sobre un fondo de color: el blanco por defecto, y el texto
 * oscuro (`--cp-texto`) cuando el fondo es claro y el blanco no llega al
 * contraste de 4.5:1 (WCAG 2.1 AA, texto normal).
 *
 * El fondo es dato del backend (el color del proyecto, que llega en hex):
 * aqui solo se decide el texto, nunca el fondo. Sin color valido no hay
 * decision que tomar: se devuelve el blanco, el valor por defecto.
 *
 * El oscuro es el token `--cp-texto` (rgb 15 23 42), no el negro puro: da
 * contraste en todos los fondos de la paleta cerrada donde el blanco no
 * llega. La decision se hace con los hex de trabajo y se devuelve como
 * token, nunca como hex suelto.
 */
export function textoSobre(hex) {
  const BLANCO = 'rgb(255 255 255)'
  if (hexACanal(hex) === null) return BLANCO
  const blanco = `#${canalAHex(255)}${canalAHex(255)}${canalAHex(255)}`
  const oscuro = `#${canalAHex(15)}${canalAHex(23)}${canalAHex(42)}`
  if ((contraste(blanco, hex) ?? 0) >= 4.5) return BLANCO
  if ((contraste(oscuro, hex) ?? 0) >= 4.5) return 'rgb(var(--cp-texto))'
  return BLANCO
}
