# Coonic · Registro de horas — MVP

Aplicación interna mínima para que el equipo de Coonic (10–25 personas) apunte las **horas dedicadas a cada cliente y proyecto/tarea**. Nada más. Sin costes de empleado, sin facturable/no facturable, sin rentabilidad. Eso vendrá después: este documento define solo el **MVP**, pensado para construirse rápido e ir puliéndose con el uso.

**Objetivo en una frase:** que cualquier compañero deje apuntadas sus horas de la semana en menos de un minuto, y que dirección pueda ver cuántas horas se lleva cada cliente.

---

## 1. Principios del MVP

- **Lo más simple que funcione.** Cada decisión de producto se resuelve a favor de menos campos, menos clics, menos pantallas.
- **Cero fricción de alta.** Los compañeros nunca dan de alta nada: eligen de listas. Solo los admin crean clientes y proyectos.
- **Coste 0 € y sin cuota por usuario.** Free tiers o servidor propio; nunca pago por asiento.
- **Preparado para crecer.** El modelo de datos deja hueco para lo que vendrá (costes, tarifas, rentabilidad, MCP), pero no se implementa ahora.

---

## 2. ¿Registro diario o semanal? → Semanal en rejilla, con pasos diarios

La recomendación para el MVP es una **rejilla semanal tipo parte de horas**:

- **Filas** = las líneas de trabajo de esa persona (cliente + proyecto/tarea).
- **Columnas** = los días de la semana (L–V, con S/D plegados).
- **Celdas** = horas (pasos de 0,5).

Por qué esta y no otras:

- **Entrada solo diaria** (un formulario por cada fichaje) es lo más preciso, pero es exactamente la fricción de la que venís huyendo: obliga a acordarse cada día y multiplica los clics.
- **Entrada solo semanal** ("esta semana, 12 h a TechNova") pierde el detalle por día, que luego se echa de menos.
- **La rejilla semanal da lo mejor de ambos**: quien apunta al momento rellena la celda de hoy; quien lo deja para el viernes rellena su semana entera de una pasada. Es el patrón clásico de agencia (parte de horas) y todo el mundo lo entiende sin explicación.

Detalle importante: las filas de la rejilla **se recuerdan de una semana a otra** (las líneas en las que la persona trabajó recientemente aparecen ya puestas). Rellenar la semana típica = teclear 5–10 números y guardar.

---

## 3. Funcionalidad del MVP

### 3.1 Mi semana (pantalla principal — la única que ve el equipo)

- Rejilla semanal con las líneas de trabajo de la persona y los días L–D.
- Botón **"+ Añadir línea"**: seleccionar cliente → proyecto/tarea (desplegable dependiente). La línea queda fijada para las próximas semanas hasta que se quite.
- Escribir horas directamente en las celdas (pasos de 0,5; teclado numérico en móvil).
- **Autoguardado** al salir de la celda (sin botón "guardar" que se olvide).
- Fila y columna de **totales** (total por línea, total por día, total de la semana).
- Navegación ← semana anterior / semana siguiente →. Copiar las líneas de la semana pasada viene de serie (por el recordado de líneas).
- Campo de nota opcional por línea (una tarea concreta), escondido para no estorbar.

### 3.2 Resumen (solo admin)

Una única pantalla de lectura, con selector de rango (esta semana / este mes / rango libre):

- **Horas por cliente** (total y % del total) — la vista principal.
- Desglose de un cliente **por proyecto/tarea** al desplegarlo.
- **Horas por persona** (quién ha apuntado cuánto), útil también para ver quién no ha rellenado su parte.
- Exportar a **CSV** el detalle (persona, cliente, proyecto, fecha, horas, nota).

### 3.3 Gestión (solo admin)

- CRUD mínimo de **clientes** (nombre, activo) y **proyectos/tareas** (cliente, nombre, activo).
- CRUD mínimo de **personas** (nombre, email, rol admin/miembro, activo).
- "Archivar" en lugar de borrar cuando ya existan horas registradas.

### Lo que el MVP NO incluye (a propósito)

Costes por hora, tarifas, facturable/no facturable, rentabilidad y márgenes, aprobaciones de partes, temporizador/cronómetro, informes elaborados, integraciones y MCP, notificaciones. Todo esto es fase 2+; el modelo de datos no lo impide.

---

## 4. Modelo de datos

Cuatro tablas. Nombres orientativos.

### `personas`
| campo | tipo | notas |
|---|---|---|
| id | uuid | PK |
| nombre | text | |
| email | text | único, para login |
| rol | enum(`admin`,`miembro`) | admin ve Resumen y Gestión |
| activo | bool | |

### `clientes`
| campo | tipo | notas |
|---|---|---|
| id | uuid | PK |
| nombre | text | |
| activo | bool | archivado = false |

### `proyectos`  *(proyecto o tarea del cliente — un solo nivel, sin jerarquías)*
| campo | tipo | notas |
|---|---|---|
| id | uuid | PK |
| cliente_id | uuid | FK → clientes |
| nombre | text | p. ej. "SEO", "Campaña vendimia", "Mantenimiento web" |
| activo | bool | |

### `horas`
| campo | tipo | notas |
|---|---|---|
| id | uuid | PK |
| persona_id | uuid | FK → personas |
| proyecto_id | uuid | FK → proyectos (el cliente se deriva del proyecto) |
| fecha | date | día concreto (la rejilla semanal escribe una fila por celda) |
| horas | numeric | pasos de 0,5; > 0 |
| nota | text | opcional |
| actualizado_en | timestamptz | |

Restricción útil: **única por (persona, proyecto, fecha)** — la celda de la rejilla es exactamente un registro; editar la celda es un *upsert*, vaciarla lo borra.

> Preparado para el futuro sin implementarlo ahora: añadir `coste_hora` a `personas`, `tarifa_hora` a `clientes`/`proyectos` y un flag `facturable` a `horas` convierte este MVP en la versión con rentabilidad sin migraciones dolorosas.

---

## 5. Stack recomendado (0 €, sin cuota por usuario)

| Capa | Elección | Por qué |
|---|---|---|
| App | **Next.js + TypeScript + Tailwind** | Front y API en un repo; deploy trivial |
| BD + Auth | **Supabase** (Postgres + Auth + RLS), **región EU** | Free tier holgado para 10–25 personas; login por email sin trabajo |
| Hosting | **Vercel** (free) | |

Alternativa "todo en casa": Postgres + la app en un VPS (~5 €/mes planos) o un servidor propio de Coonic.

**Permisos (RLS):**
- `miembro`: lee y escribe **solo sus propias horas**; lee clientes y proyectos activos.
- `admin`: lee todo; único que escribe en clientes/proyectos/personas.

**Login sin fricción:** *magic link* por email (sin contraseñas que gestionar). Restringir el registro al dominio `@coonic.com`.

---

## 6. Criterios de aceptación del MVP

1. Un miembro entra con su email, ve su semana actual y apunta horas en menos de 1 minuto.
2. Las líneas de trabajo de la semana pasada aparecen ya listadas en la nueva semana.
3. El autoguardado funciona: cerrar el navegador no pierde nada.
4. Usable desde el móvil (la rejilla colapsa a "día a día" en pantallas pequeñas).
5. Un admin ve horas por cliente del mes, despliega por proyecto y exporta CSV.
6. Un miembro no puede ver ni editar horas de otros (verificado a nivel de BD, no solo de UI).
7. Crear un cliente nuevo con dos proyectos lleva menos de 30 segundos.

---

## 7. Plan de construcción sugerido

1. **Esquema + auth** — tablas del punto 4, RLS, login por magic link, semilla con los clientes/proyectos/personas reales.
2. **Mi semana** — rejilla con autoguardado, añadir línea, totales, navegación de semanas, versión móvil.
3. **Resumen + Gestión** — pantalla admin con horas por cliente/proyecto/persona y export CSV; CRUD mínimo.
4. **Pulido** — recordado de líneas, notas, archivar, detalles de UX que salgan del uso real.

Con 1 y 2 el equipo ya puede dejar Clockify. 3 da la visión a dirección.

### Ideas para después del MVP (no ahora)
Rentabilidad (costes y tarifas, ver spec anterior del proyecto), servidor MCP para apuntar horas y pedir informes desde Claude, recordatorio semanal a quien no haya rellenado, presupuestos de horas por proyecto con alertas.

---

## 8. Prompt para arrancar en Claude Code

```
Lee este documento (coonic-horas-mvp.md). Vas a construir exactamente este MVP,
sin añadir funcionalidad que no esté aquí.

Stack: Next.js + TypeScript + Tailwind, Supabase (región EU) para BD y auth
por magic link, deploy en Vercel.

Empieza por el paso 1 del plan (esquema SQL + políticas RLS + semilla) y
enséñamelo antes de seguir. Después el paso 2 (la rejilla "Mi semana"), que es
el corazón del producto: prioriza que sea rapidísima de usar y que funcione
bien en móvil. Valida contra los criterios de aceptación del punto 6.
```
