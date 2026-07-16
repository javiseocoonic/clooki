import { aIso, deIso, esFechaIso, lunesActual, sumarSemanas } from "@/lib/semana";

export interface Rango {
  tipo: "semana" | "mes" | "libre";
  desde: string;
  hasta: string;
}

/** Resuelve el rango del Resumen desde los parámetros de URL. */
export function resolverRango(params: {
  [clave: string]: string | string[] | undefined;
}): Rango {
  const r = typeof params.r === "string" ? params.r : "";
  const desde = typeof params.desde === "string" ? params.desde : "";
  const hasta = typeof params.hasta === "string" ? params.hasta : "";

  if (r === "semana") {
    const lunes = lunesActual();
    return {
      tipo: "semana",
      desde: lunes,
      hasta: aIso(new Date(deIso(sumarSemanas(lunes, 1)).getTime() - 86400000)),
    };
  }
  if (r === "libre" && esFechaIso(desde) && esFechaIso(hasta) && desde <= hasta) {
    return { tipo: "libre", desde, hasta };
  }
  // Por defecto: este mes.
  const hoy = new Date();
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 12);
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 12);
  return { tipo: "mes", desde: aIso(primero), hasta: aIso(ultimo) };
}

/** Días laborables (L–V) del rango, sin contar fechas futuras. Cap: 400 días. */
export function diasLaborables(desde: string, hasta: string): string[] {
  const hoyIso = aIso(new Date());
  const tope = hasta < hoyIso ? hasta : hoyIso;
  const dias: string[] = [];
  const d = deIso(desde);
  for (let i = 0; i < 400; i++) {
    const iso = aIso(d);
    if (iso > tope) break;
    const diaSemana = d.getDay();
    if (diaSemana >= 1 && diaSemana <= 5) dias.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return dias;
}
