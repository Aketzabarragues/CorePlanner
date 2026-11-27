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

- **Sistema de tokens**: `frontend/src/assets/tokens.css` (105 tokens `--cp-*` en canales
  RGB) es el fichero unico de valores; `frontend/tailwind.config.js` los mapea a clases
  semanticas. La escala `siemens` desaparecio del codigo. `frontend/src/tests/tokens.spec.js`
  falla si una plantilla vuelve a escribir un color de la paleta por defecto o un hex.
- Tipografias en el repo: `frontend/src/assets/fonts/` con los `.woff2` de Inter, JetBrains
  Mono y Space Grotesk (con su licencia OFL) y `frontend/src/assets/fonts.css`. Sin
  dependencia de npm ni CDN: la aplicacion no necesita instalar nada para pintar su
  tipografia.
- La **escala de carga** pasa a 28 tokens (`carga-<estado>-fondo/texto/barra/borde`); la
  regla no cambia: la sobrecarga lleva triangulo y porcentaje, y la capacidad
  desconocida no lleva barra ni porcentaje.
- `frontend/src/utils/statusColor.js`: `textoSobre(hex)` elige el color del texto que va
  sobre el color de un proyecto, para llegar a 4,5:1.
- **Una sola cabecera, en la barra superior**: el shell la pinta y cada vista publica en
  ella su titulo, insignia, ayuda, filtros y acciones con un `Teleport`. Las migas de pan
  salen de la barra; el menu lateral baja la letra a la del boceto sin bajar el area
  tactil.
- **Gantt**: la columna de tareas se ajusta al contenido y el scroll horizontal desaparece
  cuando el conjunto cabe; la linea de "Hoy" pasa a discontinua; cada boton tiene su icono.
- **Capacidad**: todas las celdas miden lo mismo y una tarea de 0 h se ve (anillo hueco).
- **Proyectos**: una card por proyecto, agrupada por area. **Personas**: avatar con el
  color del departamento y competencias en texto.
- Boton de ayuda en las siete cabeceras que lo tienen en el boceto, y filtros de persona,
  proyecto y tipo en la bitacora (aplicados en el servidor).
- Componentes nuevos: `KpiCard`, `BaseCard`, `HelpTip`. `SegmentedControl`, `FilterField`,
  `PageHeader`, `ModalDialog`, `ToastHost` y `AlertBanner` adoptan el nuevo lenguaje sin
  cambiar su API.

## Decisiones tecnicas

- Los tokens se nombran **por funcion**, no por tono ni por marca: `primario`,
  `superficie`, `texto`, `lateral-*`, `ok/aviso/peligro/info/neutro-*`,
  `carga-<estado>-*`. La escala `siemens` no deja alias.
- Las medidas nuevas de texto llevan prefijo `cp-` (`text-cp-sm` = 12 px): mapear
  `--cp-texto-*` sobre `text-xs`/`text-sm` de Tailwind cambiaria el significado de esas
  clases en toda la app.
- El color de proyecto, persona, departamento y estado lo decide el backend y se pinta con
  estilo en linea; el frontend no lo calcula.
- Contraste y area tactil por encima del boceto: 4,5:1 en texto, 3:1 en graficos, 40 px
  de objetivo y 44 px en menu lateral y barra superior.
- La capacidad semanal del panel es la suma de las capacidades conocidas (la misma regla
  que el equipo y cada departamento) y publica cuantas personas quedan fuera del
  denominador.
- El codigo de proyecto no es un campo del modelo: se parsea del nombre, que lo lleva
  delante ("26009 - FLUID SYSTEM - Pasteurizador").
- Sin tema oscuro todavia, pero la infraestructura esta lista: un tema futuro es un bloque
  `[data-tema='...']` en `tokens.css`.

## Pendientes / Siguiente paso inmediato

1. Cambios de las sesiones anteriores que siguen en el arbol, por aprobar por
   separado (incluida la correccion del calendario).
2. Sin tema oscuro y sin `.ics` (planificado, fuera de v1).
3. Revisar en el navegador el resultado: el build y los tests pasan, pero el contraste
   real de cada pantalla se ve mejor a ojo.
