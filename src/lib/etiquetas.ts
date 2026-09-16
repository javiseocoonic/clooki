// Etiquetas de prioridad de las tarjetas (migración 020). Las mismas
// cinco que usaba el equipo en Trello, más «sin etiqueta». El orden del
// array es el orden de apilado dentro de cada columna del tablero:
// urgentes arriba, pausadas abajo (decisión Javi, 16 sep 2026).

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

/** Etiqueta efectiva de una tarjeta: si la columna aún no existe en la
 *  BD (020 sin ejecutar), se deriva del booleano `urgente`. */
export function etiquetaDe(t: {
  etiqueta?: Etiqueta | null;
  urgente: boolean;
}): Etiqueta {
  return t.etiqueta ?? (t.urgente ? "urgente" : "ninguna");
}
