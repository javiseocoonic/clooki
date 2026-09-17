import Link from "next/link";
import type { ReactNode } from "react";
import type { Persona } from "@/lib/tipos";
import { cerrarSesion } from "@/app/login/acciones";
import { cargarNotificaciones } from "@/lib/datos/notificaciones";
import { Logotipo } from "@/componentes/logotipo";
import { Notificaciones } from "@/componentes/notificaciones";

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
export async function Cabecera({
  persona,
  seccion,
  children,
}: {
  persona: Persona;
  seccion: "semana" | "tareas" | "vacaciones" | "resumen" | "gestion";
  children?: ReactNode;
}) {
  // null = tabla sin crear (019): la campana no se muestra.
  const avisos = await cargarNotificaciones(persona.id);
  return (
    <header className="flex items-center gap-2 border-b border-borde pb-3">
      <Link
        href="/"
        className="mr-1 rounded-sm text-tinta focus-visible:outline-2 focus-visible:outline-acento"
      >
        <Logotipo className="text-lg" />
      </Link>
      {/* Mi semana, Tareas y Vacaciones son de todo el equipo; Resumen y
          Gestión, admin. */}
      <nav aria-label="Secciones" className="flex items-center gap-1">
        <Link href="/" className={claseEnlace(seccion === "semana")}>
          Mi semana
        </Link>
        <Link href="/tareas" className={claseEnlace(seccion === "tareas")}>
          Tareas
        </Link>
        {avisos !== null && (
          <Notificaciones
            personaId={persona.id}
            iniciales={avisos}
            claseEnlace={claseEnlace(false)}
          />
        )}
        <Link
          href="/vacaciones"
          className={claseEnlace(seccion === "vacaciones")}
        >
          Vacaciones
        </Link>
        {persona.rol === "admin" && (
          <>
            <Link href="/resumen" className={claseEnlace(seccion === "resumen")}>
              Resumen
            </Link>
            <Link href="/gestion" className={claseEnlace(seccion === "gestion")}>
              Gestión
            </Link>
          </>
        )}
      </nav>
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
