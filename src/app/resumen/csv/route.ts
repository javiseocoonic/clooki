import type { NextRequest } from "next/server";
import { cargarAdmin, cargarHorasRango } from "@/lib/datos/admin";
import {
  esFechaIso,
  formatearDuracion,
  formatearHorasDecimal,
} from "@/lib/semana";

// Export CSV del detalle (persona, cliente, proyecto, tarea, fecha,
// duracion h:mm:ss y horas decimales para cálculos en Excel).
// Separador ; y BOM para que Excel en español lo abra directamente.
export async function GET(request: NextRequest) {
  const datos = await cargarAdmin();
  if (!datos) return new Response("Solo admin", { status: 403 });

  const desde = request.nextUrl.searchParams.get("desde") ?? "";
  const hasta = request.nextUrl.searchParams.get("hasta") ?? "";
  if (!esFechaIso(desde) || !esFechaIso(hasta) || desde > hasta) {
    return new Response("Rango inválido", { status: 400 });
  }

  const horas = await cargarHorasRango(desde, hasta);
  const personasPorId = new Map(datos.personas.map((p) => [p.id, p]));
  const proyectosPorId = new Map(datos.proyectos.map((p) => [p.id, p]));
  const clientesPorId = new Map(datos.clientes.map((c) => [c.id, c]));

  const campo = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const lineas = [
    "persona;cliente;proyecto;tarea;fecha;duracion;horas",
    ...horas.map((h) => {
      const proyecto = proyectosPorId.get(h.proyecto_id);
      const cliente = proyecto ? clientesPorId.get(proyecto.cliente_id) : null;
      return [
        campo(personasPorId.get(h.persona_id)?.nombre ?? ""),
        campo(cliente?.nombre ?? ""),
        campo(proyecto?.nombre ?? ""),
        campo(h.tarea),
        h.fecha,
        formatearDuracion(h.segundos),
        formatearHorasDecimal(h.segundos),
      ].join(";");
    }),
  ];

  return new Response("﻿" + lineas.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clooki-horas-${desde}-${hasta}.csv"`,
    },
  });
}
