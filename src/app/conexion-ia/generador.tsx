"use client";

import { useActionState } from "react";
import { Cargador } from "@/componentes/cargador";
import { generarToken, type EstadoToken } from "./acciones";

const ESTADO_INICIAL: EstadoToken = { token: null, mensaje: null };

export function GeneradorToken({
  yaExiste,
  urlMcp,
}: {
  yaExiste: boolean;
  urlMcp: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    generarToken,
    ESTADO_INICIAL,
  );

  if (estado.token) {
    const comando = `claude mcp add --transport http clooki ${urlMcp} --header "Authorization: Bearer ${estado.token}"`;
    const urlConector = `${urlMcp}?clave=${estado.token}`;
    return (
      <div className="rounded-lg border border-exito/40 bg-exito-suave p-3">
        <p className="text-sm font-medium text-exito">
          Token generado. Cópialo ahora: no se volverá a mostrar.
        </p>
        <code className="mt-2 block select-all break-all rounded-md bg-superficie px-3 py-2 font-mono text-sm text-tinta">
          {estado.token}
        </code>
        <p className="mt-3 text-xs font-medium text-texto">
          Opción A — claude.ai (sin terminal, vale para todos tus
          dispositivos): Ajustes → Conectores → Añadir conector personalizado,
          y pega esta URL:
        </p>
        <code className="mt-1 block select-all break-all rounded-md bg-superficie px-3 py-2 font-mono text-xs text-texto">
          {urlConector}
        </code>
        <p className="mt-3 text-xs font-medium text-texto">
          Opción B — Claude Code (terminal):
        </p>
        <code className="mt-1 block select-all break-all rounded-md bg-superficie px-3 py-2 font-mono text-xs text-texto">
          {comando}
        </code>
      </div>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-2">
      {estado.mensaje && (
        <p className="text-sm text-error" role="alert">
          {estado.mensaje}
        </p>
      )}
      <button
        type="submit"
        disabled={pendiente}
        className="self-start rounded-lg bg-marca-accion px-4 py-2.5 text-sm font-semibold text-sobre-marca transition-colors hover:bg-marca-accion-fuerte focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-50"
      >
        {pendiente ? (
          <Cargador texto="Generando…" tamano="size-4" />
        ) : yaExiste ? (
          "Regenerar token (revoca el anterior)"
        ) : (
          "Generar mi token"
        )}
      </button>
    </form>
  );
}
