import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { Persona, Vacacion } from "@/lib/tipos";

/** Cupo anual: 22 días laborables por año natural (espejo del trigger 018). */
export const DIAS_VACACIONES_ANIO = 22;

export interface DatosMisVacaciones {
  persona: Persona;
  /** Todos los periodos de la persona, del más reciente al más antiguo. */
  vacaciones: Vacacion[];
}

/** Carga la pestaña «Mis vacaciones». Null si no hay persona activa. */
export async function cargarMisVacaciones(): Promise<DatosMisVacaciones | null> {
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

  const { data } = await supabase
    .from("vacaciones")
    .select("*")
    .eq("persona_id", persona.id)
    .order("desde", { ascending: false });

  return { persona, vacaciones: data ?? [] };
}
