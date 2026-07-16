"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoLogin } from "./acciones";

const ESTADO_INICIAL: EstadoLogin = { mensaje: null };

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState(
    iniciarSesion,
    ESTADO_INICIAL,
  );

  const estiloInput =
    "rounded-lg border border-neutral-300 px-4 py-2.5 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";

  return (
    <form action={accion} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium text-neutral-700">
        Tu correo de Coonic
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoFocus
        autoComplete="email"
        placeholder="nombre@coonic.com"
        pattern=".+@coonic\.com"
        title="Correo @coonic.com"
        className={estiloInput}
      />

      <label
        htmlFor="contrasena"
        className="mt-1 text-sm font-medium text-neutral-700"
      >
        Contraseña
      </label>
      <input
        id="contrasena"
        name="contrasena"
        type="password"
        required
        autoComplete="current-password"
        className={estiloInput}
      />

      {estado.mensaje && (
        <p className="text-sm text-red-600" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="mt-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
      >
        {pendiente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
