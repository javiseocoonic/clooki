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

/** Paso mínimo de horas (cuartos de hora). */
export const PASO_HORAS = 0.25;

/** Redondea al múltiplo de 0,25 más cercano (empates hacia arriba). */
export function redondearAPaso(horas: number): number {
  return Math.round(horas * 4) / 4;
}

/** Formatea horas para mostrar: 7.5 → "7,5"; 1.25 → "1,25"; 8 → "8". */
export function formatearHoras(horas: number): string {
  return redondearAPaso(horas).toString().replace(".", ",");
}

/**
 * Interpreta la entrada de una celda y la normaliza a pasos de 0,25
 * dentro de (0, 24]. Acepta decimales ("7,5", "1.25", " 8 ") y formatos
 * de reloj ("1:30", "1h30", "1h", "45m"). Devuelve:
 * - number  → valor válido a guardar
 * - null    → celda vacía (borrar registro)
 * - "error" → entrada inválida
 */
export function interpretarHoras(entrada: string): number | null | "error" {
  const limpia = entrada.trim().toLowerCase();
  if (limpia === "") return null;

  let n: number;
  const reloj = limpia.match(/^(\d{1,2})[:h](?:([0-5]?\d))?$/); // 1:30, 1h30, 1h
  const soloMinutos = limpia.match(/^(\d{1,4})\s*m(?:in)?$/); // 45m, 90min
  if (reloj) {
    n = Number(reloj[1]) + (reloj[2] !== undefined ? Number(reloj[2]) : 0) / 60;
  } else if (soloMinutos) {
    n = Number(soloMinutos[1]) / 60;
  } else {
    n = Number(limpia.replace(",", "."));
    if (!Number.isFinite(n)) return "error";
  }

  if (n < 0) return "error";
  if (n === 0) return null;
  const redondeada = redondearAPaso(n);
  if (redondeada === 0 || redondeada > 24) return "error";
  return redondeada;
}
