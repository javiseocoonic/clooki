import { crearClienteServidor } from "@/lib/supabase/servidor";
import type {
  Cliente,
  Persona,
  Proyecto,
  SesionCronometro,
} from "@/lib/tipos";

/** Nombre del cliente-cajón de trabajo no imputable (brief §14.2). */
export const CLIENTE_INTERNO = "Coonic (interno)";

/** Registro de horas con las columnas que usa el Resumen. */
export interface FilaHoras {
  persona_id: string;
  proyecto_id: string;
  fecha: string;
  horas: number;
  nota: string | null;
  actualizado_en: string;
}

export interface DatosAdmin {
  persona: Persona;
  personas: Persona[];
  clientes: Cliente[];
  proyectos: Proyecto[];
  sesiones: SesionCronometro[];
}

/**
 * Carga base de las pantallas admin. Devuelve null si el usuario no tiene
 * fila activa en personas o no es admin (la página redirige).
 */
export async function cargarAdmin(): Promise<DatosAdmin | null> {
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
  if (!persona || persona.rol !== "admin") return null;

  const [personasRes, clientesRes, proyectosRes, sesionesRes] =
    await Promise.all([
      supabase.from("personas").select("*").order("nombre"),
      supabase.from("clientes").select("*").order("nombre"),
      supabase.from("proyectos").select("*").order("nombre"),
      supabase
        .from("cronometros")
        .select("*")
        .eq("persona_id", persona.id)
        .is("fin", null),
    ]);

  return {
    persona,
    personas: personasRes.data ?? [],
    clientes: clientesRes.data ?? [],
    proyectos: proyectosRes.data ?? [],
    sesiones: sesionesRes.data ?? [],
  };
}

/** Horas de todas las personas en un rango (admin ve todo vía RLS). */
export async function cargarHorasRango(
  desde: string,
  hasta: string,
): Promise<FilaHoras[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("horas")
    .select("persona_id, proyecto_id, fecha, horas, nota, actualizado_en")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .range(0, 49999); // por encima del límite por defecto de 1000 filas
  return data ?? [];
}
