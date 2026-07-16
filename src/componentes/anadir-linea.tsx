"use client";

import { useState } from "react";
import type { Cliente, Proyecto } from "@/lib/tipos";
import type { ProyectoConCliente } from "@/lib/datos/mi-semana";

interface Props {
  clientes: (Cliente & { proyectos: Proyecto[] })[];
  /** Proyectos ya presentes en la rejilla (no se ofrecen de nuevo). */
  idsExcluidos: string[];
  alAnadir: (linea: ProyectoConCliente) => void;
}

export function AnadirLinea({ clientes, idsExcluidos, alAnadir }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [proyectoId, setProyectoId] = useState("");

  const excluidos = new Set(idsExcluidos);
  const clientesConOpciones = clientes
    .map((c) => ({
      ...c,
      proyectos: c.proyectos.filter((p) => !excluidos.has(p.id)),
    }))
    .filter((c) => c.proyectos.length > 0);

  const clienteElegido = clientesConOpciones.find((c) => c.id === clienteId);

  function cerrar() {
    setAbierto(false);
    setClienteId("");
    setProyectoId("");
  }

  function anadir() {
    if (!clienteElegido) return;
    const proyecto = clienteElegido.proyectos.find((p) => p.id === proyectoId);
    if (!proyecto) return;
    alAnadir({
      ...proyecto,
      cliente: {
        id: clienteElegido.id,
        nombre: clienteElegido.nombre,
        activo: clienteElegido.activo,
      },
    });
    cerrar();
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={clientesConOpciones.length === 0}
        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-900 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-neutral-900 disabled:opacity-40"
      >
        + Añadir línea
      </button>
    );
  }

  const estiloSelect =
    "h-9 rounded-lg border border-neutral-300 bg-white px-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="nuevo-cliente">
        Cliente
      </label>
      <select
        id="nuevo-cliente"
        autoFocus
        value={clienteId}
        onChange={(e) => {
          setClienteId(e.target.value);
          setProyectoId("");
        }}
        className={estiloSelect}
      >
        <option value="">Cliente…</option>
        {clientesConOpciones.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="nuevo-proyecto">
        Proyecto o tarea
      </label>
      <select
        id="nuevo-proyecto"
        value={proyectoId}
        onChange={(e) => setProyectoId(e.target.value)}
        disabled={!clienteElegido}
        className={`${estiloSelect} disabled:opacity-40`}
      >
        <option value="">Proyecto…</option>
        {clienteElegido?.proyectos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={anadir}
        disabled={!proyectoId}
        className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-neutral-900 disabled:opacity-40"
      >
        Añadir
      </button>
      <button
        type="button"
        onClick={cerrar}
        className="rounded-lg px-2 py-2 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-neutral-900"
      >
        Cancelar
      </button>
    </div>
  );
}
