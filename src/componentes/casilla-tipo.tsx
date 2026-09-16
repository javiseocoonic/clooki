"use client";

import { useOptimistic, useTransition } from "react";

// Casilla «este cliente tiene este tipo» de la pantalla de Gestión.
// Se guarda al marcar, sin botón: la acción de servidor crea/reactiva o
// desactiva la fila de proyectos y revalida la página. Mientras vuela,
// la casilla muestra ya el nuevo estado (optimista) y queda bloqueada.
export function CasillaTipo({
  clienteId,
  tipoId,
  nombre,
  activo,
  archivado = false,
  accion,
}: {
  clienteId: string;
  tipoId: string;
  nombre: string;
  activo: boolean;
  /** Tipo archivado en el catálogo: solo se muestra para poder quitarlo. */
  archivado?: boolean;
  accion: (formulario: FormData) => Promise<void>;
}) {
  const [pendiente, iniciar] = useTransition();
  const [marcado, setMarcado] = useOptimistic(activo);

  return (
    <label
      className={`flex cursor-pointer items-center gap-2 py-1 text-sm ${
        archivado ? "text-texto-suave" : "text-texto"
      } ${pendiente ? "opacity-70" : ""}`}
    >
      <input
        type="checkbox"
        checked={marcado}
        disabled={pendiente}
        onChange={(e) => {
          const valor = e.currentTarget.checked;
          const formulario = new FormData();
          formulario.set("cliente_id", clienteId);
          formulario.set("tipo_id", tipoId);
          formulario.set("activar", valor ? "1" : "0");
          iniciar(async () => {
            setMarcado(valor);
            await accion(formulario);
          });
        }}
        className="size-4 accent-marca-accion"
      />
      <span className={archivado ? "line-through" : ""}>{nombre}</span>
      {archivado && (
        <span className="text-xs text-texto-suave">(tipo archivado)</span>
      )}
    </label>
  );
}
