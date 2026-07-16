"use client";

import {
  Fragment,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import {
  DIAS_SEMANA,
  NOMBRES_DIA,
  aIso,
  diasDeSemana,
  etiquetaDia,
  formatearHoras,
  interpretarHoras,
} from "@/lib/semana";
import type { Cliente, Proyecto, RegistroHoras } from "@/lib/tipos";
import type { ProyectoConCliente } from "@/lib/datos/mi-semana";
import { AnadirLinea } from "./anadir-linea";

type EstadoCelda = "guardando" | "error" | "invalido";

interface Props {
  personaId: string;
  lunesIso: string;
  lineas: ProyectoConCliente[];
  clientes: (Cliente & { proyectos: Proyecto[] })[];
  horas: RegistroHoras[];
}

// "Hoy" solo se conoce con certeza en el cliente (zona horaria del usuario):
// en servidor/hidratación devuelve null y tras montar, la fecha local.
const sinSuscripcion = () => () => {};
function useHoy(): string | null {
  return useSyncExternalStore(
    sinSuscripcion,
    () => aIso(new Date()),
    () => null,
  );
}

/** Clave de celda: `proyectoId|fecha`. Para notas: `nota|proyectoId`. */
function clave(proyectoId: string, fecha: string): string {
  return `${proyectoId}|${fecha}`;
}

function notasIniciales(horas: RegistroHoras[]): Record<string, string> {
  const notas: Record<string, string> = {};
  // La más reciente por línea gana.
  const ordenadas = [...horas].sort((a, b) =>
    a.actualizado_en.localeCompare(b.actualizado_en),
  );
  for (const h of ordenadas) {
    if (h.nota) notas[h.proyecto_id] = h.nota;
  }
  return notas;
}

export function RejillaSemana({
  personaId,
  lunesIso,
  lineas,
  clientes,
  horas,
}: Props) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const dias = useMemo(() => diasDeSemana(lunesIso), [lunesIso]);
  const tablaRef = useRef<HTMLDivElement>(null);
  const versionesRef = useRef<Record<string, number>>({});

  // ── Estado fuente de la rejilla (se reinicializa por semana vía key) ──
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const h of horas) m[clave(h.proyecto_id, h.fecha)] = formatearHoras(h.horas);
    return m;
  });
  const [guardadas, setGuardadas] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const h of horas) m[clave(h.proyecto_id, h.fecha)] = h.horas;
    return m;
  });
  const [estadoCeldas, setEstadoCeldas] = useState<Record<string, EstadoCelda>>({});
  const [notas, setNotas] = useState<Record<string, string>>(() => notasIniciales(horas));
  const [notasGuardadas, setNotasGuardadas] = useState<Record<string, string>>(() =>
    notasIniciales(horas),
  );
  const [notasAbiertas, setNotasAbiertas] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<ProyectoConCliente[]>([]);
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [verFinde, setVerFinde] = useState(() =>
    horas.some((h) => h.fecha === dias[5] || h.fecha === dias[6]),
  );
  const [huboGuardado, setHuboGuardado] = useState(false);
  const hoy = useHoy();
  const [diaMovilElegido, setDiaMovilElegido] = useState<string | null>(null);
  // Hasta que el usuario elija un día, en móvil se muestra hoy (si cae en
  // la semana visible) o el lunes.
  const diaMovil =
    diaMovilElegido ?? (hoy && dias.includes(hoy) ? hoy : dias[0]);

  const lineasVisibles = useMemo(
    () => [
      ...lineas.filter((l) => !ocultas.has(l.id)),
      ...extras.filter((l) => !ocultas.has(l.id)),
    ],
    [lineas, extras, ocultas],
  );

  const indicesVisibles = verFinde ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
  const hayHorasFinde = dias
    .slice(5)
    .some((f) => lineasVisibles.some((l) => guardadas[clave(l.id, f)] !== undefined));

  // ── Autoguardado ──

  function ponerEstado(k: string, estado?: EstadoCelda) {
    setEstadoCeldas((prev) => {
      const s = { ...prev };
      if (estado) s[k] = estado;
      else delete s[k];
      return s;
    });
  }

  async function guardarCelda(proyectoId: string, fecha: string, valor: number | null) {
    const k = clave(proyectoId, fecha);
    const version = (versionesRef.current[k] ?? 0) + 1;
    versionesRef.current[k] = version;
    ponerEstado(k, "guardando");

    const nota = (notas[proyectoId] ?? "").trim() || null;
    const ejecutar = async (): Promise<boolean> => {
      if (valor === null) {
        const { error } = await supabase
          .from("horas")
          .delete()
          .eq("persona_id", personaId)
          .eq("proyecto_id", proyectoId)
          .eq("fecha", fecha);
        return !error;
      }
      const { error } = await supabase.from("horas").upsert(
        { persona_id: personaId, proyecto_id: proyectoId, fecha, horas: valor, nota },
        { onConflict: "persona_id,proyecto_id,fecha" },
      );
      return !error;
    };

    let ok = await ejecutar();
    if (!ok && versionesRef.current[k] === version) ok = await ejecutar(); // reintento automático
    if (versionesRef.current[k] !== version) return; // llegó una edición posterior

    if (ok) {
      setGuardadas((prev) => {
        const s = { ...prev };
        if (valor === null) delete s[k];
        else s[k] = valor;
        return s;
      });
      ponerEstado(k);
      setHuboGuardado(true);
    } else {
      ponerEstado(k, "error");
    }
  }

  function alSalirDeCelda(proyectoId: string, fecha: string) {
    const k = clave(proyectoId, fecha);
    const texto = valores[k] ?? "";
    const resultado = interpretarHoras(texto);

    if (resultado === "error") {
      ponerEstado(k, "invalido");
      return; // no se guarda ni se borra lo escrito
    }

    if (resultado === null) {
      if (texto !== "") setValores((prev) => ({ ...prev, [k]: "" }));
      if (guardadas[k] === undefined) {
        ponerEstado(k);
        return;
      }
      void guardarCelda(proyectoId, fecha, null);
      return;
    }

    setValores((prev) => ({ ...prev, [k]: formatearHoras(resultado) }));
    if (guardadas[k] === resultado) {
      ponerEstado(k);
      return;
    }
    void guardarCelda(proyectoId, fecha, resultado);
  }

  async function guardarNota(proyectoId: string) {
    const nota = (notas[proyectoId] ?? "").trim();
    if (nota === (notasGuardadas[proyectoId] ?? "")) return;

    const hayRegistros = dias.some((f) => guardadas[clave(proyectoId, f)] !== undefined);
    if (!hayRegistros) {
      // Nada que actualizar en BD: la nota viajará con el próximo upsert.
      setNotasGuardadas((prev) => ({ ...prev, [proyectoId]: nota }));
      return;
    }

    const k = `nota|${proyectoId}`;
    const version = (versionesRef.current[k] ?? 0) + 1;
    versionesRef.current[k] = version;
    ponerEstado(k, "guardando");

    const ejecutar = async (): Promise<boolean> => {
      const { error } = await supabase
        .from("horas")
        .update({ nota: nota || null })
        .eq("persona_id", personaId)
        .eq("proyecto_id", proyectoId)
        .gte("fecha", dias[0])
        .lte("fecha", dias[6]);
      return !error;
    };

    let ok = await ejecutar();
    if (!ok && versionesRef.current[k] === version) ok = await ejecutar();
    if (versionesRef.current[k] !== version) return;

    if (ok) {
      setNotasGuardadas((prev) => ({ ...prev, [proyectoId]: nota }));
      ponerEstado(k);
      setHuboGuardado(true);
    } else {
      ponerEstado(k, "error");
    }
  }

  function reintentarErrores() {
    for (const [k, estado] of Object.entries(estadoCeldas)) {
      if (estado !== "error") continue;
      const [a, b] = k.split("|");
      if (a === "nota") {
        void guardarNota(b);
      } else {
        alSalirDeCelda(a, b);
      }
    }
  }

  // ── Líneas ──

  function anadirLinea(linea: ProyectoConCliente) {
    setOcultas((prev) => {
      const s = new Set(prev);
      s.delete(linea.id);
      return s;
    });
    if (!lineas.some((l) => l.id === linea.id)) {
      setExtras((prev) => (prev.some((l) => l.id === linea.id) ? prev : [...prev, linea]));
    }
  }

  function quitarLinea(id: string) {
    setExtras((prev) => prev.filter((l) => l.id !== id));
    setOcultas((prev) => new Set(prev).add(id));
    setNotasAbiertas((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  }

  function sinHoras(proyectoId: string): boolean {
    return dias.every((f) => {
      const k = clave(proyectoId, f);
      return guardadas[k] === undefined && (valores[k] ?? "").trim() === "";
    });
  }

  function alternarNota(proyectoId: string) {
    setNotasAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(proyectoId)) s.delete(proyectoId);
      else s.add(proyectoId);
      return s;
    });
  }

  // ── Totales (optimistas: sobre lo que hay escrito y es válido) ──

  function valorNumerico(proyectoId: string, fecha: string): number {
    const res = interpretarHoras(valores[clave(proyectoId, fecha)] ?? "");
    return typeof res === "number" ? res : 0;
  }

  const totalLinea = (proyectoId: string) =>
    dias.reduce((suma, f) => suma + valorNumerico(proyectoId, f), 0);
  const totalDia = (fecha: string) =>
    lineasVisibles.reduce((suma, l) => suma + valorNumerico(l.id, fecha), 0);
  const totalSemana = lineasVisibles.reduce((suma, l) => suma + totalLinea(l.id), 0);

  // ── Indicador global ──

  const estados = Object.values(estadoCeldas);
  const guardando = estados.includes("guardando");
  const hayErrores = estados.includes("error");

  // ── Teclado: Enter/flechas mueven el foco verticalmente ──

  function enfocarCelda(fila: number, col: number) {
    const el = tablaRef.current?.querySelector<HTMLInputElement>(
      `[data-celda="${fila}-${col}"]`,
    );
    el?.focus();
  }

  function alTeclearEnCelda(
    e: React.KeyboardEvent<HTMLInputElement>,
    fila: number,
    col: number,
  ) {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      if (fila + 1 < lineasVisibles.length) enfocarCelda(fila + 1, col);
      else e.currentTarget.blur(); // última fila: confirma y guarda
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (fila > 0) enfocarCelda(fila - 1, col);
    }
  }

  // ── Render de una celda (compartido entre tabla y vista móvil) ──

  function celdaInput(
    linea: ProyectoConCliente,
    fecha: string,
    extra?: { fila: number; col: number },
  ) {
    const k = clave(linea.id, fecha);
    const estado = estadoCeldas[k];
    const conError = estado === "error" || estado === "invalido";
    const idxDia = dias.indexOf(fecha);
    return (
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="next"
        data-celda={extra ? `${extra.fila}-${extra.col}` : undefined}
        aria-label={`Horas de ${linea.cliente.nombre} — ${linea.nombre}, ${NOMBRES_DIA[idxDia]} ${etiquetaDia(fecha)}`}
        aria-invalid={conError || undefined}
        title={
          estado === "invalido"
            ? "Horas en pasos de 0,5, entre 0,5 y 24"
            : estado === "error"
              ? "No se pudo guardar"
              : undefined
        }
        value={valores[k] ?? ""}
        onChange={(e) => setValores((prev) => ({ ...prev, [k]: e.target.value }))}
        onBlur={() => alSalirDeCelda(linea.id, fecha)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={extra ? (e) => alTeclearEnCelda(e, extra.fila, extra.col) : undefined}
        className={`h-9 w-full min-w-12 rounded-md border text-center text-sm tabular-nums outline-none transition-colors ${
          conError
            ? "border-red-500 bg-red-50 text-red-700 focus:ring-2 focus:ring-red-200"
            : "border-neutral-200 bg-white text-neutral-900 hover:border-neutral-300 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
        } ${estado === "guardando" ? "opacity-70" : ""}`}
      />
    );
  }

  function botonesLinea(linea: ProyectoConCliente) {
    const notaPuesta = Boolean((notas[linea.id] ?? "").trim());
    return (
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => alternarNota(linea.id)}
          aria-expanded={notasAbiertas.has(linea.id)}
          aria-label={`Nota de ${linea.cliente.nombre} — ${linea.nombre}`}
          title={notaPuesta ? `Nota: ${notas[linea.id]}` : "Añadir nota"}
          className={`rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-neutral-900 ${
            notaPuesta ? "font-semibold text-neutral-900" : "text-neutral-400"
          }`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="inline-block"
          >
            <path
              d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H8l-3.5 3v-3h-1A1.5 1.5 0 0 1 2 9.5v-6Z"
              stroke="currentColor"
              strokeWidth="1.4"
              fill={notaPuesta ? "currentColor" : "none"}
            />
          </svg>
        </button>
        {sinHoras(linea.id) && (
          <button
            type="button"
            onClick={() => quitarLinea(linea.id)}
            aria-label={`Quitar la línea ${linea.cliente.nombre} — ${linea.nombre}`}
            title="Quitar línea (sin horas esta semana)"
            className="rounded-md px-1.5 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-neutral-900"
          >
            ✕
          </button>
        )}
      </span>
    );
  }

  function inputNota(linea: ProyectoConCliente) {
    return (
      <input
        type="text"
        value={notas[linea.id] ?? ""}
        placeholder="Nota de la línea (p. ej. la tarea concreta)"
        aria-label={`Nota para ${linea.cliente.nombre} — ${linea.nombre}`}
        onChange={(e) => setNotas((prev) => ({ ...prev, [linea.id]: e.target.value }))}
        onBlur={() => void guardarNota(linea.id)}
        className="h-8 w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 text-xs text-neutral-700 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
      />
    );
  }

  const idsVisibles = lineasVisibles.map((l) => l.id);

  return (
    <div>
      {/* Indicador global de guardado */}
      <div className="mb-2 flex min-h-6 items-center justify-end gap-2 text-xs" aria-live="polite">
        {guardando ? (
          <span className="text-neutral-500">Guardando…</span>
        ) : hayErrores ? (
          <span className="flex items-center gap-2 text-red-600">
            No se pudo guardar alguna celda.
            <button
              type="button"
              onClick={reintentarErrores}
              className="rounded-md border border-red-300 px-2 py-0.5 font-medium transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-600"
            >
              Reintentar
            </button>
          </span>
        ) : huboGuardado ? (
          <span className="text-emerald-700">Guardado ✓</span>
        ) : null}
      </div>

      {lineasVisibles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-500">
          No tienes líneas de trabajo esta semana. Añade la primera con «+ Añadir línea».
        </div>
      ) : (
        <>
          {/* ── Rejilla de escritorio ── */}
          <div ref={tablaRef} className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-xs text-neutral-500">
                  <th scope="col" className="w-56 pb-2 pr-3 text-left font-medium">
                    Cliente — proyecto
                  </th>
                  {indicesVisibles.map((i) => (
                    <th
                      key={dias[i]}
                      scope="col"
                      className={`px-1 pb-2 text-center font-medium ${
                        hoy === dias[i] ? "text-neutral-900" : ""
                      }`}
                    >
                      <span className={hoy === dias[i] ? "font-semibold" : ""}>
                        {DIAS_SEMANA[i]}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-normal text-neutral-400">
                        {etiquetaDia(dias[i])}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="w-16 px-1 pb-2 text-right font-medium">
                    Total
                  </th>
                  <th scope="col" className="w-16 pb-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineasVisibles.map((linea, fila) => (
                  <Fragment key={linea.id}>
                    <tr>
                      <th
                        scope="row"
                        className="border-t border-neutral-100 py-1.5 pr-3 text-left font-normal"
                      >
                        <span className="block text-[11px] uppercase tracking-wide text-neutral-400">
                          {linea.cliente.nombre}
                        </span>
                        <span className="block truncate font-medium text-neutral-900">
                          {linea.nombre}
                        </span>
                      </th>
                      {indicesVisibles.map((i) => (
                        <td
                          key={dias[i]}
                          className={`border-t border-neutral-100 px-1 py-1.5 ${
                            hoy === dias[i] ? "bg-neutral-100/70" : ""
                          }`}
                        >
                          {celdaInput(linea, dias[i], { fila, col: i })}
                        </td>
                      ))}
                      <td className="border-t border-neutral-100 px-1 py-1.5 text-right font-medium tabular-nums text-neutral-900">
                        {totalLinea(linea.id) > 0 ? formatearHoras(totalLinea(linea.id)) : ""}
                      </td>
                      <td className="border-t border-neutral-100 py-1.5 pl-1 text-right">
                        {botonesLinea(linea)}
                      </td>
                    </tr>
                    {notasAbiertas.has(linea.id) && (
                      <tr>
                        <td />
                        <td colSpan={indicesVisibles.length + 2} className="pb-1.5">
                          {inputNota(linea)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-sm">
                  <th scope="row" className="border-t border-neutral-200 py-2 pr-3 text-left text-xs font-medium text-neutral-500">
                    Total por día
                  </th>
                  {indicesVisibles.map((i) => (
                    <td
                      key={dias[i]}
                      className={`border-t border-neutral-200 px-1 py-2 text-center font-medium tabular-nums text-neutral-700 ${
                        hoy === dias[i] ? "bg-neutral-100/70" : ""
                      }`}
                    >
                      {totalDia(dias[i]) > 0 ? formatearHoras(totalDia(dias[i])) : ""}
                    </td>
                  ))}
                  <td className="border-t border-neutral-200 px-1 py-2 text-right font-semibold tabular-nums text-neutral-900">
                    {formatearHoras(totalSemana)}
                  </td>
                  <td className="border-t border-neutral-200" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Vista móvil: día a día ── */}
          <div className="sm:hidden">
            <div
              role="tablist"
              aria-label="Día de la semana"
              className="mb-4 grid grid-cols-7 gap-1"
            >
              {dias.map((f, i) => {
                const activo = diaMovil === f;
                return (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={activo}
                    onClick={() => setDiaMovilElegido(f)}
                    className={`flex flex-col items-center rounded-lg py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-neutral-900 ${
                      activo
                        ? "bg-neutral-900 text-white"
                        : hoy === f
                          ? "bg-neutral-100 font-semibold text-neutral-900"
                          : "bg-neutral-50 text-neutral-600"
                    }`}
                  >
                    <span>{DIAS_SEMANA[i]}</span>
                    <span className={`text-[10px] ${activo ? "text-neutral-300" : "text-neutral-400"}`}>
                      {etiquetaDia(f).split(" ")[0]}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="mb-2 text-xs text-neutral-500">
              {NOMBRES_DIA[dias.indexOf(diaMovil)].charAt(0).toUpperCase() +
                NOMBRES_DIA[dias.indexOf(diaMovil)].slice(1)}{" "}
              {etiquetaDia(diaMovil)}
              {hoy === diaMovil ? " · hoy" : ""}
            </p>

            <ul className="divide-y divide-neutral-100">
              {lineasVisibles.map((linea) => (
                <li key={linea.id} className="py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="block text-[11px] uppercase tracking-wide text-neutral-400">
                        {linea.cliente.nombre}
                      </span>
                      <span className="block truncate text-sm font-medium text-neutral-900">
                        {linea.nombre}
                      </span>
                    </div>
                    {botonesLinea(linea)}
                    <div className="w-16 shrink-0">{celdaInput(linea, diaMovil)}</div>
                  </div>
                  {notasAbiertas.has(linea.id) && (
                    <div className="mt-2">{inputNota(linea)}</div>
                  )}
                </li>
              ))}
            </ul>

            <dl className="mt-3 flex justify-between gap-4 border-t border-neutral-200 pt-3 text-sm">
              <div className="flex gap-2">
                <dt className="text-neutral-500">Total del día</dt>
                <dd className="font-semibold tabular-nums text-neutral-900">
                  {formatearHoras(totalDia(diaMovil))}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-neutral-500">Semana</dt>
                <dd className="font-semibold tabular-nums text-neutral-900">
                  {formatearHoras(totalSemana)}
                </dd>
              </div>
            </dl>
          </div>
        </>
      )}

      {/* ── Acciones bajo la rejilla ── */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <AnadirLinea clientes={clientes} idsExcluidos={idsVisibles} alAnadir={anadirLinea} />
        {!verFinde && (
          <button
            type="button"
            onClick={() => setVerFinde(true)}
            className="hidden rounded-lg px-3 py-2 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-neutral-900 sm:inline-block"
          >
            + fin de semana
          </button>
        )}
        {verFinde && !hayHorasFinde && (
          <button
            type="button"
            onClick={() => setVerFinde(false)}
            className="hidden rounded-lg px-3 py-2 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-neutral-900 sm:inline-block"
          >
            − ocultar fin de semana
          </button>
        )}
      </div>
    </div>
  );
}
