"use client";

// Puente «Mis tareas» (roadmap-tareas.md §4): tus tarjetas del tablero, a
// un clic de convertirse en línea de la rejilla. El único automatismo es
// pendiente → en curso al apuntar tiempo (guardado manual o cronómetro);
// «hecha» siempre es decisión humana.

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import { idLinea, limpiarTarea } from "@/lib/semana";
import { useCronometros } from "./cronometros";
import type { LineaSemana, TarjetaMia } from "@/lib/datos/mi-semana";
import type { Cliente, Proyecto } from "@/lib/tipos";

interface Props {
  clientes: (Cliente & { proyectos: Proyecto[] })[];
  /** Estado controlado por la rejilla: el check de línea completada y
   *  este panel comparten las mismas tarjetas (marcar en un sitio se
   *  refleja en el otro sin recargar). */
  tarjetas: TarjetaMia[];
  alCambiar: React.Dispatch<React.SetStateAction<TarjetaMia[]>>;
  /** Claves (idLinea) de las líneas ya visibles: se marcan y no se duplican. */
  clavesExistentes: string[];
  alAnadir: (lineas: LineaSemana[]) => void;
  /** La rejilla llama al fn registrado tras guardar horas con éxito. */
  conectarGuardado: (fn: (proyectoId: string, tarea: string) => void) => void;
}

/** Clave de línea que produciría esta tarjeta al llevarla a la rejilla. */
function claveDeTarjeta(t: TarjetaMia): string {
  return idLinea(t.proyecto_id, limpiarTarea(t.titulo));
}

/** Quita acentos/diacríticos y baja a minúsculas para comparar. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function MisTareas({
  clientes,
  tarjetas,
  alCambiar: setTarjetas,
  clavesExistentes,
  alAnadir,
  conectarGuardado,
}: Props) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const crono = useCronometros();
  const idBase = useId();
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  // Cada bloque se pliega por separado (decide qué lista ver).
  const [verMias, setVerMias] = useState(true);
  const [verCreadas, setVerCreadas] = useState(true);
  const [anuncio, setAnuncio] = useState("");
  const tarjetasRef = useRef(tarjetas);
  useEffect(() => {
    tarjetasRef.current = tarjetas;
  });

  const porProyecto = useMemo(() => {
    const m = new Map<string, { proyecto: Proyecto; cliente: Cliente }>();
    for (const c of clientes) {
      const cliente: Cliente = { id: c.id, nombre: c.nombre, activo: c.activo };
      for (const p of c.proyectos) m.set(p.id, { proyecto: p, cliente });
    }
    return m;
  }, [clientes]);

  // Tarjetas con proyecto activo, agrupadas por cliente. Dentro de cada
  // grupo: en curso primero (lo que vienes a continuar), luego pendientes;
  // a igualdad, el orden del tablero. Dos bloques: las asignadas a mí (mi
  // trabajo) y las que creé para otros y sigo hasta que se terminen.
  const agrupar = useMemo(
    () => (lista: TarjetaMia[]) => {
      const resueltas = lista.flatMap((t) => {
        const r = porProyecto.get(t.proyecto_id);
        return r ? [{ t, ...r }] : [];
      });
      const porCliente = new Map<string, typeof resueltas>();
      for (const r of resueltas) {
        const l = porCliente.get(r.cliente.id);
        if (l) l.push(r);
        else porCliente.set(r.cliente.id, [r]);
      }
      const peso = { en_curso: 0, pendiente: 1, hecha: 2 } as const;
      return [...porCliente.values()]
        .map((g) =>
          g.sort(
            (a, b) =>
              peso[a.t.estado] - peso[b.t.estado] ||
              a.t.posicion - b.t.posicion,
          ),
        )
        .sort((a, b) =>
          a[0].cliente.nombre.localeCompare(b[0].cliente.nombre, "es"),
        );
    },
    [porProyecto],
  );
  const gruposMias = useMemo(
    () => agrupar(tarjetas.filter((t) => t.mia)),
    [agrupar, tarjetas],
  );
  const gruposCreadas = useMemo(
    () => agrupar(tarjetas.filter((t) => !t.mia)),
    [agrupar, tarjetas],
  );
  type Grupos = ReturnType<typeof agrupar>;

  const nMias = gruposMias.reduce((s, g) => s + g.length, 0);
  const nCreadas = gruposCreadas.reduce((s, g) => s + g.length, 0);
  const n = nMias + nCreadas;
  const existentes = new Set(clavesExistentes);

  // Buscador (como en «+ Añadir línea»): filtra por título de la tarjeta,
  // proyecto o cliente, sin distinguir acentos ni mayúsculas.
  const aguja = normalizar(busqueda.trim());
  const filtrar = (grupos: Grupos): Grupos =>
    aguja === ""
      ? grupos
      : grupos
          .map((grupo) =>
            grupo.filter(
              ({ t, proyecto, cliente }) =>
                normalizar(t.titulo).includes(aguja) ||
                normalizar(proyecto.nombre).includes(aguja) ||
                normalizar(cliente.nombre).includes(aguja),
            ),
          )
          .filter((grupo) => grupo.length > 0);
  const miasVisibles = filtrar(gruposMias);
  const creadasVisibles = filtrar(gruposCreadas);
  const nVisibles =
    miasVisibles.reduce((s, g) => s + g.length, 0) +
    creadasVisibles.reduce((s, g) => s + g.length, 0);

  // ── Automatismo pendiente → en curso ──

  function alRegistrarTiempo(proyectoId: string, tarea: string) {
    const k = idLinea(proyectoId, tarea);
    const t = tarjetasRef.current.find(
      (x) => x.estado === "pendiente" && claveDeTarjeta(x) === k,
    );
    if (!t) return;
    setTarjetas((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, estado: "en_curso" } : x)),
    );
    // Guarda de carrera en servidor: solo si sigue pendiente.
    void supabase
      .from("tarjetas")
      .update({ estado: "en_curso" })
      .eq("id", t.id)
      .eq("estado", "pendiente")
      .then(({ error }) => {
        if (error) {
          setTarjetas((prev) =>
            prev.map((x) =>
              x.id === t.id ? { ...x, estado: "pendiente" } : x,
            ),
          );
        } else {
          setAnuncio(`«${t.titulo}» pasa a En curso.`);
        }
      });
  }

  const alRegistrarRef = useRef(alRegistrarTiempo);
  useEffect(() => {
    alRegistrarRef.current = alRegistrarTiempo;
  });

  useEffect(() => {
    conectarGuardado((proyectoId, tarea) =>
      alRegistrarRef.current(proyectoId, tarea),
    );
  }, [conectarGuardado]);

  useEffect(() => {
    if (!crono) return;
    return crono.suscribir((e) => {
      if (e.tipo === "inicio") alRegistrarRef.current(e.proyectoId, e.tarea);
    });
  }, [crono]);

  // ── Acciones ──

  function anadir(t: TarjetaMia, proyecto: Proyecto, cliente: Cliente) {
    const tarea = limpiarTarea(t.titulo);
    if (existentes.has(idLinea(t.proyecto_id, tarea))) return;
    alAnadir([{ ...proyecto, cliente, tarea }]);
    setAbierto(false);
    setAnuncio(`Línea de «${t.titulo}» añadida a la semana.`);
  }

  async function marcarHecha(t: TarjetaMia) {
    const { error } = await supabase
      .from("tarjetas")
      .update({ estado: "hecha" })
      .eq("id", t.id);
    if (error) {
      setAnuncio("No se pudo marcar como hecha.");
      return;
    }
    setTarjetas((prev) => prev.filter((x) => x.id !== t.id));
    setAnuncio(`«${t.titulo}» hecha.`);
  }

  // ── Render ──

  if (!abierto) {
    return (
      <>
        <p aria-live="polite" className="sr-only">
          {anuncio}
        </p>
        <button
          type="button"
          onClick={() => {
            setBusqueda("");
            setAbierto(true);
          }}
          aria-expanded={false}
          className="inline-flex items-center gap-1.5 rounded-lg border border-borde-fuerte px-3 py-2 text-sm font-medium text-texto transition-colors hover:border-acento hover:text-acento focus-visible:outline-2 focus-visible:outline-acento"
        >
          Mis tareas
          {n > 0 && (
            <span
              title={`${nMias} asignadas a ti / ${nCreadas} creadas por ti`}
              className="rounded-full bg-acento px-1.5 py-0.5 text-xs font-semibold tabular-nums text-superficie"
            >
              {nMias}/{nCreadas}
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <div
      className="w-full max-w-md rounded-xl border border-borde bg-superficie p-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") setAbierto(false);
      }}
    >
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-texto-suave">Mis tareas</p>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          aria-label="Cerrar Mis tareas"
          className="flex size-8 items-center justify-center rounded-md text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento"
        >
          ✕
        </button>
      </div>

      {n === 0 ? (
        <p className="py-2 text-sm text-texto-suave">
          No tienes tarjetas pendientes.{" "}
          <Link
            href="/tareas"
            className="font-medium text-acento hover:underline focus-visible:outline-2 focus-visible:outline-acento"
          >
            Cógelas en el tablero
          </Link>
          .
        </p>
      ) : (
        <>
          <label htmlFor={`${idBase}-buscar`} className="sr-only">
            Buscar tarea
          </label>
          <input
            id={`${idBase}-buscar`}
            type="text"
            autoFocus
            autoComplete="off"
            placeholder="Buscar tarea…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="h-10 w-full rounded-lg border border-borde-fuerte bg-superficie px-2.5 text-sm text-tinta outline-none placeholder:text-texto-suave focus:border-acento focus:ring-2 focus:ring-acento/20"
          />
          <p aria-live="polite" className="sr-only">
            {nVisibles === 1 ? "1 tarea" : `${nVisibles} tareas`}
          </p>
          {nVisibles === 0 ? (
            <p className="px-1 py-3 text-sm text-texto-suave">
              Ninguna tarea coincide
            </p>
          ) : (
          <div className="mt-2 flex flex-col gap-2">
            {miasVisibles.length > 0 && (
              <section
                aria-labelledby={`${idBase}-mias`}
                className="rounded-lg border border-borde p-1.5"
              >
                <button
                  type="button"
                  id={`${idBase}-mias`}
                  aria-expanded={verMias}
                  onClick={() => setVerMias((v) => !v)}
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs font-semibold text-tinta transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento"
                >
                  <span
                    aria-hidden="true"
                    className={`text-[10px] text-texto-suave transition-transform ${verMias ? "rotate-90" : ""}`}
                  >
                    ▶
                  </span>
                  Asignadas a mí
                  <span className="font-normal text-texto-suave">· {nMias}</span>
                </button>
                {verMias && listaGrupos(miasVisibles, false)}
              </section>
            )}
            {creadasVisibles.length > 0 && (
              <section
                aria-labelledby={`${idBase}-creadas`}
                className="rounded-lg border border-borde p-1.5"
              >
                <button
                  type="button"
                  id={`${idBase}-creadas`}
                  aria-expanded={verCreadas}
                  onClick={() => setVerCreadas((v) => !v)}
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs font-semibold text-tinta transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento"
                >
                  <span
                    aria-hidden="true"
                    className={`text-[10px] text-texto-suave transition-transform ${verCreadas ? "rotate-90" : ""}`}
                  >
                    ▶
                  </span>
                  Creadas por mí
                  <span className="font-normal text-texto-suave">
                    · {nCreadas} · las llevan otros, las sigues hasta el final
                  </span>
                </button>
                {verCreadas && listaGrupos(creadasVisibles, true)}
              </section>
            )}
          </div>
          )}
          <p className="mt-2 border-t border-borde px-1 pt-2 text-xs text-texto-suave">
            <Link
              href="/tareas"
              className="font-medium text-acento hover:underline focus-visible:outline-2 focus-visible:outline-acento"
            >
              Ir al tablero →
            </Link>
          </p>
        </>
      )}
    </div>
  );

  /** Lista agrupada por cliente; `creadas` muestra quién la tiene. */
  function listaGrupos(grupos: Grupos, creadas: boolean) {
    return (
          <ul className="flex flex-col">
            {grupos.map((grupo) => (
              <li key={grupo[0].cliente.id} className="mt-1">
                <p
                  className={`rounded-md border-l-4 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide ${
                    creadas
                      ? "border-aviso bg-aviso-suave text-aviso"
                      : "border-acento bg-acento-suave text-acento"
                  }`}
                >
                  {grupo[0].cliente.nombre}
                </p>
                <ul className="flex flex-col">
                  {grupo.map(({ t, proyecto, cliente }) => {
                    const enRejilla = !creadas && existentes.has(claveDeTarjeta(t));
                    const estiloFila =
                      "flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento disabled:cursor-default disabled:hover:bg-transparent";
                    const contenido = (
                      <>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-sm font-medium ${enRejilla ? "text-texto-suave" : "text-tinta"}`}
                          >
                            {enRejilla && "✓ "}
                            {t.titulo}
                          </span>
                          <span className="block truncate text-xs text-texto-suave">
                            {proyecto.nombre}
                            {creadas &&
                              (t.asignados.length > 0
                                ? ` · ${t.asignados.join(", ")}`
                                : "")}
                          </span>
                        </span>
                        {creadas && t.asignados.length === 0 && (
                          <span className="shrink-0 rounded-full bg-aviso-suave px-2 py-0.5 text-[11px] font-medium text-aviso">
                            Sin coger
                          </span>
                        )}
                        {t.estado === "en_curso" && (
                          <span className="shrink-0 rounded-full bg-acento-suave px-2 py-0.5 text-[11px] font-medium text-acento">
                            En curso
                          </span>
                        )}
                      </>
                    );
                    return (
                      <li key={t.id} className="flex items-center gap-1">
                        {creadas ? (
                          // Una tarjeta que llevan otros no es una línea de
                          // mi semana: se abre su ficha en el tablero.
                          <Link
                            href={`/tareas?tarjeta=${t.id}`}
                            title="Abrir la ficha en el tablero"
                            className={estiloFila}
                          >
                            {contenido}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            disabled={enRejilla}
                            onClick={() => anadir(t, proyecto, cliente)}
                            title={
                              enRejilla
                                ? "Ya tiene línea esta semana"
                                : "Añadir como línea de la semana"
                            }
                            className={estiloFila}
                          >
                            {contenido}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void marcarHecha(t)}
                          title={`Marcar «${t.titulo}» como hecha`}
                          aria-label={`Marcar «${t.titulo}» como hecha`}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-texto-suave transition-colors hover:bg-exito-suave hover:text-exito focus-visible:outline-2 focus-visible:outline-acento"
                        >
                          <svg
                            viewBox="0 0 16 16"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="8" cy="8" r="6.5" strokeWidth="1.4" />
                            <path d="M5.2 8.2 7.2 10.2 10.8 6" />
                          </svg>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
    );
  }
}
