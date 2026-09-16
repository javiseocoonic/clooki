"use client";

// Campana de la cabecera (019): número de avisos sin leer y lista
// desplegable. Cada aviso lleva a la tarjeta en el tablero (y al
// comentario, si es una mención) y se marca leído al pulsarlo.

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import type { NotificacionVista } from "@/lib/datos/notificaciones";

/** «hace 5 min», «hace 3 h», «ayer», «12 sep». */
function haceCuanto(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

export function Notificaciones({
  iniciales,
  claseEnlace,
}: {
  iniciales: NotificacionVista[];
  /** Misma clase que las pestañas vecinas de la cabecera. */
  claseEnlace: string;
}) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const router = useRouter();
  const idBase = useId();
  const [avisos, setAvisos] = useState(iniciales);
  const [abierto, setAbierto] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const sinLeer = avisos.filter((a) => !a.leida_en).length;

  // Cerrar al pulsar fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    function alPulsar(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setAbierto(false);
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", alPulsar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alPulsar);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  async function marcarLeida(ids: string[]) {
    const ahora = new Date().toISOString();
    setAvisos((prev) =>
      prev.map((a) => (ids.includes(a.id) ? { ...a, leida_en: ahora } : a)),
    );
    await supabase
      .from("notificaciones")
      .update({ leida_en: ahora })
      .in("id", ids);
  }

  function abrir(a: NotificacionVista) {
    if (!a.leida_en) void marcarLeida([a.id]);
    setAbierto(false);
    const destino = a.comentario_id
      ? `/tareas?tarjeta=${a.tarjeta_id}&comentario=${a.comentario_id}`
      : `/tareas?tarjeta=${a.tarjeta_id}`;
    router.push(destino);
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={`${idBase}-panel`}
        aria-label={
          sinLeer > 0
            ? `Notificaciones, ${sinLeer} sin leer`
            : "Notificaciones"
        }
        className={`${claseEnlace} inline-flex items-center gap-1.5`}
      >
        Avisos
        {sinLeer > 0 && (
          <span className="rounded-full bg-marca px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none text-sobre-marca">
            {sinLeer}
          </span>
        )}
      </button>

      {abierto && (
        <div
          id={`${idBase}-panel`}
          role="dialog"
          aria-label="Notificaciones"
          className="absolute left-0 top-full z-30 mt-1 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-borde bg-superficie shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-borde px-3 py-2">
            <p className="text-xs font-semibold text-tinta">
              Avisos{sinLeer > 0 && ` · ${sinLeer} sin leer`}
            </p>
            {sinLeer > 0 && (
              <button
                type="button"
                onClick={() =>
                  void marcarLeida(
                    avisos.filter((a) => !a.leida_en).map((a) => a.id),
                  )
                }
                className="rounded-md px-2 py-1 text-xs text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento"
              >
                Marcar todo leído
              </button>
            )}
          </div>
          {avisos.length === 0 ? (
            <p className="px-3 py-4 text-sm text-texto-suave">
              Sin avisos. Aquí verás cuando te mencionen en un comentario o
              te asignen una tarjeta.
            </p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {avisos.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => abrir(a)}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento ${
                      a.leida_en ? "" : "bg-acento-suave/40"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        a.leida_en ? "bg-transparent" : "bg-marca"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm ${
                          a.leida_en ? "text-texto" : "font-medium text-tinta"
                        }`}
                      >
                        <span className="font-semibold">{a.origen}</span>
                        {a.tipo === "mencion"
                          ? " te ha mencionado en "
                          : " te ha asignado "}
                        <span className="font-medium">«{a.titulo}»</span>
                      </span>
                      {a.extracto && (
                        <span className="block truncate text-xs text-texto-suave">
                          {a.extracto}
                        </span>
                      )}
                      <span className="block text-[11px] text-texto-suave">
                        {haceCuanto(a.creada_en)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
