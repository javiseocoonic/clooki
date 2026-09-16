import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { Notificacion } from "@/lib/tipos";

/** Aviso con lo que hace falta para pintarlo: título y quién lo provocó. */
export type NotificacionVista = Notificacion & {
  titulo: string;
  origen: string;
  /** Primeras palabras del comentario (solo menciones). */
  extracto: string | null;
};

/** Cuántos avisos recientes se cargan en la campana. */
const LIMITE = 40;

/**
 * Avisos de la persona para la campana de la cabecera. Devuelve null si
 * la tabla aún no existe (migración 019 sin ejecutar): la campana no se
 * muestra. Solo lee las propias (RLS).
 */
export async function cargarNotificaciones(
  personaId: string,
): Promise<NotificacionVista[] | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("persona_id", personaId)
    .order("creada_en", { ascending: false })
    .limit(LIMITE);
  if (error) return null;
  const avisos = data ?? [];
  if (avisos.length === 0) return [];

  const idsTarjeta = [...new Set(avisos.map((n) => n.tarjeta_id))];
  const idsPersona = [
    ...new Set(avisos.map((n) => n.origen_id).filter((x): x is string => !!x)),
  ];
  const idsComentario = avisos
    .map((n) => n.comentario_id)
    .filter((x): x is string => !!x);

  const [tarjetasRes, personasRes, comentariosRes] = await Promise.all([
    supabase.from("tarjetas").select("id, titulo").in("id", idsTarjeta),
    idsPersona.length
      ? supabase.from("personas").select("id, nombre").in("id", idsPersona)
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    idsComentario.length
      ? supabase
          .from("tarjeta_comentarios")
          .select("id, texto")
          .in("id", idsComentario)
      : Promise.resolve({ data: [] as { id: string; texto: string }[] }),
  ]);

  const titulo = new Map((tarjetasRes.data ?? []).map((t) => [t.id, t.titulo]));
  const nombre = new Map((personasRes.data ?? []).map((p) => [p.id, p.nombre]));
  const texto = new Map((comentariosRes.data ?? []).map((c) => [c.id, c.texto]));

  return avisos
    // Tarjeta borrada entre medias: sin título no hay a dónde ir.
    .filter((n) => titulo.has(n.tarjeta_id))
    .map((n) => ({
      ...n,
      titulo: titulo.get(n.tarjeta_id) ?? "",
      origen: (n.origen_id && nombre.get(n.origen_id)) || "Alguien",
      extracto: n.comentario_id
        ? (texto.get(n.comentario_id) ?? "").replace(/\s+/g, " ").slice(0, 90)
        : null,
    }));
}
