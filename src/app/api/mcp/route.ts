import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatearDuracion, deIso, aIso } from "@/lib/semana";
import type { Database, FilaHorasMcp } from "@/lib/tipos";

// ============================================================
// Servidor MCP de Clooki (transporte Streamable HTTP, sin estado).
// Autenticación: token personal "clk_…" (generado en /conexion-ia)
// vía cabecera `Authorization: Bearer`. Toda la seguridad vive en
// las funciones SECURITY DEFINER de la migración 004 — aquí no hay
// service role: cliente con la clave publishable.
// ============================================================

const CLIENTE_INTERNO = "Coonic (interno)";
const VERSION_PROTOCOLO = "2025-06-18";

function supabaseAnonimo() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/* ── Fechas en la zona del equipo (Madrid), no la del servidor ── */

function hoyMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());
}

function lunesDeMadrid(): string {
  const hoy = deIso(hoyMadrid());
  const dia = hoy.getDay();
  hoy.setDate(hoy.getDate() + (dia === 0 ? -6 : 1 - dia));
  return aIso(hoy);
}

function mesActualMadrid(): { desde: string; hasta: string } {
  const hoy = deIso(hoyMadrid());
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 12);
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 12);
  return { desde: aIso(primero), hasta: aIso(ultimo) };
}

function diasLaborablesHastaHoy(desde: string, hasta: string): string[] {
  const tope = hasta < hoyMadrid() ? hasta : hoyMadrid();
  const dias: string[] = [];
  const d = deIso(desde);
  for (let i = 0; i < 400; i++) {
    const iso = aIso(d);
    if (iso > tope) break;
    if (d.getDay() >= 1 && d.getDay() <= 5) dias.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/* ── Definición de herramientas ── */

const HERRAMIENTAS = [
  {
    name: "listar_catalogo",
    description:
      "Lista los clientes activos de Coonic con sus proyectos. Úsala para resolver nombres antes de apuntar horas.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "apuntar_horas",
    description:
      "Apunta horas del usuario autenticado a un proyecto de un cliente, con tarea opcional. Horas decimales sin redondeo (se guardan al segundo). La celda es persona+proyecto+tarea+día: el mismo proyecto puede tener varias tareas el mismo día. Por defecto FIJA el valor de la celda; con sumar=true acumula sobre lo que hubiera. horas=0 (sin sumar) borra la celda de esa tarea (sin tarea, la celda sin tarea).",
    inputSchema: {
      type: "object",
      properties: {
        cliente: { type: "string", description: "Nombre (o parte) del cliente" },
        proyecto: { type: "string", description: "Nombre (o parte) del proyecto" },
        horas: { type: "number", description: "Horas decimales, p. ej. 1.75 (0 borra la celda)" },
        fecha: { type: "string", description: "YYYY-MM-DD; por defecto hoy (Madrid)" },
        tarea: { type: "string", description: "Tarea concreta dentro del proyecto (opcional; identifica la línea)" },
        sumar: { type: "boolean", description: "true = añadir sobre el valor existente" },
      },
      required: ["cliente", "proyecto", "horas"],
      additionalProperties: false,
    },
  },
  {
    name: "mis_horas",
    description:
      "Horas apuntadas por el usuario autenticado en un rango (por defecto, la semana actual). Devuelve detalle por día/proyecto y totales por cliente.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "YYYY-MM-DD (defecto: lunes de esta semana)" },
        hasta: { type: "string", description: "YYYY-MM-DD (defecto: hoy)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "resumen_horas",
    description:
      "SOLO ADMIN. Resumen del equipo en un rango (por defecto, el mes actual): horas por cliente con desglose por proyecto, horas por persona con días laborables sin registro, y fiabilidad del dato. El cliente interno queda fuera salvo incluir_interno=true. Nota: la suma diaria puede superar 24 h por cronómetros simultáneos — es intencional.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "YYYY-MM-DD (defecto: día 1 del mes)" },
        hasta: { type: "string", description: "YYYY-MM-DD (defecto: fin de mes)" },
        incluir_interno: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
] as const;

/* ── Implementación de herramientas ── */

type Args = Record<string, unknown>;

class ErrorHerramienta extends Error {}

async function ejecutarHerramienta(
  nombre: string,
  args: Args,
  clave: string,
): Promise<string> {
  const supabase = supabaseAnonimo();

  if (nombre === "listar_catalogo") {
    const { data, error } = await supabase.rpc("mcp_catalogo", { p_clave: clave });
    if (error) throw new ErrorHerramienta(error.message);
    return (data ?? [])
      .map(
        (c) =>
          `${c.nombre}\n${c.proyectos.map((p) => `  - ${p.nombre}`).join("\n")}`,
      )
      .join("\n");
  }

  if (nombre === "apuntar_horas") {
    const horas = Number(args.horas);
    const fecha = typeof args.fecha === "string" ? args.fecha : hoyMadrid();
    if (!ES_FECHA.test(fecha))
      throw new ErrorHerramienta("Fecha inválida: usa YYYY-MM-DD");
    if (!Number.isFinite(horas))
      throw new ErrorHerramienta("Horas inválidas");

    const { data: catalogo, error } = await supabase.rpc("mcp_catalogo", {
      p_clave: clave,
    });
    if (error) throw new ErrorHerramienta(error.message);

    // Resolver cliente por nombre (exacto primero, luego subcadena).
    const aguja = normalizar(String(args.cliente ?? ""));
    const exactos = (catalogo ?? []).filter((c) => normalizar(c.nombre) === aguja);
    const parciales = (catalogo ?? []).filter((c) =>
      normalizar(c.nombre).includes(aguja),
    );
    const candidatos = exactos.length > 0 ? exactos : parciales;
    if (candidatos.length === 0)
      throw new ErrorHerramienta(
        `Ningún cliente coincide con "${args.cliente}". Usa listar_catalogo.`,
      );
    if (candidatos.length > 1)
      throw new ErrorHerramienta(
        `Varios clientes coinciden: ${candidatos.map((c) => c.nombre).join(", ")}. Sé más específico.`,
      );
    const cliente = candidatos[0];

    const agujaP = normalizar(String(args.proyecto ?? ""));
    const pExactos = cliente.proyectos.filter((p) => normalizar(p.nombre) === agujaP);
    const pParciales = cliente.proyectos.filter((p) =>
      normalizar(p.nombre).includes(agujaP),
    );
    const proyectos = pExactos.length > 0 ? pExactos : pParciales;
    if (proyectos.length === 0)
      throw new ErrorHerramienta(
        `${cliente.nombre} no tiene ningún proyecto que coincida con "${args.proyecto}". Sus proyectos: ${cliente.proyectos.map((p) => p.nombre).join(", ")}.`,
      );
    if (proyectos.length > 1)
      throw new ErrorHerramienta(
        `Varios proyectos coinciden en ${cliente.nombre}: ${proyectos.map((p) => p.nombre).join(", ")}. Sé más específico.`,
      );

    // `nota` se acepta como alias legado de `tarea` (conectores antiguos).
    const tarea =
      typeof args.tarea === "string"
        ? args.tarea
        : typeof args.nota === "string"
          ? args.nota
          : null;
    const { data, error: errorApuntar } = await supabase.rpc("mcp_apuntar", {
      p_clave: clave,
      p_proyecto_id: proyectos[0].id,
      p_fecha: fecha,
      p_horas: horas,
      p_tarea: tarea,
      p_sumar: args.sumar === true,
    });
    if (errorApuntar) throw new ErrorHerramienta(errorApuntar.message);

    const etiqueta =
      `${cliente.nombre} — ${proyectos[0].nombre}` +
      (tarea?.trim() ? ` · ${tarea.trim()}` : "");
    if (data.accion === "borrado")
      return `Celda borrada: ${etiqueta}, ${fecha}.`;
    return `${data.accion === "sumado" ? "Sumado" : "Apuntado"} ${formatearDuracion(Math.round(horas * 3600))} a ${etiqueta} el ${fecha}. Total de esa celda: ${formatearDuracion(data.segundos_total)}.`;
  }

  if (nombre === "mis_horas") {
    const desde =
      typeof args.desde === "string" && ES_FECHA.test(args.desde)
        ? args.desde
        : lunesDeMadrid();
    const hasta =
      typeof args.hasta === "string" && ES_FECHA.test(args.hasta)
        ? args.hasta
        : hoyMadrid();
    const { data, error } = await supabase.rpc("mcp_horas_rango", {
      p_clave: clave,
      p_desde: desde,
      p_hasta: hasta,
    });
    if (error) throw new ErrorHerramienta(error.message);
    const filas = (data ?? []) as FilaHorasMcp[];
    if (filas.length === 0) return `Sin horas entre ${desde} y ${hasta}.`;

    const porCliente = new Map<string, number>();
    let total = 0;
    const detalle = filas
      .map((f) => {
        porCliente.set(
          f.cliente,
          (porCliente.get(f.cliente) ?? 0) + f.segundos,
        );
        total += f.segundos;
        return `${f.fecha}  ${formatearDuracion(f.segundos).padStart(8)}  ${f.cliente} — ${f.proyecto}${f.tarea ? ` · ${f.tarea}` : ""}`;
      })
      .join("\n");
    const totales = [...porCliente.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, s]) => `  ${c}: ${formatearDuracion(s)}`)
      .join("\n");
    return `Horas de ${desde} a ${hasta}:\n\n${detalle}\n\nPor cliente:\n${totales}\n\nTotal: ${formatearDuracion(total)}`;
  }

  if (nombre === "resumen_horas") {
    const porDefecto = mesActualMadrid();
    const desde =
      typeof args.desde === "string" && ES_FECHA.test(args.desde)
        ? args.desde
        : porDefecto.desde;
    const hasta =
      typeof args.hasta === "string" && ES_FECHA.test(args.hasta)
        ? args.hasta
        : porDefecto.hasta;

    // mcp_personas ya exige admin en SQL; si no lo es, el error sube limpio.
    const [horasRes, personasRes] = await Promise.all([
      supabase.rpc("mcp_horas_rango", { p_clave: clave, p_desde: desde, p_hasta: hasta }),
      supabase.rpc("mcp_personas", { p_clave: clave }),
    ]);
    if (personasRes.error) throw new ErrorHerramienta(personasRes.error.message);
    if (horasRes.error) throw new ErrorHerramienta(horasRes.error.message);
    const filas = (horasRes.data ?? []) as FilaHorasMcp[];
    const personas = personasRes.data ?? [];
    const incluirInterno = args.incluir_interno === true;

    const porCliente = new Map<string, { total: number; proyectos: Map<string, number> }>();
    const porPersona = new Map<string, { total: number; fechas: Set<string> }>();
    let interno = 0;
    let puntuales = 0;
    let totalSegundos = 0;
    for (const f of filas) {
      totalSegundos += f.segundos;
      const registrado = deIso(f.actualizado_en.slice(0, 10)).getTime();
      if (registrado - deIso(f.fecha).getTime() <= 86400000 * 1.5)
        puntuales += f.segundos;
      const p = porPersona.get(f.persona_id) ?? { total: 0, fechas: new Set<string>() };
      p.total += f.segundos;
      p.fechas.add(f.fecha);
      porPersona.set(f.persona_id, p);
      if (f.cliente === CLIENTE_INTERNO) {
        interno += f.segundos;
        if (!incluirInterno) continue;
      }
      const c = porCliente.get(f.cliente) ?? { total: 0, proyectos: new Map<string, number>() };
      c.total += f.segundos;
      c.proyectos.set(f.proyecto, (c.proyectos.get(f.proyecto) ?? 0) + f.segundos);
      porCliente.set(f.cliente, c);
    }

    const totalMostrado = [...porCliente.values()].reduce((s, c) => s + c.total, 0);
    const clientesTexto = [...porCliente.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([nombre, c]) => {
        const pct = totalMostrado > 0 ? Math.round((c.total / totalMostrado) * 100) : 0;
        const proyectos = [...c.proyectos.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([p, s]) => `    ${p}: ${formatearDuracion(s)}`)
          .join("\n");
        return `  ${nombre}: ${formatearDuracion(c.total)} (${pct} %)\n${proyectos}`;
      })
      .join("\n");

    const laborables = diasLaborablesHastaHoy(desde, hasta);
    const personasTexto = personas
      .map((p) => {
        const agg = porPersona.get(p.id);
        const sinRegistro = laborables.filter((d) => !agg?.fechas.has(d)).length;
        return {
          nombre: p.nombre,
          total: agg?.total ?? 0,
          sinRegistro,
        };
      })
      .sort((a, b) => b.total - a.total)
      .map(
        (p) =>
          `  ${p.nombre}: ${formatearDuracion(p.total)}` +
          (p.sinRegistro > 0 ? ` · ${p.sinRegistro} día(s) sin registro` : ""),
      )
      .join("\n");

    const fiabilidad =
      totalSegundos > 0 ? Math.round((puntuales / totalSegundos) * 100) : null;

    return (
      `Resumen ${desde} → ${hasta}\n\n` +
      `Por cliente${incluirInterno ? " (interno incluido)" : ""}: ${formatearDuracion(totalMostrado)}\n${clientesTexto || "  (sin horas)"}\n` +
      (incluirInterno
        ? ""
        : `\n${CLIENTE_INTERNO}: ${formatearDuracion(interno)} (fuera del análisis)\n`) +
      `\nPor persona (días sin registro = L–V a cero hasta hoy; señal de dato incompleto, no de jornada):\n${personasTexto || "  (sin personas)"}\n` +
      (fiabilidad !== null
        ? `\nFiabilidad: ${fiabilidad}% de las horas se apuntaron el mismo día o el siguiente.`
        : "") +
      `\n\nNota: la suma diaria de una persona puede superar 24 h (cronómetros simultáneos); no es un error.`
    );
  }

  throw new ErrorHerramienta(`Herramienta desconocida: ${nombre}`);
}

/* ── Transporte JSON-RPC (Streamable HTTP sin estado) ── */

interface PeticionRpc {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: {
    protocolVersion?: string;
    name?: string;
    arguments?: Args;
  };
}

function rpcResultado(id: number | string | null, result: unknown) {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: number | string | null, code: number, message: string) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}

export async function POST(request: NextRequest) {
  const autorizacion = request.headers.get("authorization") ?? "";
  // Token por cabecera Bearer (Claude Code) o por URL ?clave= (los
  // conectores de claude.ai no permiten cabeceras personalizadas).
  const clave = autorizacion.startsWith("Bearer ")
    ? autorizacion.slice(7).trim()
    : (request.nextUrl.searchParams.get("clave") ?? "").trim();
  if (!clave) {
    return new Response(
      JSON.stringify({ error: "Falta el token. Genera el tuyo en /conexion-ia." }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": "Bearer",
        },
      },
    );
  }

  let peticion: PeticionRpc;
  try {
    peticion = await request.json();
  } catch {
    return rpcError(null, -32700, "JSON inválido");
  }
  if (Array.isArray(peticion)) {
    return rpcError(null, -32600, "Lotes no soportados");
  }

  const id = peticion.id ?? null;
  const metodo = peticion.method ?? "";

  // Notificaciones: aceptar sin cuerpo.
  if (metodo.startsWith("notifications/")) {
    return new Response(null, { status: 202 });
  }

  if (metodo === "initialize") {
    return rpcResultado(id, {
      protocolVersion:
        peticion.params?.protocolVersion === "2025-03-26"
          ? "2025-03-26"
          : VERSION_PROTOCOLO,
      capabilities: { tools: {} },
      serverInfo: {
        name: "clooki",
        title: "Clooki · Registro de horas de Coonic",
        version: "1.0.0",
      },
      instructions:
        "Registro de horas interno de Coonic. El tiempo se guarda exacto al " +
        "segundo (horas decimales, sin redondeos). " +
        "Usa listar_catalogo para resolver nombres de clientes/proyectos. " +
        "La celda es persona+proyecto+tarea+día: la tarea (opcional) permite " +
        "varias líneas del mismo proyecto. apuntar_horas FIJA la celda salvo " +
        "sumar=true. resumen_horas es solo para admins.",
    });
  }

  if (metodo === "ping") {
    return rpcResultado(id, {});
  }

  if (metodo === "tools/list") {
    return rpcResultado(id, { tools: HERRAMIENTAS });
  }

  if (metodo === "tools/call") {
    const nombre = peticion.params?.name ?? "";
    const args = peticion.params?.arguments ?? {};
    try {
      const texto = await ejecutarHerramienta(nombre, args, clave);
      return rpcResultado(id, {
        content: [{ type: "text", text: texto }],
        isError: false,
      });
    } catch (e) {
      const mensaje =
        e instanceof Error ? e.message : "Error inesperado";
      return rpcResultado(id, {
        content: [{ type: "text", text: mensaje }],
        isError: true,
      });
    }
  }

  return rpcError(id, -32601, `Método no soportado: ${metodo}`);
}

export function GET() {
  // Sin flujo SSE: servidor sin estado, solo POST.
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
