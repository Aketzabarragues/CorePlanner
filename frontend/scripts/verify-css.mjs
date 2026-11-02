/**
 * Guard del bundle CSS.
 *
 * Extrae las clases Tailwind usadas en las plantillas .vue y comprueba que
 * todas han acabado en el CSS compilado. Un rebuild parcial o un cambio en
 * tailwind.config.js pueden perder clases sin que nada mas lo detecte.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const srcDir = join(root, 'src')
const distDir = join(root, 'dist', 'assets')

function collectFiles(dir, extensions) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...collectFiles(full, extensions))
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      found.push(full)
    }
  }
  return found
}

/** Escapa una clase de Tailwind como lo hace el generador de CSS. */
function escapeClassName(name) {
  return name.replace(/[.:/[\]()%&#!@'"~>+=$^|<>?*\\]/g, (char) => `\\${char}`)
}

function extractClasses(content) {
  const classes = new Set()

  // class="a b c" estatico
  for (const match of content.matchAll(/(?<![:\w-])class="([^"]*)"/g)) {
    for (const token of match[1].split(/\s+/)) {
      if (token) classes.add(token)
    }
  }

  // :class="'a b' : 'c'" dinamico: solo interesan los literales de cadena
  for (const match of content.matchAll(/:class="([^"]*)"/g)) {
    for (const literal of match[1].matchAll(/'([^']*)'|"([^"]*)"/g)) {
      const value = literal[1] ?? literal[2]
      for (const token of value.split(/\s+/)) {
        if (token) classes.add(token)
      }
    }
  }

  return classes
}

const templates = collectFiles(srcDir, ['.vue'])
if (templates.length === 0) {
  console.error('No se han encontrado plantillas .vue en src/.')
  process.exit(1)
}

const usedClasses = new Set()
for (const file of templates) {
  for (const name of extractClasses(readFileSync(file, 'utf-8'))) {
    usedClasses.add(name)
  }
}

const cssFiles = collectFiles(distDir, ['.css'])
if (cssFiles.length === 0) {
  console.error('No hay CSS compilado en dist/assets. Ejecuta primero: npm run build')
  process.exit(1)
}
const css = cssFiles.map((file) => readFileSync(file, 'utf-8')).join('\n')

const missing = [...usedClasses].filter((name) => !css.includes(`.${escapeClassName(name)}`))

console.log(`Plantillas revisadas: ${templates.length}`)
console.log(`Clases usadas: ${usedClasses.size}`)
console.log(`Bundle CSS: ${cssFiles.map((f) => relative(root, f)).join(', ')}`)

if (missing.length > 0) {
  console.error(`\nClases ausentes en el bundle (${missing.length}):`)
  for (const name of missing) console.error(`  - ${name}`)
  process.exit(1)
}

console.log('OK: todas las clases usadas estan en el bundle')
