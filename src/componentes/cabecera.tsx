import Link from "next/link";
import type { ReactNode } from "react";
import type { Persona } from "@/lib/tipos";
import { cerrarSesion } from "@/app/login/acciones";

const ESTILO_NAV =
  "rounded-lg px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-acento";

function claseEnlace(activo: boolean): string {
  return `${ESTILO_NAV} ${
    activo
      ? "bg-superficie-2 font-medium text-tinta"
      : "text-texto-suave hover:bg-superficie-2 hover:text-tinta"
  }`;
}

/**
 * Barra superior compartida por todas las vistas autenticadas.
 * `children` es el hueco de la bandeja de cronómetros (client), que la
 * página inyecta dentro de su ProveedorCronometros.
 */
export function Cabecera({
  persona,
  seccion,
  children,
}: {
  persona: Persona;
  seccion: "semana" | "resumen" | "gestion";
  children?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-2 border-b border-borde pb-3">
      <Link
        href="/"
        className="text-lg font-bold tracking-tight text-tinta focus-visible:outline-2 focus-visible:outline-acento"
      >
        Clooki
      </Link>
      {persona.rol === "admin" && (
        <nav aria-label="Secciones" className="flex items-center gap-1">
          <Link href="/" className={claseEnlace(seccion === "semana")}>
            Mi semana
          </Link>
          <Link href="/resumen" className={claseEnlace(seccion === "resumen")}>
            Resumen
          </Link>
          <Link href="/gestion" className={claseEnlace(seccion === "gestion")}>
            Gestión
          </Link>
        </nav>
      )}
      <span className="ml-auto">{children}</span>
      <span className="hidden text-sm text-texto-suave sm:inline">
        {persona.nombre}
      </span>
      <Link
        href="/conexion-ia"
        className={`${claseEnlace(false)} hidden sm:inline-block`}
      >
        Claude
      </Link>
      <Link href="/cambiar-contrasena" className={claseEnlace(false)}>
        Contraseña
      </Link>
      <form action={cerrarSesion}>
        <button type="submit" className={claseEnlace(false)}>
          Salir
        </button>
      </form>
    </header>
  );
}
