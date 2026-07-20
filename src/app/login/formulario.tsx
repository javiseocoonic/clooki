"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoLogin } from "./acciones";
import { CampoContrasena } from "@/componentes/campo-contrasena";

const ESTADO_INICIAL: EstadoLogin = { mensaje: null };

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState(
    iniciarSesion,
    ESTADO_INICIAL,
  );

  return (
    <form action={accion} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium text-texto">
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
        pattern=".+@(coonic\.com|proyectoscoonic\.com)"
        title="Correo @coonic.com o @proyectoscoonic.com"
        className="rounded-lg border border-borde-fuerte bg-superficie px-4 py-2.5 text-base text-tinta outline-none focus:border-acento focus:ring-2 focus:ring-acento/20"
      />

      <CampoContrasena
        id="contrasena"
        name="contrasena"
        label="Contraseña"
        autoComplete="current-password"
      />

      {estado.mensaje && (
        <p className="text-sm text-error" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="mt-1 rounded-lg bg-marca-accion px-4 py-2.5 text-sm font-semibold text-sobre-marca transition-colors hover:bg-marca-accion-fuerte focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-50"
      >
        {pendiente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
