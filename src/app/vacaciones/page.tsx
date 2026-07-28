import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  DIAS_VACACIONES_ANIO,
  cargarMisVacaciones,
} from "@/lib/datos/vacaciones";
import {
  aIso,
  contarLaborables,
  etiquetaRangoFechas,
} from "@/lib/semana";
import { BotonEnvio } from "@/componentes/boton-envio";
import { Cabecera } from "@/componentes/cabecera";
import { anadirVacaciones, borrarVacaciones } from "./acciones";
import type { Vacacion } from "@/lib/tipos";

export const metadata: Metadata = { title: "Mis vacaciones · Clooki" };

const ESTILO_INPUT =
  "h-10 rounded-lg border border-borde-fuerte bg-superficie px-3 text-sm text-tinta outline-none focus:border-acento focus:ring-2 focus:ring-acento/20";
const ESTILO_BOTON_PRIMARIO =
  "h-10 rounded-lg bg-marca-accion px-4 text-sm font-semibold text-sobre-marca transition-colors hover:bg-marca-accion-fuerte focus-visible:outline-2 focus-visible:outline-acento";
const ESTILO_BOTON_SUAVE =
  "rounded-md px-2 py-1 text-xs font-medium text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento";

const MENSAJES_ERROR: Record<string, string> = {
  fechas:
    "Revisa las fechas: «hasta» no puede ser anterior a «desde» y el periodo no puede pasar de 60 días.",
  solape: "Ese periodo se solapa con otro que ya tienes apuntado.",
  limite: `Superarías los ${DIAS_VACACIONES_ANIO} días laborables de vacaciones de ese año.`,
  "1": "No se pudo guardar el último cambio. Inténtalo de nuevo.",
};

function FilaVacacion({ v, hoy }: { v: Vacacion; hoy: string }) {
  const enCurso = v.desde <= hoy && hoy <= v.hasta;
  const laborables = contarLaborables(v.desde, v.hasta);
  return (
    <li className="flex items-center gap-3 border-t border-borde py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-tinta">
          {etiquetaRangoFechas(v.desde, v.hasta)}
          {enCurso && (
            <span className="rounded-full bg-acento-suave px-2 py-0.5 text-[11px] font-medium text-acento">
              Ahora
            </span>
          )}
        </p>
        {v.nota && (
          <p className="truncate text-xs text-texto-suave">{v.nota}</p>
        )}
      </div>
      <span className="shrink-0 text-xs tabular-nums text-texto-suave">
        {laborables} lab.
      </span>
      <form action={borrarVacaciones}>
        <input type="hidden" name="id" value={v.id} />
        <BotonEnvio className={ESTILO_BOTON_SUAVE} pendienteTexto="Borrando…">
          Borrar
        </BotonEnvio>
      </form>
    </li>
  );
}

export default async function PaginaVacaciones({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;
  const datos = await cargarMisVacaciones();
  if (!datos) redirect("/");

  const { persona, vacaciones } = datos;
  const hoy = aIso(new Date());
  const anio = hoy.slice(0, 4);

  const proximas = vacaciones
    .filter((v) => v.hasta >= hoy)
    .sort((a, b) => a.desde.localeCompare(b.desde));
  const pasadas = vacaciones.filter((v) => v.hasta < hoy);

  // Días laborables apuntados dentro del año en curso (los periodos no se
  // solapan — lo garantiza la BD — así que la suma es exacta).
  const laborablesAnio = vacaciones.reduce((suma, v) => {
    const desde = v.desde < `${anio}-01-01` ? `${anio}-01-01` : v.desde;
    const hasta = v.hasta > `${anio}-12-31` ? `${anio}-12-31` : v.hasta;
    return desde > hasta ? suma : suma + contarLaborables(desde, hasta);
  }, 0);

  const restantes = Math.max(0, DIAS_VACACIONES_ANIO - laborablesAnio);

  const mensajeError =
    typeof error === "string" ? MENSAJES_ERROR[error] : undefined;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-4 sm:px-6">
      <Cabecera persona={persona} seccion="vacaciones" />

      <main className="mt-5 flex-1">
        <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-marca text-xl font-semibold tracking-tight text-tinta">
            Mis vacaciones
          </h1>
          <p className="text-sm text-texto-suave">
            {anio}:{" "}
            <span className="font-medium text-tinta tabular-nums">
              {laborablesAnio} de {DIAS_VACACIONES_ANIO}
            </span>{" "}
            días laborables ·{" "}
            {restantes === 1 ? "queda 1 día" : `quedan ${restantes} días`}
          </p>
        </div>

        {mensajeError && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-error/40 bg-error-suave px-3 py-2 text-sm text-error"
          >
            {mensajeError}
          </p>
        )}

        {/* ── Apuntar un periodo ── */}
        <section className="rounded-xl border border-borde bg-superficie p-4">
          <h2 className="mb-3 text-sm font-semibold text-tinta">
            Apuntar un periodo
          </h2>
          <form
            action={anadirVacaciones}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="vac-desde" className="text-xs text-texto-suave">
                Desde
              </label>
              <input
                id="vac-desde"
                type="date"
                name="desde"
                required
                className={ESTILO_INPUT}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="vac-hasta" className="text-xs text-texto-suave">
                Hasta
              </label>
              <input
                id="vac-hasta"
                type="date"
                name="hasta"
                required
                className={ESTILO_INPUT}
              />
            </div>
            <div className="flex min-w-40 flex-1 flex-col gap-1">
              <label htmlFor="vac-nota" className="text-xs text-texto-suave">
                Nota (opcional)
              </label>
              <input
                id="vac-nota"
                name="nota"
                maxLength={120}
                placeholder="p. ej. Semana Santa"
                className={ESTILO_INPUT}
              />
            </div>
            <BotonEnvio
              className={ESTILO_BOTON_PRIMARIO}
              pendienteTexto="Guardando…"
            >
              Añadir
            </BotonEnvio>
          </form>
          <p className="mt-3 text-xs text-texto-suave">
            Ambas fechas incluidas; un solo día también vale (desde = hasta).
            «Lab.» cuenta días laborables L–V — los festivos no se descuentan.
            Máximo {DIAS_VACACIONES_ANIO} días laborables por año natural.
          </p>
        </section>

        {/* ── Próximas y en curso ── */}
        <section className="mt-5 rounded-xl border border-borde bg-superficie p-4">
          <h2 className="mb-1 text-sm font-semibold text-tinta">
            Próximas y en curso
          </h2>
          {proximas.length === 0 ? (
            <p className="py-4 text-center text-sm text-texto-suave">
              Nada apuntado todavía.
            </p>
          ) : (
            <ul>
              {proximas.map((v) => (
                <FilaVacacion key={v.id} v={v} hoy={hoy} />
              ))}
            </ul>
          )}
        </section>

        {/* ── Pasadas ── */}
        {pasadas.length > 0 && (
          <section className="mt-5 rounded-xl border border-borde bg-superficie p-4">
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-tinta focus-visible:outline-2 focus-visible:outline-acento">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0 text-texto-suave transition-transform group-open:rotate-90"
                >
                  <path
                    d="M4 2l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Pasadas ({pasadas.length})
              </summary>
              <ul className="mt-1">
                {pasadas.map((v) => (
                  <FilaVacacion key={v.id} v={v} hoy={hoy} />
                ))}
              </ul>
            </details>
          </section>
        )}
      </main>
    </div>
  );
}
