import { crearClienteServidor } from "@/lib/supabase/servidor";
import { diasDeSemana, sumarSemanas } from "@/lib/semana";
import type { Cliente, Persona, Proyecto, RegistroHoras } from "@/lib/tipos";

/** Semanas hacia atrás que se miran para "recordar" las líneas de trabajo. */
const SEMANAS_RECORDADAS = 6;

export interface ProyectoConCliente extends Proyecto {
  cliente: Cliente;
}

export interface DatosMiSemana {
  persona: Persona;
  /** Clientes activos con sus proyectos activos, para "+ Añadir línea". */
  clientes: (Cliente & { proyectos: Proyecto[] })[];
  /**
   * Líneas de la rejilla: proyectos con horas esta semana o en las últimas
   * SEMANAS_RECORDADAS semanas, orden estable por cliente y proyecto.
   */
  lineas: ProyectoConCliente[];
  /** Registros de la semana visible (celdas con valor). */
  horas: RegistroHoras[];
}

/**
 * Carga todo lo que necesita la rejilla de una semana.
 * @param lunesIso lunes de la semana visible, `YYYY-MM-DD`
 */
export async function cargarMiSemana(
  lunesIso: string,
): Promise<DatosMiSemana | null> {
  const supabase = await crearClienteServidor();

  // RLS: un miembro solo ve su propia fila (los admin ven todas,
  // así que filtramos por el email del usuario autenticado).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data: persona } = await supabase
    .from("personas")
    .select("*")
    .eq("email", user.email.toLowerCase())
    .eq("activo", true)
    .maybeSingle();
  if (!persona) return null;

  const dias = diasDeSemana(lunesIso);
  const desdeRecordado = sumarSemanas(lunesIso, -SEMANAS_RECORDADAS);

  const [clientesRes, proyectosRes, horasRes, recientesRes] =
    await Promise.all([
      supabase.from("clientes").select("*").eq("activo", true).order("nombre"),
      supabase.from("proyectos").select("*").order("nombre"),
      supabase
        .from("horas")
        .select("*")
        .eq("persona_id", persona.id)
        .gte("fecha", dias[0])
        .lte("fecha", dias[6]),
      supabase
        .from("horas")
        .select("proyecto_id")
        .eq("persona_id", persona.id)
        .gte("fecha", desdeRecordado)
        .lt("fecha", dias[0]),
    ]);

  const clientes = clientesRes.data ?? [];
  const proyectos = proyectosRes.data ?? [];
  const horas = horasRes.data ?? [];
  const recientes = recientesRes.data ?? [];

  const clientesPorId = new Map(clientes.map((c) => [c.id, c]));
  const proyectosPorId = new Map(proyectos.map((p) => [p.id, p]));

  // Líneas = proyectos con horas esta semana ∪ proyectos con horas recientes.
  const idsLineas = new Set<string>([
    ...horas.map((h) => h.proyecto_id),
    ...recientes.map((r) => r.proyecto_id),
  ]);

  const lineas: ProyectoConCliente[] = [...idsLineas]
    .map((id) => proyectosPorId.get(id))
    .filter((p): p is Proyecto => Boolean(p))
    .map((p) => ({ ...p, cliente: clientesPorId.get(p.cliente_id) }))
    .filter((p): p is ProyectoConCliente => Boolean(p.cliente))
    .sort(
      (a, b) =>
        a.cliente.nombre.localeCompare(b.cliente.nombre, "es") ||
        a.nombre.localeCompare(b.nombre, "es"),
    );

  return {
    persona,
    clientes: clientes.map((c) => ({
      ...c,
      proyectos: proyectos.filter((p) => p.cliente_id === c.id && p.activo),
    })),
    lineas,
    horas,
  };
}
