"use client";

// Puente «Mis tareas» (roadmap-tareas.md §4): tus tarjetas del tablero, a
// un clic de convertirse en línea de la rejilla. El único automatismo es
// pendiente → en curso al apuntar tiempo (guardado manual o cronómetro);
// «hecha» siempre es decisión humana.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import { idLinea, limpiarTarea } from "@/lib/semana";
import { useCronometros } from "./cronometros";
import type { LineaSemana, TarjetaMia } from "@/lib/datos/mi-semana";
import type { Cliente, Proyecto } from "@/lib/tipos";

interface Props {
  clientes: (Cliente & { proyectos: Proyecto[] })[];
  tarjetasIniciales: TarjetaMia[];
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

export function MisTareas({
  clientes,
  tarjetasIniciales,
  clavesExistentes,
  alAnadir,
  conectarGuardado,
}: Props) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const crono = useCronometros();
  const [tarjetas, setTarjetas] = useState(tarjetasIniciales);
  const [abierto, setAbierto] = useState(false);
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
  // a igualdad, el orden del tablero.
  const grupos = useMemo(() => {
    const resueltas = tarjetas.flatMap((t) => {
      const r = porProyecto.get(t.proyecto_id);
      return r ? [{ t, ...r }] : [];
    });
    const porCliente = new Map<string, typeof resueltas>();
    for (const r of resueltas) {
      const lista = porCliente.get(r.cliente.id);
      if (lista) lista.push(r);
      else porCliente.set(r.cliente.id, [r]);
    }
    const peso = { en_curso: 0, pendiente: 1, hecha: 2 } as const;
    return [...porCliente.values()]
      .map((lista) =>
        lista.sort(
          (a, b) =>
            peso[a.t.estado] - peso[b.t.estado] ||
            a.t.posicion - b.t.posicion,
        ),
      )
      .sort((a, b) =>
        a[0].cliente.nombre.localeCompare(b[0].cliente.nombre, "es"),
      );
  }, [tarjetas, porProyecto]);

  const n = grupos.reduce((s, g) => s + g.length, 0);
  const existentes = new Set(clavesExistentes);

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
          onClick={() => setAbierto(true)}
          aria-expanded={false}
          className="inline-flex items-center gap-1.5 rounded-lg border border-borde-fuerte px-3 py-2 text-sm font-medium text-texto transition-colors hover:border-acento hover:text-acento focus-visible:outline-2 focus-visible:outline-acento"
        >
          Mis tareas
          {n > 0 && (
            <span className="rounded-full bg-acento px-1.5 py-0.5 text-xs font-semibold tabular-nums text-superficie">
              {n}
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
          <ul className="flex flex-col">
            {grupos.map((grupo) => (
              <li key={grupo[0].cliente.id}>
                <p className="px-1 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-texto-suave">
                  {grupo[0].cliente.nombre}
                </p>
                <ul className="flex flex-col">
                  {grupo.map(({ t, proyecto, cliente }) => {
                    const enRejilla = existentes.has(claveDeTarjeta(t));
                    return (
                      <li key={t.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={enRejilla}
                          onClick={() => anadir(t, proyecto, cliente)}
                          title={
                            enRejilla
                              ? "Ya tiene línea esta semana"
                              : "Añadir como línea de la semana"
                          }
                          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento disabled:cursor-default disabled:hover:bg-transparent"
                        >
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-sm font-medium ${enRejilla ? "text-texto-suave" : "text-tinta"}`}
                            >
                              {enRejilla && "✓ "}
                              {t.titulo}
                            </span>
                            <span className="block truncate text-xs text-texto-suave">
                              {proyecto.nombre}
                            </span>
                          </span>
                          {t.estado === "en_curso" && (
                            <span className="shrink-0 rounded-full bg-acento-suave px-2 py-0.5 text-[11px] font-medium text-acento">
                              En curso
                            </span>
                          )}
                        </button>
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
}
