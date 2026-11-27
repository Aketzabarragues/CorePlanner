# Estado de la sesion

## Objetivo actual

Sistema de diseno del frontend a partir del boceto `docs/diseno_nuevo.html`:
un unico fichero de tokens de color (`frontend/src/assets/tokens.css`) que
`tailwind.config.js` mapea a clases semanticas, tipografias locales, y la
migracion de toda la interfaz a esos tokens sin cambiar comportamiento.

**Cerrado.** La comparativa contra el boceto se ejecuto con capturas reales
(16 vistas, 1440 px) y los huecos que quedaban estan resueltos:

- el armazon y la barra de vista con las medidas del boceto (lateral de 240 px,
  controles visibles de 26 a 32 px con zona tactil de 40 px);
- las acciones de la cabecera al extremo derecho, en dos grupos como el
  boceto;
- la cabecera del Gantt repartida en dos lineas como la del boceto, con la
  escala en la segunda y el rango a la vista;
- dos defectos de detalle: la insignia de "Solo lectura" del calendario, que
  salia cortada, y las horas libres de Mi trabajo, que duplicaban la unidad.

Verificacion: `npm test` 1119/1119 (58 ficheros), `npm run build` OK,
`npm run verify:css` OK, `npx vitest run src/tests/tokens.spec.js` 5/5,
`.venv/bin/pytest` 622 en verde y `.venv/bin/ruff check backend` limpio. Cero
colores sueltos en el codigo de la aplicacion, vigilado por
`frontend/src/tests/tokens.spec.js` en modo estricto.

## Cambios realizados

Commits de esta tanda (sobre `ae5eb98`):

- `2e62b94` el armazon y la barra de vista al boceto.
- `76d5266` las acciones de la cabecera al borde derecho.
- `b573fc0` la escala del Gantt baja a la segunda linea con el rango a la vista.
- `343473e` insignia de contexto por tono y horas libres con una sola unidad.

Antes de esta tanda, ya estaban:

- **Sistema de tokens**: `frontend/src/assets/tokens.css` (105 tokens `--cp-*` en canales
  RGB) es el fichero unico de valores; `frontend/tailwind.config.js` los mapea a clases
  semanticas. La escala `siemens` desaparecio del codigo. `frontend/src/tests/tokens.spec.js`
  falla si una plantilla vuelve a escribir un color de la paleta por defecto o un hex.
- Tipografias en el repo: `frontend/src/assets/fonts/` con los `.woff2` de Inter, JetBrains
  Mono y Space Grotesk (con su licencia OFL) y `frontend/src/assets/fonts.css`. Sin
  dependencia de npm ni CDN.
- La **escala de carga** pasa a 28 tokens (`carga-<estado>-fondo/texto/barra/borde`); la
  regla no cambia: la sobrecarga lleva triangulo y porcentaje, y la capacidad
  desconocida no lleva barra ni porcentaje.
- `frontend/src/utils/statusColor.js`: `textoSobre(hex)` elige el color del texto que va
  sobre el color de un proyecto, para llegar a 4,5:1.
- **Una sola cabecera, en la barra superior**: el shell la pinta y cada vista publica en
  ella su titulo, insignia, ayuda, filtros y acciones con un `Teleport`.
- **Gantt**: la columna de tareas se ajusta al contenido; la linea de "Hoy" pasa a
  discontinua; cada boton tiene su icono.
- **Capacidad**: todas las celdas miden lo mismo y una tarea de 0 h se ve (anillo hueco).
- **Proyectos**: una card por proyecto, agrupada por area. **Personas**: avatar con el
  color del departamento y competencias en texto.
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
- **El alto visible y la zona tactil son dos cosas.** El boceto mide 26-32 px y el
  proyecto exige 40 px de zona pulsable: se pinta el control pequeno y se amplia el
  objetivo con un pseudo-elemento transparente. El pseudo va en un contenedor `relative`,
  nunca en el `<select>` ni en el `<input>` (elemento reemplazado: no se pinta).
- **La cabecera tiene dos grupos** (titulo con sus filtros / acciones) y `justify-between`
  en la raiz: en una linea las acciones se pegan al borde derecho; cuando bajan a su
  propia linea quedan a la izquierda. El grupo de la izquierda no lleva `flex-1`, que
  impediria el salto de linea.
- El color de proyecto, persona, departamento y estado lo decide el backend y se pinta con
  estilo en linea; el frontend no lo calcula.
- Contraste y area tactil por encima del boceto: 4,5:1 en texto, 3:1 en graficos, 40 px
  de objetivo y 44 px en menu lateral.
- El codigo de proyecto no es un campo del modelo: se parsea del nombre, que lo lleva
  delante ("26009 - FLUID SYSTEM - Pasteurizador").
- Sin tema oscuro todavia, pero la infraestructura esta lista: un tema futuro es un bloque
  `[data-tema='...']` en `tokens.css`.

## Pendientes / Siguiente paso inmediato

1. **Push**: los cuatro commits de esta tanda estan en local, sin subir.
2. Sin tema oscuro y sin `.ics` (planificado, fuera de v1).
3. Revisar a ojo las capturas de `docs/capturas/` (las 16 vistas a 1440 px y el
   calendario estrecho) si se quiere una comprobacion final en pantalla.
