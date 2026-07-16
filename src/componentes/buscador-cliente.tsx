"use client";

import { useId, useState } from "react";

/** Opción mínima que necesita el buscador (id + nombre visibles). */
export interface OpcionCliente {
  id: string;
  nombre: string;
}

interface Props {
  /** Clientes elegibles (ya filtrados por el llamador). */
  opciones: OpcionCliente[];
  /** Ids de clientes recientes del usuario, del más reciente al más antiguo. */
  recientes?: string[];
  alElegir: (id: string) => void;
}

/** Quita acentos/diacríticos y baja a minúsculas para comparar. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const MAX_RECIENTES = 5;

/**
 * Combobox de cliente: input que filtra al teclear + lista siempre visible
 * en el flujo del panel. Con el input vacío agrupa "Recientes" / "Todos".
 * ↓/↑ mueven el resaltado, Enter elige; Escape NO se captura aquí (sube al
 * panel contenedor, que decide si cierra el formulario).
 */
export function BuscadorCliente({ opciones, recientes = [], alElegir }: Props) {
  const idBase = useId();
  const [busqueda, setBusqueda] = useState("");
  const [resaltado, setResaltado] = useState(0);

  const idListbox = `${idBase}-listbox`;
  const idOpcion = (clienteId: string) => `${idBase}-op-${clienteId}`;

  const alfabetico = [...opciones].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es"),
  );

  let grupoRecientes: OpcionCliente[] = [];
  let grupoResto: OpcionCliente[] = [];

  if (busqueda.trim() === "") {
    grupoRecientes = recientes
      .map((id) => opciones.find((o) => o.id === id))
      .filter((o): o is OpcionCliente => o !== undefined)
      .slice(0, MAX_RECIENTES);
    const idsRecientes = new Set(grupoRecientes.map((o) => o.id));
    grupoResto = alfabetico.filter((o) => !idsRecientes.has(o.id));
  } else {
    const aguja = normalizar(busqueda);
    const coincide = (o: OpcionCliente) => normalizar(o.nombre).includes(aguja);
    // Sin grupos: los recientes que coincidan van primero, en su orden.
    const primeros = recientes
      .map((id) => opciones.find((o) => o.id === id))
      .filter((o): o is OpcionCliente => o !== undefined && coincide(o));
    const idsPrimeros = new Set(primeros.map((o) => o.id));
    grupoResto = [
      ...primeros,
      ...alfabetico.filter((o) => coincide(o) && !idsPrimeros.has(o.id)),
    ];
  }

  const conGrupos = grupoRecientes.length > 0;
  const plana = [...grupoRecientes, ...grupoResto];
  const iResaltado = Math.min(resaltado, Math.max(0, plana.length - 1));

  function mover(delta: number) {
    if (plana.length === 0) return;
    const siguiente = (iResaltado + delta + plana.length) % plana.length;
    setResaltado(siguiente);
    document
      .getElementById(idOpcion(plana[siguiente].id))
      ?.scrollIntoView({ block: "nearest" });
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      mover(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      mover(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const elegida = plana[iResaltado];
      if (elegida) alElegir(elegida.id);
    }
    // Escape: no se toca; sube al contenedor (cierra el formulario entero).
  }

  const cabecera = (texto: string) => (
    <div
      role="presentation"
      className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-texto-suave"
    >
      {texto}
    </div>
  );

  const fila = (o: OpcionCliente, indice: number) => {
    const activa = indice === iResaltado;
    return (
      <button
        key={o.id}
        type="button"
        role="option"
        id={idOpcion(o.id)}
        aria-selected={activa}
        tabIndex={-1}
        onClick={() => alElegir(o.id)}
        onMouseMove={() => setResaltado(indice)}
        className={`flex min-h-10 w-full items-center px-3 py-2 text-left text-sm transition-colors ${
          activa
            ? "bg-acento-suave text-acento"
            : "text-tinta hover:bg-superficie-2"
        }`}
      >
        {o.nombre}
      </button>
    );
  };

  return (
    <div>
      <label htmlFor={`${idBase}-input`} className="sr-only">
        Buscar cliente
      </label>
      <input
        id={`${idBase}-input`}
        type="text"
        role="combobox"
        autoFocus
        autoComplete="off"
        placeholder="Buscar cliente…"
        value={busqueda}
        onChange={(e) => {
          setBusqueda(e.target.value);
          setResaltado(0);
        }}
        onKeyDown={alTeclear}
        aria-expanded="true"
        aria-controls={idListbox}
        aria-autocomplete="list"
        aria-activedescendant={
          plana[iResaltado] ? idOpcion(plana[iResaltado].id) : undefined
        }
        className="h-10 w-full rounded-lg border border-borde-fuerte bg-superficie px-2.5 text-sm text-tinta outline-none placeholder:text-texto-suave focus:border-acento focus:ring-2 focus:ring-acento/20"
      />

      <p aria-live="polite" className="sr-only">
        {plana.length === 1 ? "1 cliente" : `${plana.length} clientes`}
      </p>

      <div
        id={idListbox}
        role="listbox"
        aria-label="Clientes"
        className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-borde"
      >
        {plana.length === 0 ? (
          <p className="px-3 py-3 text-sm text-texto-suave">
            Ningún cliente coincide
          </p>
        ) : conGrupos ? (
          <>
            {cabecera("Recientes")}
            {grupoRecientes.map((o, i) => fila(o, i))}
            <div role="presentation" className="border-t border-borde" />
            {cabecera("Todos")}
            {grupoResto.map((o, i) => fila(o, grupoRecientes.length + i))}
          </>
        ) : (
          grupoResto.map((o, i) => fila(o, i))
        )}
      </div>
    </div>
  );
}
