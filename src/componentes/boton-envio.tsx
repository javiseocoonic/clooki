"use client";

import { useFormStatus } from "react-dom";
import { Cargador } from "./cargador";

// Botón de envío para los <form action={serverAction}> (gestión, etc.).
// Con useFormStatus muestra el cuco volando mientras la acción está en
// vuelo y bloquea el botón para no reenviar. Va SIEMPRE dentro de un <form>.
export function BotonEnvio({
  children,
  pendienteTexto,
  className = "",
}: {
  children: React.ReactNode;
  /** Texto durante el envío; por defecto reusa el del botón. */
  pendienteTexto?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`${className} disabled:opacity-70`}
    >
      {pending ? (
        <Cargador texto={pendienteTexto} tamano="size-4" />
      ) : (
        children
      )}
    </button>
  );
}
