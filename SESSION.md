# Estado de la sesion

## Objetivo actual

Sistema de diseno del frontend a partir del boceto `docs/diseno_nuevo.html`:
un unico fichero de tokens de color (`frontend/src/assets/tokens.css`) que
`tailwind.config.js` mapea a clases semanticas, tipografias locales, y la
migracion de toda la interfaz a esos tokens sin cambiar comportamiento.

Cerrado, con la comparativa contra el boceto ejecutada (77 hallazgos, las dos
sesiones aplicadas: cabeceras y cuerpo).

Verificacion: `npm test` 1093/1093 (57 ficheros), `npm run build` OK,
`npm run verify:css` OK, `.venv/bin/pytest` 616 en verde y
`.venv/bin/ruff check backend` limpio. Cero colores sueltos en el codigo de la
aplicacion, vigilado por `frontend/src/tests/tokens.spec.js` en modo estricto.

## Cambios realizados

- `frontend/src/assets/tokens.css` (nuevo): 105 tokens `--cp-*` en canales RGB
  (marca, superficie, texto, borde, lateral, estado, escala de carga de 28,
  medidas y tramas). Unico fichero de valores.
- `frontend/tailwind.config.js`: la escala `siemens` desaparece; los tokens se
  mapean a clases semanticas, con `fontFamily` (sans, mono, titulo), `fontSize`
  con prefijo `cp-`, `borderRadius` y `boxShadow` desde variables.
- Tipografias locales con `@fontsource-variable/*` (Inter, JetBrains Mono,
  Space Grotesk): los `.woff2` se empaquetan, sin CDN ni red en runtime.
- `frontend/src/utils/load.js`: la escala de carga pasa a 28 tokens, con clases
  literales. La regla no cambia: la sobrecarga lleva triangulo y porcentaje; la
  capacidad desconocida no lleva barra ni porcentaje.
- `frontend/src/utils/statusColor.js`: `textoSobre(hex)` elige el color del
  texto que va sobre el color de un proyecto, para llegar a 4,5:1.
- Toda la interfaz migrada a tokens: armazon, barra lateral, cabeceras de
  vista, tablas, tarjetas, tablero, calendario, Gantt, dialogos y avisos.
- Cabecera de vista en una linea: filtros junto al titulo, etiqueta en linea,
  desplegable acotado, subtitulo fuera (su texto va en el boton de ayuda) y
  cascada de acciones que compacta a icono antes de esconder.
- Boton de ayuda en las siete cabeceras que lo tenian en el boceto.
- Filtros de la bitacora por persona, proyecto y tipo de evento, aplicados en
  el servidor (`GET /api/activity` acepta `actor_id` y `action`).
- Componentes nuevos: `KpiCard`, `BaseCard`, `HelpTip`. `SegmentedControl`,
  `FilterField`, `PageHeader`, `ModalDialog`, `ToastHost` y `AlertBanner`
  adoptan el nuevo lenguaje sin cambiar su API.

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
- La capacidad semanal del panel es la suma de las capacidades conocidas (la
  misma regla que el equipo y cada departamento) y publica cuantas personas
  quedan fuera del denominador.
- El codigo de proyecto no es un campo del modelo: se parsea del nombre, que
  lo lleva delante ("26009 - FLUID SYSTEM - Pasteurizador").
- Sin tema oscuro todavia, pero la infraestructura esta lista: un tema futuro
  es un bloque `[data-tema='...']` en `tokens.css`.

## Pendientes / Siguiente paso inmediato

1. Cambios de las sesiones anteriores que siguen en el arbol, por aprobar por
   separado (incluida la correccion del calendario).
2. Sin tema oscuro y sin `.ics` (planificado, fuera de v1).
3. La barra de tarea del calendario lleva relleno claro al 12 % y borde izquierdo
   del color del proyecto (texto oscuro): el unico punto donde el boceto
   avanzaba y quedo aplicado al final. El Gantt mantiene su barra con el color
   solido y el texto contrastado.
4. El `.ics` del Gantt esta planificado pero pendiente; la exportacion del Gantt
   sigue fuera de v1.
