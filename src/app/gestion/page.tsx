import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CLIENTE_INTERNO, cargarAdmin } from "@/lib/datos/admin";
import { BotonEnvio } from "@/componentes/boton-envio";
import { Cabecera } from "@/componentes/cabecera";
import {
  BandejaCronometros,
  ProveedorCronometros,
} from "@/componentes/cronometros";
import {
  alternarActivo,
  alternarRol,
  crearClienteConProyectos,
  crearPersona,
  crearProyecto,
} from "./acciones";

export const metadata: Metadata = { title: "Gestión · Clooki" };

const ESTILO_INPUT =
  "h-10 rounded-lg border border-borde-fuerte bg-superficie px-3 text-sm text-tinta outline-none focus:border-acento focus:ring-2 focus:ring-acento/20";
const ESTILO_BOTON_PRIMARIO =
  "h-10 rounded-lg bg-marca-accion px-3 text-sm font-semibold text-sobre-marca transition-colors hover:bg-marca-accion-fuerte focus-visible:outline-2 focus-visible:outline-acento";
const ESTILO_BOTON_SUAVE =
  "rounded-md px-2 py-1 text-xs font-medium text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento";

function BotonArchivar({
  tabla,
  id,
  activo,
}: {
  tabla: "clientes" | "proyectos" | "personas";
  id: string;
  activo: boolean;
}) {
  return (
    <form action={alternarActivo}>
      <input type="hidden" name="tabla" value={tabla} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activar" value={activo ? "0" : "1"} />
      <button type="submit" className={ESTILO_BOTON_SUAVE}>
        {activo ? "Archivar" : "Reactivar"}
      </button>
    </form>
  );
}

export default async function PaginaGestion({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;
  const datos = await cargarAdmin();
  if (!datos) redirect("/");

  const { personas, clientes, proyectos } = datos;
  const clientesConProyectos = clientes
    .filter((c) => c.activo)
    .map((c) => ({
      ...c,
      proyectos: proyectos.filter((p) => p.cliente_id === c.id && p.activo),
    }));
  // Interno al final; el resto por nombre (ya vienen ordenados).
  const clientesOrdenados = [
    ...clientes.filter((c) => c.nombre !== CLIENTE_INTERNO),
    ...clientes.filter((c) => c.nombre === CLIENTE_INTERNO),
  ];

  return (
    <ProveedorCronometros
      personaId={datos.persona.id}
      sesionesIniciales={datos.sesiones}
      clientes={clientesConProyectos}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-4 sm:px-6">
        <Cabecera persona={datos.persona} seccion="gestion">
          <BandejaCronometros clientes={clientesConProyectos} />
        </Cabecera>

        <main className="mt-5 flex-1">
          <h1 className="font-marca mb-4 text-xl font-semibold tracking-tight text-tinta">
            Gestión
          </h1>

          {error === "1" && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-error/40 bg-error-suave px-3 py-2 text-sm text-error"
            >
              No se pudo guardar el último cambio. Revisa los datos e
              inténtalo de nuevo.
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            {/* ── Clientes y proyectos ── */}
            <section className="rounded-xl border border-borde bg-superficie p-4">
              <h2 className="mb-3 text-sm font-semibold text-tinta">
                Clientes y proyectos
              </h2>

              <form
                action={crearClienteConProyectos}
                className="mb-4 flex flex-col gap-2 rounded-lg bg-superficie-2 p-3"
              >
                <div className="flex flex-wrap gap-2">
                  <label className="sr-only" htmlFor="nuevo-cliente-nombre">
                    Nombre del cliente
                  </label>
                  <input
                    id="nuevo-cliente-nombre"
                    name="nombre"
                    required
                    placeholder="Nuevo cliente"
                    className={`${ESTILO_INPUT} min-w-40 flex-1`}
                  />
                  <BotonEnvio
                    className={ESTILO_BOTON_PRIMARIO}
                    pendienteTexto="Creando…"
                  >
                    Crear cliente
                  </BotonEnvio>
                </div>
                <label className="sr-only" htmlFor="nuevo-cliente-proyectos">
                  Proyectos iniciales
                </label>
                <input
                  id="nuevo-cliente-proyectos"
                  name="proyectos"
                  placeholder="Proyectos iniciales, separados por comas (opcional)"
                  className={ESTILO_INPUT}
                />
              </form>

              <ul>
                {clientesOrdenados.map((c) => {
                  const suyos = proyectos.filter((p) => p.cliente_id === c.id);
                  return (
                    <li key={c.id} className="border-t border-borde">
                      <details className="group">
                        <summary className="flex cursor-pointer items-center gap-2 py-2 focus-visible:outline-2 focus-visible:outline-acento">
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 12 12"
                            fill="none"
                            aria-hidden="true"
                            className="shrink-0 text-texto-suave transition-transform group-open:rotate-90"
                          >
                            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span
                            className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                              c.activo ? "text-tinta" : "text-texto-suave line-through"
                            }`}
                          >
                            {c.nombre}
                          </span>
                          <span className="text-xs text-texto-suave">
                            {suyos.filter((p) => p.activo).length} proy.
                          </span>
                          <BotonArchivar tabla="clientes" id={c.id} activo={c.activo} />
                        </summary>

                        <div className="mb-2 ml-5">
                          <ul>
                            {suyos.map((p) => (
                              <li
                                key={p.id}
                                className="flex items-center gap-2 py-1 text-sm"
                              >
                                <span
                                  className={`min-w-0 flex-1 truncate ${
                                    p.activo ? "text-texto" : "text-texto-suave line-through"
                                  }`}
                                >
                                  {p.nombre}
                                </span>
                                <BotonArchivar tabla="proyectos" id={p.id} activo={p.activo} />
                              </li>
                            ))}
                          </ul>
                          {c.activo && (
                            <form action={crearProyecto} className="mt-1.5 flex gap-2">
                              <input type="hidden" name="cliente_id" value={c.id} />
                              <label className="sr-only" htmlFor={`proy-${c.id}`}>
                                Nuevo proyecto de {c.nombre}
                              </label>
                              <input
                                id={`proy-${c.id}`}
                                name="nombre"
                                required
                                placeholder="Nuevo proyecto o tarea"
                                className={`${ESTILO_INPUT} h-9 flex-1`}
                              />
                              <BotonEnvio
                                className="h-9 rounded-lg border border-borde-fuerte px-3 text-sm font-medium text-texto transition-colors hover:border-acento hover:text-acento focus-visible:outline-2 focus-visible:outline-acento"
                                pendienteTexto="Añadiendo…"
                              >
                                Añadir
                              </BotonEnvio>
                            </form>
                          )}
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* ── Personas ── */}
            <section className="rounded-xl border border-borde bg-superficie p-4">
              <h2 className="mb-3 text-sm font-semibold text-tinta">
                Personas
              </h2>

              <form
                action={crearPersona}
                className="mb-1 flex flex-wrap gap-2 rounded-lg bg-superficie-2 p-3"
              >
                <label className="sr-only" htmlFor="nueva-persona-nombre">
                  Nombre
                </label>
                <input
                  id="nueva-persona-nombre"
                  name="nombre"
                  required
                  placeholder="Nombre"
                  className={`${ESTILO_INPUT} min-w-32 flex-1`}
                />
                <label className="sr-only" htmlFor="nueva-persona-email">
                  Correo
                </label>
                <input
                  id="nueva-persona-email"
                  name="email"
                  type="email"
                  required
                  pattern=".+@(coonic\.com|proyectoscoonic\.com)"
                  placeholder="nombre@coonic.com"
                  className={`${ESTILO_INPUT} min-w-44 flex-1`}
                />
                <label className="sr-only" htmlFor="nueva-persona-rol">
                  Rol
                </label>
                <select
                  id="nueva-persona-rol"
                  name="rol"
                  defaultValue="miembro"
                  className={ESTILO_INPUT}
                >
                  <option value="miembro">Miembro</option>
                  <option value="admin">Admin</option>
                </select>
                <BotonEnvio
                  className={ESTILO_BOTON_PRIMARIO}
                  pendienteTexto="Añadiendo…"
                >
                  Añadir
                </BotonEnvio>
              </form>
              <p className="mb-3 text-xs text-texto-suave">
                El alta aquí no crea la cuenta de acceso: créala también en
                Supabase (Authentication → Users) con el mismo correo.
              </p>

              <ul>
                {personas.map((p) => (
                  <li key={p.id} className="border-t border-borde py-2">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-sm font-medium ${
                            p.activo ? "text-tinta" : "text-texto-suave line-through"
                          }`}
                        >
                          {p.nombre}
                        </span>
                        <span className="block truncate text-xs text-texto-suave">
                          {p.email}
                        </span>
                      </div>
                      {p.rol === "admin" && (
                        <span className="rounded-md bg-acento-suave px-1.5 py-0.5 text-xs font-medium text-acento">
                          admin
                        </span>
                      )}
                      {p.id !== datos.persona.id && (
                        <>
                          <form action={alternarRol}>
                            <input type="hidden" name="id" value={p.id} />
                            <input
                              type="hidden"
                              name="rol"
                              value={p.rol === "admin" ? "miembro" : "admin"}
                            />
                            <button type="submit" className={ESTILO_BOTON_SUAVE}>
                              {p.rol === "admin" ? "Hacer miembro" : "Hacer admin"}
                            </button>
                          </form>
                          <BotonArchivar tabla="personas" id={p.id} activo={p.activo} />
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </main>
      </div>
    </ProveedorCronometros>
  );
}
