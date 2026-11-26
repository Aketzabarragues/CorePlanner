import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Test de tokens centralizados, estricto por defecto: cualquier infraccion en
 * el codigo de la aplicacion hace fallar el test.
 *
 * El color solo entra en las plantillas por token (las variables `--cp-*` de
 * `src/assets/tokens.css`, mapeadas en `tailwind.config.js` a clases
 * semanticas), por datos del backend (colores de proyecto, departamento,
 * persona y estado, que se pintan por estilo en linea) o por la copia de la
 * paleta cerrada en `src/utils/palette.js`.
 *
 * Reglas por tipo de fichero:
 * - codigo de la aplicacion (`.vue` y `.js` de `src/`): ninguna clase de la
 *   paleta por defecto de Tailwind, ni `siemens`, ni hex literal de color, ni
 *   `theme('colors.`.
 * - `src/tests/*.spec.js`: el hex SI es dato (fixtures que imitan lo que
 *   devuelve el backend), asi que no se cuenta; las clases de la paleta por
 *   defecto y `siemens` siguen contando: si un spec afirma una clase de
 *   estilo, esa clase debe ser de token.
 *
 * Excepciones: `src/utils/palette.js` (copia de la paleta del backend) y este
 * propio fichero.
 *
 * `LIMITE_INFRACCIONES` es solo dato informativo: cuantas infracciones tenia
 * el codigo cuando se activo el modo estricto. Nunca es condicion de paso.
 */

const LIMITE_INFRACCIONES = 0

const RAIZ = process.cwd()
const EXCEPCIONES = new Set(['src/utils/palette.js', 'src/tests/tokens.spec.js'])
const RE_SIEMENS = /\bsiemens\b/i
const RE_PALETA =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|divide|outline|shadow|accent|caret|decoration|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
const RE_HEX = /\#[0-9a-fA-F]{3,8}\b/
const RE_TAILWIND_FUNC = /theme\(\s*['"]colors\./
const VARIABLES_OBLIGATORIAS = [
  '--cp-primario',
  '--cp-lienzo',
  '--cp-tarjeta',
  '--cp-texto',
  '--cp-borde',
  '--cp-lateral-fondo',
]

function ficherosEscaneados(raiz) {
  const salida = []
  const recorrer = (dir) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, entrada.name)
      if (entrada.isDirectory()) {
        recorrer(ruta)
      } else if (entrada.name.endsWith('.vue') || entrada.name.endsWith('.js')) {
        salida.push(ruta)
      }
    }
  }
  recorrer(join(raiz, 'src'))
  return salida
}

/**
 * Infracciones de una linea, segun el tipo de fichero: en los specs el hex es
 * dato de test, en el codigo de la aplicacion no.
 */
function lineasInfractoras(texto, esSpec) {
  const infracciones = []
  texto.split(/\r?\n/).forEach((linea, i) => {
    const reglas = []
    if (RE_SIEMENS.test(linea)) reglas.push('siemens')
    if (RE_PALETA.test(linea)) reglas.push('paleta')
    if (!esSpec && RE_HEX.test(linea)) reglas.push('hex')
    if (RE_TAILWIND_FUNC.test(linea)) reglas.push("theme('colors.")
    if (reglas.length > 0) {
      infracciones.push({ linea: i + 1, texto: linea.trim().slice(0, 120), reglas })
    }
  })
  return infracciones
}

function escanear(raiz) {
  const porFichero = new Map()
  for (const ruta of ficherosEscaneados(raiz)) {
    const rel = relative(raiz, ruta).split(sep).join('/')
    if (EXCEPCIONES.has(rel)) continue
    const infracciones = lineasInfractoras(
      readFileSync(ruta, 'utf8'),
      rel.startsWith('src/tests/') && rel.endsWith('.spec.js'),
    )
    if (infracciones.length > 0) porFichero.set(rel, infracciones)
  }
  return porFichero
}

function totalInfracciones(porFichero) {
  return [...porFichero.values()].reduce((suma, infracciones) => suma + infracciones.length, 0)
}

function detalleInfracciones(porFichero) {
  const lineas = []
  for (const [rel, infracciones] of porFichero) {
    lineas.push(rel)
    for (const item of infracciones) {
      lineas.push(`  linea ${item.linea}: [${item.reglas.join(', ')}] ${item.texto}`)
    }
  }
  return lineas
}

describe('tokens.css y tailwind.config.js', () => {
  it('tokens.css existe y declara las variables basicas', () => {
    const texto = readFileSync(join(RAIZ, 'src', 'assets', 'tokens.css'), 'utf8')
    for (const variable of VARIABLES_OBLIGATORIAS) {
      expect(texto, `falta la variable ${variable}`).toContain(variable)
    }
  })

  it('tailwind.config.js no contiene la escala antigua siemens', () => {
    const texto = readFileSync(join(RAIZ, 'tailwind.config.js'), 'utf8')
    expect(texto).not.toMatch(RE_SIEMENS)
  })
})

describe('infracciones de tokens en src', () => {
  it('ningun .vue/.js usa theme(colors.', () => {
    const ofensores = []
    for (const [rel, infracciones] of escanear(RAIZ)) {
      for (const item of infracciones) {
        if (item.reglas.includes("theme('colors.")) ofensores.push(`${rel}:${item.linea}`)
      }
    }
    expect(ofensores).toEqual([])
  })

  it('el codigo de la aplicacion no reintroduce la escala siemens', () => {
    const ofensores = []
    for (const [rel, infracciones] of escanear(RAIZ)) {
      for (const item of infracciones) {
        if (item.reglas.includes('siemens')) ofensores.push(`${rel}:${item.linea}`)
      }
    }
    expect(ofensores).toEqual([])
  })

  it('cero infracciones en el codigo de la aplicacion (modo estricto)', () => {
    const porFichero = escanear(RAIZ)
    const total = totalInfracciones(porFichero)
    // Dato informativo, nunca condicion de paso: la migracion termino con
    // LIMITE_INFRACCIONES lineas con infraccion.
    console.info(
      `tokens: ${total} lineas con infraccion (referencia de la migracion: ${LIMITE_INFRACCIONES})`,
    )
    expect(
      detalleInfracciones(porFichero),
      'infracciones de tokens en el codigo de la aplicacion (el hex en specs es dato, no infraccion)',
    ).toEqual([])
  })
})
