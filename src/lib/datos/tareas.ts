import { crearClienteServidor } from "@/lib/supabase/servidor";
import type {
  Cliente,
  Persona,
  Proyecto,
  SesionCronometro,
  Tarjeta,
} from "@/lib/tipos";

/** Días tras «hecha» antes de ocultarse del tablero (roadmap §7.2). */
export const DIAS_ARCHIVADO = 30;

export type TarjetaTablero = Tarjeta & {
  /** ids de personas asignadas; vacío = backlog del cliente. */
  asignados: string[];
};

export interface DatosTareas {
  persona: Persona;
  clientes: (Cliente & { proyectos: Proyecto[] })[];
  /** Equipo activo, para iniciales y para el selector de asignación. */
  equipo: Pick<Persona, "id" | "nombre">[];
  /** Ordenadas por posición dentro de su columna (empate: antigüedad). */
  tarjetas: TarjetaTablero[];
  /** Cronómetros activos de la persona (bandeja de la cabecera). */
  sesiones: SesionCronometro[];
}

/**
 * Carga del tablero /tareas (todo el equipo, no solo admin). Devuelve
 * null si el usuario no tiene fila activa en personas (la página
 * redirige). Excluye las tarjetas archivadas —hechas hace más de
 * DIAS_ARCHIVADO— salvo que se pidan («ver archivadas»); siguen en BD.
 */
export async function cargarTareas(
  incluirArchivadas = false,
): Promise<DatosTareas | null> {
  const supabase = await crearClienteServidor();

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

  // Los filtros van antes que .order() (exigencia de tipos de supabase-js).
  let consultaTarjetas = supabase.from("tarjetas").select("*");
  if (!incluirArchivadas) {
    const corte = new Date(
      Date.now() - DIAS_ARCHIVADO * 86_400_000,
    ).toISOString();
    // Archivada = hecha hace más de 30 días (hecha_en lo fija el trigger).
    consultaTarjetas = consultaTarjetas.or(
      `estado.neq.hecha,hecha_en.gte.${corte}`,
    );
  }

  const [
    clientesRes,
    proyectosRes,
    equipoRes,
    tarjetasRes,
    asignacionesRes,
    sesionesRes,
  ] = await Promise.all([
    supabase.from("clientes").select("*").eq("activo", true).order("nombre"),
    supabase.from("proyectos").select("*").eq("activo", true).order("nombre"),
    supabase
      .from("personas")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre"),
    consultaTarjetas.order("posicion").order("creada_en"),
    supabase.from("tarjeta_asignaciones").select("*"),
    supabase
      .from("cronometros")
      .select("*")
      .eq("persona_id", persona.id)
      .is("fin", null),
  ]);

  const proyectos = proyectosRes.data ?? [];

  const asignadosPorTarjeta = new Map<string, string[]>();
  for (const a of asignacionesRes.data ?? []) {
    const lista = asignadosPorTarjeta.get(a.tarjeta_id);
    if (lista) lista.push(a.persona_id);
    else asignadosPorTarjeta.set(a.tarjeta_id, [a.persona_id]);
  }

  return {
    persona,
    clientes: (clientesRes.data ?? []).map((c) => ({
      ...c,
      proyectos: proyectos.filter((p) => p.cliente_id === c.id),
    })),
    equipo: equipoRes.data ?? [],
    tarjetas: (tarjetasRes.data ?? []).map((t) => ({
      ...t,
      asignados: asignadosPorTarjeta.get(t.id) ?? [],
    })),
    sesiones: sesionesRes.data ?? [],
  };
}
