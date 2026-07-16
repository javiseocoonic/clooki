"use server";

// Entrada por lenguaje natural (ROADMAP fase IA·3): interpreta una frase
// ("ayer 3h en Viamed rrss y 2 en Capitalidad contenidos") y devuelve
// propuestas de celdas para CONFIRMAR — la IA propone, la persona decide.
// La identidad viene de la sesión de Clooki: sin cuentas de Claude ni
// tokens por usuario (clave de empresa ANTHROPIC_API_KEY en el servidor).

import Anthropic from "@anthropic-ai/sdk";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { esFechaIso, redondearAPaso } from "@/lib/semana";

export interface PropuestaHoras {
  proyecto_id: string;
  cliente: string;
  proyecto: string;
  /** YYYY-MM-DD */
  fecha: string;
  /** Pasos de 0,25, (0, 24] */
  horas: number;
  /** true = sumar sobre lo existente; false = fijar la celda */
  sumar: boolean;
  nota: string | null;
}

export interface ResultadoInterpretacion {
  propuestas: PropuestaHoras[];
  avisos: string[];
  error: string | null;
}

const ESQUEMA_SALIDA = {
  type: "object" as const,
  properties: {
    propuestas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          proyecto_id: { type: "string" },
          fecha: { type: "string", description: "YYYY-MM-DD" },
          horas: { type: "number" },
          sumar: { type: "boolean" },
          nota: { type: "string" },
        },
        required: ["proyecto_id", "fecha", "horas", "sumar"],
        additionalProperties: false,
      },
    },
    avisos: {
      type: "array",
      items: { type: "string" },
      description: "Partes de la frase que no se pudieron interpretar y por qué",
    },
  },
  required: ["propuestas", "avisos"],
  additionalProperties: false,
};

function hoyMadrid(): { fecha: string; diaSemana: string } {
  const ahora = new Date();
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(ahora);
  const diaSemana = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
  }).format(ahora);
  return { fecha, diaSemana };
}

export async function interpretarFrase(
  frase: string,
): Promise<ResultadoInterpretacion> {
  const texto = frase.trim();
  if (texto.length < 3 || texto.length > 500) {
    return { propuestas: [], avisos: [], error: "Escribe una frase con tus horas." };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      propuestas: [],
      avisos: [],
      error:
        "Falta configurar la clave de la API de Anthropic en el servidor (ANTHROPIC_API_KEY).",
    };
  }

  // Identidad + catálogo por la sesión (RLS: solo clientes/proyectos activos).
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { propuestas: [], avisos: [], error: "Sesión caducada. Vuelve a entrar." };
  }

  const [clientesRes, proyectosRes] = await Promise.all([
    supabase.from("clientes").select("id, nombre").eq("activo", true),
    supabase.from("proyectos").select("id, cliente_id, nombre").eq("activo", true),
  ]);
  const clientesPorId = new Map(
    (clientesRes.data ?? []).map((c) => [c.id, c.nombre]),
  );
  const proyectos = (proyectosRes.data ?? []).filter((p) =>
    clientesPorId.has(p.cliente_id),
  );
  if (proyectos.length === 0) {
    return { propuestas: [], avisos: [], error: "No hay proyectos activos." };
  }

  const catalogo = proyectos
    .map((p) => `${p.id} | ${clientesPorId.get(p.cliente_id)} — ${p.nombre}`)
    .join("\n");
  const { fecha: hoy, diaSemana } = hoyMadrid();

  const sistema = `Eres el intérprete de partes de horas de Clooki (agencia Coonic).
Convierte la frase del usuario en propuestas de registro de horas.

Hoy es ${diaSemana} ${hoy} (zona Europe/Madrid).

CATÁLOGO (proyecto_id | Cliente — Proyecto). Usa EXACTAMENTE estos ids:
${catalogo}

REGLAS:
- Fechas: resuelve expresiones relativas a hoy ("hoy", "ayer", "anteayer",
  "el lunes" = el más reciente pasado o hoy). Sin mención de fecha → hoy.
- Horas en pasos de 0,25: "media hora"=0.5, "hora y media"=1.5, "1:30"=1.5,
  "un cuarto de hora"=0.25. Acepta coma decimal.
- Nombres de cliente/proyecto aproximados e insensibles a acentos. Si un
  nombre encaja con varios candidatos o con ninguno, NO propongas esa parte:
  añade un aviso breve explicándolo (con los candidatos si los hay).
- sumar=true solo si el usuario dice añadir/sumar/más sobre lo que ya hay;
  en caso contrario sumar=false (fijar el valor de la celda).
- nota: solo si el usuario describe la tarea concreta.
- Nunca inventes clientes, proyectos ni cantidades no mencionadas.`;

  const anthropic = new Anthropic();
  let bruto: unknown;
  try {
    const respuesta = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      system: sistema,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: ESQUEMA_SALIDA },
      },
      messages: [{ role: "user", content: texto }],
    });
    if (respuesta.stop_reason !== "end_turn") {
      return {
        propuestas: [],
        avisos: [],
        error: "No se pudo interpretar la frase. Prueba a reformularla.",
      };
    }
    const bloqueTexto = respuesta.content.find((b) => b.type === "text");
    bruto = bloqueTexto ? JSON.parse(bloqueTexto.text) : null;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return { propuestas: [], avisos: [], error: "La ANTHROPIC_API_KEY del servidor no es válida." };
    }
    if (e instanceof Anthropic.RateLimitError) {
      return { propuestas: [], avisos: [], error: "Demasiadas peticiones seguidas. Espera unos segundos." };
    }
    return { propuestas: [], avisos: [], error: "El intérprete no está disponible ahora mismo. Inténtalo de nuevo." };
  }

  // Validación servidor: nada entra sin pasar las mismas reglas que a mano.
  const datos = bruto as {
    propuestas?: {
      proyecto_id?: string;
      fecha?: string;
      horas?: number;
      sumar?: boolean;
      nota?: string;
    }[];
    avisos?: string[];
  } | null;
  const avisos = (datos?.avisos ?? []).slice(0, 6).map(String);
  const proyectosPorId = new Map(proyectos.map((p) => [p.id, p]));
  const margenMs = 60 * 86400000;
  const propuestas: PropuestaHoras[] = [];

  for (const p of datos?.propuestas ?? []) {
    const proyecto = p.proyecto_id ? proyectosPorId.get(p.proyecto_id) : undefined;
    if (!proyecto) {
      avisos.push("Se descartó una propuesta con un proyecto no reconocido.");
      continue;
    }
    if (!p.fecha || !esFechaIso(p.fecha)) {
      avisos.push(`Se descartó una propuesta con fecha inválida (${proyecto.nombre}).`);
      continue;
    }
    const distancia = Math.abs(new Date(p.fecha).getTime() - new Date(hoy).getTime());
    if (distancia > margenMs) {
      avisos.push(`Se descartó ${proyecto.nombre}: la fecha ${p.fecha} está demasiado lejos.`);
      continue;
    }
    const horas = redondearAPaso(Number(p.horas));
    if (!Number.isFinite(horas) || horas <= 0 || horas > 24) {
      avisos.push(`Se descartó ${proyecto.nombre}: horas fuera de rango.`);
      continue;
    }
    propuestas.push({
      proyecto_id: proyecto.id,
      cliente: clientesPorId.get(proyecto.cliente_id) ?? "",
      proyecto: proyecto.nombre,
      fecha: p.fecha,
      horas,
      sumar: p.sumar === true,
      nota: typeof p.nota === "string" && p.nota.trim() ? p.nota.trim() : null,
    });
    if (propuestas.length >= 12) break;
  }

  if (propuestas.length === 0 && avisos.length === 0) {
    avisos.push("No se encontró nada que apuntar en la frase.");
  }
  return { propuestas, avisos, error: null };
}
