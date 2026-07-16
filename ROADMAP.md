# Clooki · Roadmap

El MVP se define en [`coonic-horas-mvp.md`](./coonic-horas-mvp.md) y las
directrices de diseño en [`ux-ui-directrices.md`](./ux-ui-directrices.md).
**Objetivo de la herramienta:** conocer con exactitud el tiempo dedicado a
cada cliente para analizar su rentabilidad. No es control horario de
empleados: sin cuotas ni objetivos de horas.

## Estado

| Fase | Estado |
|---|---|
| 1. Esquema + auth (email/contraseña, DNI para miembros) | ✅ jul 2026 |
| 2. Rejilla "Mi semana" + pasada completa de UX (brief §1–14) | ✅ jul 2026 |
| — Cronómetro concurrente, pegado, líneas múltiples, 0,25, aviso semana incompleta | ✅ jul 2026 |
| 3. Resumen + Gestión (admin) | ✅ jul 2026 |
| 4. Pulido con uso real | ⬜ |
| QA de modo oscuro (brief §9.21) | ⬜ opcional |

## Fase IA (aprobada 17 jul 2026, en este orden)

1. **Servidor MCP de Clooki** — ✅ jul 2026 (`/api/mcp` + `/conexion-ia` + migración 004).
   Apuntar horas y consultar datos desde Claude, donde el equipo ya trabaja:
   - Escribir: "apunta 2h de hoy a Viamed desarrollo web" → upsert con las
     mismas validaciones y RLS (token por usuario; nunca service role).
   - Leer (admin): "¿cuántas horas lleva Capitalidad este mes por proyecto?",
     "¿quién no ha rellenado esta semana?" — reutiliza los agregados del Resumen.
2. **Resumen inteligente** — botón "Analizar periodo" en `/resumen`: 5-6
   observaciones en prosa (subidas/bajadas por cliente, propuestas que acumulan
   horas sin firmar, % de datos apuntados con retraso). Bajo demanda, una
   llamada por clic; sin coste recurrente.
3. **Entrada en lenguaje natural en la app** — ✅ jul 2026, adelantada:
   el equipo comparte una sola cuenta de claude.ai, así que los conectores
   MCP personales no sirven para todos — la caja en la propia app resuelve la
   identidad con el login de Clooki. "ayer 3h viamed rrss" → propuestas con
   **vista previa confirmable** (la IA propone, la persona confirma). Requiere
   `ANTHROPIC_API_KEY` (clave de empresa) en Vercel; modelo `claude-opus-4-8`
   con salida estructurada (~1 céntimo por frase).
4. **Síntesis de notas por cliente** — resumen mensual en prosa de en qué se
   fueron las horas de un cliente, a partir de las notas de línea. Esperar a
   que haya notas reales antes de construirlo.

### Descartado a propósito (no reabrir sin decisión nueva)
- **IA que sugiera cantidades de horas** (o copiar cifras de semanas
  anteriores): rompe la honestidad del dato — decisión anti-piloto-automático.
- **Minería de calendario/email para auto-imputar tiempo**: integraciones y
  privacidad desproporcionadas para una herramienta interna.
- **PWA/instalable** y **notificaciones externas**: descartadas en el brief
  (§13.4, §14.4).

## Fase 2 clásica (sin fecha, tras la fase IA)

Costes por hora y tarifas → rentabilidad real por cliente (el esquema ya
deja hueco: `coste_hora` en personas, `tarifa_hora` en clientes/proyectos,
flag `facturable` en horas). Al analizarla, recordar que el total diario
entre proyectos puede superar 24 h (cronómetros concurrentes: "tiempo
asignado", no "tiempo exclusivo" — brief §11.3).
