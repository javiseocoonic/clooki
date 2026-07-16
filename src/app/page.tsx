import Link from "next/link";
import { cargarMiSemana } from "@/lib/datos/mi-semana";
import {
  esLunesIso,
  etiquetaSemana,
  lunesActual,
  sumarSemanas,
} from "@/lib/semana";
import { RejillaSemana } from "@/componentes/rejilla-semana";
import { cerrarSesion } from "./login/acciones";

export default async function PaginaMiSemana({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const { semana } = await searchParams;
  const lunesHoy = lunesActual();
  const lunes =
    typeof semana === "string" && esLunesIso(semana) ? semana : lunesHoy;

  const datos = await cargarMiSemana(lunes);

  if (!datos) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-bold">Clooki</h1>
          <p className="mt-3 text-sm text-neutral-600">
            Tu usuario no está dado de alta en Clooki. Pide a un admin que te
            añada en Gestión y vuelve a entrar.
          </p>
          <form action={cerrarSesion} className="mt-6">
            <button
              type="submit"
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-900 hover:text-neutral-900"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </main>
    );
  }

  const { persona } = datos;
  const estiloNav =
    "rounded-lg px-2.5 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-neutral-900";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5 sm:px-6">
      <header className="flex items-center gap-3">
        <span className="text-lg font-bold tracking-tight">Clooki</span>
        {persona.rol === "admin" && (
          <nav aria-label="Admin" className="flex items-center gap-1">
            <Link href="/resumen" className={estiloNav}>
              Resumen
            </Link>
            <Link href="/gestion" className={estiloNav}>
              Gestión
            </Link>
          </nav>
        )}
        <span className="ml-auto hidden text-sm text-neutral-500 sm:inline">
          {persona.nombre}
        </span>
        <Link
          href="/cambiar-contrasena"
          className={`${estiloNav} ml-auto sm:ml-0`}
        >
          Contraseña
        </Link>
        <form action={cerrarSesion}>
          <button type="submit" className={estiloNav}>
            Salir
          </button>
        </form>
      </header>

      <main className="mt-6 flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="mr-2 text-xl font-bold tracking-tight">Mi semana</h1>
          <nav aria-label="Semana" className="flex items-center gap-1">
            <Link
              href={`/?semana=${sumarSemanas(lunes, -1)}`}
              aria-label="Semana anterior"
              className={estiloNav}
            >
              ←
            </Link>
            <span className="min-w-36 text-center text-sm font-medium text-neutral-700 tabular-nums">
              {etiquetaSemana(lunes)}
            </span>
            <Link
              href={`/?semana=${sumarSemanas(lunes, 1)}`}
              aria-label="Semana siguiente"
              className={estiloNav}
            >
              →
            </Link>
            {lunes !== lunesHoy && (
              <Link href="/" className={estiloNav}>
                Hoy
              </Link>
            )}
          </nav>
        </div>

        <RejillaSemana
          key={lunes}
          personaId={persona.id}
          lunesIso={lunes}
          lineas={datos.lineas}
          clientes={datos.clientes}
          horas={datos.horas}
        />
      </main>
    </div>
  );
}
