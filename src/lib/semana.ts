// Utilidades de semana para la rejilla "Mi semana".
// Todas las fechas se manejan como cadenas ISO `YYYY-MM-DD` en hora local
// (sin Date UTC de por medio) para evitar sorpresas de zona horaria.

export const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"] as const;

export const NOMBRES_DIA = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
] as const;

const MESES_CORTOS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

/** Convierte un Date local a `YYYY-MM-DD`. */
export function aIso(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Convierte `YYYY-MM-DD` a Date local (mediodía, inmune a DST). */
export function deIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

/** Lunes de la semana a la que pertenece la fecha dada. */
export function lunesDe(fecha: Date): string {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12);
  const dia = d.getDay(); // 0 = domingo
  const desplazamiento = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + desplazamiento);
  return aIso(d);
}

/** Lunes de la semana actual. */
export function lunesActual(): string {
  return lunesDe(new Date());
}

/** Suma semanas a un lunes ISO y devuelve el lunes resultante. */
export function sumarSemanas(lunesIso: string, semanas: number): string {
  const d = deIso(lunesIso);
  d.setDate(d.getDate() + semanas * 7);
  return aIso(d);
}

/** Los 7 días (ISO) de la semana que empieza en `lunesIso`, L→D. */
export function diasDeSemana(lunesIso: string): string[] {
  const base = deIso(lunesIso);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return aIso(d);
  });
}

/** ¿Es una fecha ISO `YYYY-MM-DD` válida? */
export function esFechaIso(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = deIso(valor);
  return !Number.isNaN(d.getTime()) && aIso(d) === valor;
}

/** ¿Es un lunes válido en ISO? (defensa para el parámetro de URL `?semana=`) */
export function esLunesIso(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = deIso(valor);
  return !Number.isNaN(d.getTime()) && aIso(d) === valor && d.getDay() === 1;
}

/** Etiqueta corta de un día: "15 jul". */
export function etiquetaDia(iso: string): string {
  const d = deIso(iso);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}

/** Etiqueta del rango de la semana: "14 – 20 jul 2026" o "28 jul – 3 ago 2026". */
export function etiquetaSemana(lunesIso: string): string {
  const lunes = deIso(lunesIso);
  const domingo = new Date(lunes);
  domingo.setDate(domingo.getDate() + 6);
  const finalDomingo = `${domingo.getDate()} ${MESES_CORTOS[domingo.getMonth()]} ${domingo.getFullYear()}`;
  if (lunes.getMonth() === domingo.getMonth()) {
    return `${lunes.getDate()} – ${finalDomingo}`;
  }
  return `${lunes.getDate()} ${MESES_CORTOS[lunes.getMonth()]} – ${finalDomingo}`;
}

/** Tope por celda: un día completo, en segundos. */
export const SEGUNDOS_DIA = 86400;

/**
 * Separador interno de las claves de línea/celda. Unidad de separación
 * ASCII: no es tecleable y `limpiarTarea` la filtra de toda entrada.
 * (El separador "|" anterior rompería con tareas de texto libre.)
 */
export const SEP_LINEA = "\u001f";

/** Clave estable de una línea (proyecto + tarea; "" = sin tarea). */
export function idLinea(proyectoId: string, tarea: string): string {
  return `${proyectoId}${SEP_LINEA}${tarea}`;
}

/**
 * Normaliza una tarea escrita por el usuario: sin caracteres de control
 * (incluido el separador interno), recortada y a lo sumo 120 caracteres —
 * el mismo límite que el check de la BD.
 */
export function limpiarTarea(texto: string): string {
  return texto.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120).trim();
}

/** Paso de los steppers móviles: 15 minutos. */
export const PASO_STEPPER_SEGUNDOS = 900;

/** Formatea una duración en segundos como reloj: 5445 → "1:30:45". */
export function formatearDuracion(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
}

/**
 * Horas decimales con coma para el CSV/Excel: 5400 → "1,5"; 1 → "0,000278".
 * Hasta 6 decimales, sin ceros de cola.
 */
export function formatearHorasDecimal(segundos: number): string {
  return (segundos / 3600)
    .toFixed(6)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "")
    .replace(".", ",");
}

/**
 * Interpreta la entrada de una celda y devuelve la duración en SEGUNDOS,
 * dentro de (0, 86400]. Acepta horas decimales ("7,5", "1.25", " 8 "),
 * reloj ("1:30", "1h30", "1h", "1:30:45") y minutos ("45m", "90min").
 * Devuelve:
 * - number  → segundos a guardar
 * - null    → celda vacía (borrar registro)
 * - "error" → entrada inválida
 */
export function interpretarDuracion(entrada: string): number | null | "error" {
  const limpia = entrada.trim().toLowerCase();
  if (limpia === "") return null;

  const relojSeg = limpia.match(/^(\d{1,2}):([0-5]?\d):([0-5]?\d)$/); // 1:30:45
  const reloj = limpia.match(/^(\d{1,2})[:h](?:([0-5]?\d))?$/); // 1:30, 1h30, 1h
  const soloMinutos = limpia.match(/^(\d{1,4})\s*m(?:in)?$/); // 45m, 90min

  let s: number;
  if (relojSeg) {
    s = Number(relojSeg[1]) * 3600 + Number(relojSeg[2]) * 60 + Number(relojSeg[3]);
  } else if (reloj) {
    s = Number(reloj[1]) * 3600 + (reloj[2] !== undefined ? Number(reloj[2]) : 0) * 60;
  } else if (soloMinutos) {
    s = Number(soloMinutos[1]) * 60;
  } else {
    const n = Number(limpia.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return "error";
    if (n === 0) return null;
    s = Math.round(n * 3600);
    if (s === 0) return "error"; // positivo pero por debajo de medio segundo
  }

  if (s === 0) return null;
  if (s > SEGUNDOS_DIA) return "error";
  return s;
}
