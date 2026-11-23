# Estado de la sesion

## Objetivo actual

Toast global del frontend: **implementado**. Un aviso flotante unico en toda la
aplicacion (`stores/toast.js` + `components/common/ToastHost.vue`, montado en
`App.vue`) sustituye a los 11 `AlertBanner variant="success"`. Los `error` y los
`warning` se quedan en linea; ademas, el error sale tambien como toast cuando el
inline puede no estar a la vista.

Esta sesion no toco el backend.

## Cambios realizados

- `frontend/src/stores/toast.js` (nuevo): store Pinia con la pila de avisos.
  `push({ message, variant, timeout, key })`, `success`/`info` (se autocierran a
  los 4000 ms), `warning`/`error` (no se autocierran), `dismiss(id)` y `clear()`.
  Tope de 3 avisos visibles; con `key` el aviso reemplaza al anterior en vez de
  apilar.
- `frontend/src/components/common/ToastHost.vue` (nuevo): pinta la pila.
  Reutiliza `AlertBanner` (mismo mapa de variantes, iconos y roles), con sombra,
  `z-[60]`, abajo a la derecha; en movil, ancho completo pegado abajo.
- `frontend/src/App.vue`: monta el host fuera del `v-if` publico, asi que existe
  tambien en el login y sobrevive al cambio de vista.
- Migrados los 11 `success` (28 mensajes) a toast: `AppShell` (1),
  `GanttView` (4), `KanbanView` (3), `MyWorkView` (1), `MembersView` (3),
  `ProjectSettingsView` (1), `CapacityMatrix` (4), `people/PersonDialog` (4),
  `settings/MembersPanel` (2), `settings/LaborCalendarPanel` (2),
  `settings/SkillsPanel` (3).
- `frontend/src/views/GanttView.vue`: separado el error de guardado del error de
  carga. `error` (carga) lo consume el `AsyncState`; `errorGuardado` (guardado) es
  un banner propio junto al diagrama, con "Reintentar", mas toast. Se arregla el
  bug de que `load()` borraba el error de guardado en la recarga siguiente.
- `frontend/src/components/CapacityMatrix.vue`: el rechazo del servidor al
  reasignar sale ademas como toast; los rechazos de destino (locales) se quedan
  solo en linea.
- Tests nuevos: `frontend/src/tests/toast.spec.js` (store) y `toastHost.spec.js`
  (host). Los specs de las 9 vistas migradas, de `GanttView` y de
  `CapacityMatrix` afirman contra el store en vez de contra `wrapper.text()`.
- `docs/especificaciones.md` §19: el patron de aviso pasa a ser de dos papeles
  (toast de confirmacion, banner de estado) con un solo componente.
- `.operator/specs/frontend-ux.md`: nueva seccion "Avisos: banner en linea y
  toast flotante".
- `.operator/product/ideas.md`: I-002 pasa a "decidido e implementado".
- `.operator/index/index.md`: el store, el host y el numero de tests.

## Decisiones tecnicas

**Alcance**

- Los 11 `AlertBanner variant="success"` pasan a toast. Quedan 23 `AlertBanner`
  en 19 ficheros (14 `error`, 7 `warning`, 2 `info`): `AlertBanner` sigue siendo
  el patron de error y de aviso que hay que entender.
- El toast es un aviso **transitorio de confirmacion**. El banner en linea es el
  **estado de una region** (error de guardado, validacion, aviso con detalle).
- Criterio para el error: **inline siempre; toast ademas cuando el inline puede
  no estar a la vista**. El inline lleva el detalle y la accion ("Reintentar"); el
  toast el resumen. Con el mismo texto en los dos, el lector de pantalla lo
  anuncia dos veces (inline con `role="alert"`, toast con `aria-live="polite"`).
- Califican el error con toast: el **guardado fallido del Gantt** (el inline vive
  junto al diagrama) y el **rechazo del servidor al reasignar** en la matriz (el
  inline vive en la cabecera, sobre el contenedor con scroll del arrastre). El
  **fallo al exportar `.ics` no califica**: su aviso sale justo debajo del boton.

**Estilo: B** (fondo de color claro). Es el mismo del `AlertBanner` actual (fondo
50, borde 200, texto 800, icono de la variante). **Reutilizar `AlertBanner` dentro
del host** en vez de duplicar el mapa de clases: el toast es un `AlertBanner`
flotante con sombra.

**Variantes y tiempos**

- Cuatro variantes: `success`, `info`, `warning`, `error` (mismos nombres y
  colores que `AlertBanner`).
- `success` e `info`: cierre automatico a los **4000 ms**.
- `warning` y `error`: **no se autocierran**; se cierran con la `x`.
- Todos los toasts llevan cierre manual (`x`), como el `AlertBanner` actual.

**Pila y posicion**

- Abajo a la derecha (`fixed`, `right-4 bottom-4`); en movil, ancho completo
  pegado abajo. Por encima del velo del `ModalDialog` (`fixed inset-0 z-50`): el
  host va con **`z-[60]`**.
- Maximo **3** toasts visibles; al entrar el cuarto se descarta el mas viejo.
- `key` opcional: si ya hay un toast con ese `key`, se **reemplaza** su mensaje
  en vez de apilar. El arrastre en el Gantt dispara uno por suelta:
  `key: 'gantt-fechas'`.

**Mecanica**

- `frontend/src/stores/toast.js`: store Pinia (setup, como `auth` y `projects`).
  `state: { items: [] }`, cada item `{ id, message, variant, key }`.
- `frontend/src/components/common/ToastHost.vue`: pinta la pila. Contenedor con
  `aria-live="polite"`; el error sale con `role="alert"` (lo aporta `AlertBanner`).
  No roba el foco. Sin animacion de entrada.
- Montaje en **`frontend/src/App.vue`** (no en `AppShell`): sobrevive al cambio de
  vista y existe tambien en el login.

**Aviso: hay que reutilizar, no reimplementar**

`AlertBanner.vue` ya tiene el mapa de variantes, los iconos, los roles de
accesibilidad y el boton de cierre. El toast es ese componente en un contenedor
flotante. No hay un segundo mapa de colores.

**Trampas concretas (verificadas en el codigo)**

- `ModalDialog` usa `fixed inset-0 z-50`: sin `z-[60]` el toast de un dialogo
  queda detras del velo.
- `verify:css` exige que las clases de Tailwind aparezcan **enteras** en el
  template. `z-[60]`, `shadow-lg` y las de posicion van literales, no montadas por
  trozos.
- Los tests usan **Pinia real** (`createPinia` + `setActivePinia`), asi que el
  store funciona en los tests sin doble. El helper de montaje debe usar **la
  misma** instancia que la vista: si no, el store que lee el test no es el de la
  vista y la asercion pasa por un store vacio.
- Con el host fuera de la vista, `wrapper.text()` ya no ve el texto del toast: los
  tests afirman contra `useToastStore().items`.

## Pendientes / Siguiente paso inmediato

1. **Sin commit**: el usuario no lo ha pedido. Los cambios estan en el arbol de
   trabajo.
2. Mirar el cambio en el navegador: `python iniciar.py` (API 8000, interfaz 5173) y
   comprobar un toast de exito, uno de error y uno disparado desde un dialogo.
3. El toast mete una region viva dentro de la del banner. Si en algun lector de
   pantalla se anuncia dos veces, la solucion es quitar el `role="status"` del
   banner cuando va dentro del host, no quitar el `aria-live` del contenedor.

Verificacion de esta sesion: `npm test` (45 ficheros, 774 tests, en verde),
`npm run build` y `npm run verify:css` ("todas las clases usadas estan en el
bundle"). El backend no se toco: no hace falta pytest.

Pendiente abierto de la sesion anterior, que sigue sin decidir y no bloquea esta:
si la semilla de demostracion sigue anclando el trabajo dos y tres semanas por
delante (deja la primera pantalla del calendario y de "Mi trabajo" vacia) o si se
mueve parte del trabajo a la semana en curso.
