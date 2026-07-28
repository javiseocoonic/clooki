import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CLIENTE_INTERNO,
  cargarAdmin,
  cargarHorasRango,
  cargarVacacionesRango,
} from "@/lib/datos/admin";
import {
  DIAS_SEMANA,
  aIso,
  deIso,
  etiquetaMes,
  etiquetaRangoFechas,
  formatearDuracion,
} from "@/lib/semana";
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

  // ── Mes visible del calendario de vacaciones (?vm=YYYY-MM) ──
  const hoyIso = aIso(new Date());
  const mesVisible =
    typeof params.vm === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.vm)
      ? params.vm
      : hoyIso.slice(0, 7);
  const [anioMes, numMes] = mesVisible.split("-").map(Number);
  const diasMes: string[] = [];
  {
    const d = new Date(anioMes, numMes - 1, 1, 12);
    while (d.getMonth() === numMes - 1) {
      diasMes.push(aIso(d));
      d.setDate(d.getDate() + 1);
    }
  }

  const [horas, vacacionesRango, vacacionesMes] = await Promise.all([
    cargarHorasRango(rango.desde, rango.hasta),
    cargarVacacionesRango(rango.desde, rango.hasta),
    cargarVacacionesRango(diasMes[0], diasMes[diasMes.length - 1]),
  ]);

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
    if (esInterno) totalInterno += h.segundos;
    if (esInterno && !incluirInterno) continue;
    const agg = porCliente.get(cliente.id) ?? {
      total: 0,
      porProyecto: new Map<string, number>(),
    };
    agg.total += h.segundos;
    agg.porProyecto.set(
      proyecto.id,
      (agg.porProyecto.get(proyecto.id) ?? 0) + h.segundos,
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
    agg.total += h.segundos;
    agg.fechas.add(h.fecha);
    porPersona.set(h.persona_id, agg);
  }
  // Un día de vacaciones no es un hueco de datos: se descuenta.
  const vacsPorPersonaRango = new Map<string, { desde: string; hasta: string }[]>();
  for (const v of vacacionesRango) {
    const lista = vacsPorPersonaRango.get(v.persona_id);
    if (lista) lista.push(v);
    else vacsPorPersonaRango.set(v.persona_id, [v]);
  }
  const deVacaciones = (personaId: string, fecha: string) =>
    (vacsPorPersonaRango.get(personaId) ?? []).some(
      (v) => v.desde <= fecha && fecha <= v.hasta,
    );
  const filasPersonas = personas
    .filter((p) => p.activo)
    .map((p) => {
      const agg = porPersona.get(p.id);
      const sinRegistro = laborables.filter(
        (d) => !agg?.fechas.has(d) && !deVacaciones(p.id, d),
      ).length;
      return { persona: p, total: agg?.total ?? 0, sinRegistro };
    })
    .sort((a, b) => b.total - a.total);

  // ── Fiabilidad: % de horas apuntadas el mismo día o el siguiente ──
  let horasPuntuales = 0;
  let horasTotales = 0;
  for (const h of horas) {
    horasTotales += h.segundos;
    const registrado = deIso(h.actualizado_en.slice(0, 10)).getTime();
    const trabajado = deIso(h.fecha).getTime();
    if (registrado - trabajado <= 86400000 * 1.5) horasPuntuales += h.segundos;
  }
  const fiabilidad =
    horasTotales > 0 ? Math.round((horasPuntuales / horasTotales) * 100) : null;

  const urlBase = (extra: string) =>
    `/resumen?${extra}${incluirInterno ? "&interno=1" : ""}`;
  const urlCsv = `/resumen/csv?desde=${rango.desde}&hasta=${rango.hasta}`;

  // ── Datos del calendario de vacaciones ──
  const metaDias = diasMes.map((iso) => {
    const d = deIso(iso);
    return {
      iso,
      num: d.getDate(),
      letra: DIAS_SEMANA[(d.getDay() + 6) % 7],
      finde: d.getDay() === 0 || d.getDay() === 6,
      hoy: iso === hoyIso,
      laborable: d.getDay() >= 1 && d.getDay() <= 5,
    };
  });
  const vacsPorPersonaMes = new Map<string, typeof vacacionesMes>();
  for (const v of vacacionesMes) {
    const lista = vacsPorPersonaMes.get(v.persona_id);
    if (lista) lista.push(v);
    else vacsPorPersonaMes.set(v.persona_id, [v]);
  }
  const personasCalendario = personas.filter((p) => p.activo);
  const mesAnterior = aIso(new Date(anioMes, numMes - 2, 1, 12)).slice(0, 7);
  const mesSiguiente = aIso(new Date(anioMes, numMes, 1, 12)).slice(0, 7);
  // Los enlaces de mes conservan el rango de horas elegido arriba.
  const paramsRangoActual = `r=${rango.tipo}${
    rango.tipo === "libre" ? `&desde=${rango.desde}&hasta=${rango.hasta}` : ""
  }`;
  const urlMes = (m: string) =>
    `${urlBase(`${paramsRangoActual}&vm=${m}`)}#vacaciones`;

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
              {mesVisible !== hoyIso.slice(0, 7) && (
                <input type="hidden" name="vm" value={mesVisible} />
              )}
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
                {totalMostrado > 0 ? formatearDuracion(totalMostrado) : "—"}
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
                            {formatearDuracion(total)}
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
                                  {formatearDuracion(h)}
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
                  {CLIENTE_INTERNO}: {formatearDuracion(totalInterno)} — fuera
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
                      {total > 0 ? formatearDuracion(total) : <span className="font-normal text-texto-suave">—</span>}
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
              días de vacaciones apuntados no cuentan como hueco. Los totales
              pueden superar las horas de calendario por los cronómetros
              simultáneos — es intencional.
            </p>
          </section>

          {/* ── Vacaciones del equipo (contexto de los huecos, no control) ── */}
          <section
            id="vacaciones"
            className="mt-5 rounded-xl border border-borde bg-superficie p-4"
          >
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold text-tinta">
                Vacaciones del equipo
              </h2>
              <div className="ml-auto flex items-center gap-1">
                <Link
                  href={urlMes(mesAnterior)}
                  aria-label="Mes anterior"
                  className={estiloPreset(false)}
                >
                  ←
                </Link>
                <span className="min-w-32 text-center text-sm font-medium text-tinta">
                  {etiquetaMes(mesVisible)}
                </span>
                <Link
                  href={urlMes(mesSiguiente)}
                  aria-label="Mes siguiente"
                  className={estiloPreset(false)}
                >
                  →
                </Link>
                {mesVisible !== hoyIso.slice(0, 7) && (
                  <Link
                    href={urlMes(hoyIso.slice(0, 7))}
                    className={estiloPreset(false)}
                  >
                    Hoy
                  </Link>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 bg-superficie pb-1.5 pr-3 text-left text-xs font-semibold text-texto-suave"
                    >
                      Persona
                    </th>
                    {metaDias.map((d) => (
                      <th
                        key={d.iso}
                        scope="col"
                        className={`min-w-5 pb-1.5 text-center font-normal ${
                          d.finde ? "opacity-50" : ""
                        }`}
                      >
                        <span className="block text-[10px] leading-tight text-texto-suave">
                          {d.letra}
                        </span>
                        {d.hoy ? (
                          <span
                            title="Hoy"
                            className="mx-auto flex h-4 w-4 items-center justify-center rounded-full bg-acento text-[10px] font-semibold tabular-nums text-superficie"
                          >
                            {d.num}
                          </span>
                        ) : (
                          <span className="block text-[11px] tabular-nums text-texto">
                            {d.num}
                          </span>
                        )}
                      </th>
                    ))}
                    <th
                      scope="col"
                      title="Días laborables (L–V) de vacaciones en el mes"
                      className="pb-1.5 pl-2 text-right text-xs font-semibold text-texto-suave"
                    >
                      Lab.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {personasCalendario.map((p) => {
                    const vs = vacsPorPersonaMes.get(p.id) ?? [];
                    const lab = metaDias.filter(
                      (d) =>
                        d.laborable &&
                        vs.some((v) => v.desde <= d.iso && d.iso <= v.hasta),
                    ).length;
                    return (
                      <tr key={p.id} className="border-t border-borde">
                        <td className="sticky left-0 whitespace-nowrap bg-superficie py-1.5 pr-3 text-tinta">
                          {p.nombre}
                        </td>
                        {metaDias.map((d) => {
                          const v = vs.find(
                            (x) => x.desde <= d.iso && d.iso <= x.hasta,
                          );
                          const fondo = d.hoy
                            ? "bg-acento-suave/50"
                            : d.finde
                              ? "bg-superficie-2/70"
                              : "";
                          if (!v) return <td key={d.iso} className={`p-0 ${fondo}`} />;
                          const inicio =
                            d.iso === v.desde || d.iso === diasMes[0];
                          const fin =
                            d.iso === v.hasta ||
                            d.iso === diasMes[diasMes.length - 1];
                          return (
                            <td
                              key={d.iso}
                              className={`p-0 ${fondo}`}
                              title={`${p.nombre}: ${etiquetaRangoFechas(v.desde, v.hasta)}${v.nota ? ` — ${v.nota}` : ""}`}
                            >
                              <span className="sr-only">de vacaciones</span>
                              <div
                                aria-hidden="true"
                                className={`h-3.5 bg-tinta/75 ${
                                  inicio ? "ml-0.5 rounded-l-full" : ""
                                } ${fin ? "mr-0.5 rounded-r-full" : ""}`}
                              />
                            </td>
                          );
                        })}
                        <td className="py-1.5 pl-2 text-right tabular-nums">
                          {lab > 0 ? (
                            <span className="font-medium text-tinta">{lab}</span>
                          ) : (
                            <span className="text-texto-suave">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-texto-suave">
              La barra marca días de vacaciones — pasa el cursor para ver el
              periodo y su nota. Fin de semana sombreado; «Lab.» cuenta solo
              laborables L–V del mes. Cada persona apunta las suyas en su
              pestaña «Vacaciones».
            </p>
          </section>
        </main>
      </div>
    </ProveedorCronometros>
  );
}
