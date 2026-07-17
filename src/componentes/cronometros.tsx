"use client";

// Cronómetros concurrentes (brief §11.3): estado compartido entre la
// bandeja global de la cabecera y la rejilla. Las sesiones viven en
// servidor (tabla `cronometros`); aquí solo se reconstruye la UI.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import {
  aIso,
  formatearDuracion,
  interpretarDuracion,
  limpiarTarea,
  SEGUNDOS_DIA,
} from "@/lib/semana";
import type { Cliente, Proyecto, SesionCronometro } from "@/lib/tipos";
import { BuscadorCliente } from "./buscador-cliente";

const UMBRAL_AVISO_MS = 10 * 60 * 60 * 1000; // 10 h (§11.3.f)

export interface EventoCronometro {
  tipo: "inicio" | "volcado";
  proyectoId: string;
  tarea: string;
  /** Solo en volcado: celda afectada y su total resultante en segundos. */
  fecha?: string;
  segundosTotal?: number;
}

interface ContextoCronometros {
  sesiones: SesionCronometro[];
  ahora: number;
  arrancar: (proyectoId: string, tarea: string) => Promise<boolean>;
  parar: (sesionId: string, segundos?: number) => Promise<boolean>;
  suscribir: (cb: (e: EventoCronometro) => void) => () => void;
  conError: Set<string>;
  etiquetaLinea: (proyectoId: string, tarea: string) => string;
}

const Ctx = createContext<ContextoCronometros | null>(null);

export function useCronometros(): ContextoCronometros | null {
  return useContext(Ctx);
}

export function duracionMs(sesion: SesionCronometro, ahora: number): number {
  return Math.max(0, ahora - new Date(sesion.inicio).getTime());
}

/** Duración de una sesión en marcha, en el h:mm:ss común de la app. */
export function formatearDuracionMs(ms: number): string {
  return formatearDuracion(Math.floor(ms / 1000));
}

export function ProveedorCronometros({
  personaId,
  sesionesIniciales,
  clientes,
  children,
}: {
  personaId: string;
  sesionesIniciales: SesionCronometro[];
  clientes: (Cliente & { proyectos: Proyecto[] })[];
  children: ReactNode;
}) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const [sesiones, setSesiones] = useState(sesionesIniciales);
  const [conError, setConError] = useState<Set<string>>(new Set());
  const [ahora, setAhora] = useState(() => Date.now());
  const [anuncio, setAnuncio] = useState("");
  const oyentesRef = useRef(new Set<(e: EventoCronometro) => void>());
  const tituloBaseRef = useRef<string | null>(null);

  // Un único ticker compartido a 1 s — solo corre si hay sesiones activas
  // (sin cronómetros no hay nada que repintar cada segundo).
  const haySesiones = sesiones.length > 0;
  useEffect(() => {
    if (!haySesiones) return;
    const intervalo = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, [haySesiones]);

  useEffect(() => {
    const alVolver = () => setAhora(Date.now());
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, []);

  // Título de pestaña con cronómetros activos (§12.4).
  useEffect(() => {
    if (tituloBaseRef.current === null) tituloBaseRef.current = document.title;
    document.title =
      sesiones.length > 0
        ? `● ${sesiones.length} en marcha · Clooki`
        : tituloBaseRef.current;
  }, [sesiones.length]);

  const etiquetaLinea = useCallback(
    (proyectoId: string, tarea: string) => {
      for (const c of clientes) {
        const p = c.proyectos.find((p) => p.id === proyectoId);
        if (p) {
          const base = `${c.nombre} — ${p.nombre}`;
          return tarea ? `${base} · ${tarea}` : base;
        }
      }
      return tarea ? `Proyecto · ${tarea}` : "Proyecto";
    },
    [clientes],
  );

  function emitir(e: EventoCronometro) {
    oyentesRef.current.forEach((cb) => cb(e));
  }

  const suscribir = useCallback((cb: (e: EventoCronometro) => void) => {
    oyentesRef.current.add(cb);
    return () => {
      oyentesRef.current.delete(cb);
    };
  }, []);

  async function arrancar(proyectoId: string, tarea: string): Promise<boolean> {
    const tareaLimpia = limpiarTarea(tarea);
    if (
      sesiones.some(
        (s) => s.proyecto_id === proyectoId && s.tarea === tareaLimpia,
      )
    ) {
      setAnuncio("Ya hay un cronómetro en marcha en esa tarea.");
      return false;
    }
    const { data, error } = await supabase
      .from("cronometros")
      .insert({
        persona_id: personaId,
        proyecto_id: proyectoId,
        tarea: tareaLimpia,
        dia_atribuido: aIso(new Date()),
      })
      .select()
      .single();
    if (error || !data) {
      // 23505 = índice único parcial: sesión duplicada desde otra pestaña.
      setAnuncio(
        error?.code === "23505"
          ? "Ya hay un cronómetro en marcha en esa tarea."
          : "No se pudo arrancar el cronómetro.",
      );
      return false;
    }
    setSesiones((prev) => [...prev, data]);
    setAhora(Date.now());
    setAnuncio(
      `Cronómetro de ${etiquetaLinea(proyectoId, tareaLimpia)} iniciado — cuenta para hoy.`,
    );
    emitir({ tipo: "inicio", proyectoId, tarea: tareaLimpia });
    return true;
  }

  async function parar(sesionId: string, segundos?: number): Promise<boolean> {
    const sesion = sesiones.find((s) => s.id === sesionId);
    if (!sesion) return true;
    const { data, error } = await supabase.rpc("parar_cronometro", {
      p_id: sesionId,
      p_segundos: segundos ?? null,
    });
    if (error || !data) {
      setConError((prev) => new Set(prev).add(sesionId));
      setAnuncio("No se pudo parar. Reintentar.");
      return false;
    }
    setSesiones((prev) => prev.filter((s) => s.id !== sesionId));
    setConError((prev) => {
      const s = new Set(prev);
      s.delete(sesionId);
      return s;
    });
    const volcado = Number(data.segundos_volcados ?? 0);
    setAnuncio(
      volcado > 0
        ? `Cronómetro parado. Se han sumado ${formatearDuracion(volcado)} al ${sesion.dia_atribuido}.`
        : "Cronómetro descartado: no se ha sumado tiempo.",
    );
    emitir({
      tipo: "volcado",
      proyectoId: sesion.proyecto_id,
      tarea: sesion.tarea,
      fecha: sesion.dia_atribuido,
      segundosTotal: Number(data.segundos_total ?? 0),
    });
    return true;
  }

  const valor: ContextoCronometros = {
    sesiones,
    ahora,
    arrancar,
    parar,
    suscribir,
    conError,
    etiquetaLinea,
  };

  return (
    <Ctx.Provider value={valor}>
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>
      {children}
    </Ctx.Provider>
  );
}

/* ── Bandeja global (cabecera) ─────────────────────────────────── */

export function BandejaCronometros({
  clientes,
}: {
  clientes: (Cliente & { proyectos: Proyecto[] })[];
}) {
  const crono = useCronometros();
  const [abierta, setAbierta] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [tareaNueva, setTareaNueva] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta) return;
    const alPulsarFuera = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener("mousedown", alPulsarFuera);
    return () => document.removeEventListener("mousedown", alPulsarFuera);
  }, [abierta]);

  if (!crono || crono.sesiones.length === 0) {
    // 0 activos → no ocupa espacio (§11.3.d)... salvo que quieras arrancar
    // uno desde aquí: sin sesiones tampoco hay bandeja; se arranca desde
    // la rejilla. (Decisión §11.3.d: nada de "0 en marcha".)
    return null;
  }

  const { sesiones, ahora, parar, arrancar, conError, etiquetaLinea } = crono;
  const ordenadas = [...sesiones].sort(
    (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
  );
  const hayAviso = ordenadas.some(
    (s) => duracionMs(s, ahora) >= UMBRAL_AVISO_MS,
  );
  // Un proyecto con sesión activa sigue siendo elegible: puede arrancarse
  // otro cronómetro del mismo proyecto con OTRA tarea. El duplicado real
  // (misma tarea) lo rechazan arrancar() y el índice único de la BD.
  const clientesElegibles = clientes.filter((c) => c.proyectos.length > 0);
  const clienteElegido = clientesElegibles.find((c) => c.id === clienteId);

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        aria-label={`${sesiones.length} cronómetros en marcha`}
        className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-acento ${
          hayAviso
            ? "bg-aviso-suave text-aviso"
            : "bg-acento-suave text-acento"
        }`}
      >
        <span
          aria-hidden="true"
          className={`punto-pulso size-2 rounded-full ${hayAviso ? "bg-aviso" : "bg-acento"}`}
        />
        {sesiones.length} en marcha
      </button>

      {abierta && (
        <div className="absolute right-0 top-11 z-20 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-borde bg-superficie p-2 shadow-lg">
          <p className="px-2 py-1.5 text-xs font-semibold text-texto-suave">
            Cronómetros en marcha
          </p>
          <ul className="max-h-64 overflow-y-auto">
            {ordenadas.map((s) => {
              const ms = duracionMs(s, ahora);
              const aviso = ms >= UMBRAL_AVISO_MS;
              const error = conError.has(s.id);
              return (
                <li
                  key={s.id}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                    error
                      ? "border border-error/40 bg-error-suave"
                      : aviso
                        ? "border border-aviso/40 bg-aviso-suave"
                        : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-tinta">
                      {etiquetaLinea(s.proyecto_id, s.tarea)}
                    </span>
                    <span
                      className={`text-xs tabular-nums ${
                        error
                          ? "text-error"
                          : aviso
                            ? "text-aviso"
                            : "text-texto-suave"
                      }`}
                    >
                      {error
                        ? "No se pudo parar."
                        : aviso
                          ? `¿Sigues? Lleva ${formatearDuracionMs(ms)} en marcha.`
                          : `${formatearDuracionMs(ms)} en marcha`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void parar(s.id)}
                    className={`flex h-11 shrink-0 items-center rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 ${
                      error
                        ? "text-error hover:bg-error/10 focus-visible:outline-error"
                        : "text-acento hover:bg-acento-suave focus-visible:outline-acento"
                    }`}
                  >
                    {error ? "Reintentar" : "Parar"}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-1 border-t border-borde pt-2">
            {!eligiendo ? (
              <button
                type="button"
                onClick={() => setEligiendo(true)}
                disabled={clientesElegibles.length === 0}
                className="w-full rounded-lg px-2 py-2 text-left text-sm text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-40"
              >
                + Empezar en otro proyecto
              </button>
            ) : (
              <div className="flex flex-col gap-2 p-1">
                <label className="sr-only" htmlFor="tarea-cronometro">
                  Tarea (opcional)
                </label>
                <input
                  id="tarea-cronometro"
                  type="text"
                  value={tareaNueva}
                  onChange={(e) => setTareaNueva(e.target.value)}
                  maxLength={120}
                  placeholder="Tarea (opcional)"
                  className="h-9 rounded-lg border border-borde bg-superficie px-2.5 text-sm text-tinta outline-none placeholder:text-texto-suave focus:border-acento focus:ring-2 focus:ring-acento/20"
                />
                {!clienteElegido ? (
                  <BuscadorCliente
                    opciones={clientesElegibles.map((c) => ({
                      id: c.id,
                      nombre: c.nombre,
                    }))}
                    alElegir={setClienteId}
                  />
                ) : (
                  <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-acento-suave py-1 pl-3 pr-1 text-sm font-medium text-acento">
                    {clienteElegido.nombre}
                    <button
                      type="button"
                      onClick={() => setClienteId("")}
                      aria-label={`Quitar ${clienteElegido.nombre} y volver a buscar`}
                      className="flex size-6 items-center justify-center rounded-full transition-colors hover:bg-acento/15 focus-visible:outline-2 focus-visible:outline-acento"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {clienteElegido && (
                  <ul className="max-h-40 overflow-y-auto">
                    {clienteElegido.proyectos.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            void arrancar(p.id, tareaNueva);
                            setEligiendo(false);
                            setClienteId("");
                            setTareaNueva("");
                          }}
                          className="w-full rounded-md px-2 py-2 text-left text-sm text-tinta transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento"
                        >
                          Empezar en {p.nombre}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Reclamo de sesiones de días anteriores (§11.3.f) ──────────── */

export function SesionesAntiguas() {
  const crono = useCronometros();
  const hoy = aIso(new Date());
  const [horasEditadas, setHorasEditadas] = useState<Record<string, string>>(
    {},
  );

  if (!crono) return null;
  const antiguas = crono.sesiones.filter((s) => s.dia_atribuido < hoy);
  if (antiguas.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {antiguas.map((s) => {
        const sugeridos = Math.min(
          SEGUNDOS_DIA,
          Math.floor(duracionMs(s, crono.ahora) / 1000),
        );
        const valor = horasEditadas[s.id] ?? formatearDuracion(sugeridos);
        const interpretado = interpretarDuracion(valor);
        // null (vacío/cero) equivale a descartar: también es confirmable.
        const valido = interpretado !== "error";
        const segundos = typeof interpretado === "number" ? interpretado : 0;
        return (
          <div
            key={s.id}
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-lg border border-aviso/40 bg-aviso-suave px-3 py-2.5 text-sm text-aviso"
          >
            <span className="min-w-0 flex-1 basis-56">
              Tenías un cronómetro en{" "}
              <strong>{crono.etiquetaLinea(s.proyecto_id, s.tarea)}</strong>{" "}
              desde el {s.dia_atribuido}. ¿Cuánto tiempo cuentas?
            </span>
            <label className="sr-only" htmlFor={`horas-${s.id}`}>
              Tiempo a contar
            </label>
            <input
              id={`horas-${s.id}`}
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={(e) =>
                setHorasEditadas((prev) => ({ ...prev, [s.id]: e.target.value }))
              }
              aria-invalid={!valido || undefined}
              className={`h-11 w-28 rounded-lg border bg-superficie px-2 text-center text-base tabular-nums text-tinta outline-none focus:ring-2 ${
                valido
                  ? "border-borde-fuerte focus:border-acento focus:ring-acento/20"
                  : "border-error focus:ring-error/25"
              }`}
            />
            {/* Excepción deliberada al rojo de marca de los botones primarios:
                este botón vive DENTRO de una tarjeta de aviso ámbar, y un
                relleno rojo sobre ámbar es el patrón de "confirmar acción
                destructiva". Aquí la semántica sería justo la contraria:
                Confirmar guarda las horas y Descartar es el que las tira.
                Se queda en tinta neutra para no señalar peligro donde no lo hay. */}
            <button
              type="button"
              disabled={!valido}
              onClick={() => void crono.parar(s.id, segundos)}
              className="h-11 rounded-lg bg-tinta px-3 text-sm font-semibold text-superficie transition-colors hover:bg-texto focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-40"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => void crono.parar(s.id, 0)}
              title="Cierra el cronómetro sin sumar tiempo"
              className="h-11 rounded-lg px-3 text-sm font-medium text-aviso transition-colors hover:bg-aviso/10 focus-visible:outline-2 focus-visible:outline-aviso"
            >
              Descartar
            </button>
          </div>
        );
      })}
    </div>
  );
}
