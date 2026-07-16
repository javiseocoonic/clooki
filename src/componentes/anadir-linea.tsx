"use client";

import { useState } from "react";
import type { Cliente, Proyecto } from "@/lib/tipos";
import type { ProyectoConCliente } from "@/lib/datos/mi-semana";

interface Props {
  clientes: (Cliente & { proyectos: Proyecto[] })[];
  /** Proyectos ya presentes en la rejilla (no se ofrecen de nuevo). */
  idsExcluidos: string[];
  alAnadir: (lineas: ProyectoConCliente[]) => void;
}

export function AnadirLinea({ clientes, idsExcluidos, alAnadir }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  const excluidos = new Set(idsExcluidos);
  const clientesConOpciones = clientes
    .map((c) => ({
      ...c,
      proyectos: c.proyectos.filter((p) => !excluidos.has(p.id)),
    }))
    .filter((c) => c.proyectos.length > 0);

  const clienteElegido = clientesConOpciones.find((c) => c.id === clienteId);
  const n = marcados.size;

  function cerrar() {
    setAbierto(false);
    setClienteId("");
    setMarcados(new Set());
  }

  function alternar(proyectoId: string) {
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
    const nuevas = clienteElegido.proyectos
      .filter((p) => marcados.has(p.id))
      .map((p) => ({ ...p, cliente }));
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
            ? "Ya tienes todas tus líneas"
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
      <label
        htmlFor="nuevo-cliente"
        className="mb-1.5 block text-xs font-medium text-texto-suave"
      >
        Cliente
      </label>
      <select
        id="nuevo-cliente"
        autoFocus
        value={clienteId}
        onChange={(e) => {
          setClienteId(e.target.value);
          setMarcados(new Set());
        }}
        className="h-10 w-full rounded-lg border border-borde-fuerte bg-superficie px-2 text-sm text-tinta outline-none focus:border-acento focus:ring-2 focus:ring-acento/20"
      >
        <option value="">Elige un cliente…</option>
        {clientesConOpciones.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>

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
        </fieldset>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={anadir}
          disabled={n === 0}
          title={n === 0 ? "Marca al menos un proyecto" : undefined}
          className="rounded-lg bg-tinta px-3 py-2 text-sm font-semibold text-superficie transition-colors hover:bg-texto focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-40"
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
