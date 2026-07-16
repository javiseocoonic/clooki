"use client";

import { useState } from "react";
import Link from "next/link";

const CLAVE_SESION = "clooki-aviso-semana-descartado";

/**
 * Aviso descartable de semana anterior incompleta (brief §14.1).
 * El descarte dura la sesión del navegador (sessionStorage), no se persiste.
 */
export function AvisoSemanaIncompleta({
  dias,
  lunesAnterior,
}: {
  dias: number;
  lunesAnterior: string;
}) {
  const [descartado, setDescartado] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(CLAVE_SESION) === lunesAnterior;
    } catch {
      return false;
    }
  });

  if (descartado || dias === 0) return null;

  function descartar() {
    try {
      sessionStorage.setItem(CLAVE_SESION, lunesAnterior);
    } catch {
      // sessionStorage bloqueado: el aviso solo vivirá este render.
    }
    setDescartado(true);
  }

  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-3 rounded-lg border border-aviso/40 bg-aviso-suave px-3 py-2 text-sm text-aviso"
    >
      <span className="flex-1">
        La semana pasada tiene {dias} día{dias === 1 ? "" : "s"} sin horas.{" "}
        <Link
          href={`/?semana=${lunesAnterior}`}
          className="font-semibold underline underline-offset-2 hover:opacity-80"
        >
          Completarla
        </Link>
      </span>
      <button
        type="button"
        onClick={descartar}
        aria-label="Descartar el aviso"
        className="flex size-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-aviso/10 focus-visible:outline-2 focus-visible:outline-aviso"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M3 3l8 8M11 3l-8 8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
