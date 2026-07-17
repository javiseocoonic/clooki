"use client";

import { useState } from "react";
import type { Cliente, Proyecto } from "@/lib/tipos";
import type { LineaSemana } from "@/lib/datos/mi-semana";
import { idLinea, limpiarTarea } from "@/lib/semana";
import { BuscadorCliente } from "./buscador-cliente";

interface Props {
  clientes: (Cliente & { proyectos: Proyecto[] })[];
  /** Ids de clientes con horas recientes del usuario, más reciente primero. */
  clientesRecientes: string[];
  /**
   * Claves (idLinea) de las líneas ya visibles en la rejilla. Un proyecto
   * puede repetirse con otra tarea; solo se rechaza el par exacto.
   */
  clavesExistentes: string[];
  alAnadir: (lineas: LineaSemana[]) => void;
}

export function AnadirLinea({
  clientes,
  clientesRecientes,
  clavesExistentes,
  alAnadir,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [tarea, setTarea] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const existentes = new Set(clavesExistentes);
  const clientesConOpciones = clientes.filter((c) => c.proyectos.length > 0);

  const clienteElegido = clientesConOpciones.find((c) => c.id === clienteId);
  const n = marcados.size;

  function cerrar() {
    setAbierto(false);
    setClienteId("");
    setMarcados(new Set());
    setTarea("");
    setAviso(null);
  }

  function alternar(proyectoId: string) {
    setAviso(null);
    setMarcados((prev) => {
      const s = new Set(prev);
      if (s.has(proyectoId)) s.delete(proyectoId);
      else s.add(proyectoId);
      return s;
    });
  }

  function anadir() {
    if (!clienteElegido || n === 0) return;
    const cliente: Cliente = {
      id: clienteElegido.id,
      nombre: clienteElegido.nombre,
      activo: clienteElegido.activo,
    };
    const tareaLimpia = limpiarTarea(tarea);
    const elegidos = clienteElegido.proyectos.filter((p) => marcados.has(p.id));
    const nuevas: LineaSemana[] = elegidos
      .filter((p) => !existentes.has(idLinea(p.id, tareaLimpia)))
      .map((p) => ({ ...p, cliente, tarea: tareaLimpia }));
    if (nuevas.length === 0) {
      setAviso(
        tareaLimpia
          ? "Ya tienes esa línea con esa tarea en la semana."
          : "Ya tienes esa línea en la semana. Escribe una tarea para diferenciarla.",
      );
      return;
    }
    alAnadir(nuevas);
    cerrar();
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={clientesConOpciones.length === 0}
        title={
          clientesConOpciones.length === 0
            ? "No hay proyectos activos"
            : undefined
        }
        className="rounded-lg border border-borde-fuerte px-3 py-2 text-sm font-medium text-texto transition-colors hover:border-acento hover:text-acento focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-40"
      >
        + Añadir línea
      </button>
    );
  }

  return (
    <div
      className="w-full max-w-md rounded-xl border border-borde bg-superficie p-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") cerrar();
      }}
    >
      <p className="mb-1.5 text-xs font-medium text-texto-suave">Cliente</p>

      {!clienteElegido ? (
        <BuscadorCliente
          opciones={clientesConOpciones.map((c) => ({
            id: c.id,
            nombre: c.nombre,
          }))}
          recientes={clientesRecientes}
          alElegir={(id) => {
            setClienteId(id);
            setMarcados(new Set());
            setAviso(null);
          }}
        />
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-acento-suave py-1 pl-3 pr-1 text-sm font-medium text-acento">
          {clienteElegido.nombre}
          <button
            type="button"
            onClick={() => {
              setClienteId("");
              setMarcados(new Set());
              setAviso(null);
            }}
            aria-label={`Quitar ${clienteElegido.nombre} y volver a buscar`}
            className="flex size-6 items-center justify-center rounded-full transition-colors hover:bg-acento/15 focus-visible:outline-2 focus-visible:outline-acento"
          >
            ✕
          </button>
        </span>
      )}

      {clienteElegido && (
        <fieldset className="mt-3">
          <legend className="mb-1.5 text-xs font-medium text-texto-suave">
            Proyectos de {clienteElegido.nombre}
          </legend>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-borde">
            {clienteElegido.proyectos.map((p) => (
              <label
                key={p.id}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 border-b border-borde px-3 py-2 text-sm text-tinta transition-colors last:border-b-0 hover:bg-superficie-2"
              >
                <input
                  type="checkbox"
                  checked={marcados.has(p.id)}
                  onChange={() => alternar(p.id)}
                  className="size-4 accent-[var(--acento)]"
                />
                {p.nombre}
              </label>
            ))}
          </div>
          <p aria-live="polite" className="sr-only">
            {n} proyectos seleccionados
          </p>

          <label
            htmlFor="tarea-linea"
            className="mb-1.5 mt-3 block text-xs font-medium text-texto-suave"
          >
            Tarea (opcional) — en qué vas a trabajar
          </label>
          <input
            id="tarea-linea"
            type="text"
            value={tarea}
            onChange={(e) => {
              setTarea(e.target.value);
              setAviso(null);
            }}
            maxLength={120}
            placeholder="p. ej. Ficha de académicos"
            className="h-10 w-full rounded-lg border border-borde bg-superficie px-3 text-sm text-tinta outline-none placeholder:text-texto-suave focus:border-acento focus:ring-2 focus:ring-acento/20"
          />
        </fieldset>
      )}

      {aviso && (
        <p role="alert" className="mt-2 text-xs text-aviso">
          {aviso}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={anadir}
          disabled={n === 0}
          title={n === 0 ? "Marca al menos un proyecto" : undefined}
          className="rounded-lg bg-marca-accion px-3 py-2 text-sm font-semibold text-sobre-marca transition-colors hover:bg-marca-accion-fuerte focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-40"
        >
          {n <= 1 ? "Añadir 1 línea" : `Añadir ${n} líneas`}
        </button>
        <button
          type="button"
          onClick={cerrar}
          className="rounded-lg px-2.5 py-2 text-sm text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
