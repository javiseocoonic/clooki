"use client";

import { useActionState } from "react";
import { cambiarContrasena, type EstadoCambio } from "./acciones";
import { CampoContrasena } from "@/componentes/campo-contrasena";

const ESTADO_INICIAL: EstadoCambio = { hecho: false, mensaje: null };

export function FormularioCambio() {
  const [estado, accion, pendiente] = useActionState(
    cambiarContrasena,
    ESTADO_INICIAL,
  );

  return (
    <form action={accion} className="flex flex-col gap-3">
      <CampoContrasena
        id="nueva"
        name="nueva"
        label="Nueva contraseña"
        autoComplete="new-password"
        minLength={8}
      />
      <CampoContrasena
        id="repetida"
        name="repetida"
        label="Repítela"
        autoComplete="new-password"
        minLength={8}
      />

      {estado.mensaje && (
        <p
          className={`text-sm ${estado.hecho ? "text-exito" : "text-error"}`}
          role={estado.hecho ? "status" : "alert"}
        >
          {estado.mensaje}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="mt-1 rounded-lg bg-marca-accion px-4 py-2.5 text-sm font-semibold text-sobre-marca transition-colors hover:bg-marca-accion-fuerte focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-50"
      >
        {pendiente ? "Cambiando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
