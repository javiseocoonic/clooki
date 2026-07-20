import Link from "next/link";
import { cargarMiSemana } from "@/lib/datos/mi-semana";
import { cargarEstadoWordle } from "@/lib/datos/wordle";
import {
  esLunesIso,
  etiquetaSemana,
  lunesActual,
  sumarSemanas,
} from "@/lib/semana";
import { RejillaSemana } from "@/componentes/rejilla-semana";
import { AvisoSemanaIncompleta } from "@/componentes/aviso-semana-incompleta";
import { Wordle } from "@/componentes/wordle";
import { Cabecera } from "@/componentes/cabecera";
import { Logotipo } from "@/componentes/logotipo";
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

  const esSemanaActual = lunes === lunesHoy;
  const [datos, estadoWordle] = await Promise.all([
    cargarMiSemana(lunes),
    esSemanaActual ? cargarEstadoWordle() : Promise.resolve(null),
  ]);

  if (!datos) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-tinta">
            <Logotipo className="text-2xl" />
          </h1>
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

  return (
    <ProveedorCronometros
      personaId={persona.id}
      sesionesIniciales={datos.sesiones}
      clientes={datos.clientes}
    >
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-4 sm:px-6">
      <Cabecera persona={persona} seccion="semana">
        <BandejaCronometros clientes={datos.clientes} />
      </Cabecera>

      <main className="mt-5 flex-1">
        <SesionesAntiguas />
        {/* Título de la vista + navegación de semana agrupada */}
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-marca text-xl font-semibold tracking-tight text-tinta">
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
          clientesRecientes={datos.clientesRecientes}
          horas={datos.horas}
          misTarjetas={datos.misTarjetas}
        />

        {/* Wordle: solo en la semana actual (el juego es siempre de la
            semana en curso; verlo desde una semana pasada confundiría). */}
        {esSemanaActual && (
          <div className="mx-auto mt-6 w-full max-w-md">
            <Wordle inicial={estadoWordle} personaId={persona.id} />
          </div>
        )}
      </main>
    </div>
    </ProveedorCronometros>
  );
}
