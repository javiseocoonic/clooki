import { crearClienteServidor } from "@/lib/supabase/servidor";
// idLinea vive en semana.ts (módulo neutro): este archivo importa código
// solo-servidor y los componentes cliente no pueden tirar de él.
import { diasDeSemana, idLinea, sumarSemanas } from "@/lib/semana";
import type {
  Cliente,
  Persona,
  Proyecto,
  RegistroHoras,
  SesionCronometro,
  Tarjeta,
} from "@/lib/tipos";

/** Semanas hacia atrás que se miran para "recordar" las líneas de trabajo. */
const SEMANAS_RECORDADAS = 6;

export interface ProyectoConCliente extends Proyecto {
  cliente: Cliente;
}

/**
 * Una línea de la rejilla: proyecto + tarea ("" = sin tarea). Puede haber
 * varias líneas del mismo proyecto con tareas distintas.
 */
export interface LineaSemana extends ProyectoConCliente {
  tarea: string;
}

/** Tarjeta del tablero asignada a la persona (puente «Mis tareas», T·3). */
export type TarjetaMia = Pick<
  Tarjeta,
  "id" | "titulo" | "proyecto_id" | "estado" | "posicion"
>;

export interface DatosMiSemana {
  persona: Persona;
  /** Clientes activos con sus proyectos activos, para "+ Añadir línea". */
  clientes: (Cliente & { proyectos: Proyecto[] })[];
  /**
   * Líneas de la rejilla: pares proyecto+tarea con horas esta semana o en
   * las últimas SEMANAS_RECORDADAS semanas, orden estable por cliente,
   * proyecto y tarea (la línea sin tarea primero).
   */
  lineas: LineaSemana[];
  /** Registros de la semana visible (celdas con valor). */
  horas: RegistroHoras[];
  /**
   * Días laborables (L–V) de la semana ANTERIOR a la visible sin ningún
   * registro. Alimenta el aviso de semana incompleta (brief §14.1); la
   * página solo lo muestra cuando la semana visible es la actual.
   */
  diasSinHorasSemanaAnterior: number;
  /** Sesiones de cronómetro activas de la persona (fin = null). */
  sesiones: SesionCronometro[];
  /**
   * Ids de clientes en los que la persona apuntó horas recientemente
   * (semana visible + últimas SEMANAS_RECORDADAS), del más reciente al
   * más antiguo. Alimenta el grupo "Recientes" del selector de cliente.
   */
  clientesRecientes: string[];
  /** Tarjetas pendientes/en curso asignadas a la persona («Mis tareas»). */
  misTarjetas: TarjetaMia[];
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

  const [
    clientesRes,
    proyectosRes,
    horasRes,
    recientesRes,
    sesionesRes,
    tarjetasRes,
    asignacionesRes,
  ] = await Promise.all([
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
      .select("proyecto_id, fecha, tarea")
      .eq("persona_id", persona.id)
      .gte("fecha", desdeRecordado)
      .lt("fecha", dias[0]),
    supabase
      .from("cronometros")
      .select("*")
      .eq("persona_id", persona.id)
      .is("fin", null),
    // «Mis tareas»: dos consultas en paralelo (todas las no-hechas + mis
    // asignaciones) y el cruce en memoria — evita un round-trip secuencial.
    supabase
      .from("tarjetas")
      .select("id, titulo, proyecto_id, estado, posicion")
      .neq("estado", "hecha"),
    supabase
      .from("tarjeta_asignaciones")
      .select("tarjeta_id")
      .eq("persona_id", persona.id),
  ]);

  const clientes = clientesRes.data ?? [];
  const proyectos = proyectosRes.data ?? [];
  const horas = horasRes.data ?? [];
  const recientes = recientesRes.data ?? [];
  const sesiones = sesionesRes.data ?? [];

  const clientesPorId = new Map(clientes.map((c) => [c.id, c]));
  const proyectosPorId = new Map(proyectos.map((p) => [p.id, p]));

  // Líneas = pares proyecto+tarea con horas esta semana ∪ con horas
  // recientes ∪ con cronómetro activo (una sesión en marcha aún no tiene
  // horas volcadas, pero su línea debe verse al recargar — brief §11.3.e).
  const paresLinea = new Map<string, { proyectoId: string; tarea: string }>();
  for (const f of [...horas, ...recientes, ...sesiones]) {
    const proyectoId = f.proyecto_id;
    const tarea = f.tarea;
    paresLinea.set(idLinea(proyectoId, tarea), { proyectoId, tarea });
  }

  const lineas: LineaSemana[] = [...paresLinea.values()]
    .map(({ proyectoId, tarea }) => {
      const p = proyectosPorId.get(proyectoId);
      if (!p) return null;
      const cliente = clientesPorId.get(p.cliente_id);
      if (!cliente) return null;
      return { ...p, cliente, tarea };
    })
    .filter((l): l is LineaSemana => l !== null)
    .sort(
      (a, b) =>
        a.cliente.nombre.localeCompare(b.cliente.nombre, "es") ||
        a.nombre.localeCompare(b.nombre, "es") ||
        a.tarea.localeCompare(b.tarea, "es"),
    );

  // Clientes recientes de la persona: última fecha con horas por cliente.
  const ultimaFechaPorCliente = new Map<string, string>();
  for (const r of [...horas, ...recientes]) {
    const clienteId = proyectosPorId.get(r.proyecto_id)?.cliente_id;
    if (!clienteId) continue;
    const previa = ultimaFechaPorCliente.get(clienteId);
    if (!previa || r.fecha > previa) ultimaFechaPorCliente.set(clienteId, r.fecha);
  }
  const clientesRecientes = [...ultimaFechaPorCliente.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([id]) => id);

  // Días L–V de la semana anterior sin ningún registro (aviso §14.1).
  const diasSemanaAnterior = diasDeSemana(sumarSemanas(lunesIso, -1)).slice(
    0,
    5,
  );
  const fechasConHoras = new Set(recientes.map((r) => r.fecha));
  const diasSinHorasSemanaAnterior = diasSemanaAnterior.filter(
    (d) => !fechasConHoras.has(d),
  ).length;

  const misIds = new Set(
    (asignacionesRes.data ?? []).map((a) => a.tarjeta_id),
  );
  const misTarjetas = (tarjetasRes.data ?? []).filter((t) =>
    misIds.has(t.id),
  );

  return {
    persona,
    clientes: clientes.map((c) => ({
      ...c,
      proyectos: proyectos.filter((p) => p.cliente_id === c.id && p.activo),
    })),
    lineas,
    horas,
    diasSinHorasSemanaAnterior,
    sesiones,
    clientesRecientes,
    misTarjetas,
  };
}
