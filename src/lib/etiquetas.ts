// Etiquetas de prioridad de las tarjetas. Las mismas cinco que usaba el
// equipo en Trello, más «sin etiqueta». El orden del array es el orden
// de apilado dentro de cada columna del tablero: urgentes arriba,
// pausadas abajo (decisión Javi, 16 sep 2026).
//
// DÓNDE VIVE: sin columna propia (no hay migración ejecutable de
// momento), la etiqueta se guarda como una marca al final de la
// descripción, «[etiqueta:mediana]», que la app lee y oculta. `urgente`
// (booleano real de la tabla) se mantiene sincronizado para los filtros
// y contadores que lo leen. La migración 020 traslada la marca a una
// columna cuando se ejecute.

export type Etiqueta =
  | "urgente"
  | "mediana"
  | "ninguna"
  | "no_urgente"
  | "pendiente_aprobacion"
  | "pausado";

export const ETIQUETAS: readonly {
  clave: Etiqueta;
  texto: string;
  /** Chip bien visible (fondo sólido) — colores pedidos por Javi. */
  chip: string;
}[] = [
  { clave: "urgente", texto: "Urgente", chip: "bg-red-600 text-white" },
  {
    clave: "mediana",
    texto: "Mediana importancia",
    chip: "bg-yellow-400 text-yellow-950",
  },
  { clave: "ninguna", texto: "Sin etiqueta", chip: "" },
  {
    clave: "no_urgente",
    texto: "No es emergencia",
    chip: "bg-green-600 text-white",
  },
  {
    clave: "pendiente_aprobacion",
    texto: "Pendiente aprobación",
    chip: "bg-purple-500 text-white",
  },
  {
    clave: "pausado",
    texto: "Pausado hasta aviso",
    chip: "bg-pink-500 text-white",
  },
];

export const ETIQUETA_POR_CLAVE: ReadonlyMap<Etiqueta, (typeof ETIQUETAS)[number]> =
  new Map(ETIQUETAS.map((e) => [e.clave, e]));

/** Peso de orden (0 = arriba). */
export function pesoEtiqueta(e: Etiqueta | null | undefined): number {
  const i = ETIQUETAS.findIndex((x) => x.clave === (e ?? "ninguna"));
  return i === -1 ? ETIQUETAS.findIndex((x) => x.clave === "ninguna") : i;
}

/** Marca al final de la descripción: última línea «[etiqueta:clave]». */
const MARCA =
  /\s*\[etiqueta:(urgente|mediana|no_urgente|pendiente_aprobacion|pausado)\]\s*$/;

/** Etiqueta efectiva de una tarjeta: la marca de la descripción; si no
 *  hay, el booleano `urgente`. */
export function etiquetaDe(t: {
  descripcion: string | null;
  urgente: boolean;
}): Etiqueta {
  const m = t.descripcion?.match(MARCA);
  if (m) return m[1] as Etiqueta;
  return t.urgente ? "urgente" : "ninguna";
}

/** Descripción tal como se enseña: sin la marca. */
export function descripcionSinMarca(descripcion: string | null): string {
  return (descripcion ?? "").replace(MARCA, "").trimEnd();
}

/** Descripción a guardar: texto limpio + marca (si hay etiqueta). */
export function descripcionConMarca(
  descripcion: string,
  etiqueta: Etiqueta,
): string | null {
  const limpia = descripcionSinMarca(descripcion).trim();
  if (etiqueta === "ninguna") return limpia || null;
  return `${limpia}${limpia ? "\n\n" : ""}[etiqueta:${etiqueta}]`;
}
