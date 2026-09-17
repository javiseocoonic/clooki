import { crearClienteServidor } from "@/lib/supabase/servidor";
import {
  consultarNotificaciones,
  type NotificacionVista,
} from "@/lib/notificaciones-consulta";

export type { NotificacionVista };

/**
 * Avisos de la persona para la campana de la cabecera (carga inicial en
 * servidor). null = la tabla aún no existe (019 sin ejecutar).
 */
export async function cargarNotificaciones(
  personaId: string,
): Promise<NotificacionVista[] | null> {
  const supabase = await crearClienteServidor();
  return consultarNotificaciones(supabase, personaId);
}
