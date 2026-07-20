// Cargador de Clooki: el cuco «vuela» mientras hay un proceso en marcha
// (alta de miembro, propuesta de la IA, generar token…). Presentacional y
// accesible: role="status" + texto sr-only, así que también sirve suelto,
// no solo dentro de un botón. El color del cuco lo hereda de currentColor.

import { Cuco } from "./cuco";

export function Cargador({
  texto,
  tamano = "size-5",
  className = "",
}: {
  /** Texto visible junto al cuco (p. ej. «Añadiendo…»). Opcional. */
  texto?: string;
  /** Clases de tamaño del cuco (Tailwind). */
  tamano?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 ${className}`}
    >
      <Cuco className={`${tamano} shrink-0 cuco-volando`} />
      {texto}
      <span className="sr-only">Cargando…</span>
    </span>
  );
}
