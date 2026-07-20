# Clooki · Cuco — humor y Wordle semanal

Propuesta de gamificación (jul 2026). Objetivo: incentivar la **semana
completa de registro** — el dato que Clooki necesita — con un premio que
no contamina el dato: al rellenar L–V se desbloquea el Wordle de la
semana, y el mejor del mes se lleva un detalle de la empresa (un
desayuno). Se compite en Wordle, nunca en horas.

**Decisiones ya tomadas con el cliente (20 jul 2026):**

| Decisión | Elegido |
|---|---|
| ¿Palabra por persona o común? | **La misma palabra semanal para todo el equipo** — ranking justo y conversación de pasillo; el spoiler se gestiona socialmente, como en el Wordle real |
| Desbloqueo | **L–V de la semana actual con al menos un registro cada día** (la regla del aviso de semana incompleta, en positivo) |
| Ranking mensual | **Media de intentos de las semanas jugadas** (no suma), mínimo 2 semanas jugadas en el mes; desempate: más semanas jugadas. Quien falta una semana (vacaciones) no queda fuera |
| Puntuación | Tipo golf: intentos usados (1–6); no resolverla = **7**; semana no jugada = no puntúa |
| Candado de futuro | **No se pueden apuntar horas en días posteriores a hoy** — evita desbloquear el Wordle antes de tiempo y, de paso, protege la honestidad del dato |
| Premio | Sin código: el admin mira el ranking y paga el desayuno |

---

## 1) Concepto y encaje con lo existente

- **Se gamifica el hábito de registrar, nunca la cantidad trabajada**
  (línea roja del brief: la herramienta mide rentabilidad por cliente, no
  personas). El ranking es de un juego; las horas siguen sin compararse
  entre compañeros en ninguna pantalla.
- **El candado visible es el incentivo**: el panel del Wordle vive en
  Mi semana y, bloqueado, dice cuántos días faltan («Te faltan martes y
  jueves para el Wordle»). Es el reverso amable del aviso de semana
  incompleta que ya existe.
- **El cuco es quien lo presenta.** Clooki suena a reloj de cuco: la
  mascota (un cuco SVG propio, sin librerías) asoma en momentos contados
  — al completar la semana trae la palabra, y celebra al líder del mes en
  el ranking (entregándole un croissant). Pocas apariciones bien
  elegidas > veinte badges.
- **Tono**: es el primer ranking público individual de la app. Al ser de
  un juego está bien, pero visualmente debe leerse siempre en clave de
  humor, nunca como un dashboard de rendimiento.

### Flujo tipo

1. María apunta sus horas del viernes → su semana tiene L–V con registro.
2. El panel del Wordle se abre: el cuco asoma con la palabra de la
   semana. Seis intentos, palabra de 5 letras en español.
3. La saca en 3. Su partida queda guardada; el lunes el ranking del mes
   suma la semana. A fin de mes, el mejor promedio desayuna gratis.

---

## 2) Candado de futuro (migración 009)

Independiente del juego y con valor propio: hoy la rejilla permite
escribir en cualquier día de la semana visible y navegar a semanas
futuras — horas de pasado mañana son ruido para el dato.

- **BD (la garantía real)**: trigger `before insert or update` en
  `horas` que rechaza `fecha` posterior a hoy en `Europe/Madrid`
  (equipo en Málaga; `current_date` del servidor es UTC y a partir de
  la 1:00/2:00 de la madrugada iría un día por detrás). Mensaje claro:
  «No se pueden apuntar horas de días futuros». Cubre rejilla, pegado,
  IA y MCP de una vez. `cronometros` no lo necesita: su día atribuido
  es siempre el de arranque.
- **Front (la experiencia)**: celdas de días futuros deshabilitadas con
  título explicativo; el pegado y los steppers móviles las saltan (como
  ya hacen con celdas con cronómetro); `aplicarPropuestas` (IA) y
  `mcp_apuntar` devuelven el error amable. «Hoy» en el front es la fecha
  local del navegador, coherente con `dia_atribuido`.

## 3) Modelo del juego (migración 010)

```
wordle_semanas
  semana    date pk           -- lunes ISO de la semana
  palabra   text not null     -- 5 letras, mayúsculas, sin tildes, con Ñ
  creada_en timestamptz

wordle_partidas
  persona_id uuid → personas(id)
  semana     date → wordle_semanas(semana)
  intentos   jsonb not null default '[]'   -- palabras probadas, en orden
  resuelta   boolean not null default false
  terminada_en timestamptz                 -- fijada al resolver o agotar
  primary key (persona_id, semana)
```

- **La palabra nunca viaja al navegador** hasta terminar la partida.
  Todo pasa por RPC `security definer`:
  - `wordle_estado()` → ¿semana completa? ¿partida en curso? intentos
    con sus colores (verde/amarillo/gris) ya calculados en servidor.
  - `wordle_intentar(palabra)` → valida contra el diccionario, calcula
    colores, actualiza la partida; al terminar devuelve la palabra.
  - La palabra de la semana se elige en servidor en el primer
    `wordle_estado()` que la necesita (insert idempotente).
- **Listas de palabras como datos del repo** (sin librerías, brief):
  una lista curada de respuestas (cientos de palabras comunes de 5
  letras) y un diccionario amplio de intentos válidos. Convención del
  Wordle español: sin tildes, con Ñ.
- **RLS**: cada uno lee/escribe SOLO su partida — los intentos ajenos
  revelarían la palabra. El ranking sale de una RPC agregada
  (persona, semanas jugadas, media) sin exponer intentos.
- **Ventana de juego**: cada Wordle es jugable solo su semana (hasta el
  domingo, hora de Madrid). La semana pertenece al mes de su lunes.
- **El desbloqueo se comprueba en servidor** (`wordle_estado` cuenta los
  días L–V con registro), no en el cliente.

## 4) Fases de construcción

| Fase | Contenido | Tamaño |
|---|---|---|
| **W·1 Candado de futuro** | Migración 009 (trigger en `horas`), celdas futuras deshabilitadas, pegado/steppers/IA/MCP con error amable | S — ✅ 20 jul |
| **W·2 Motor del juego** | Migración 010 (tablas + RLS + RPCs), listas de palabras, elección semanal en servidor | M |
| **W·3 El juego en Mi semana** | Panel bloqueado (días que faltan) / desbloqueado, tablero 6×5, teclado en pantalla (móvil), colores accesibles (no solo color), el cuco trae la palabra | L |
| **W·4 Ranking y celebración** | RPC agregada, vista del ranking mensual (clave de humor: el cuco y el croissant), «copiar resultado» en cuadraditos para compartir | S/M |

Orden: W·1 → W·2 → W·3 → W·4. W·1 se puede desplegar ya (valor propio).
El juego es usable al final de W·3; el desayuno funciona desde W·4 sin
más código que el ranking. Migración siempre antes que el front.

---

## 5) Qué NO es esta versión (anti-alcance)

- **Sin rachas tipo Duolingo** ni presión por jugar: semana no jugada =
  no puntúa, y ya.
- **Sin cronometrar la resolución**: meter prisa en el juego de
  relajarse es contradictorio. El desempate es por participación.
- **Sin ranking ni comparativa de horas** — línea roja permanente.
- **Sin notificaciones** (el brief las excluye): el candado del panel
  es el único recordatorio.
- **Sin librerías**: cuco SVG propio, listas de palabras como datos,
  teclado en pantalla con botones normales.

---

## 6) Decisiones del cliente (20 jul 2026) y dudas que quedan

1. **Palabras temáticas de agencia de vez en cuando** (BRIEF, PAUTA,
   LOGOS…): **sí**, pero de dificultad **media-alta** — no tan obvias que
   se adivinen entre compañeros. Van en la lista de respuestas curada.
2. **«Copiar resultado»**: **sí**, al portapapeles — los cuadraditos de
   colores de toda la vida, sin compartir a ningún servicio externo.
3. **Alta a mitad de mes**: **ok** — juega desde su primera semana
   completa; si no llega al mínimo de 2 semanas, sale en el ranking como
   «fuera de concurso».
4. **Sigue abierta — meses de 4 vs 5 semanas**: la media ya lo neutraliza;
   revisar con el primer mes real si el mínimo de 2 semanas jugadas se
   queda corto o largo.
