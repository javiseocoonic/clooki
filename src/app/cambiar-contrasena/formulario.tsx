"use client";

import { useActionState } from "react";
import { cambiarContrasena, type EstadoCambio } from "./acciones";

const ESTADO_INICIAL: EstadoCambio = { hecho: false, mensaje: null };

export function FormularioCambio() {
  const [estado, accion, pendiente] = useActionState(
    cambiarContrasena,
    ESTADO_INICIAL,
  );

  const estiloInput =
    "rounded-lg border border-neutral-300 px-4 py-2.5 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";

  return (
    <form action={accion} className="flex flex-col gap-3">
      <label htmlFor="nueva" className="text-sm font-medium text-neutral-700">
        Nueva contraseña
      </label>
      <input
        id="nueva"
        name="nueva"
        type="password"
        required
        minLength={8}
        autoFocus
        autoComplete="new-password"
        className={estiloInput}
      />

      <label
        htmlFor="repetida"
        className="mt-1 text-sm font-medium text-neutral-700"
      >
        Repítela
      </label>
      <input
        id="repetida"
        name="repetida"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        className={estiloInput}
      />

      {estado.mensaje && (
        <p
          className={`text-sm ${estado.hecho ? "text-emerald-700" : "text-red-600"}`}
          role={estado.hecho ? "status" : "alert"}
        >
          {estado.mensaje}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="mt-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
      >
        {pendiente ? "Cambiando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
