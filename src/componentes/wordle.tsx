"use client";

// Panel del Wordle semanal (fase Cuco, W·3). Vive en Mi semana y solo en
// la semana actual. Bloqueado hasta que L–V tengan registro (el candado
// visible ES el incentivo); al desbloquear, el cuco trae la palabra.
//
// Toda la verdad está en la BD (migración 010): este componente nunca
// conoce la palabra hasta que la partida termina. Escribe vía las RPC
// wordle_estado / wordle_intentar, que validan diccionario, aciertos y el
// máximo de 6 intentos y calculan los colores en servidor.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import { etiquetaDia } from "@/lib/semana";
import {
  FILAS_TECLADO,
  LONGITUD_PALABRA,
  MAX_INTENTOS,
  RANGO_COLOR,
  esLetra,
} from "@/lib/wordle";
import type { ColorPista, EstadoWordle } from "@/lib/tipos";
import { Cuco } from "./cuco";

const CLASE_FICHA: Record<ColorPista, string> = {
  correcto: "border-wc-correcto bg-wc-correcto text-white",
  presente: "border-wc-presente bg-wc-presente text-white",
  ausente: "border-wc-ausente bg-wc-ausente text-white",
};
const CLASE_TECLA: Record<ColorPista, string> = {
  correcto: "bg-wc-correcto text-white",
  presente: "bg-wc-presente text-white",
  ausente: "bg-wc-ausente text-white",
};
const NOMBRE_PISTA: Record<ColorPista, string> = {
  correcto: "correcta",
  presente: "en otra posición",
  ausente: "no está",
};

function esEditable(el: Element | null): boolean {
  if (!el) return false;
  const t = el.tagName;
  return (
    t === "INPUT" ||
    t === "TEXTAREA" ||
    t === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

export function Wordle({ inicial }: { inicial: EstadoWordle | null }) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const [estado, setEstado] = useState<EstadoWordle | null>(inicial);
  const [actual, setActual] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sacude, setSacude] = useState(false);
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const desbloqueado = estado?.desbloqueado === true;
  const intentos = useMemo(() => estado?.intentos ?? [], [estado]);
  const partida = estado?.estado ?? "en_curso";
  const terminada = partida === "ganada" || partida === "perdida";
  const usados = intentos.length;

  const mostrarAviso = useCallback((texto: string) => {
    setAviso(texto);
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(null), 2600);
  }, []);

  const cargarEstado = useCallback(async () => {
    const { data, error } = await supabase.rpc("wordle_estado");
    if (!error && data) setEstado(data as EstadoWordle);
  }, [supabase]);

  // Desbloqueo en vivo: mientras siga bloqueado, revalidar cuando la
  // rejilla guarda horas (evento window) — así el panel se abre en cuanto
  // se completa el último día, sin recargar. Ya desbloqueado, se ignora
  // para no pisar la partida en curso.
  useEffect(() => {
    if (desbloqueado) return;
    const alGuardar = () => void cargarEstado();
    window.addEventListener("clooki:horas", alGuardar);
    return () => window.removeEventListener("clooki:horas", alGuardar);
  }, [desbloqueado, cargarEstado]);

  // ── Entrada ──

  const escribir = useCallback(
    (letra: string) => {
      if (!desbloqueado || terminada || enviando) return;
      setActual((a) => (a.length < LONGITUD_PALABRA ? a + letra : a));
    },
    [desbloqueado, terminada, enviando],
  );

  const borrar = useCallback(() => {
    if (!desbloqueado || terminada || enviando) return;
    setActual((a) => a.slice(0, -1));
  }, [desbloqueado, terminada, enviando]);

  const enviar = useCallback(async () => {
    if (!desbloqueado || terminada || enviando) return;
    if (actual.length !== LONGITUD_PALABRA) {
      setSacude(true);
      mostrarAviso("Escribe una palabra de 5 letras.");
      return;
    }
    setEnviando(true);
    const { data, error } = await supabase.rpc("wordle_intentar", {
      p_palabra: actual,
    });
    setEnviando(false);

    if (error || !data) {
      // Excepciones del servidor (partida terminada, semana bloqueada…).
      mostrarAviso(error?.message ?? "No se pudo enviar. Inténtalo de nuevo.");
      void cargarEstado();
      return;
    }
    if (!data.ok) {
      setSacude(true);
      mostrarAviso(
        data.motivo === "desconocida"
          ? "Esa palabra no está en la lista."
          : "Escribe una palabra de 5 letras.",
      );
      return;
    }
    // Intento válido: añadir con sus colores; actualizar fin de partida.
    setEstado((prev) =>
      prev
        ? {
            ...prev,
            intentos: [
              ...(prev.intentos ?? []),
              { palabra: data.palabra_intentada, pistas: data.pistas },
            ],
            usados: data.usados,
            estado: data.estado,
            palabra: data.palabra,
          }
        : prev,
    );
    setActual("");
  }, [
    actual,
    desbloqueado,
    terminada,
    enviando,
    supabase,
    mostrarAviso,
    cargarEstado,
  ]);

  // Teclado físico (escritorio). Se ignora si el foco está en un campo
  // editable (la rejilla de horas) para no robarle las pulsaciones.
  useEffect(() => {
    if (!desbloqueado || terminada) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (esEditable(document.activeElement)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        void enviar();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        borrar();
      } else if (e.key.length === 1) {
        const letra = e.key.toUpperCase();
        if (esLetra(letra)) {
          e.preventDefault();
          escribir(letra);
        }
      }
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [desbloqueado, terminada, enviar, borrar, escribir]);

  // Fin de la sacudida.
  useEffect(() => {
    if (!sacude) return;
    const t = setTimeout(() => setSacude(false), 320);
    return () => clearTimeout(t);
  }, [sacude]);

  // Mejor color conocido por tecla (verde > amarillo > gris).
  const coloresTeclas = useMemo(() => {
    const m: Record<string, ColorPista> = {};
    for (const it of intentos) {
      const letras = [...it.palabra];
      it.pistas.forEach((pista, i) => {
        const l = letras[i];
        if (!m[l] || RANGO_COLOR[pista] > RANGO_COLOR[m[l]]) m[l] = pista;
      });
    }
    return m;
  }, [intentos]);

  // ── Render ──

  if (!estado) {
    return (
      <section className="rounded-xl border border-borde bg-superficie p-4">
        <p className="text-sm text-texto-suave">
          El Wordle no está disponible ahora mismo.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="wordle-titulo"
      className="rounded-xl border border-borde bg-superficie p-4"
    >
      <header className="mb-3 flex items-center gap-2">
        <Cuco
          animo={!desbloqueado ? "duerme" : partida === "ganada" ? "feliz" : "normal"}
          className="size-9 shrink-0 text-marca"
        />
        <div className="min-w-0">
          <h2
            id="wordle-titulo"
            className="font-marca text-sm font-semibold text-tinta"
          >
            Wordle de la semana
          </h2>
          {estado && (
            <p className="text-xs text-texto-suave">
              Semana del {etiquetaDia(estado.semana)}
            </p>
          )}
        </div>
      </header>

      {!desbloqueado ? (
        <Bloqueado dias={estado?.dias_completos ?? 0} />
      ) : (
        <>
          <Tablero
            intentos={intentos}
            actual={actual}
            usados={usados}
            terminada={terminada}
            sacude={sacude}
          />

          <p aria-live="polite" className="sr-only">
            {aviso}
          </p>

          {terminada ? (
            <ResultadoFinal
              gano={partida === "ganada"}
              intentos={usados}
              palabra={estado?.palabra ?? ""}
            />
          ) : (
            <>
              {aviso && (
                <p className="mt-2 text-center text-xs font-medium text-aviso">
                  {aviso}
                </p>
              )}
              <Teclado
                colores={coloresTeclas}
                onLetra={escribir}
                onEnter={() => void enviar()}
                onBorrar={borrar}
                deshabilitado={enviando}
              />
            </>
          )}

          <Leyenda />
        </>
      )}
    </section>
  );
}

/* ── Piezas ── */

function Bloqueado({ dias }: { dias: number }) {
  const faltan = 5 - dias;
  return (
    <div className="flex flex-col items-center gap-2 py-3 text-center">
      <p className="text-sm text-texto">
        Completa los cinco días laborables (L–V) para desbloquear el Wordle.
      </p>
      <div
        className="flex gap-1.5"
        role="img"
        aria-label={`${dias} de 5 días con registro`}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`size-2.5 rounded-full ${
              i < dias ? "bg-acento" : "bg-superficie-2 ring-1 ring-borde-fuerte"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-texto-suave">
        {faltan === 0
          ? "¡Ya casi! Actualizando…"
          : `Te ${faltan === 1 ? "falta" : "faltan"} ${faltan} día${faltan === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}

function Tablero({
  intentos,
  actual,
  usados,
  terminada,
  sacude,
}: {
  intentos: { palabra: string; pistas: ColorPista[] }[];
  actual: string;
  usados: number;
  terminada: boolean;
  sacude: boolean;
}) {
  const filas = Array.from({ length: MAX_INTENTOS }, (_, r) => r);
  // La fila activa (donde se teclea) es la siguiente a los intentos, salvo
  // que la partida haya terminado.
  const filaActiva = terminada ? -1 : usados;

  return (
    <div
      role="group"
      aria-label="Tablero del Wordle"
      className="mx-auto grid w-fit gap-1.5"
    >
      {filas.map((r) => {
        const intento = intentos[r];
        const esActiva = r === filaActiva;
        const letras = intento
          ? [...intento.palabra]
          : esActiva
            ? [...actual]
            : [];
        return (
          <div
            key={r}
            className={`flex gap-1.5 ${esActiva && sacude ? "sacudir" : ""}`}
          >
            {Array.from({ length: LONGITUD_PALABRA }, (_, c) => {
              const letra = letras[c] ?? "";
              const pista = intento?.pistas[c];
              return (
                <div
                  key={c}
                  aria-label={
                    pista
                      ? `${letra}, ${NOMBRE_PISTA[pista]}`
                      : letra || undefined
                  }
                  className={`relative flex size-11 items-center justify-center rounded-md border text-xl font-bold uppercase tabular-nums sm:size-12 ${
                    pista
                      ? CLASE_FICHA[pista]
                      : letra
                        ? "border-borde-fuerte bg-superficie text-tinta"
                        : "border-borde bg-superficie text-tinta"
                  }`}
                >
                  {letra}
                  {/* Pista no-solo-color: ✓ acierto, ○ presente. */}
                  {pista === "correcto" && (
                    <span
                      aria-hidden="true"
                      className="absolute right-0.5 top-0.5 text-[9px] leading-none"
                    >
                      ✓
                    </span>
                  )}
                  {pista === "presente" && (
                    <span
                      aria-hidden="true"
                      className="absolute right-0.5 top-0.5 text-[9px] leading-none"
                    >
                      ○
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Teclado({
  colores,
  onLetra,
  onEnter,
  onBorrar,
  deshabilitado,
}: {
  colores: Record<string, ColorPista>;
  onLetra: (l: string) => void;
  onEnter: () => void;
  onBorrar: () => void;
  deshabilitado: boolean;
}) {
  return (
    <div className="mt-3 flex flex-col items-center gap-1.5">
      {FILAS_TECLADO.map((fila, i) => (
        <div key={i} className="flex w-full justify-center gap-1">
          {fila.map((tecla) => {
            const accion = tecla === "Enter" || tecla === "Borrar";
            const color = !accion ? colores[tecla] : undefined;
            return (
              <button
                key={tecla}
                type="button"
                disabled={deshabilitado}
                onClick={() =>
                  tecla === "Enter"
                    ? onEnter()
                    : tecla === "Borrar"
                      ? onBorrar()
                      : onLetra(tecla)
                }
                aria-label={
                  tecla === "Borrar"
                    ? "Borrar"
                    : tecla === "Enter"
                      ? "Enviar"
                      : tecla
                }
                className={`flex h-11 items-center justify-center rounded-md text-sm font-semibold uppercase transition-colors focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-50 ${
                  accion ? "px-2 text-xs" : "w-8 sm:w-9"
                } ${
                  color
                    ? CLASE_TECLA[color]
                    : "bg-superficie-2 text-tinta hover:bg-borde"
                }`}
              >
                {tecla === "Borrar" ? "⌫" : tecla}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ResultadoFinal({
  gano,
  intentos,
  palabra,
}: {
  gano: boolean;
  intentos: number;
  palabra: string;
}) {
  return (
    <div
      aria-live="polite"
      className={`mt-3 rounded-lg border px-3 py-2.5 text-center text-sm ${
        gano
          ? "border-wc-correcto/40 bg-exito-suave text-exito"
          : "border-borde bg-superficie-2 text-texto"
      }`}
    >
      {gano ? (
        <p className="font-semibold">
          ¡Bien! Lo sacaste en {intentos}/{MAX_INTENTOS}.
        </p>
      ) : (
        <p>
          Se acabó por hoy. La palabra era{" "}
          <strong className="font-semibold tracking-wide text-tinta">
            {palabra}
          </strong>
          .
        </p>
      )}
      <p className="mt-0.5 text-xs text-texto-suave">
        Vuelve el lunes para el próximo.
      </p>
    </div>
  );
}

function Leyenda() {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-texto-suave">
      <span className="flex items-center gap-1">
        <span className="inline-block size-3 rounded-sm bg-wc-correcto" /> en su
        sitio
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block size-3 rounded-sm bg-wc-presente" /> en la
        palabra
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block size-3 rounded-sm bg-wc-ausente" /> no está
      </span>
    </div>
  );
}
