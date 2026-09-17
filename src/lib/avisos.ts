import type { crearClienteNavegador } from "@/lib/supabase/navegador";
import type { TarjetaComentario } from "@/lib/tipos";

/** Prefijo del comentario automático «tarea hecha»; la campana lo
 *  reconoce para pintar el aviso como «X ha terminado «tarea»». */
export const PREFIJO_HECHA = "✅";

/** Prefijo del comentario automático «tarea reabierta» (de hecha a
 *  pendiente o en curso); la campana lo pinta como «X ha reabierto». */
export const PREFIJO_REABIERTA = "↩️";

/**
 * Aviso a las personas asignadas cuando alguien devuelve una tarjeta
 * hecha a pendiente o en curso. Mismo mecanismo: comentario automático
 * con menciones. No se avisa a quien la reabre.
 */
export async function avisarReabierta(
  supabase: ReturnType<typeof crearClienteNavegador>,
  tarjeta: { id: string; titulo: string },
  asignados: { id: string; nombre: string }[],
  estadoNuevo: "pendiente" | "en_curso",
  personaId: string,
): Promise<TarjetaComentario | null> {
  const destinatarias = asignados.filter((p) => p.id !== personaId);
  if (destinatarias.length === 0) return null;
  const etiqueta = estadoNuevo === "en_curso" ? "En curso" : "Pendiente";
  const { data } = await supabase
    .from("tarjeta_comentarios")
    .insert({
      tarjeta_id: tarjeta.id,
      persona_id: personaId,
      texto: `${PREFIJO_REABIERTA} «${tarjeta.titulo}» vuelve a ${etiqueta}. ${destinatarias
        .map((p) => `@${p.nombre}`)
        .join(" ")} revisadla.`,
      menciones: destinatarias.map((p) => p.id),
    })
    .select()
    .single();
  return data ?? null;
}

/**
 * Aviso al creador cuando OTRA persona marca su tarjeta como hecha.
 * Los avisos los genera la BD al insertar comentarios con menciones, así
 * que se deja un comentario automático mencionando al creador; queda
 * además como rastro en el hilo. Devuelve el comentario creado, o null
 * si no procede (la marca el propio creador) o si el hilo no existe.
 */
export async function avisarHecha(
  supabase: ReturnType<typeof crearClienteNavegador>,
  tarjeta: { id: string; titulo: string; creada_por: string; creador: string },
  personaId: string,
): Promise<TarjetaComentario | null> {
  if (tarjeta.creada_por === personaId) return null;
  const { data } = await supabase
    .from("tarjeta_comentarios")
    .insert({
      tarjeta_id: tarjeta.id,
      persona_id: personaId,
      texto: `${PREFIJO_HECHA} «${tarjeta.titulo}» está hecha. @${tarjeta.creador} revísala.`,
      menciones: [tarjeta.creada_por],
    })
    .select()
    .single();
  return data ?? null;
}
