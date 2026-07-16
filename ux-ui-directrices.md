# Clooki · Directrices de UX/UI para la rejilla "Mi semana" (y el resto de la app)

> **Para el agente frontend.** Este documento es tu brief de diseño. Ejecútalo de forma
> incremental (ver §9). Salvo la §11, no añade pantallas, campos ni funcionalidad: es una pasada de
> **capa de interacción + capa visual** sobre lo que ya existe. No toques el modelo de datos
> ni el mecanismo de autoguardado (upsert/delete optimista por celda); sí puedes cambiar
> *cuándo y cómo* se comunica el estado de guardado.
>
> **Excepción documentada (§11):** el cronómetro concurrente es la única funcionalidad de esta
> ampliación que **sí** requiere tocar el modelo de datos (necesita persistir *sesiones* de
> cronómetro en servidor, no solo el total de horas por día/proyecto). Ese trabajo de esquema/RLS
> lo hace el agente backend antes de que el frontend pueda implementarse — ver los "Requisitos de
> datos para el backend" en §11.4. La regla "no toques el modelo de datos" **sigue vigente para
> todo lo demás**: líneas múltiples (§11.1) y pegado (§11.2) se apoyan en el mismo upsert por celda
> que ya existe y no cambian el esquema.
>
> Principio rector que gobierna cada decisión: **"lo más simple que funcione; menos campos,
> menos clics, menos pantallas"**. Sobriedad deliberada, no decoración. Un solo acento de
> color, usado con disciplina.

---

## 1. Resumen ejecutivo

1. **Arreglar el feedback de guardado**, que hoy está roto: `huboGuardado` se pone a `true` y nunca vuelve a `false`, así que "Guardado ✓" se queda pegado para siempre (viola *visibilidad del estado del sistema* de Nielsen y los umbrales de temporización). Pasamos a un patrón transitorio: confirmación por celda + badge global que se desvanece.
2. **Dar identidad sobria a Clooki** con 6 tokens de color nombrados + un único acento indigo, sustituyendo el `neutral-900/neutral-100` de fábrica que hace que la app parezca un `create-next-app` cualquiera.
3. **Subir los objetivos táctiles** de la vista móvil: los inputs son de 36 px (`h-9`) y las fuentes de 14 px provocan zoom automático en iOS; suben a 44 px y 16 px (Ley de Fitts + prevención de errores).
4. **Reforzar la jerarquía tipográfica**: hoy casi todo es `text-xs/text-sm`; damos escala real entre cliente, proyecto, valor de celda, total de fila, total de columna y total de semana (Gestalt: similitud/jerarquía).
5. **Mantener la vista móvil "día a día"** (es la correcta para el modelo mental "qué hice el lunes"), pero arreglar sus carencias: puntos de progreso por día, targets grandes, total del día visible.
6. **Corregir un bug de tipografía**: `globals.css` fuerza `font-family: Arial` en `body`, lo que anula la fuente Geist cargada en `layout.tsx`. La app se ve en Arial sin querer.
7. **Migrar los componentes a tokens semánticos** (hoy usan clases fijas `bg-white`, `text-neutral-900`, `border-red-500` que ignoran el modo oscuro declarado en `globals.css`). Esto da identidad ahora y deja el modo oscuro al ~80% "gratis"; el pulido final de dark es un bloque aparte.
8. **Afinar microcopy y accesibilidad**: contraste de los grises tenues (`neutral-400` no cumple AA), foco visible con el acento, `prefers-reduced-motion`, y mover el foco a la línea recién añadida.
9. **Ampliación de productividad (§11)**, decidida por el cliente tras revisar este borrador: **añadir varias líneas de golpe** (checkboxes de proyectos por cliente), **pegar valores desde el portapapeles** sobre la rejilla (patrón tipo hoja de cálculo) y un **cronómetro play/stop concurrente** (varios cronómetros activos a la vez para la misma persona, en proyectos distintos). Los dos primeros no tocan el modelo de datos; el cronómetro **sí** y es la única excepción a esa regla (ver §11.4). Bloque final de §9, después de todo lo anterior.
10. **Revisión de segunda opinión (§12)** con los huecos que quedaban: el más serio, **una celda escrita sin confirmar se pierde al cerrar la pestaña** (incumple el criterio de aceptación 3; se arregla con debounce + `visibilitychange`); además, auto-reintento al reconectar, toggle de mostrar contraseña, cronómetros en el título de la pestaña, no quitar líneas con sesión activa, y la regla de parseo del pegado corregida (la coma nunca separa celdas).

---

## 2. Sistema de diseño base

Todo esto vive en `globals.css` con `@theme` de Tailwind v4 y se consume como utilidades (`bg-fondo`, `text-tinta`, `border-borde`, `ring-acento`…). **Regla:** ningún componente vuelve a escribir `neutral-*`, `red-*`, `emerald-*` a pelo; todo pasa por token.

### 2.1 Color — tokens nombrados

Paleta base **neutra cálida** (grises ligeramente cálidos, no el gris azulado de fábrica) + **un acento indigo** sobrio. El indigo transmite calma/confianza y es una herramienta de trabajo, no un CTA de marketing; se reserva para **foco, "hoy", selección activa y enlaces**. Los estados (éxito/error/aviso) tienen su propio color y **nunca** se confunden con el acento.

Elección deliberada de dos colores de estado distintos para dos fallos distintos:
- **Entrada inválida** (el usuario escribió "abc" o 30) → **aviso ámbar**: es corregible, no es un fallo del sistema. Tono suave, no alarmante (prevención de errores, no castigo).
- **Fallo de red** (no se guardó) → **error rojo**: algo del sistema falló y hay que reintentar.

```css
/* globals.css */
@import "tailwindcss";

:root {
  /* Neutros base */
  --color-fondo:         #FBFBFA; /* fondo de página, blanco cálido */
  --color-superficie:    #FFFFFF; /* inputs, tarjetas */
  --color-superficie-2:  #F4F4F5; /* zebra sutil / relleno tenue */
  --color-borde:         #E7E7E9;
  --color-borde-fuerte:  #D4D4D8;

  /* Texto */
  --color-tinta:         #1B1B1F; /* texto fuerte: proyecto, totales, botón primario */
  --color-texto:         #3F3F46; /* cuerpo */
  --color-texto-suave:   #6B6B74; /* etiquetas secundarias (AA: 5.4:1 sobre blanco) */

  /* Acento (indigo) — foco, hoy, selección, enlaces */
  --color-acento:        #3A54C4;
  --color-acento-suave:  #EEF1FD; /* tinte de la columna/celda de hoy y del chip activo */

  /* Estados */
  --color-exito:         #15803D; --color-exito-suave: #ECFDF5;
  --color-error:         #B91C1C; --color-error-suave: #FEF2F2;
  --color-aviso:         #B45309; --color-aviso-suave: #FFFBEB;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-fondo:        #0E0E10;
    --color-superficie:   #161619;
    --color-superficie-2: #1F1F23;
    --color-borde:        #2A2A2F;
    --color-borde-fuerte: #3A3A41;
    --color-tinta:        #FAFAFA;
    --color-texto:        #E4E4E7;
    --color-texto-suave:  #A1A1AA;
    --color-acento:       #93A5FF; /* aclarado para contraste sobre oscuro */
    --color-acento-suave: rgba(147,165,255,0.14);
    --color-exito:        #4ADE80; --color-exito-suave: rgba(74,222,128,0.12);
    --color-error:        #F87171; --color-error-suave: rgba(248,113,113,0.12);
    --color-aviso:        #FBBF24; --color-aviso-suave: rgba(251,191,36,0.12);
  }
}

@theme inline {
  --color-fondo: var(--color-fondo);
  --color-superficie: var(--color-superficie);
  --color-superficie-2: var(--color-superficie-2);
  --color-borde: var(--color-borde);
  --color-borde-fuerte: var(--color-borde-fuerte);
  --color-tinta: var(--color-tinta);
  --color-texto: var(--color-texto);
  --color-texto-suave: var(--color-texto-suave);
  --color-acento: var(--color-acento);
  --color-acento-suave: var(--color-acento-suave);
  --color-exito: var(--color-exito);
  --color-exito-suave: var(--color-exito-suave);
  --color-error: var(--color-error);
  --color-error-suave: var(--color-error-suave);
  --color-aviso: var(--color-aviso);
  --color-aviso-suave: var(--color-aviso-suave);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--color-fondo);
  color: var(--color-texto);
  /* NO fijar font-family aquí: dejar que Tailwind/Geist manden (ver §3, bug del Arial) */
}
```

> **Decisión sobre modo oscuro:** merece la pena abordar el *cableado* ahora, porque migrar a
> tokens es trabajo que hay que hacer igualmente para dar identidad. Con los componentes leyendo
> tokens, el modo claro queda perfecto y el oscuro queda al ~80% sin esfuerzo extra. **Lo que
> queda fuera de esta pasada** es el QA fino de dark (revisar cada estado en oscuro, sombras,
> el tinte de "hoy"): es el último bloque de §9, no un bloqueante. No inviertas en dark hasta
> que el claro esté cerrado.

### 2.2 Tipografía

Fuente: **Geist** (ya cargada). Números siempre `tabular-nums` en celdas y totales (evita que las cifras "bailen"). Escala con jerarquía real por nivel:

| Nivel | Tamaño / peso / tracking | Token Tailwind | Color |
|---|---|---|---|
| Wordmark "Clooki" | 18px / 700 / -0.01em | `text-lg font-bold tracking-tight` | `text-tinta` |
| Título de página ("Mi semana") | 20px / 700 / -0.01em | `text-xl font-bold tracking-tight` | `text-tinta` |
| Cabecera de columna (día L–D) | 12px / 600 / normal | `text-xs font-semibold` | `text-texto-suave` (hoy: `text-acento`) |
| Sub-etiqueta de columna (fecha "15 jul") | 11px / 400 | `text-[11px]` | `text-texto-suave` |
| Cliente (eyebrow de fila) | 11px / 500 / 0.04em uppercase | `text-[11px] font-medium uppercase tracking-wide` | `text-texto-suave` |
| Proyecto (título de fila) | 14px / 600 | `text-sm font-semibold` | `text-tinta` |
| Valor de celda | 15px / 500 tabular | `text-[15px] font-medium tabular-nums` | `text-texto` |
| Total de fila | 14px / 600 tabular | `text-sm font-semibold tabular-nums` | `text-tinta` |
| Total por día (tfoot) | 14px / 600 tabular | `text-sm font-semibold tabular-nums` | `text-texto` |
| **Total de la semana** | 16px / 700 tabular | `text-base font-bold tabular-nums` | `text-tinta` |
| Texto auxiliar / ayuda | 12px / 400 | `text-xs` | `text-texto-suave` |

Punto clave (Gestalt / carga cognitiva): **el proyecto es el ancla de la fila** (14/600 tinta) y el cliente es su contexto (11/500 tenue). Hoy los dos compiten. Y **el total de la semana debe ser tipográficamente el número más importante de la pantalla** (16/700); hoy es igual que un total de día cualquiera.

### 2.3 Espaciado

Escala 4px. Contenedor de página `max-w-5xl` (ya está bien). Densidad de la tabla: filas cómodas pero no infladas — alto de fila objetivo **44px** para que la celda cumpla táctil sin scroll infinito. Separación entre grupos (tabla ↔ acciones ↔ totales) mínimo `mt-4`/`pt-3` con borde para separar por *proximidad*.

### 2.4 Objetivos táctiles (Fitts)

- **Celda (móvil): 44px de alto mínimo** y **16px de fuente** (evita el zoom automático de iOS con inputs < 16px). Desktop puede quedarse en 40px.
- **Botón de nota / quitar línea: 40×40px de área pulsable** (padding, aunque el icono sea de 14px). Hoy son `px-1.5 py-1` ≈ 24px: imposibles de acertar en móvil y minúsculos con ratón.
- **Chips de día (móvil): 44px de alto.**
- Objetivo general recomendado: 44×44 (Apple HIG). No bajar de ahí en nada interactivo.

### 2.5 Movimiento

```css
:root {
  --dur-rapido: 120ms;   /* hover, foco */
  --dur-medio: 200ms;    /* aparición de nota / fin de semana */
  --ease: cubic-bezier(0.2, 0, 0, 1);
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 1ms !important; animation-duration: 1ms !important; }
}
```

- Transiciones solo de `color`/`background`/`opacity`/`border-color`; **nunca** de layout.
- Badge "Guardado": visible **1.6s**, luego fade-out de **300ms**.
- Confirmación por celda: parpadeo de borde acento → normal en **~900ms**.
- Con `prefers-reduced-motion`: los cambios de estado son instantáneos, pero **siguen ocurriendo** (no se elimina el feedback, solo la animación).

---

## 3. Diagnóstico del estado actual (archivo · comportamiento · principio violado)

| # | Dónde | Qué pasa | Principio |
|---|---|---|---|
| D1 | `rejilla-semana.tsx:96,164,231` | `huboGuardado` se pone a `true` y **nunca** vuelve a `false`. Tras guardar la primera celda, "Guardado ✓" queda fijo el resto de la sesión. | **Visibilidad del estado del sistema** + temporización del feedback (Nielsen ~1s/~10s). Un indicador permanente = ningún indicador: deja de significar "acabo de guardar". |
| D2 | `globals.css:25` | `body { font-family: Arial, Helvetica, sans-serif }` **anula** la variable Geist que `layout.tsx` inyecta. La app entera se renderiza en Arial. | Consistencia; intención de diseño perdida por accidente. |
| D3 | `rejilla-semana.tsx:364` (`celdaInput`) | Inputs `h-9` (36px) y `text-sm` (14px) también en móvil. 36px < 44px objetivo; 14px provoca zoom automático en iOS al enfocar. | **Ley de Fitts**; prevención de errores (el zoom desorienta a media escritura). |
| D4 | `botonesLinea` (`:383,:409`) | Nota y quitar-línea son `px-1.5 py-1` (~24px) con iconos de 14px; el icono tenue es `text-neutral-400`. | **Fitts** (target diminuto) + **contraste AA** (`neutral-400` #a3a3a3 ≈ 2.6:1 sobre blanco, falla). |
| D5 | Toda la rejilla | Paleta `neutral-900/100/50` de fábrica; sin acento propio. Genérico. | Identidad/consistencia de marca (no es un fallo funcional, sí de producto). |
| D6 | `celdaInput`, `inputNota`, `page.tsx`, logins | Clases fijas `bg-white`, `text-neutral-900`, `border-red-500`, `bg-neutral-900`… no reaccionan al `prefers-color-scheme: dark` que `globals.css` sí declara. | Consistencia (modo oscuro roto de facto). |
| D7 | Indicador global `:437-454` | Estado agregado: "Guardando…" / "error" / "Guardado" para toda la tabla. No dices **qué** celda. En una rejilla de 35 celdas, "no se pudo guardar alguna celda" obliga a buscar cuál. | Ayudar a **diagnosticar/recuperarse** de errores; reconocer sobre recordar. |
| D8 | `anadirLinea` (`:252`) | Al añadir una línea, el foco no se mueve a ella; el usuario tiene que buscarla y hacer clic para empezar a teclear. | **Flexibilidad y eficiencia**; flujo de power-user roto. |
| D9 | Cabecera de día / totales | "Hoy" se marca solo con `bg-neutral-100/70` (un gris casi imperceptible) + negrita. En móvil el chip activo es negro sólido pero "hoy no activo" es casi invisible. | Visibilidad del estado; el color no es el único canal, pero el que hay es demasiado sutil. |
| D10 | Celda inválida `:364-368` y error de red comparten `border-red-500`/`bg-red-50` | Entrada inválida y fallo de red se ven **idénticos**, siendo problemas distintos con soluciones distintas. | Ayudar a diagnosticar errores; *match* con la causa real. |
| D11 | Columna "Total" de fila `:520` | Muestra `""` cuando el total es 0, pero el tfoot y el total de semana siempre muestran número. Inconsistencia de cuándo aparece un total. | Consistencia. |
| D12 | Sin `Escape` en celda | No hay forma de cancelar una edición y volver al último valor guardado; hay que borrar y reescribir. | **Control y libertad del usuario** ("salida de emergencia"). |
| D13 | `page.tsx:53` "Clooki" y `:82` "Mi semana" | Dos títulos `font-bold` de tamaño casi igual (`text-lg` y `text-xl`) compitiendo; la navegación de semana va suelta a su lado. | Jerarquía (Gestalt). |

---

## 4. Rediseño de "Mi semana" — escritorio

Estructura general igual (tabla líneas × días + tfoot). Cambia el acabado, la jerarquía y el feedback.

### 4.1 Cabecera de página + navegación de semana (`page.tsx`)
- Separar identidad de contenido: **"Clooki"** (wordmark) vive en una barra superior discreta con la nav admin y "Salir"; **"Mi semana"** es el `<h1>` de la vista, más grande, con la navegación de semana **agrupada a su derecha en un solo control** (proximidad Gestalt): `[←] 14 – 20 jul 2026 [→]  · Hoy`.
- Flechas `←/→`: subir a 40×40, `aria-label` ya correcto. El rango de fechas es el "eje": `text-sm font-medium text-texto tabular-nums`, `min-w` fijo para que no salte al cambiar de semana.
- "Hoy" (volver a semana actual) solo visible cuando no estás en la semana actual (ya lo hace). Estilo enlace-acento, no botón sólido.

### 4.2 Tabla
- Fondo `bg-superficie`, borde exterior `border border-borde rounded-xl` para que la rejilla lea como **una superficie** (Gestalt: región cerrada), en vez de líneas sueltas sobre el fondo.
- Cabecera de columnas: `text-texto-suave`, `font-semibold text-xs`. La columna de **hoy** lleva el nombre del día en `text-acento` + un subrayado de 2px `border-b-2 border-acento` bajo la cabecera (canal redundante al color).
- Mantener `min-w-[640px]` + `overflow-x-auto` para pantallas medianas.

### 4.3 Fila de línea
- Eyebrow **cliente** (11/500 uppercase tenue) sobre **proyecto** (14/600 tinta). Truncado con `title` completo por si el nombre es largo.
- Alto de fila 44px. Separador entre filas `border-t border-borde` (más visible que `neutral-100`).
- **Hover de fila**: `bg-superficie-2` sutil para dar contexto de "estás sobre esta fila" (útil con muchas líneas; Gestalt continuidad).

### 4.4 Celda
- `h-10` (40px) desktop, borde `border-borde`, texto `text-[15px] tabular-nums`.
- Vacía: sin placeholder (ruido innecesario; el 0 se entiende por ausencia). 
- **Foco**: `border-acento` + `ring-2 ring-acento/20` (sustituye el ring negro). Foco **claramente visible** y consistente en toda la app.
- La columna de **hoy** lleva `bg-acento-suave` (tinte indigo muy claro) en toda su vertical, incluida la celda y el total del día: así "hoy" se localiza de un vistazo (reconocer sobre recordar).
- `onFocus` sigue haciendo `select()` (bien: teclear sobreescribe).

### 4.5 Fila de totales (tfoot)
- "Total por día" a la izquierda (`text-xs font-medium text-texto-suave`).
- Cada total de día: `text-sm font-semibold tabular-nums`. Total de la columna de hoy hereda el tinte acento.
- **Total de la semana**: la celda de la esquina inferior derecha es el número protagonista — `text-base font-bold text-tinta`, quizá con una etiqueta "Semana" minúscula encima. Es el dato que el usuario verifica antes de irse ("¿llego a mis horas?").
- **Consistencia (D11):** decide una única regla y aplícala en fila, tfoot y semana. Recomendación: mostrar `—` (guion tenue `text-texto-suave`) cuando un total es 0, en vez de mezclar "" y "0". El guion comunica "sin horas" mejor que un vacío ambiguo.

### 4.6 Controles de nota / quitar línea (Fitts + D4)
- Agrupar a la derecha de la fila en una celda de acciones de ancho fijo.
- **Nota**: botón 40×40, icono 16px. Sin nota → `text-texto-suave`; con nota → `text-acento` + relleno del icono (señal de "aquí hay algo"). `aria-expanded` ya está.
- **Quitar línea**: sustituir el carácter `✕` por el mismo peso visual que la nota (icono SVG de papelera o una equis dibujada), 40×40, `text-texto-suave` con `hover:text-error`. Mantener la regla actual (**solo aparece si la línea no tiene horas esa semana**): es buena **prevención de errores** — no puedes borrar sin querer una línea con datos. Documenta esa regla con un `title` claro (ver §7).
- El campo de nota, al abrirse, ocupa una fila propia bajo la línea (ya lo hace) con `bg-superficie-2`, transición de `opacity`/altura de 200ms.

### 4.7 Indicador de guardado (arreglo de D1 — el hallazgo más importante)
Patrón de **doble canal, ambos transitorios**:

1. **Por celda (primario, local):** al confirmar un guardado con éxito, la celda parpadea su borde a `border-acento`/`border-exito` y vuelve a normal en ~900ms. Mientras guarda: `opacity-70` (ya existe). Es el feedback en el sitio donde el usuario está mirando (Fitts del feedback: donde está la atención).
2. **Global (secundario, agregado):** una zona `aria-live="polite"` que:
   - Muestra **"Guardando…"** mientras haya ≥1 celda en `guardando`.
   - Al quedar todo guardado, muestra **"Guardado"** con check **durante 1.6s y luego se desvanece a vacío**. Implementación: un `useEffect` que, cuando `guardando` pasa de `true`→`false` sin errores, arranca un timer que limpia el mensaje. **Elimina por completo la bandera `huboGuardado` permanente.**
   - Si hay errores, muestra el error persistente (no se desvanece hasta resolverse) — ver §6.

### 4.8 "+ Añadir línea" (Hick)
- El patrón actual (botón → dos selects dependientes cliente→proyecto) **es correcto y respeta Hick**: reduce las opciones del segundo select a las del cliente elegido. No lo conviertas en un buscador con librería nueva.
- Mejoras:
  - **Al añadir, mueve el foco a la primera celda editable de la línea nueva** (arregla D8). La línea nueva debería además hacer un breve resaltado de aparición (borde acento 900ms) para que el ojo la encuentre (Gestalt: dónde apareció).
  - `Escape` cierra el formulario de añadir (control y libertad).
  - Si no quedan proyectos por añadir, el botón se deshabilita (ya lo hace) — añade `title="Ya tienes todas tus líneas"` para explicar el porqué del disabled (evita el "botón muerto sin explicación").

### 4.9 Fin de semana plegable
- El toggle actual ("+ fin de semana" / "− ocultar fin de semana") está bien conceptualmente (progressive disclosure reduce carga). Mejoras:
  - Convertirlo en un control más legible: un botón con chevron, `text-texto-suave`, junto a "+ Añadir línea".
  - No permitir ocultar el finde si tiene horas (ya lo hace vía `hayHorasFinde`) — **prevención de pérdida de datos**. Añade `title` explicando por qué desaparece la opción de ocultar.
  - S/D, cuando visibles, con cabecera `text-texto-suave` un punto más tenue que L–V (jerarquía: son excepción).

---

## 5. Rediseño de "Mi semana" — móvil

### 5.1 Recomendación: **mantener "día a día"** (con arreglos), no cambiar a línea×7

Razonado:
- **A favor de día-a-día (elegido):** coincide con el criterio de aceptación 4; coincide con el modelo mental "¿qué hice el lunes?" (*match con el mundo real*); en pantalla estrecha caben todas las líneas de un día en vertical con inputs de 44px, sin scroll horizontal.
- **Alternativa "lista de líneas × 7 inputs con scroll horizontal" — rechazada:** 7 inputs no caben en 360px; obliga a scroll horizontal por cada línea, que es justo la fricción que el MVP evita.
- **Alternativa "acordeón con los 7 días abiertos a la vez" — rechazada:** para 5 líneas son 35 inputs apilados; scroll larguísimo y pesado. "La semana de una pasada" se resuelve mejor con *feedback de progreso* (abajo) que amontonando inputs.

Es decir: la crítica del MVP ("rellenar la semana entera de una pasada") **no exige verlo todo a la vez**; exige *saber qué falta y llegar rápido*. Eso se logra con indicadores de progreso, no con densidad.

### 5.2 Especificación móvil

- **Selector de día (chips L–D):** fila de 7, cada chip **44px de alto**. Estado:
  - Activo: `bg-acento text-superficie` (blanco), fecha en `text-superficie/70`.
  - Hoy (no activo): `text-acento` + subrayado 2px acento (no el `bg-neutral-100` casi invisible actual — arregla D9).
  - Resto: `bg-superficie-2 text-texto-suave`.
  - **Punto de progreso:** bajo cada chip, un `•` de 4px en `bg-acento` **si ese día tiene alguna hora**. Así, de un vistazo, el usuario ve qué días le faltan (reconocer sobre recordar; resuelve "la semana de una pasada"). Los días sin horas, sin punto.
  - Añade flechas o gesto no es imprescindible: 7 chips ya son alcanzables. `role="tablist"` ya está bien.
- **Etiqueta del día** (ya existe: "Lunes 15 jul · hoy"): mantener, `text-sm text-texto-suave`.
- **Lista de líneas del día:** cada `li` en 44px+, cliente/proyecto a la izquierda (misma jerarquía que desktop), input a la derecha **56px de ancho × 44px alto, `text-base` (16px)** para no disparar el zoom de iOS (arregla D3). `inputMode="decimal"` ya está.
- **Acciones (nota / quitar):** 40×40 cada una; en móvil, considera colapsar la de nota en un toque sobre la propia línea si el espacio aprieta, pero no es imprescindible.
- **Totales del día + semana (pie):** ya existen; sube el **total del día** a `text-base font-bold` (es el número que el usuario confirma antes de cambiar de día) y deja "Semana" como secundario.
- **Añadir línea / fin de semana:** el `+ fin de semana` hoy está `hidden sm:inline-block` (solo desktop). En móvil los 7 chips ya incluyen S y D, así que el finde es accesible; mantén esa coherencia (no muestres el toggle en móvil).

---

## 6. Estados y feedback

| Estado | Disparador | Tratamiento visual | Temporización |
|---|---|---|---|
| **Vacío (sin líneas)** | `lineasVisibles.length === 0` | Caja punteada `border-borde`, texto `text-texto-suave`, CTA "+ Añadir línea" enfatizado. | — |
| **Ocioso** | Sin ediciones pendientes | Sin indicador global (zona vacía, `min-h` reservado para que no salte el layout). | — |
| **Guardando** | ≥1 celda en `guardando` | Celda `opacity-70`; global "Guardando…" `text-texto-suave`. | Mientras dure la petición. |
| **Guardado OK** | `guardando` true→false sin errores | Celda: parpadeo de borde acento→normal. Global: "Guardado ✓" `text-exito`. | Celda ~900ms; global **1.6s + fade 300ms**, luego vacío. |
| **Entrada inválida** | `interpretarHoras === "error"` | Celda `border-aviso bg-aviso-suave text-aviso`; `title`/tooltip "Horas de 0,5 en 0,5, entre 0,5 y 24". **No se guarda ni se borra** lo escrito (ya lo hace). Icono de aviso pequeño dentro/junto a la celda. | Persistente hasta corregir. |
| **Error de red** | Fallo tras reintento | Celda `border-error bg-error-suave text-error`. Global: "No se guardaron N cambios" + botón **Reintentar**. | Persistente hasta reintento con éxito. |
| **Nota abierta/cerrada** | `notasAbiertas` | Fila extra `bg-superficie-2`, transición opacity/altura 200ms. Botón nota `aria-expanded`. | 200ms. |
| **Fin de semana plegado/desplegado** | `verFinde` | Columnas S/D aparecen; cabecera S/D un tono más tenue. | 200ms. |
| **Cargando (navegación de semana)** | Cambio de `?semana=` (server) | La página es un Server Component; usa el `loading.tsx` de Next para un skeleton de la rejilla (filas grises) en vez de pantalla en blanco. | Hasta que resuelva. |
| **Cronómetro corriendo** | Sesión activa persona+proyecto (§11.3) | Celda en `bg-acento-suave` + `border-acento`, punto acento pulsante junto al tiempo transcurrido `mm:ss`/`h:mm`; input **de solo lectura** mientras corre. Botón de fila en modo "Parar" (`text-acento`). Fila listada en la bandeja global. | Mientras la sesión esté activa. |
| **Cronómetro parado (volcado OK)** | Stop con éxito | Tiempo redondeado a 0,5h se **suma** al valor existente de la celda; celda vuelve a editable con el parpadeo de "Guardado OK". La fila sale de la bandeja global. | Parpadeo ~900ms; bandeja se actualiza al instante. |
| **Cronómetro — aviso de olvido** | Sesión activa supera el umbral (recom. 10h) | Chip de la bandeja global vira a `border-aviso bg-aviso-suave text-aviso` + icono de aviso; texto "Lleva {N} h en marcha, ¿sigues?". **No bloqueante**, no autopara. | Persistente hasta parar o descartar el aviso. |
| **Cronómetro — error al parar (red)** | Fallo de red al hacer stop | El tiempo transcurrido **no se pierde**: la sesión queda "pendiente de cierre" con su hora de inicio intacta; chip en `border-error bg-error-suave` + botón **Reintentar parar**. Nunca vuelve a cero. | Persistente hasta reintento con éxito. |

**Diferenciación clave (D10):** aviso (ámbar, corregible por el usuario) ≠ error (rojo, fallo del sistema, reintentable). Dos colores, dos copys, dos acciones. Los estados del cronómetro reutilizan esta misma semántica (ámbar = "revisa si te olvidaste"; rojo = "falló el guardado, reintenta") y se detallan en §11.3.

---

## 7. Microcopy (voz activa, directa, sin disculpas de más)

| Ubicación | Actual | Propuesto | Por qué |
|---|---|---|---|
| Error global de red | "No se pudo guardar alguna celda." | **"No se guardaron {N} cambios."** (+ botón "Reintentar") | Cuantifica y usa voz activa; "alguna celda" es vago. |
| Tooltip celda inválida | "Horas en pasos de 0,5, entre 0,5 y 24" | **"Usa pasos de 0,5, entre 0,5 y 24."** | Instrucción accionable en imperativo, no descripción. |
| Tooltip celda error | "No se pudo guardar" | **"No se guardó. Reintentando…"** o "Toca Reintentar." | Dice qué hacer. |
| Sin líneas | "No tienes líneas de trabajo esta semana. Añade la primera con «+ Añadir línea»." | **"Aún no tienes líneas. Añade la primera con + Añadir línea."** | Más corto; "aún" es menos seco. |
| Usuario no dado de alta (`page.tsx`) | "Tu usuario no está dado de alta en Clooki. Pide a un admin que te añada en Gestión y vuelve a entrar." | **"Todavía no tienes acceso a Clooki. Pide a un admin que te dé de alta y vuelve a entrar."** | Elimina jerga interna ("en Gestión") para el usuario que aún no es admin; más humano. |
| Quitar línea (title) | "Quitar línea (sin horas esta semana)" | **"Quitar línea"** (y, si tiene horas y por eso no aparece, no hace falta copy) | El paréntesis explica una condición que el usuario no ve; sobra. |
| Añadir línea deshabilitado | (sin title) | **"Ya tienes todas tus líneas"** | Explica el disabled (evita botón muerto). |
| Placeholder nota | "Nota de la línea (p. ej. la tarea concreta)" | **"Nota (opcional)"** | Más corto; el contexto ya se entiende. |
| Login subtítulo | "Registro de horas de Coonic. Entra con tu correo y contraseña." | Correcto — mantener. | — |
| Botón guardar login | "Entrar" / "Entrando…" | Correcto — mantener. | — |

Regla transversal: **cada control describe exactamente lo que hace**, en imperativo, sin "por favor" ni disculpas ("lo sentimos"). El tono es de compañero, no de recepcionista.

---

## 8. Accesibilidad (checklist aplicada a la rejilla)

- [ ] **Contraste AA:** ningún texto en `neutral-400`; los grises tenues pasan a `text-texto-suave` (≥4.5:1). Verificar acento sobre blanco (6:1 ✓) y blanco sobre acento en chips/botón (6:1 ✓).
- [ ] **Foco visible** consistente en toda la app: `ring-2 ring-acento/30` + `border-acento` en inputs; `outline-2 outline-acento outline-offset-2` en botones. Nada de `outline: none` sin sustituto.
- [ ] **Objetivos táctiles** ≥44px en celdas móviles y chips; ≥40px en botones de icono.
- [ ] **Inputs de celda a 16px en móvil** (evita zoom que rompe la orientación).
- [ ] **`prefers-reduced-motion`**: sin animaciones de layout; los cambios de estado siguen siendo perceptibles (color), solo se quita la transición.
- [ ] **`aria-live="polite"`** en el indicador global (ya está) — pero que **cambie** de verdad (hoy queda pegado y deja de anunciar). Al desvanecerse debe quedar vacío para volver a anunciar el próximo "Guardado".
- [ ] **El color no es el único canal:** hoy = tinte + subrayado; error = borde + icono + texto; nota puesta = color + relleno de icono; progreso móvil = punto (no solo color del chip).
- [ ] **Labels:** `aria-label` de celda ya es excelente ("Horas de {cliente} — {proyecto}, {día} {fecha}"). Mantener. Selects con `<label sr-only>` ✓.
- [ ] **Tabla semántica:** `th scope="col"/"row"`, `tfoot` ✓. Mantener.
- [ ] **Teclado:** Tab horizontal (nativo) + ↑/↓ vertical (ya) + **`Escape` revierte la celda** al último valor guardado y hace blur (nuevo, D12). Opcional: ←/→ mueven entre días cuando el cursor está en el extremo del texto.
- [ ] **Foco tras acción:** al añadir línea, foco a su primera celda (D8); al quitar línea, foco al control "+ Añadir línea".

---

## 9. Lista priorizada de implementación

Ejecuta por bloques. **Tras cada bloque: `build` + `lint` + prueba manual** (desktop y móvil real o responsive) antes de seguir.

### Quick wins (bajo esfuerzo, alto impacto)
1. **D1 — Arreglar "Guardado ✓" pegado.** Eliminar `huboGuardado`; badge transitorio con `useEffect` + timer (1.6s + fade). *Es el bug más visible; hazlo primero.*
2. **D2 — Quitar `font-family: Arial` de `globals.css`.** Deja que Geist mande. Verifica que la app cambia de aspecto.
3. **D3 — Inputs móviles a 44px alto / 16px fuente.** Un cambio de clases en `celdaInput` (condicional móvil) y en chips.
4. **D4 — Targets de nota/quitar a 40×40** y color a `text-texto-suave` (arregla Fitts + contraste de golpe).
5. **Microcopy §7** — textos, son cadenas.
6. **D11 — Unificar la regla de totales a 0** (guion tenue).

### Cambios de sistema (base para lo demás)
7. **Tokens de color en `globals.css`** (§2.1) y **migrar componentes a tokens** (`bg-superficie`, `text-tinta`, `border-borde`, `ring-acento`, estados). Esto toca rejilla, `page.tsx`, `anadir-linea.tsx`, ambos formularios de login/contraseña. Deja el modo claro perfecto y el oscuro al ~80%.
8. **Tipografía §2.2** — aplicar la escala por nivel (proyecto, totales, total de semana protagonista).
9. **Foco/hoy con acento §4.4** — ring acento en inputs; tinte + subrayado en "hoy" (desktop y chip móvil), con canal redundante.

### Cambios más profundos (interacción)
10. **Feedback por celda §4.7** — parpadeo de confirmación + diferenciar aviso (ámbar) vs error (rojo) §6/D10.
11. **Error global cuantificado §7** + reintento (ya existe la función; cambia copy y presentación).
12. **Foco a la línea recién añadida + resaltado de aparición §4.8 (D8)**; `Escape` en celda (D12) y en añadir-línea.
13. **Progreso móvil (puntos por día) §5.2** — recalcular por día si tiene horas y pintar el `•`.
14. **`loading.tsx`** con skeleton de la rejilla para la navegación de semana.
15. **Añadir varias líneas de golpe §11.1** — evolucionar `anadir-linea.tsx` de dos selects a select de cliente + lista de checkboxes de proyectos + botón "Añadir N líneas". Esfuerzo medio, alto impacto para quien arranca una semana con varios proyectos del mismo cliente. No toca el modelo de datos (reusa el alta de línea existente, en bucle).
16. **Pegar desde el portapapeles §11.2** — `onPaste` en la celda que reparte los valores por la fila, cada uno pasando por la validación de entrada manual, con un único indicador transitorio agrupado. Esfuerzo medio; función "oculta" con texto de ayuda discreto. No toca el modelo de datos (reusa el upsert por celda, en lote).

### Bloque final — Cronómetro concurrente (§11.3) · REQUIERE MIGRACIÓN DE BACKEND ANTES DE EMPEZAR EL FRONTEND
> Este bloque es bastante mayor que todos los anteriores y **no puede empezar en el frontend hasta
> que exista el esquema de sesiones de cronómetro + RLS** descrito en §11.4. Trátalo como su propio
> hito, después de cerrar 1–16. Coordínalo con `agents/backend.md`.

17. **[Backend, prerrequisito] Sesiones de cronómetro §11.4** — tabla de sesiones (persona+proyecto+inicio, activa/cerrada), unicidad de "una sesión activa por persona+proyecto", RLS "cada persona solo ve/escribe sus sesiones", endpoints arrancar/parar/listar-activas, y el volcado sumatorio a la celda del día de inicio al parar. Sin esto, nada del cronómetro es implementable.
18. **[Frontend] Control play/stop por fila + indicador "en curso" §11.3** — botón en la fila (desktop y móvil) con su jerarquía; celda en modo "corriendo" (solo lectura, tiempo transcurrido).
19. **[Frontend] Bandeja global de cronómetros activos §11.3** — en la cabecera de la app, lista de sesiones activas con proyecto + tiempo + parar; arranque desde ahí de proyectos fuera de la semana visible; 0 activos = no ocupa espacio.
20. **[Frontend] Salvaguarda de olvido + estados de error/aviso §11.3/§6** — umbral de aviso no bloqueante, reintento de parada sin perder el tiempo transcurrido.

### Adiciones de §13 — decisiones finales del cliente (no renumeran nada)
28. **[ANTES de los quick wins — backend] Migración de granularidad 0,25 §13.1** — `numeric(5,2)` + `CHECK mod(horas, 0.25) = 0`. Prerrequisito de 29, 30 y de los copys nuevos; hazla primero porque todo lo demás valida contra ella.
29. **[Quick wins] Entrada tipo reloj §13.2 + redondeo a 0,25 en `interpretarHoras`/`formatearHoras`** — un solo archivo (`semana.ts`) + microcopy de tooltips.
30. **[Bloque interacción, con 3/§5.2] Steppers +/− en móvil §13.3** — junto al retoque de targets móviles, es la misma zona de código.

### Adiciones de §14 — calidad del dato (no renumeran nada)
31. **[Bloque interacción] Aviso de semana incompleta §14.1** — banda ámbar descartable al abrir la semana actual; la consulta se resuelve dentro de `cargarMiSemana`.
32. **[Datos/seed, 5 min] Cliente interno "Coonic (interno)" §14.2** — añadir al seed + insert en el proyecto ya sembrado; documentar en README la práctica de alta temprana de potenciales con proyecto "Propuesta".
33. **[Punto 3 — NO esta pasada] Requisitos del Resumen §14.3** — separar interno, días sin registro por persona, indicador de fiabilidad, no capar el solape >24 h. Se implementan cuando se construya `/resumen`.

### Adiciones de la revisión §12 (encajan en los bloques anteriores; no renumeran nada)
22. **[Con los quick wins] Mostrar contraseña §12.3** — toggle en `/login` y `/cambiar-contrasena`. Es un botón y un estado.
23. **[Bloque interacción, junto a 10-11] Debounce + vaciado en `visibilitychange` §12.1** — cierra el hueco del criterio de aceptación 3 (celda escrita sin blur se pierde hoy al cerrar la pestaña). **Prioridad alta dentro de su bloque: es el único punto de esta lista que es una pérdida de datos real.**
24. **[Bloque interacción, junto a 11] Auto-reintento al reconectar + aviso "Sin conexión" §12.2** — eventos `online`/`offline`, reutiliza la función de reintento existente.
25. **[Ítem 16] La regla de parseo del pegado queda corregida por §12.6** — la coma nunca separa celdas, siempre es decimal. Implementar 16 directamente con esta regla.
26. **[Bloque cronómetro, con 18-20] Título de pestaña con cronómetros activos §12.4** y **regla de no-quitar línea con sesión activa §12.5**.
27. **[Opcional, al final del bloque interacción] Foco inicial en escritorio §12.7** — solo semana actual + escritorio; quitar si molesta en uso real.

### Cierre (opcional en esta pasada)
21. **QA de modo oscuro** — revisar cada estado en dark, ajustar `acento-suave`, sombras, tintes. Solo cuando 1–20 y las adiciones 22–26 estén cerrados.

---

## 10. Fuera de alcance (no lo toques en esta pasada)

- **Nada de fase 2+:** costes, tarifas, facturable/no facturable, rentabilidad, aprobaciones, informes elaborados, notificaciones externas, integraciones/MCP. *(El cronómetro/temporizador **ya no está fuera de alcance**: el cliente lo ha aprobado y se especifica en §11.3–§11.4. Todo lo demás de fase 2 sigue excluido.)*
- **No añadir pantallas** (Resumen y Gestión existen aparte; aquí solo "Mi semana", login y cambiar-contraseña). La bandeja global de cronómetros (§11.3) no es una pantalla nueva: es un elemento persistente en la cabecera de la app ya existente.
- **No añadir campos** a la línea ni a la celda; nada más que horas + nota opcional. *(El cronómetro no añade un campo a la celda: reutiliza el mismo valor de horas, al que **suma** el tiempo volcado al parar; sus datos de sesión viven en su propia tabla, no en la celda — §11.4.)*
- **No cambiar el modelo de datos** ni el mecanismo de autoguardado (upsert/delete optimista por celda, reintento, restricción única persona+proyecto+fecha) **para nada salvo el cronómetro**, cuya persistencia de sesiones es la única excepción documentada (§11.4). Líneas múltiples y pegado no cambian el esquema. En el resto, solo cambias *cómo se comunica*.
- **No instalar librerías** (UI, iconos, date-pickers, comboboxes). Solo Tailwind v4 + React + los SVG dibujados a mano. El cronómetro y el pegado se construyen con Web APIs nativas: `setInterval`/`Date` para el tiempo, evento `paste` del navegador para el portapapeles.
- **No convertir el "+ Añadir línea"** en buscador/combobox; los selects dependientes se quedan (respetan Hick y no necesitan dependencias). La evolución de §11.1 (checkboxes de proyectos por cliente) **no es** un combobox: es una lista acotada de casillas, sigue respetando Hick.
- **No rediseñar el login** más allá de migrarlo a tokens y unificar el estilo de foco; su estructura (email + contraseña) es correcta.
- **No cambiar el idioma** ni el tono: español, interno, directo.
```

---

## 11. Ampliación: líneas múltiples, pegado y cronómetro concurrente

> **Contexto.** Tras revisar el primer borrador, el cliente aprobó tres funciones de productividad.
> Mantienen el principio rector ("menos clics, menos pantallas"): las tres eliminan repetición
> manual. Reutilizan el sistema de la §2 (tokens, tipografía, movimiento, targets ≥44px) — **no**
> introducen un sistema paralelo. La única que toca el modelo de datos es el cronómetro (§11.3/§11.4);
> las otras dos se apoyan en el upsert por celda existente.

### 11.1 Añadir varias líneas de golpe

Hoy `anadir-linea.tsx` es dos `<select>` dependientes (cliente → proyecto) + "Añadir", y hay que
repetir el flujo una vez por línea. Cuando alguien arranca la semana con 4 proyectos del mismo cliente,
son 4 recorridos idénticos. Se cambia el **segundo paso** de un select a una **lista de casillas**.

#### Flujo nuevo
1. **Select de cliente** (igual que hoy; respeta *Hick* al acotar lo que viene después).
2. Al elegir cliente, aparece la **lista de sus proyectos aún no añadidos** como checkboxes (uno por
   fila, label completo pulsable). La lista **ya está acotada por el cliente** — no crece sin control,
   así que *Hick* se mantiene: el usuario no elige entre "todos los proyectos", solo entre los de un
   cliente. Si un cliente tuviera muchísimos proyectos, siguen cabiendo en una lista con scroll propio
   (`max-h` + `overflow-y-auto`), nunca en un combobox con dependencias nuevas.
3. **Botón "Añadir N líneas"**, donde **N** es el recuento de casillas marcadas y **cambia en vivo**
   ("Añadir 3 líneas"). Con 1 marcada: "Añadir 1 línea". Con 0: deshabilitado (ver estados).
4. Al confirmar, se crean las N líneas en una sola acción (bucle sobre el alta existente — **no** cambia
   el modelo de datos), se cierra el formulario y **el foco va a la primera celda de la primera línea
   nueva** (coherente con D8); las líneas nuevas hacen el resaltado de aparición de §4.8 (borde acento
   ~900ms) para que el ojo las localice (Gestalt: dónde aparecieron).

#### Estados (§11.1)
| Estado | Disparador | Tratamiento | Copy |
|---|---|---|---|
| Sin cliente elegido | Formulario recién abierto | Lista de checkboxes oculta; botón deshabilitado. | Placeholder del select: "Elige un cliente". |
| Cliente sin proyectos por añadir | Todos sus proyectos ya son líneas | El cliente **no aparece** en el select (mantener el filtro actual). Si quedara vacío del todo, botón "+ Añadir línea" deshabilitado con `title` "Ya tienes todas tus líneas" (§7). | — |
| Ninguna casilla marcada | Cliente elegido, 0 checks | Botón deshabilitado, `text-texto-suave`. | "Marca al menos un proyecto". |
| 1+ casillas marcadas | ≥1 check | Botón activo, primario. | "Añadir {N} línea(s)". |
| Proyecto ya añadido durante la sesión | (No debería listarse) | Se excluye de la lista al vuelo tras añadirlo. | — |

#### Accesibilidad (§11.1)
- Cada checkbox con `<label>` asociado (click en el texto marca la casilla) y target ≥44px de alto.
- Navegación por teclado: `Tab` recorre las casillas, `Espacio` marca/desmarca, `Enter` en el botón confirma, `Escape` cierra el formulario (coherente con §4.8).
- **Anuncio del recuento** en `aria-live="polite"`: al marcar/desmarcar, "{N} proyectos seleccionados". El propio botón "Añadir {N} líneas" ya lo refleja visualmente (canal redundante).
- Grupo de casillas envuelto en `<fieldset>` con `<legend>` "Proyectos de {cliente}".

### 11.2 Pegar valores desde el portapapeles (patrón hoja de cálculo)

Mucha gente lleva sus horas en su propia hoja (Excel/Sheets) y las quiere volcar. Se añade soporte de
**pegado por fila**: enfocas una celda, pegas (`Ctrl/Cmd+V`) una fila de números y se reparten a la
derecha. Se construye con el evento `paste` nativo — sin librerías.

#### Comportamiento exacto
- **Disparador:** `onPaste` sobre una celda enfocada de la rejilla.
- **Parseo:** se lee `clipboardData.getData('text')` y se parte por **tabulador, coma o espacios**
  (lo que produce copiar una fila de Excel/Sheets es TSV; una fila de números "a mano" suele ir por
  comas o espacios). Se admite coma decimal española (`1,5`) y punto (`1.5`) por valor — con cuidado de
  no confundir la coma **separadora de celdas** con la coma **decimal**: si el texto contiene tabuladores,
  el separador de celdas es el tabulador y las comas internas son decimales; si no hay tabuladores, se
  asume el separador más frecuente. (Regla simple y predecible; documentarla en la ayuda, §11.2 abajo.)
- **Reparto:** el primer valor cae en la celda donde se pegó y los siguientes **avanzan por las celdas
  de esa misma fila (esa línea)**, hacia la derecha, respetando los **límites de la semana visible**:
  - Si pegas **más** valores de los que caben (p. ej. 7 valores empezando en miércoles), los **sobrantes se ignoran** — no saltan a otra fila ni a la semana siguiente (evita escrituras invisibles fuera de vista).
  - Si pegas **menos**, el resto de celdas de la fila **no se toca** (no se borran).
  - El pegado **no cambia de fila**: es un reparto horizontal dentro de una línea, coherente con el modelo mental "esta línea, estos días".
- **Guardado:** cada celda escrita dispara el mismo upsert por celda que la entrada manual (no cambia el modelo de datos: es la escritura existente en lote).

#### Validación (§11.2)
- Cada valor pegado pasa por **la misma validación que la entrada manual** (`interpretarHoras`: pasos de
  0,5, entre 0,5 y 24). El pegado **no** es una vía para colar valores inválidos.
- Un valor inválido en la posición N **no bloquea** el resto: las celdas con valores válidos se guardan
  y la celda N queda marcada como **entrada inválida** con el mismo tratamiento visual ya definido
  (`border-aviso bg-aviso-suave text-aviso`, tooltip "Usa pasos de 0,5, entre 0,5 y 24" — §6/§7). El
  usuario corrige solo esa.
- Una celda con **cronómetro en marcha** (§11.3) es de solo lectura: si el reparto la alcanza, ese valor
  se **omite** (no sobrescribe una celda en curso) y se informa en el feedback agrupado ("1 celda omitida: cronómetro en marcha").

#### Feedback (§11.2)
- Tras un pegado múltiple **no se disparan N indicadores sueltos**: se **agrupa** el indicador transitorio
  de §4.7. El badge global muestra **"Pegadas {M} celdas"** (y, si procede, "· {K} sin guardar" para las
  inválidas/omitidas) durante 1,6s + fade, en vez de parpadear 7 veces. Cada celda escrita sí hace su
  parpadeo local de confirmación, pero el mensaje agregado es uno solo (evita el ruido de N anuncios).
- Si alguna celda falla por red, entra en el estado de **error** normal (§6) y cuenta en el "No se
  guardaron {N} cambios" con su botón Reintentar.

#### Accesibilidad y descubribilidad (§11.2)
- Es una función **oculta**: nadie prueba a pegar si no sabe que existe. Se resuelve con **una línea de
  ayuda discreta** bajo la rejilla (`text-xs text-texto-suave`), no un tooltip que haya que descubrir:
  **"Consejo: copia una fila de tu hoja de cálculo y pégala sobre una celda para rellenar varios días."**
  Un único texto tenue, sin iconografía llamativa: informa a quien lea, no molesta a quien no lo necesita.
- El resultado del pegado se anuncia por `aria-live="polite"` ("Pegadas {M} celdas"), como el resto del feedback global.
- El pegado respeta el foco: tras pegar, el foco permanece en la celda de origen (el usuario ve el reparto sin perder su sitio).

### 11.3 Cronómetro concurrente (play/stop) — pieza central

**Modelo de uso aprobado por el cliente (no relitigar):** una persona puede tener **varios cronómetros
activos a la vez, uno por proyecto distinto**, porque con trabajo asistido por IA puede lanzar trabajo en
el proyecto A y atender una reunión del proyecto B, y **ambos cuentan simultáneamente**.

> ### ⚠️ Implicación intencional — que nadie la "arregle"
> El tiempo registrado **no es "tiempo exclusivo de atención humana"**, es **"esfuerzo/tiempo asignado a
> cada proyecto"**, y ahora puede **solaparse**. Por tanto:
> **el total de horas de un día (suma de todos los proyectos) puede superar legítimamente las 24 h.**
> Esto **no es un bug**. Ni el agente frontend, ni el pegado, ni el futuro Resumen de admin deben validar,
> capar, avisar ni "corregir" que el total diario o semanal pase de 24 h. (El límite 0–24 sigue aplicando
> **solo por celda** — un único proyecto en un único día no puede pasar de 24 h; lo que no se capa es la
> **suma entre proyectos**.)

Regla de conversión al parar:
- Al **Parar**, `transcurrido = ahora − inicio` se **redondea al múltiplo de 0,5 h más cercano** (empates
  hacia arriba), igual que la entrada manual, y se **SUMA** (no sobrescribe) al valor que ya hubiera ese
  día en esa celda. Arrancar/parar varias veces el mismo proyecto el mismo día **va acumulando**.
- **Atribución de día:** todo el tiempo se imputa **al día en que se inició** el cronómetro. Si cruza
  medianoche (inicio 23:00, parada 01:00), las 2 h van íntegras al día de inicio; **no se fracciona**
  entre dos días (regla simple, predecible).
- **Duraciones muy cortas:** si `transcurrido` redondea a 0 (menos de ~15 min), no se suma nada, y **se
  dice** en el anuncio de parada ("Menos de 0,5 h: no se ha sumado tiempo") — así no parece que el
  cronómetro "no hizo nada" en silencio (visibilidad del estado).
- **Tope por celda:** si la suma superara 24 h en esa celda (p. ej. 22 h manuales + 3 h de cronómetro),
  se capa a 24 y se informa ("La celda no puede pasar de 24 h"). Esto es el límite por celda, distinto del
  total diario entre proyectos, que **no** se capa (ver aviso arriba).

#### 11.3.a Control play/stop por línea (jerarquía, no amontonar iconos)
El cronómetro imputa siempre al **día de inicio = hoy**, así que conceptualmente el botón de una línea
"empieza a contar para hoy en este proyecto".

- **Desktop:** el botón vive en la **celda de acciones** de la fila (donde ya están nota y quitar), pero
  **como acción primaria del grupo**: va **primero** (a la izquierda de nota/quitar) y con más peso visual.
  Jerarquía clara para no amontonar:
  1. **Empezar/Parar** (primario cuando es relevante): en reposo, contorno tenue `text-texto-suave`; al
     correr, **`text-acento` + relleno**, icono de "parar" (cuadrado) — es el control que grita "algo está
     pasando".
  2. **Nota** (secundario): ghost, `text-texto-suave`, se colorea solo si hay nota (§4.6).
  3. **Quitar línea** (terciario/ocasional): ghost, solo aparece si la línea no tiene horas esa semana (§4.6).
  Los tres a 40×40 mínimo; el de cronómetro no roba tamaño a los otros, gana por **color y posición**, no por bulto.
- **Móvil (día a día):** en cada `li` de línea, junto al input, un único botón **Empezar/Parar de 44×44**
  como acción primaria de la línea; nota/quitar quedan detrás (menú de la línea o iconos más tenues, §5.2).
  Como el tiempo siempre imputa a **hoy**, el botón de una línea arranca "para hoy" con independencia del
  chip de día seleccionado; para no confundir, si el usuario está viendo un día que no es hoy, el arranque
  se confirma en el anuncio ("Cronómetro de {proyecto} iniciado — cuenta para hoy").

#### 11.3.b Indicador "en curso" y frecuencia de refresco (rendimiento vs distracción)
Una celda con cronómetro activo muestra: el **valor ya guardado** (si lo hay) + un chip **"en curso h:mm"**
en `bg-acento-suave text-acento`, con un **punto acento pulsante**. Ejemplo: `2 · +0:45 en curso`
(reconocer sobre recordar: se ve lo ya contabilizado y lo que se está acumulando).

**Decisión de "en vivo":** el número **no** cambia cada segundo en pantalla.
- Un **único ticker compartido** (un solo `setInterval`, no uno por celda) refresca **cada 30 s** todas las
  duraciones mostradas, con **granularidad de minutos** (`h:mm`). Se fuerza un recálculo inmediato en
  `focus`/`visibilitychange` (al volver a la pestaña, la cifra está al día).
- La **sensación de "vivo"** la da una **animación CSS de pulso** en el punto acento (0 coste de JS, y se
  desactiva con `prefers-reduced-motion`, quedando el punto fijo + el texto "en curso").
- **Justificación:** una rejilla con números corriendo por segundos es **ruido visual constante** y
  re-render innecesario en muchas celdas; como el resultado final **redondea a 0,5 h**, el minuto sobra
  para el usuario y el segundo no aporta nada. Un solo intervalo a 30 s es despreciable en rendimiento.
  (La bandeja global, §11.3.d, usa el **mismo** ticker: no se multiplican timers.)

#### 11.3.c Coexistencia con edición manual — celda de solo lectura mientras corre
**Recomendación (razonada): mientras el cronómetro corre, la celda es de solo lectura.** No se puede
escribir a mano en ella hasta pararlo.
- **Por qué bloquear y no "parar al escribir":** el cronómetro **suma** su resultado sobre el valor base
  de la celda al parar. Si se permitiera editar a la vez, habría una **carrera** (¿cuál es el valor base
  cuando pare?) y ambigüedad de datos. Y "al escribir se para el cronómetro" es un **efecto sorpresa**:
  bastaría tabular por accidente hasta la celda para perder una sesión en marcha. Bloquear la edición es
  **prevención de errores** y un modelo mental limpio ("esta celda la lleva el cronómetro ahora mismo").
- **Cómo se comunica visualmente:** celda en `bg-acento-suave`, cursor `not-allowed`, el chip "en curso",
  y `title`/tooltip **"Cronómetro en marcha. Párado para editar a mano."** El botón de la fila está en
  estado "Parar", que es la salida evidente.
- **Para editar a mano:** parar (lo que suma su tiempo) y entonces la celda vuelve a editable; el usuario
  ajusta el número si quiere. Flujo explícito, sin pérdidas silenciosas.

#### 11.3.d Bandeja global de cronómetros activos (cabecera de la app)
Como puede haber **varios a la vez** y en **proyectos que no estén en las líneas visibles** de la semana
actual, hace falta un lugar **persistente y siempre visible** que no dependa de la rejilla. Vive en la
**barra superior** de la app (junto al wordmark "Clooki" / nav admin / Salir — §4.1), **no es una pantalla
nueva**.

- **0 activos:** **no ocupa espacio** (no se renderiza). Nada de "0 en marcha" ocupando cabecera.
- **1+ activos:** un **chip/pill** con punto pulsante + recuento: **"● {N} en marcha"** en
  `bg-acento-suave text-acento`. Al pulsarlo, **desplegable** con la lista:
  - cada fila: **proyecto** (con su cliente como contexto tenue), **tiempo transcurrido** `h:mm` y botón
    **Parar** (44×44). Ordenadas por tiempo transcurrido descendente (lo que más lleva corriendo, arriba —
    lo más probable de "se me olvidó").
  - **Cuántas caben:** hasta **4–5 visibles**; a partir de ahí, `max-h` + `overflow-y-auto` con scroll
    interno del desplegable (no crece hasta tapar la página). El recuento del chip ya dice cuántas hay en total.
  - Pie del desplegable: **"+ Empezar en otro proyecto"** → abre el mismo selector cliente→proyecto del
    "+ Añadir línea" (reutilización; §11.3.e).
- **Desktop:** el chip va a la derecha de la barra, antes de "Salir". El desplegable se ancla bajo el chip.
- **Móvil:** la barra es estrecha → el chip compacto **"● {N}"** abre una **hoja inferior** (bottom sheet)
  o desplegable a ancho completo con la misma lista y botones Parar de 44×44. Prioridad sobre otros
  adornos de cabecera: es el control que permite "parar sin ir a buscar la celda".
- **Aviso de olvido** (§11.3.f): una sesión que supera el umbral tiñe **su fila** del desplegable y el
  **punto del chip** a ámbar, para que se note sin abrir.

#### 11.3.e Arrancar un cronómetro de un proyecto que no está en la semana visible
- **De dónde se arranca:** desde la **bandeja global**, con "+ Empezar en otro proyecto" → selector
  cliente→proyecto (el mismo patrón que "+ Añadir línea"; **no** un combobox nuevo). Si el proyecto elegido
  **ya tiene** un cronómetro activo, aparece deshabilitado con "ya en marcha" (refuerza la unicidad
  persona+proyecto — no doble arranque).
- **Qué pasa en la rejilla:** si arrancas un cronómetro de un proyecto que **aún no es una línea visible**
  de la semana actual, **aparece automáticamente como línea nueva** en la rejilla (con el resaltado de
  aparición de §4.8). Razón (**reconocer sobre recordar**, coherente con el resto del documento): el
  tiempo va a imputarse a la celda de **hoy** de esa línea; el usuario debe **ver** la línea que está
  cronometrando, no confiar en recordar que existe una sesión invisible. Si la semana visible no incluye
  hoy (navegaste a otra semana), la línea no se puede pintar en pantalla: entonces la **bandeja global es
  el ancla** y, al parar, la suma cae en la celda de hoy de la semana correspondiente aunque no esté a la vista.

#### 11.3.f Salvaguarda de "se me olvidó pararlo"
- **Umbral recomendado: 10 h** de sesión activa continua → **aviso no bloqueante** (ámbar) en la bandeja
  (§11.3.d) y por `aria-live`. **Por qué 10 h:** una jornada real rara vez supera ~10 h de sesión
  continua en un mismo proyecto; por debajo habría demasiados falsos positivos (sesiones largas
  legítimas), y esperar a 24 h llegaría tarde. Es una red de seguridad, no una norma de jornada.
- **Copy del aviso:** **"¿Sigues en {proyecto}? Lleva {N} h en marcha."** con acción **"Parar"** al lado.
  No bloquea nada: el usuario puede ignorarlo y seguir.
- **Qué pasa si nunca se para — recomendación: NO autoparar en silencio.** Autoparar fabricaría una hora de
  fin falsa y **inventaría datos** (justo lo contrario a la honestidad del registro). En su lugar:
  - El cronómetro **sigue corriendo indefinidamente** con el aviso **escalando** (a más horas, más visible).
  - **Al cruzar medianoche o al volver a entrar** con una sesión aún activa de un día anterior, se muestra
    un **prompt prominente pero descartable**: **"Tenías un cronómetro en {proyecto} desde {fecha} ({N} h).
    ¿Cuánto tiempo cuentas?"** con un valor **sugerido** (el transcurrido redondeado) editable y un botón
    **"Confirmar"** / **"Descartar"**. Así la persona decide — no el sistema.
  - Este prompt es la única concesión "casi bloqueante", y aun así se puede posponer; nunca se pierde la
    hora de inicio real.

#### 11.3.g Estados del cronómetro
Se añaden a la tabla de §6 (ya incluidas allí). Resumen aquí para tenerlo junto al resto del cronómetro:

| Estado | Visual | Microcopy |
|---|---|---|
| Corriendo | Celda `bg-acento-suave`+`border-acento`, chip "en curso h:mm", punto pulsante; input solo lectura; botón fila = "Parar" acento; fila en la bandeja. | Botón "Parar"; aria "Cronómetro de {proyecto} en marcha". |
| Parado (volcado OK) | Suma redondeada a la celda; parpadeo "Guardado OK" (§4.7); sale de la bandeja; celda editable de nuevo. | aria "Cronómetro parado. Se han sumado {X} h al {día}." |
| Aviso de olvido | Fila de la bandeja + punto del chip en ámbar; **no** bloquea. | "¿Sigues en {proyecto}? Lleva {N} h en marcha." |
| Error al parar (red) | Sesión "pendiente de cierre" con inicio intacto; chip/fila en rojo (`border-error bg-error-suave`); botón "Reintentar parar". **Nunca vuelve a cero.** | "No se pudo parar. Reintentar." |

#### 11.3.h Microcopy del cronómetro (coherencia con los verbos en español simple de la app)
La app ya usa verbos españoles llanos ("Entrar", "Añadir", "Quitar", "Guardar"). El cronómetro sigue esa
línea — **nada de "Play/Stop"**:

| Ubicación | Copy |
|---|---|
| Botón arrancar | **"Empezar"** (aria-label "Empezar cronómetro de {proyecto}") |
| Botón parar | **"Parar"** (aria-label "Parar cronómetro de {proyecto}") |
| Chip de celda en curso | **"en curso {h:mm}"** |
| Chip de bandeja (cabecera) | **"● {N} en marcha"** |
| Cabecera del desplegable | **"Cronómetros en marcha"** |
| Acción del desplegable | **"+ Empezar en otro proyecto"** |
| Aviso de umbral | **"¿Sigues en {proyecto}? Lleva {N} h en marcha."** |
| Anuncio al parar | **"Cronómetro parado. Se han sumado {X} h al {día}."** / (si <0,5h) **"Menos de 0,5 h: no se ha sumado tiempo."** |
| Error al parar | **"No se pudo parar. Reintentar."** |
| Tooltip de celda bloqueada | **"Cronómetro en marcha. Párado para editar a mano."** |

#### 11.3.i Accesibilidad del cronómetro (checklist)
- [ ] **Anuncio por lector de pantalla** al arrancar y al parar vía `aria-live="polite"` (arranque:
  "Cronómetro de {proyecto} iniciado — cuenta para hoy"; parada: "…se han sumado {X} h al {día}"). El
  cambio de sesión no depende solo de color/animación.
- [ ] **El tiempo transcurrido no depende de animación ni color:** se muestra como **texto** "en curso
  {h:mm}" además del punto pulsante; con `prefers-reduced-motion` el punto queda fijo y el texto persiste.
- [ ] **Target táctil** del botón Empezar/Parar y de los "Parar" de la bandeja: **≥44×44** (mismo mínimo de §2.4).
- [ ] **Foco** visible con el acento (§8) en el botón de la fila, en el chip de la bandeja y en cada "Parar".
- [ ] **Estado comunicado en más de un canal:** corriendo = color + chip de texto + punto + botón "Parar";
  aviso = color ámbar + copy "Lleva N h"; error = color rojo + copy + acción.
- [ ] La celda de solo lectura anuncia su condición (`aria-disabled` o `readonly` + `title`), no solo cambia de color.

### 11.4 Requisitos de datos para el backend (comportamiento esperado, no SQL)

> **Para quien coja la tarea de backend (ver `agents/backend.md`).** Esta es la **única** parte de toda la
> ampliación que exige trabajo de esquema/RLS **antes** de que el frontend del cronómetro pueda empezar
> (§9, ítem 17). Se describe **comportamiento**, no la migración SQL final — esa la decides tú. Líneas
> múltiples (§11.1) y pegado (§11.2) **no** necesitan nada de aquí: reutilizan el alta de línea y el upsert
> por celda existentes.

Hace falta que exista **persistencia de sesiones de cronómetro en servidor** (no estado de cliente), con
este comportamiento:

- **Una sesión = (persona, proyecto, inicio, estado)**. Al cerrarse guarda además: fin, horas volcadas
  (redondeadas a 0,5), y **día atribuido** (= día del inicio, en la zona horaria del usuario).
- **Sobrevive a todo lo del cliente:** cerrar la pestaña, cambiar de dispositivo o perder conexión **no**
  paran ni pierden la sesión — es estado de servidor. Al **cargar la app**, el frontend **lee las sesiones
  activas de la persona** y reconstruye la UI (bandeja global + celdas "en curso"). El "tiempo transcurrido"
  se calcula siempre como `ahora − inicio` sobre el `inicio` guardado, no sobre un contador de cliente.
- **Concurrencia permitida y su límite:** **varias sesiones activas por persona a la vez**, pero **como
  máximo una activa por (persona, proyecto)** — evita el doble arranque accidental del mismo proyecto.
  Arrancar un proyecto que ya tiene sesión activa se **rechaza** (el frontend lo muestra como "ya en marcha").
- **RLS:** cada persona **solo ve y solo escribe sus propias sesiones**. Nadie ve las de otra persona
  (coherente con el modelo de aislamiento por persona del resto de la app).
- **Comportamiento de los endpoints (nombres orientativos):**
  - **Arrancar:** crea una sesión activa (persona+proyecto+inicio=ahora); rechaza si ya hay una activa de ese proyecto para esa persona.
  - **Parar:** calcula `transcurrido = ahora − inicio`, **redondea a 0,5 h**, **SUMA** ese valor al upsert
    de horas de la **celda del día de inicio** (persona+proyecto+fecha — la restricción única que ya existe),
    y marca la sesión **cerrada** con su resultado.
  - **Listar activas:** devuelve las sesiones activas de la persona (para pintar la bandeja al cargar).
- **Idempotencia del "parar" (crítico para el estado "error al parar"):** si la parada falla por red y se
  **reintenta**, **no debe sumar dos veces**. La sesión es el registro de verdad: una vez cerrada con su
  resultado, reintentar sobre una sesión **ya cerrada** devuelve el **mismo** resultado sin volver a sumar.
  Así el frontend puede reintentar sin miedo y **sin perder el tiempo transcurrido** ni duplicarlo.
- **Atribución de día y cruce de medianoche:** todo el tiempo va al **día del inicio**; el backend **no**
  fracciona una sesión entre dos días.
- **No capar la suma entre proyectos:** el backend **no** debe validar ni rechazar que la suma de horas del
  día (entre proyectos distintos) supere 24 h — es intencional (ver aviso de §11.3). El límite 0–24 sigue
  aplicando **por celda** (un proyecto en un día); al parar, si la suma superara 24 en esa celda, se capa a
  24 (y el frontend lo informa).
- **Salvaguarda de olvido (§11.3.f):** el umbral de aviso (10 h) puede calcularse en el cliente sobre el
  `inicio` guardado; **no** se requiere lógica de autoparada en servidor (la recomendación es **no**
  autoparar). Si más adelante se quisiera una autoparada de seguridad, sería una decisión de producto
  posterior, fuera de este alcance.

#### Checklist de "listo para frontend" (backend)
- [ ] Tabla/almacén de sesiones con (persona, proyecto, inicio, estado, fin, horas_volcadas, día_atribuido).
- [ ] Unicidad: **máx. 1 sesión activa por (persona, proyecto)**; varias activas por persona en proyectos distintos, permitido.
- [ ] RLS: la persona solo ve/escribe sus sesiones.
- [ ] Endpoint arrancar (rechaza duplicado de proyecto activo).
- [ ] Endpoint parar **idempotente** que **suma** (no sobrescribe) sobre la celda del día de inicio y cierra la sesión.
- [ ] Endpoint listar activas (para reconstruir la UI al cargar).
- [ ] La suma entre proyectos **no** se capa; el 0–24 se mantiene **por celda**.

---

## 12. Revisión adicional (segunda opinión) — huecos cerrados antes de implementar

> Pasada de revisión independiente sobre §1–§11 recorriendo el viaje completo del usuario
> (login → rejilla → cierre de pestaña → reconexión → cronómetro) contra el código real.
> No repite nada de lo anterior: solo añade lo que faltaba o corrige reglas ambiguas.
> Mismas restricciones: sin librerías, sin pantallas nuevas, sin tocar esquema (salvo lo ya
> excepcionado del cronómetro).

### 12.1 ⚠️ El hueco más serio: una celda escrita y no confirmada se pierde al cerrar la pestaña

**Verificado en `rejilla-semana.tsx`:** el guardado solo se dispara en `onBlur` (línea ~361). Si el
usuario teclea un valor y **cierra la pestaña, apaga el móvil o cambia de app sin salir de la celda**,
ese valor **se pierde sin aviso**. Esto **contradice el criterio de aceptación 3 del MVP** ("cerrar el
navegador no pierde nada") — hoy solo se cumple para celdas ya confirmadas con blur.

**Arreglo especificado (dos capas, sin dependencias):**
1. **Autoguardado con debounce sobre `onChange`**: además del blur, un temporizador de **800 ms tras la
   última pulsación** dispara la misma validación+guardado que el blur (si el valor es válido). El blur
   sigue siendo el momento "autoritativo" (normaliza el formato "7.5"→"7,5" en pantalla); el debounce no
   reformatea mientras escribes, solo persiste. Con esto, la ventana de pérdida pasa de "indefinida" a
   "<1 s de tecleo activo".
2. **Vaciado best-effort en `visibilitychange`**: al ocultarse la pestaña (cambio de app en móvil,
   cierre), se intenta guardar la celda enfocada con cambios pendientes. Es best-effort (el navegador
   puede matar la petición), por eso la capa 1 es la principal y esta la red de seguridad.

Descartado a propósito: diálogo `beforeunload` ("¿seguro que quieres salir?") — fricción
desproporcionada para una celda de horas, y en móvil ni siquiera es fiable.

### 12.2 Reconexión: los errores de red deben curarse solos

§6 deja el error de red como estado persistente con botón "Reintentar" — correcto, pero pasivo. Añadir:
- Escuchar el evento **`online`** del navegador: al recuperar conexión, **reintentar automáticamente**
  todos los guardados pendientes (celdas en error), sin esperar al clic.
- Al detectar **`offline`**, el indicador global muestra **"Sin conexión — tus cambios se guardarán al
  volver"** (`text-aviso`, ámbar: no es culpa del usuario ni un fallo definitivo), en lugar de ir
  acumulando celdas rojas una a una.
- Los valores escritos permanecen en pantalla entre tanto (ya es así — conservar).

Esto convierte el caso "wifi del tren" de una pantalla llena de rojo en una experiencia auto-reparable
(visibilidad del estado + recuperación de errores sin trabajo del usuario).

### 12.3 Login: mostrar contraseña

Los miembros teclean su **DNI** (8 dígitos + letra) en un campo enmascarado, muchas veces desde el
móvil. Un error de tecleo invisible = "Correo o contraseña incorrectos" sin pista. Añadir el toggle
estándar **"Mostrar"** (ojo) en el campo de contraseña de `/login` y de `/cambiar-contrasena`
(recomendación clásica de NN/g: el enmascaramiento aporta poco en contextos de baja amenaza y multiplica
los errores de entrada). Botón dentro del campo, 44×44, `aria-pressed`, no cambia el layout.

### 12.4 Cronómetro en el título de la pestaña

Con cronómetros en marcha, `document.title = "● 2 en marcha · Clooki"` (y restaurar al parar todos).
Coste cero, sin permisos ni notificaciones: la pestaña de Clooki **recuerda desde cualquier otra
pestaña** que hay algo corriendo. Complementa la salvaguarda de olvido de §11.3.f para el caso más
común (la pestaña quedó abierta detrás). Con 0 activos, título normal.

### 12.5 Regla que faltaba: no quitar una línea con cronómetro activo

§4.6 permite quitar una línea "si no tiene horas esta semana" — pero una línea puede no tener horas
**y** tener un cronómetro corriendo (arrancado hace 10 min). Quitarla dejaría una sesión huérfana en la
bandeja apuntando a una línea invisible. Regla: **el botón de quitar también desaparece mientras la
línea tenga una sesión activa** (misma lógica de prevención que con las horas).

### 12.6 Corrección a la regla de parseo del pegado (§11.2)

La regla "si no hay tabuladores, se asume el separador más frecuente" tiene un fallo silencioso en
España: `"1,5,2,3"` (¿es «1,5 | 2 | 3» o «1 | 5 | 2 | 3»?) se resolvería mal sin que el usuario lo note.
**Regla corregida, determinista:** separadores de celda son **solo tabulador, salto de línea o espacios**.
**La coma nunca separa celdas: siempre es decimal** (coherente con la entrada manual, que ya acepta
"7,5"). Quien pegue una lista separada solo por comas verá el valor marcado como inválido en la primera
celda — feedback inmediato y corregible, mejor que un reparto erróneo silencioso (prevención de errores:
ante ambigüedad, fallar visiblemente antes que acertar a medias).

### 12.7 Foco inicial en escritorio (opcional, marcado como tal)

Al cargar "Mi semana" en **escritorio** y en la **semana actual**, enfocar la celda de **hoy de la
primera línea** (sin scroll forzado). El flujo objetivo del MVP ("apuntar horas en menos de un minuto")
queda en: abrir → teclear. **Solo escritorio** — en móvil un autofocus abre el teclado sin permiso, y
eso es peor que el beneficio. Si en la práctica molesta (p. ej. a quien entra solo a consultar), se
quita: por eso es opcional y va al final de su bloque.

### 12.8 Considerado y descartado (para que no se reabra sin motivo)

- **`beforeunload` con diálogo** — fricción alta, no fiable en móvil; lo cubre 12.1.
- **Swipe entre días en móvil** — los 7 chips ya son targets directos; un gesto añade descubribilidad
  cero y conflictos con el scroll.
- **Zebra striping en la tabla** — el hover de fila (§4.3) + bordes ya resuelven el seguimiento
  horizontal con ≤10 líneas típicas; zebra añadiría ruido.
- **Quitar los botones de nota/quitar del orden de tabulación** para acelerar el Tab — dañaría teclado
  y lectores de pantalla; la navegación rápida vertical ya la dan ↓/Enter.
- **Aviso de CapsLock en el login** — el toggle "Mostrar" de 12.3 cubre la necesidad con menos piezas.

---

## 13. Decisiones finales del cliente: granularidad 0,25, entrada tipo reloj y steppers móviles

> Decididas por el cliente tras revisar §12. **Esta sección prevalece sobre cualquier mención
> anterior a "pasos de 0,5"** — no se han reescrito una a una las apariciones previas; donde
> §2–§12 digan "0,5", léase "0,25" según las reglas de aquí.

### 13.1 Granularidad: cuartos de hora (0,25)

El paso mínimo de horas pasa de 0,5 a **0,25** (1,25 / 2,75…). Motivo: el cronómetro se aprobó
por precisión, y redondear a medias horas tiraba parte de esa precisión.

**Dónde impacta (lista cerrada):**
- **Migración de BD (backend, prerrequisito):** la columna `horas` es `numeric(4,1)` — **no puede
  almacenar 1,25**. Pasa a `numeric(5,2)` y el CHECK a `mod(horas, 0.25) = 0` (resto igual: > 0, ≤ 24).
  Es una migración nueva (`002_…`), compatible con los datos existentes (todo múltiplo de 0,5 lo es de 0,25).
- **`interpretarHoras` / `formatearHoras`** (`semana.ts`): redondeo al múltiplo de 0,25 más cercano;
  el formato muestra hasta 2 decimales solo cuando hacen falta ("1,25", pero "1,5" y "2", nunca "2,00").
- **Cronómetro (§11.3):** el volcado al parar redondea a **0,25** (empates hacia arriba). El umbral de
  "menos de un paso no suma" baja de ~15 min a **~7 min** — actualizar el copy: "Menos de 0,25 h: no se
  ha sumado tiempo."
- **Pegado (§11.2):** la validación por celda usa la nueva regla (0,25) automáticamente al compartir
  `interpretarHoras`.
- **Microcopy (§6/§7):** tooltips pasan a **"Usa pasos de 0,25, entre 0,25 y 24."**
- **Steppers (§13.3):** incrementan/decrementan en 0,25.

### 13.2 Entrada tipo reloj en la celda

La celda acepta, además de decimales ("1,5" / "1.5"), **formatos de reloj**: `1:30`, `1h30`, `1h`,
`0:45`, `45m` → se convierten a horas decimales (1,5 / 1,5 / 1 / 0,75 / 0,75) y **se redondean al paso
de 0,25** como cualquier otra entrada. Reglas:
- El parseo vive en `interpretarHoras` (un solo sitio; el pegado y el debounce lo heredan gratis).
- Tras el blur, la celda **siempre muestra el formato decimal normalizado** ("1:30" → "1,5") — una sola
  representación canónica en la rejilla; el formato reloj es de *entrada*, no de *visualización*
  (consistencia; los totales suman decimales).
- Minutos que no caen en el paso se redondean ("1:37" → 1,5 h con aviso ninguno: mismo criterio
  silencioso que ya aplica el redondeo decimal). `aria-label` y tooltip de celda inválida no cambian.
- No se documenta con ayuda visible (a diferencia del pegado): quien escribe "1:30" lo hace por
  instinto, y si no, el formato decimal ya está a la vista en toda la rejilla.

### 13.3 Botones +/− en las celdas del móvil (steppers)

Solo en la **vista móvil día-a-día** (en escritorio el teclado es más rápido y los steppers estorbarían
en 7 columnas):
- Cada línea muestra **[−] [input] [+]**: el − y el + ajustan el valor en **±0,25**, con los mismos
  límites (no baja de 0 — llegar a 0 vacía la celda y borra el registro, igual que borrar a mano; no
  pasa de 24). Cada toque dispara el mismo guardado con debounce (§12.1) — no un guardado por toque si
  se toca rápido varias veces.
- Targets **44×44** cada botón; el input entre ambos conserva su ancho (56px) y sigue siendo editable
  por teclado para saltos grandes ("8").
- **Mantener pulsado** repite el incremento (repetición nativa de un intervalo, empezando lenta) —
  opcional, solo si no complica; el toque simple es lo esencial.
- Celda con cronómetro activo: los steppers desaparecen con el input bloqueado (§11.3.c).
- `aria-label`: "Añadir 0,25 h a {proyecto}" / "Quitar 0,25 h de {proyecto}". El valor anunciado por el
  input ya cambia (es el mismo input).

### 13.4 Descartado por el cliente en esta ronda
- **PWA / instalable en móvil** — propuesto en la revisión y no aprobado. No añadir manifest ni iconos
  de instalación sin nueva decisión explícita.

---

## 14. Calidad del dato por cliente (objetivo real de la herramienta)

> **Contexto de producto, fijado por el cliente:** el objetivo de Clooki es conocer con exactitud el
> **tiempo dedicado a cada cliente** para analizar después su **rentabilidad**. NO es una herramienta de
> control horario de empleados: no se mide si alguien hace 30/40/60 h, no hay cuotas ni objetivos de
> horas. Toda funcionalidad de esta sección se presenta como **calidad/completitud del dato**, nunca como
> vigilancia. Este encuadre gobierna también el diseño del futuro Resumen (punto 3 del plan).

### 14.1 Aviso de semana incompleta (frontend, esta pasada)

Al cargar "Mi semana" estando en la **semana actual**, si la **semana anterior** tiene días laborables
(L–V) **sin ningún registro**, se muestra un aviso **discreto y descartable** sobre la rejilla:

- Copy: **"La semana pasada tiene {N} día(s) sin horas. [Completarla]"** — el enlace navega a
  `?semana={lunes anterior}`.
- Visual: banda `bg-aviso-suave text-aviso` con borde `border-aviso`, misma semántica ámbar de "esto lo
  resuelves tú" (§2.1). Botón de cierre (✕, 44×44) que lo **descarta hasta la próxima sesión**
  (estado en memoria o `sessionStorage`; no persistir en BD — no es un dato, es un recordatorio).
- **No** es una notificación externa (email/push siguen excluidos): solo aparece dentro de la app, al entrar.
- No se muestra si: estás viendo otra semana, la semana anterior está completa, o ya lo descartaste en
  esta sesión. Días sin registro en fin de semana **no** cuentan como incompletos.
- El dato necesario (¿hay registros de la persona en L–V de la semana anterior?) es una consulta mínima
  que puede resolverse en `cargarMiSemana` sin cambios de esquema (los registros recientes ya se leen
  para las líneas recordadas — reutilizar).
- Accesibilidad: `role="status"`, no roba el foco, se cierra con su botón (no con Escape global).

### 14.2 Higiene de atribución (proceso + datos de Gestión; sin código nuevo)

Para que el tiempo no-facturable y la preventa no contaminen el coste de los clientes reales:

1. **Cliente interno "Coonic (interno)"** con proyectos: **Gestión interna**, **Formación**,
   **Comercial**. Se añade al seed (y con un insert equivalente en el proyecto ya sembrado, o desde la
   pantalla de Gestión cuando exista). Todo el trabajo sin cliente tiene ahí su cajón legítimo.
2. **Práctica de alta temprana de potenciales:** cuando se empieza una propuesta para un cliente que aún
   no lo es, se le da de alta como cliente con un proyecto **"Propuesta"** y el tiempo de preventa se
   apunta ahí. Si firma, su rentabilidad nace con el coste de adquisición incluido; si no, queda el coste
   real de las propuestas perdidas. Es una práctica de uso (documentarla en el README), no código.

### 14.3 Requisitos derivados para el Resumen (punto 3 del plan — NO es de esta pasada frontend)

Especificación que el Resumen admin debe cumplir cuando se construya:

- **Separar lo interno de la rentabilidad:** "Coonic (interno)" se muestra, pero **fuera** del análisis
  de rentabilidad por cliente (sección aparte o toggle "incluir interno", por defecto excluido).
- **Señal de completitud, no de cantidad:** por persona y rango, **días laborables sin ningún registro**
  ("datos incompletos"), sin comparar contra ninguna cuota de horas. Un día a cero es casi seguro un
  hueco de datos, no un día sin trabajar — y un hueco sesga la rentabilidad del cliente **a la baja en
  costes** (parece más rentable de lo que es).
- **Indicador de fiabilidad del periodo:** % de horas apuntadas el mismo día o el siguiente al día
  trabajado, calculado con `fecha` vs `actualizado_en` (ya existen; sin cambios de esquema). Se presenta
  agregado por periodo ("el 72 % de las horas de mayo se apuntó en el día o al día siguiente"), como
  medida de cuánto fiarse del análisis — no como ranking de personas. *Limitación conocida y aceptable:*
  `actualizado_en` refleja la **última** edición, así que una corrección tardía cuenta como "tardía";
  es un proxy, no un audit trail.
- **Recordatorio del solape (§11.3):** la suma de horas por día/persona puede superar 24 h por los
  cronómetros concurrentes — es metodología aprobada ("tiempo asignado", no "tiempo exclusivo"), el
  Resumen no debe capar ni marcar esto como error.

### 14.4 Descartado con este objetivo en la mano
- **Cuotas u objetivos de horas semanales** — es exactamente lo que el cliente no quiere medir.
- **Aprobaciones de partes y bloqueo de semanas pasadas** — burocratiza sin mejorar la exactitud (fase 2
  si algún día hace falta).
- **Notificaciones externas** (email/push) — siguen excluidas; el aviso de 14.1 vive dentro de la app.