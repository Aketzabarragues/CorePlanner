/**
 * Paleta cerrada de colores de la organizacion.
 *
 * Es la copia de `backend/palette.py`: los dos ficheros tienen que seguir
 * teniendo la misma lista, en el mismo orden. El backend decide el color y el
 * frontend lo ofrece, asi que si las listas se separan el selector acaba
 * mostrando colores que el backend no acepta.
 */
export const PALETTE = [
  { hex: '#1f6feb', label: 'Azul' },
  { hex: '#0a3d91', label: 'Azul profundo' },
  { hex: '#1a7f37', label: 'Verde' },
  { hex: '#0b6e4f', label: 'Verde azulado' },
  { hex: '#0f766e', label: 'Teal' },
  { hex: '#0e7490', label: 'Cian' },
  { hex: '#bf8700', label: 'Ocre' },
  { hex: '#8a5a00', label: 'Marrón' },
  { hex: '#b45309', label: 'Naranja' },
  { hex: '#8250df', label: 'Violeta' },
  { hex: '#5b21b6', label: 'Violeta profundo' },
  { hex: '#c2255c', label: 'Magenta' },
  { hex: '#9d174d', label: 'Granate' },
  { hex: '#cf222e', label: 'Rojo' },
  { hex: '#a11d2b', label: 'Rojo oscuro' },
  { hex: '#4d7c0f', label: 'Oliva' },
  { hex: '#57606a', label: 'Pizarra' },
  { hex: '#3f4c5a', label: 'Pizarra oscura' },
]

/** Los valores de color validos. */
export const PALETTE_COLORS = PALETTE.map((item) => item.hex)
