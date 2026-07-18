# Clooki · Tareas — tablero de tarjetas conectado a «Mi semana»

Propuesta de la siguiente versión del proyecto (jul 2026). Objetivo: que el
equipo planifique el trabajo en un tablero tipo Trello y que ese plan fluya
sin fricción hacia el registro de horas — la tarjeta que hoy planificas es
la línea en la que mañana apuntas tiempo.

**Decisiones ya tomadas con el cliente (17–18 jul 2026):**

| Decisión | Elegido |
|---|---|
| ¿La tarjeta lleva proyecto? | **Sí, obligatorio** — columna = cliente, tarjeta = proyecto + título |
| ¿Tarjetas sin asignar? | **Sí** — funcionan como backlog del cliente; cualquiera «la coge» |
| ¿Cuántas personas por tarjeta? | **Varias o ninguna** (18 jul) — asignación múltiple; sin asignar = backlog. Cualquiera puede autoasignarse a cualquier tarjeta |
| Estados | **Pendiente → En curso → Hecha** (chips; las hechas se pliegan) |
| Botón «Mis tareas» en Mi semana | **Añade la línea** cliente→proyecto→tarea a la rejilla de un clic; en curso primero |

---

## 1) Concepto y encaje con lo existente

- **El tablero no inventa estructura nueva**: las columnas son los clientes
  activos (tabla `clientes`) y cada tarjeta pertenece a un proyecto activo de
  ese cliente (tabla `proyectos`). No hay gestión de columnas: el tablero se
  genera solo del catálogo que ya mantiene Gestión.
- **El puente con Mi semana es la tarea por línea** (migración 006): una
  línea de la rejilla es persona+proyecto+`tarea`. Al llevar una tarjeta a la
  semana, su título se convierte en la `tarea` de la línea. Mismo límite (120
  caracteres, recortada) para que el título de tarjeta siempre quepa como
  tarea de línea.
- **Filosofía intacta**: la herramienta mide tiempo por cliente para analizar
  rentabilidad, no controla personas. El tablero añade *qué* se va a hacer;
  las horas siguen diciendo *cuánto* costó. Sin cuotas, sin fechas límite
  obligatorias, sin métricas de productividad individual.

### Flujo tipo

1. Alguien crea la tarjeta «Ficha de académicos» en la columna **Academia
   Gastronómica**, proyecto **Desarrollo web** (asignada a María, o sin
   asignar al backlog).
2. María entra en **Mi semana** → botón **Mis tareas** → ve sus tarjetas
   pendientes/en curso → clic en «Ficha de académicos» → aparece la línea
   *Academia Gastronómica — Desarrollo web · Ficha de académicos* en la
   rejilla, lista para teclear horas o arrancar el cronómetro.
3. Al apuntar tiempo, la tarjeta pasa sola a **En curso**. Cuando María
   termina, la marca **Hecha** (desde el tablero o desde el propio panel de
   Mis tareas). La tarjeta hecha se pliega en su columna; las horas quedan
   en el histórico para el Resumen.

---

## 2) Modelo de datos (migración 007)

Dos tablas nuevas; nada de lo existente cambia (ni `horas`, ni `cronometros`).

```
tarjetas
  id            uuid pk
  proyecto_id   uuid not null → proyectos(id)     -- el cliente se deriva del proyecto
  titulo        text not null                      -- check: recortado, 1..120 (mismo límite que horas.tarea)
  descripcion   text                               -- opcional, detalle libre
  creada_por    uuid not null → personas(id)
  estado        text not null default 'pendiente'  -- check: pendiente | en_curso | hecha
  posicion      numeric not null                   -- orden dentro de la columna (fraccional: mover = media entre
                                                   -- vecinas; insertar con saltos grandes y renumerar la columna
                                                   -- cuando la diferencia entre vecinas baje de un umbral)
  creada_en     timestamptz default now()
  actualizada_en timestamptz (trigger, como horas)

tarjeta_asignaciones                               -- asignación múltiple (decisión 18 jul)
  tarjeta_id    uuid → tarjetas(id) on delete cascade
  persona_id    uuid → personas(id)
  pk (tarjeta_id, persona_id)                      -- sin filas = backlog del cliente
```

- **RLS**: todo el equipo activo **lee** todas las tarjetas y asignaciones
  (transparencia del tablero). **Crear**: cualquiera. **Editar/mover/cambiar
  estado**: creador, cualquier persona asignada o admin. **Asignar**: al
  crear puedes asignar a cualquiera; después, cualquiera puede
  *auto*asignarse a cualquier tarjeta («la cojo yo» = insertar su propia
  fila, idempotente con `on conflict do nothing`) o quitarse; añadir/quitar
  a *otros* queda para creador o admin. Con asignación múltiple no hay
  carrera al «cogerla»: dos personas a la vez es un resultado válido, no un
  conflicto. **Borrar**: creador o admin (con confirmación estilo papelera).
- **Vínculo con horas: por copia, no por FK.** Al añadir la línea, el título
  se copia como `horas.tarea` (pasado por `limpiarTarea`). El estado «En
  curso» se calcula cruzando (cualquiera de las personas asignadas, proyecto,
  título) contra `horas`. *Limitación aceptada:* renombrar una tarjeta con horas ya
  apuntadas rompe el cruce hacia atrás — se documenta y la UI avisa al
  renombrar. La alternativa (FK desde `horas`) acoplaría el registro de
  horas al tablero y viola el principio de que Mi semana funciona sola.

---

## 3) Pantalla /tareas

- **Menú**: nueva entrada **Tareas** en la cabecera, visible para todo el
  equipo (a diferencia de Resumen/Gestión, que son solo admin).
- **Escritorio**: columnas por cliente activo con scroll horizontal, estilo
  tablero. Solo aparecen columnas de clientes con tarjetas + un buscador para
  crear en cualquier cliente (evita 30 columnas vacías). Tarjeta: título,
  chip de proyecto, iniciales de las personas asignadas (apiladas; o «Sin
  asignar» en tenue), chip de estado. Las **hechas** se pliegan bajo un contador
  («✓ 4 hechas») por columna.
- **Móvil**: mismo patrón que Mi semana — selector de cliente (como el
  selector de día) y una columna a la vista. El tablero completo no cabe ni
  hace falta.
- **Crear tarjeta**: botón por columna → título + proyecto (select de los del
  cliente) + asignar (opcional, con «para mí» a un toque) + descripción
  opcional.
- **Mover**: dentro de la columna, arrastrar (HTML5 nativo, sin librerías —
  restricción del brief) con alternativa accesible de botones ↑/↓. Entre
  columnas **no se arrastra**: cambiar de cliente implica cambiar de
  proyecto, así que se edita la tarjeta (caso raro, no gesto frecuente).
- **Sin tiempo real** en v1: el tablero se refresca al cargar y tras cada
  acción propia. Si el uso lo pide, Supabase Realtime es la ampliación
  natural (fase T·4).

---

## 4) Integración en Mi semana — botón «Mis tareas»

- Botón **«Mis tareas»** a la derecha de «+ Añadir línea». Con un badge del
  número de tarjetas pendientes+en curso asignadas a ti.
- Abre un panel (mismo patrón visual que Añadir línea) con tus tarjetas
  (aquellas en las que estás asignado) agrupadas por cliente: título,
  proyecto y estado. **Orden dentro de cada cliente: primero las en curso,
  después las pendientes** (lo que ya está en marcha es lo que vienes a
  continuar); dentro de cada grupo, por posición del tablero.
  - **Clic en una tarjeta** → se añade la línea proyecto+tarea a la rejilla
    (mismo `anadirLineas` que ya existe) y el foco va a la celda de hoy.
  - Las que **ya tienen línea esta semana** aparecen marcadas ✓ y no se
    duplican (misma regla de par exacto proyecto+tarea que Añadir línea).
  - Cada tarjeta lleva un check rápido de **marcar Hecha** sin ir al tablero.
- **Automatismo mínimo**: al guardar horas o arrancar cronómetro en una línea
  cuyo par (proyecto, tarea) coincide con una tarjeta en «pendiente» en la
  que estás asignado, la tarjeta pasa a **en_curso**. Nada más se automatiza: «hecha» siempre es
  decisión humana (coherente con la honestidad del dato del brief).
- Lo inverso no existe: apuntar horas **no** exige tarjeta. Las líneas
  manuales, la IA y el MCP siguen funcionando exactamente igual sin pasar
  por el tablero.

---

## 5) Fases de construcción

| Fase | Contenido | Tamaño |
|---|---|---|
| **T·1 Modelo** | Migración 007 (`tarjetas` + `tarjeta_asignaciones` + RLS + trigger + índices), tipos en `tipos.ts`, carga en `src/lib/datos/tareas.ts` | S — ✅ 18 jul |
| **T·2 Tablero** | Ruta `/tareas`, entrada de menú, columnas por cliente, crear/editar/asignar/estados/borrar, orden con posicion fraccional, vista móvil | L — ✅ 18 jul (pendiente de rodaje real) |
| **T·3 Puente** | Botón «Mis tareas» en Mi semana: panel, añadir línea, marcar hecha, badge, automatismo pendiente→en_curso | M |
| **T·4 Ampliaciones** (decidir con uso real) | Realtime (ver movimientos ajenos al instante), IA («crea una tarjeta para X»; el Resumen inteligente de la fase IA·2 puede leer tarjetas hechas), arrastrar entre dispositivos táctiles, filtros por persona en el tablero | — |

Orden recomendado: T·1 → T·2 → T·3. El tablero es usable al final de T·2;
el valor diferencial (el puente) llega en T·3. Cada fase con su despliegue:
migración siempre antes que el front, como en la 006.

---

## 6) Qué NO es esta versión (anti-alcance)

- **No hay fechas límite ni recordatorios** — se puede añadir un campo
  `fecha_objetivo` opcional más adelante, pero sin notificaciones (el brief
  las excluye) y sin semáforos de retraso.
- **No hay checklist/subtareas, adjuntos ni comentarios** en v1. Si hace
  falta conversación, la descripción es texto libre.
- **No hay métricas de tarjetas por persona** en el Resumen — el tablero
  organiza, no evalúa. (Las horas siguen siendo la única métrica.)
- **No se instalan librerías** (ni de drag&drop ni de tableros): Tailwind +
  React + Web APIs, como todo lo demás.
- **No se toca el modelo de horas**: `horas` y `cronometros` quedan como
  están tras la 006.

---

## 7) Dudas cerradas (decisión del cliente, 18 jul 2026)

1. **¿Quién ve el backlog sin asignar en «Mis tareas»?** → **Solo tus
   tarjetas asignadas.** El panel es «qué tengo yo»; el backlog se coge
   desde el tablero, que es donde cogerlo es un acto consciente.
2. **Tarjetas hechas: ¿se archivan solas?** → **Sí, a los 30 días** de
   hecha se ocultan del tablero (siguen en BD), con un enlace «ver
   archivadas» por columna para no perder la confianza de que nada se borra.
3. **¿Límite de tarjetas por columna visible?** → **No decidir ahora.** Con
   las hechas plegadas y el autoarchivado, una columna que crezca sin
   control es señal de un problema de uso, no de UI. Revisar con datos
   reales.
