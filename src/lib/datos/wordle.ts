import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoWordle } from "@/lib/tipos";

/**
 * Estado inicial del Wordle de la semana actual para el usuario (fase
 * Cuco, W·3). Lo resuelve la RPC `wordle_estado` (security definer):
 * ¿L–V completos?, intentos con colores, y la palabra solo si la partida
 * terminó. Devuelve null si la RPC falla (la página lo trata con suavidad).
 */
export async function cargarEstadoWordle(): Promise<EstadoWordle | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("wordle_estado");
  if (error || !data) return null;
  return data as EstadoWordle;
}
