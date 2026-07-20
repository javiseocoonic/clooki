// Constantes compartidas del Wordle semanal (fase Cuco). El motor y la
// verdad viven en la BD (migración 010, RPCs security definer); aquí solo
// lo que la UI necesita para dibujar el tablero y el teclado. La palabra
// del navegador NUNCA se conoce hasta que la partida termina.

import type { ColorPista } from "./tipos";

export const MAX_INTENTOS = 6;
export const LONGITUD_PALABRA = 5;

/** Teclado en pantalla (móvil): QWERTY español con Ñ. La última fila
 *  lleva las teclas de acción Enter y Borrar en los extremos. */
export const FILAS_TECLADO: readonly string[][] = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ñ"],
  ["Enter", "Z", "X", "C", "V", "B", "N", "M", "Borrar"],
];

/** Orden de prioridad de un color: verde gana a amarillo, y este a gris.
 *  Sirve para pintar cada tecla con el mejor estado ya conocido. */
export const RANGO_COLOR: Record<ColorPista, number> = {
  correcto: 3,
  presente: 2,
  ausente: 1,
};

/** ¿Es una letra jugable del teclado (A–Z o Ñ)? */
export function esLetra(tecla: string): boolean {
  return /^[A-ZÑ]$/.test(tecla);
}
