import type { Equipo } from "./tipos";

/**
 * Equipos de trabajo de Coonic (decisión del cliente, jul 2026). Lista
 * cerrada: la clave vive en el check de persona_equipos (migración 008)
 * y aquí su orden y nombre visible. Añadir uno = migración + esta lista.
 */
export const EQUIPOS: readonly Equipo[] = [
  "contenidos_rrss",
  "diseno",
  "audiovisual",
  "desarrollo",
  "practicas",
];

export const NOMBRE_EQUIPO: Record<Equipo, string> = {
  contenidos_rrss: "Contenidos y RRSS",
  diseno: "Diseño",
  audiovisual: "Audiovisual",
  desarrollo: "Desarrollo",
  practicas: "Prácticas",
};

/** Valida la clave de equipo que llega de un formulario o de la URL. */
export function esEquipo(valor: string): valor is Equipo {
  return (EQUIPOS as readonly string[]).includes(valor);
}
