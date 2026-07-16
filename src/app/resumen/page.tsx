import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CLIENTE_INTERNO,
  cargarAdmin,
  cargarHorasRango,
} from "@/lib/datos/admin";
import { deIso, formatearHoras } from "@/lib/semana";
import { Cabecera } from "@/componentes/cabecera";
import {
  BandejaCronometros,
  ProveedorCronometros,
} from "@/componentes/cronometros";
import { diasLaborables, resolverRango } from "./rango";

export const metadata: Metadata = { title: "Resumen · Clooki" };

const ETIQUETA_RANGO = { semana: "Esta semana", mes: "Este mes", libre: "Rango" };

export default async function PaginaResumen({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const datos = await cargarAdmin();
  if (!datos) redirect("/");

  const rango = resolverRango(params);
  const incluirInterno = params.interno === "1";
  const horas = await cargarHorasRango(rango.desde, rango.hasta);

  const { personas, clientes, proyectos } = datos;
  const proyectosPorId = new Map(proyectos.map((p) => [p.id, p]));
  const clientesPorId = new Map(clientes.map((c) => [c.id, c]));
  const clientesConProyectos = clientes
    .filter((c) => c.activo)
    .map((c) => ({
      ...c,
      proyectos: proyectos.filter((p) => p.cliente_id === c.id && p.activo),
    }));

  // ── Agregados por cliente/proyecto ──
  const porCliente = new Map<
    string,
    { total: number; porProyecto: Map<string, number> }
  >();
  let totalInterno = 0;
  for (const h of horas) {
    const proyecto = proyectosPorId.get(h.proyecto_id);
    const cliente = proyecto && clientesPorId.get(proyecto.cliente_id);
    if (!proyecto || !cliente) continue;
    const esInterno = cliente.nombre === CLIENTE_INTERNO;
    if (esInterno) totalInterno += h.horas;
    if (esInterno && !incluirInterno) continue;
    const agg = porCliente.get(cliente.id) ?? {
      total: 0,
      porProyecto: new Map<string, number>(),
    };
    agg.total += h.horas;
    agg.porProyecto.set(
      proyecto.id,
      (agg.porProyecto.get(proyecto.id) ?? 0) + h.horas,
    );
    porCliente.set(cliente.id, agg);
  }
  const filasClientes = [...porCliente.entries()]
    .map(([id, agg]) => ({ cliente: clientesPorId.get(id)!, ...agg }))
    .sort((a, b) => b.total - a.total);
  const totalMostrado = filasClientes.reduce((s, f) => s + f.total, 0);

  // ── Agregados por persona + días sin registro (§14.3) ──
  const laborables = diasLaborables(rango.desde, rango.hasta);
  const porPersona = new Map<string, { total: number; fechas: Set<string> }>();
  for (const h of horas) {
    const agg = porPersona.get(h.persona_id) ?? {
      total: 0,
      fechas: new Set<string>(),
    };
    agg.total += h.horas;
    agg.fechas.add(h.fecha);
    porPersona.set(h.persona_id, agg);
  }
  const filasPersonas = personas
    .filter((p) => p.activo)
    .map((p) => {
      const agg = porPersona.get(p.id);
      const sinRegistro = laborables.filter(
        (d) => !agg?.fechas.has(d),
      ).length;
      return { persona: p, total: agg?.total ?? 0, sinRegistro };
    })
    .sort((a, b) => b.total - a.total);

  // ── Fiabilidad: % de horas apuntadas el mismo día o el siguiente ──
  let horasPuntuales = 0;
  let horasTotales = 0;
  for (const h of horas) {
    horasTotales += h.horas;
    const registrado = deIso(h.actualizado_en.slice(0, 10)).getTime();
    const trabajado = deIso(h.fecha).getTime();
    if (registrado - trabajado <= 86400000 * 1.5) horasPuntuales += h.horas;
  }
  const fiabilidad =
    horasTotales > 0 ? Math.round((horasPuntuales / horasTotales) * 100) : null;

  const urlBase = (extra: string) =>
    `/resumen?${extra}${incluirInterno ? "&interno=1" : ""}`;
  const urlCsv = `/resumen/csv?desde=${rango.desde}&hasta=${rango.hasta}`;

  const estiloPreset = (activo: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-acento ${
      activo
        ? "bg-tinta font-medium text-superficie"
        : "text-texto-suave hover:bg-superficie-2 hover:text-tinta"
    }`;

  return (
    <ProveedorCronometros
      personaId={datos.persona.id}
      sesionesIniciales={datos.sesiones}
      clientes={clientesConProyectos}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-4 sm:px-6">
        <Cabecera persona={datos.persona} seccion="resumen">
          <BandejaCronometros clientes={clientesConProyectos} />
        </Cabecera>

        <main className="mt-5 flex-1">
          <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="font-marca text-xl font-semibold tracking-tight text-tinta">
              Resumen
            </h1>
            <div className="flex items-center gap-1">
              <Link href={urlBase("r=semana")} className={estiloPreset(rango.tipo === "semana")}>
                Esta semana
              </Link>
              <Link href={urlBase("r=mes")} className={estiloPreset(rango.tipo === "mes")}>
                Este mes
              </Link>
            </div>
            <form action="/resumen" method="get" className="flex items-center gap-1.5">
              <input type="hidden" name="r" value="libre" />
              {incluirInterno && <input type="hidden" name="interno" value="1" />}
              <label className="sr-only" htmlFor="desde">Desde</label>
              <input
                id="desde"
                type="date"
                name="desde"
                defaultValue={rango.desde}
                required
                className="h-9 rounded-lg border border-borde-fuerte bg-superficie px-2 text-sm text-tinta outline-none focus:border-acento focus:ring-2 focus:ring-acento/20"
              />
              <span className="text-texto-suave">–</span>
              <label className="sr-only" htmlFor="hasta">Hasta</label>
              <input
                id="hasta"
                type="date"
                name="hasta"
                defaultValue={rango.hasta}
                required
                className="h-9 rounded-lg border border-borde-fuerte bg-superficie px-2 text-sm text-tinta outline-none focus:border-acento focus:ring-2 focus:ring-acento/20"
              />
              <button
                type="submit"
                className={estiloPreset(rango.tipo === "libre")}
              >
                Aplicar
              </button>
            </form>
            <a
              href={urlCsv}
              className="ml-auto rounded-lg border border-borde-fuerte px-3 py-1.5 text-sm font-medium text-texto transition-colors hover:border-acento hover:text-acento focus-visible:outline-2 focus-visible:outline-acento"
            >
              Exportar CSV
            </a>
          </div>

          <p className="mb-4 text-sm text-texto-suave">
            {ETIQUETA_RANGO[rango.tipo]}: {rango.desde} → {rango.hasta}
            {fiabilidad !== null && (
              <>
                {" · "}
                <span title="Porcentaje de horas apuntadas el mismo día trabajado o el siguiente (según su última edición). Mide cuánto fiarse del periodo.">
                  {fiabilidad}% apuntado al día
                </span>
              </>
            )}
          </p>

          {/* ── Horas por cliente ── */}
          <section className="rounded-xl border border-borde bg-superficie p-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-tinta">
                Horas por cliente
              </h2>
              <span className="text-base font-bold tabular-nums text-tinta">
                {totalMostrado > 0 ? `${formatearHoras(totalMostrado)} h` : "—"}
              </span>
            </div>
            {filasClientes.length === 0 ? (
              <p className="py-6 text-center text-sm text-texto-suave">
                Sin horas en este rango.
              </p>
            ) : (
              <ul>
                {filasClientes.map(({ cliente, total, porProyecto }) => {
                  const pct =
                    totalMostrado > 0
                      ? Math.round((total / totalMostrado) * 100)
                      : 0;
                  return (
                    <li key={cliente.id} className="border-t border-borde first:border-t-0">
                      <details className="group">
                        <summary className="flex cursor-pointer items-center gap-3 py-2.5 focus-visible:outline-2 focus-visible:outline-acento">
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 12 12"
                            fill="none"
                            aria-hidden="true"
                            className="shrink-0 text-texto-suave transition-transform group-open:rotate-90"
                          >
                            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-tinta">
                            {cliente.nombre}
                          </span>
                          <span className="w-24 text-right text-xs text-texto-suave tabular-nums">
                            {pct} %
                          </span>
                          <span className="w-20 text-right text-sm font-semibold tabular-nums text-tinta">
                            {formatearHoras(total)} h
                          </span>
                        </summary>
                        <ul className="mb-2 ml-6">
                          {[...porProyecto.entries()]
                            .map(([pid, h]) => ({
                              proyecto: proyectosPorId.get(pid),
                              h,
                            }))
                            .sort((a, b) => b.h - a.h)
                            .map(({ proyecto, h }) => (
                              <li
                                key={proyecto?.id ?? "?"}
                                className="flex items-baseline justify-between gap-3 py-1 text-sm"
                              >
                                <span className="text-texto">
                                  {proyecto?.nombre ?? "Proyecto"}
                                </span>
                                <span className="tabular-nums text-texto">
                                  {formatearHoras(h)} h
                                </span>
                              </li>
                            ))}
                        </ul>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 border-t border-borde pt-2.5 text-xs text-texto-suave">
              {incluirInterno ? (
                <>
                  Incluye el trabajo interno.{" "}
                  <Link href={`/resumen?r=${rango.tipo}${rango.tipo === "libre" ? `&desde=${rango.desde}&hasta=${rango.hasta}` : ""}`} className="font-medium text-acento hover:underline">
                    Excluirlo
                  </Link>
                </>
              ) : (
                <>
                  {CLIENTE_INTERNO}: {formatearHoras(totalInterno)} h — fuera
                  del análisis por cliente.{" "}
                  <Link href={`/resumen?r=${rango.tipo}${rango.tipo === "libre" ? `&desde=${rango.desde}&hasta=${rango.hasta}` : ""}&interno=1`} className="font-medium text-acento hover:underline">
                    Incluirlo
                  </Link>
                </>
              )}
            </p>
          </section>

          {/* ── Horas por persona (calidad del dato, no control) ── */}
          <section className="mt-5 rounded-xl border border-borde bg-superficie p-4">
            <h2 className="mb-2 text-sm font-semibold text-tinta">
              Horas por persona
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-texto-suave">
                  <th scope="col" className="pb-2 text-left font-semibold">Persona</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Horas</th>
                  <th
                    scope="col"
                    className="pb-2 text-right font-semibold"
                    title="Días laborables del rango sin ningún registro (hasta hoy). Un día a cero suele ser un hueco de datos, no un día sin trabajar."
                  >
                    Días sin registro
                  </th>
                </tr>
              </thead>
              <tbody>
                {filasPersonas.map(({ persona: p, total, sinRegistro }) => (
                  <tr key={p.id} className="border-t border-borde">
                    <td className="py-2 text-tinta">{p.nombre}</td>
                    <td className="py-2 text-right font-medium tabular-nums text-tinta">
                      {total > 0 ? formatearHoras(total) : <span className="font-normal text-texto-suave">—</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {sinRegistro > 0 ? (
                        <span className="rounded-md bg-aviso-suave px-1.5 py-0.5 text-aviso">
                          {sinRegistro}
                        </span>
                      ) : (
                        <span className="text-exito">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-texto-suave">
              «Días sin registro» mide datos incompletos, no jornada: un hueco
              hace que los clientes parezcan más rentables de lo que son. Los
              totales pueden superar las horas de calendario por los
              cronómetros simultáneos — es intencional.
            </p>
          </section>
        </main>
      </div>
    </ProveedorCronometros>
  );
}
