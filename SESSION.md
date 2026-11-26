# Estado de la sesion

## Objetivo actual

Sistema de diseno del frontend a partir del boceto `docs/diseno_nuevo.html`:
un unico fichero de tokens de color (`frontend/src/assets/tokens.css`) que
`tailwind.config.js` mapea a clases semanticas, tipografias locales, y la
migracion de toda la interfaz a esos tokens sin cambiar comportamiento.

Cerrado: `npm test` 1061/1061 (57 ficheros), `npm run build` OK,
`npm run verify:css` OK (498 clases). Infracciones de color en el codigo de
la aplicacion: **cero** (medido por `frontend/src/tests/tokens.spec.js`, que
ya corre en modo estricto).

## Cambios realizados

- `frontend/src/assets/tokens.css` (nuevo): 105 tokens `--cp-*` en canales RGB
  (marca, superficie, texto, borde, lateral, estado, escala de carga de 28,
  medidas y tramas). Unico fichero de valores.
- `frontend/tailwind.config.js`: la escala `siemens` desaparece; los tokens se
  mapean a clases semanticas (`bg-tarjeta`, `text-texto-tenue`, `border-borde`…),
  con `fontFamily` (sans, mono, titulo), `fontSize` con prefijo `cp-`,
  `borderRadius` y `boxShadow` desde variables.
- Tipografias locales con `@fontsource-variable/*` (Inter, JetBrains Mono,
  Space Grotesk): los `.woff2` se empaquetan, sin CDN ni red en runtime.
- `frontend/src/main.js`, `frontend/src/assets/main.css`: import de tokens y
  fuentes; `.cp-striped` se sustituye por `.cp-trama-rayado`.
- `frontend/src/utils/load.js`: la escala de carga pasa a 28 tokens
  (`carga-<estado>-fondo/texto/barra/borde`), con clases literales (las
  compuestas no las ve `verify:css`). La regla no cambia: la sobrecarga lleva
  triangulo y porcentaje; la capacidad desconocida no lleva barra ni porcentaje.
- `frontend/src/utils/statusColor.js` y `utils/kanban.js`: los colores
  literales pasan a tokens o a la paleta cerrada (`palette.js`); el hex del
  estado sigue siendo dato del backend.
- Toda la interfaz migrada a tokens: armazon, barra lateral, cabeceras de
  vista, tablas, tarjetas, tablero, calendario, Gantt, dialogos y avisos.
- Componentes nuevos: `KpiCard`, `BaseCard`, `HelpTip`. `SegmentedControl`,
  `FilterField`, `PageHeader`, `ModalDialog`, `ToastHost` y `AlertBanner`
  adoptan el nuevo lenguaje sin cambiar su API.
- `frontend/src/tests/tokens.spec.js` (nuevo): falla si una plantilla vuelve
  a escribir una clase de la paleta por defecto de Tailwind, `siemens`, un hex
  o `theme('colors.`. En los `.spec.js` el hex no se cuenta (son fixtures que
  imitan al backend); las clases de paleta si.

## Decisiones tecnicas

- Los tokens se nombran **por funcion**, no por tono ni por marca: `primario`,
  `superficie`, `texto`, `lateral-*`, `ok/aviso/peligro/info/neutro-*`,
  `carga-<estado>-*`. La escala `siemens` no deja alias.
- Las medidas nuevas de texto llevan prefijo `cp-` (`text-cp-sm` = 12 px):
  mapear `--cp-texto-*` sobre `text-xs`/`text-sm` de Tailwind cambiaria el
  significado de esas clases en toda la app.
- El color de proyecto, persona, departamento y estado lo decide el backend y
  se pinta con estilo en linea; el frontend no lo calcula.
- Contraste y area tactil por encima del boceto: 4,5:1 en texto, 3:1 en
  graficos, 40 px de objetivo y 44 px en menu lateral y cabecera del shell.
- Sin tema oscuro todavia, pero la infraestructura esta lista: un tema
  futuro es un bloque `[data-tema='…']` en `tokens.css`.

## Pendientes / Siguiente paso inmediato

1. **Cabecera de vista en una sola linea** (siguiente punto, pedido del
   usuario): en el boceto los filtros van en la MISMA linea que el titulo,
   separados por una regla vertical, y las acciones a la derecha. Ahora los
   filtros caen a una segunda linea: cada `FilterField` lleva la etiqueta
   encima y el desplegable toma el ancho de su opcion mas larga, asi que el
   grupo de filtros no cabe junto al titulo y envuelve. Gana una fila de alto
   en cada vista de planificacion. Opciones: etiqueta en linea a la izquierda
   del desplegable (como el boceto), ancho maximo del desplegable con
   `truncate`, y decidir a partir de que ancho los filtros pasan a su propia
   linea en vez de desbordar. Repasar con el designer la plantilla exacta
   antes de tocar `PageHeader.vue` y `FilterField.vue`.
2. Commit pendiente de aprobacion explicita del usuario (los botones de
   ayuda, los tres arreglos de la revision visual y las capturas).
3. Cambios de las sesiones anteriores que siguen en el arbol, por aprobar por
   separado (incluida la correccion del calendario).
4. Sin tema oscuro, sin boton de ayuda en las vistas que no lo tienen y sin
   `.ics` (planificado, fuera de v1).
