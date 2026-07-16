import Link from "next/link";
import { cargarMiSemana } from "@/lib/datos/mi-semana";
import {
  esLunesIso,
  etiquetaSemana,
  lunesActual,
  sumarSemanas,
} from "@/lib/semana";
import { RejillaSemana } from "@/componentes/rejilla-semana";
import { AvisoSemanaIncompleta } from "@/componentes/aviso-semana-incompleta";
import {
  BandejaCronometros,
  ProveedorCronometros,
  SesionesAntiguas,
} from "@/componentes/cronometros";
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
          <h1 className="text-xl font-bold text-tinta">Clooki</h1>
          <p className="mt-3 text-sm text-texto">
            Todavía no tienes acceso a Clooki. Pide a un admin que te dé de
            alta y vuelve a entrar.
          </p>
          <form action={cerrarSesion} className="mt-6">
            <button
              type="submit"
              className="rounded-lg border border-borde-fuerte px-4 py-2 text-sm font-medium text-texto transition-colors hover:border-acento hover:text-acento focus-visible:outline-2 focus-visible:outline-acento"
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
    "rounded-lg px-2.5 py-1.5 text-sm text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento";

  return (
    <ProveedorCronometros
      personaId={persona.id}
      sesionesIniciales={datos.sesiones}
      clientes={datos.clientes}
    >
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-4 sm:px-6">
      {/* Barra superior: identidad + navegación de app */}
      <header className="flex items-center gap-2 border-b border-borde pb-3">
        <span className="text-lg font-bold tracking-tight text-tinta">
          Clooki
        </span>
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
        <span className="ml-auto">
          <BandejaCronometros clientes={datos.clientes} />
        </span>
        <span className="hidden text-sm text-texto-suave sm:inline">
          {persona.nombre}
        </span>
        <Link href="/cambiar-contrasena" className={estiloNav}>
          Contraseña
        </Link>
        <form action={cerrarSesion}>
          <button type="submit" className={estiloNav}>
            Salir
          </button>
        </form>
      </header>

      <main className="mt-5 flex-1">
        <SesionesAntiguas />
        {/* Título de la vista + navegación de semana agrupada */}
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-xl font-bold tracking-tight text-tinta">
            Mi semana
          </h1>
          <nav aria-label="Semana" className="flex items-center gap-0.5">
            <Link
              href={`/?semana=${sumarSemanas(lunes, -1)}`}
              aria-label="Semana anterior"
              className="flex size-10 items-center justify-center rounded-lg text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento"
            >
              ←
            </Link>
            <span className="min-w-36 text-center text-sm font-medium text-texto tabular-nums">
              {etiquetaSemana(lunes)}
            </span>
            <Link
              href={`/?semana=${sumarSemanas(lunes, 1)}`}
              aria-label="Semana siguiente"
              className="flex size-10 items-center justify-center rounded-lg text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento"
            >
              →
            </Link>
            {lunes !== lunesHoy && (
              <Link
                href="/"
                className="ml-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-acento transition-colors hover:bg-acento-suave focus-visible:outline-2 focus-visible:outline-acento"
              >
                Hoy
              </Link>
            )}
          </nav>
        </div>

        {lunes === lunesHoy && (
          <AvisoSemanaIncompleta
            dias={datos.diasSinHorasSemanaAnterior}
            lunesAnterior={sumarSemanas(lunes, -1)}
          />
        )}

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
    </ProveedorCronometros>
  );
}
