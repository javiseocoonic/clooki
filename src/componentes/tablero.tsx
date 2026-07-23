"use client";

// Tablero de tareas (roadmap-tareas.md §3): columnas por cliente activo,
// tarjeta = proyecto + título. Muta con el cliente de navegador y RLS
// (mismo patrón que la rejilla); optimista con reversión donde el fallo
// es recuperable. Un solo árbol para móvil y escritorio: en móvil, el
// selector de cliente decide qué columna se ve (nada se renderiza doble).

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import { limpiarTarea } from "@/lib/semana";
import { BuscadorCliente } from "./buscador-cliente";
import {
  duracionMs,
  formatearDuracionMs,
  useCronometros,
} from "./cronometros";
import type { TarjetaTablero } from "@/lib/datos/tareas";
import type {
  Cliente,
  EstadoTarjeta,
  Persona,
  Proyecto,
  TarjetaCheck,
} from "@/lib/tipos";

type ClienteConProyectos = Cliente & { proyectos: Proyecto[] };
type MiembroEquipo = Pick<Persona, "id" | "nombre">;

/** Posición: insertar con saltos grandes; renumerar bajo umbral (007). */
const SALTO = 1024;
const UMBRAL_RENUMERAR = 0.001;

/**
 * Normaliza para comparar: minúsculas y sin acentos. Da la clave del
 * tipo de trabajo (que «Diseño» y «Diseno» de clientes distintos cuenten
 * como el mismo tipo) y el cotejo del buscador de cliente.
 */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const ETIQUETA_ESTADO: Record<EstadoTarjeta, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  hecha: "Hecha",
};
const SIGUIENTE_ESTADO: Record<EstadoTarjeta, EstadoTarjeta> = {
  pendiente: "en_curso",
  en_curso: "hecha",
  hecha: "pendiente",
};
const CHIP_ESTADO: Record<EstadoTarjeta, string> = {
  pendiente: "bg-superficie-2 text-texto-suave",
  en_curso: "bg-acento-suave text-acento",
  hecha: "bg-exito-suave text-exito",
};

/* ── Fecha de entrega: proximidad → color ── */

type Plazo = "vencida" | "cerca" | "media" | "holgada";

/** Días locales de hoy a `fecha` (YYYY-MM-DD); negativo = vencida. */
function diasHasta(fecha: string): number {
  const hoy = new Date();
  const objetivo = new Date(`${fecha}T00:00:00`);
  hoy.setHours(0, 0, 0, 0);
  return Math.round((objetivo.getTime() - hoy.getTime()) / 86_400_000);
}

function plazoDe(fecha: string): Plazo {
  const d = diasHasta(fecha);
  if (d < 0) return "vencida";
  if (d <= 2) return "cerca";
  if (d <= 7) return "media";
  return "holgada";
}

/** Rojo si vencida o encima, ámbar esta semana, verde con margen. */
const CHIP_PLAZO: Record<Plazo, string> = {
  vencida: "bg-error-suave text-error",
  cerca: "bg-error-suave text-error",
  media: "bg-aviso-suave text-aviso",
  holgada: "bg-exito-suave text-exito",
};

const MES_CORTO = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function etiquetaFechaCorta(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00`);
  return `${d.getDate()} ${MES_CORTO[d.getMonth()]}`;
}

/**
 * Tipos de trabajo con resumen de carga por persona (decisión Javi,
 * jul 2026): los equipos que reparten tarea a tarea. La clave llega
 * normalizada (minúsculas sin acentos); «web» cubre «Desarrollo web».
 */
function tipoConResumen(clave: string): boolean {
  return (
    clave === "audiovisual" || clave === "diseno" || clave.includes("web")
  );
}

const BOTON_ICONO =
  "flex h-10 w-10 items-center justify-center rounded-lg text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-30";

const SELECT_FILTRO =
  "h-9 rounded-lg border border-borde bg-superficie px-2 text-sm text-texto outline-none focus:border-acento focus:ring-2 focus:ring-acento/20";

const SELECTOR_ENFOCABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Atrapa el Tab dentro de `ref` mientras `activo` (modal de detalle). */
function useFocoAtrapado(activo: boolean, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!activo) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodos = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLE) ?? [],
      ).filter((n) => !n.hasAttribute("disabled"));
      if (nodos.length === 0) return;
      const primero = nodos[0];
      const ultimo = nodos[nodos.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [activo, ref]);
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ??"") + (partes[1]?.[0] ?? "")).toUpperCase();
}

function limpiarTitulo(titulo: string): string {
  return titulo.trim().slice(0, 120).trim();
}

/* ── Formulario de tarjeta (crear y editar) ────────────────────── */

export interface DatosFormularioTarjeta {
  titulo: string;
  proyectoId: string;
  descripcion: string;
  asignados: string[];
  /** `YYYY-MM-DD` de entrega; "" = sin fecha. */
  fechaLimite: string;
  urgente: boolean;
  /** Subtareas: id null = nueva. En el formulario solo se edita el
   *  texto; persona y fecha por ítem viven en el modal de detalle. */
  checks: { id: string | null; texto: string }[];
}

function FormularioTarjeta({
  proyectosDelCliente,
  todosLosClientes,
  equipo,
  personaId,
  puedeAsignarOtros,
  inicial,
  etiquetaGuardar,
  alGuardar,
  alCancelar,
}: {
  /** Proyectos elegibles al crear (solo los del cliente de la columna). */
  proyectosDelCliente?: Proyecto[];
  /** Al editar: catálogo completo (cambiar de proyecto puede cambiar de columna). */
  todosLosClientes?: ClienteConProyectos[];
  equipo: MiembroEquipo[];
  personaId: string;
  puedeAsignarOtros: boolean;
  inicial?: DatosFormularioTarjeta;
  etiquetaGuardar: string;
  alGuardar: (d: DatosFormularioTarjeta) => Promise<boolean>;
  alCancelar: () => void;
}) {
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [proyectoId, setProyectoId] = useState(
    inicial?.proyectoId ?? proyectosDelCliente?.[0]?.id ?? "",
  );
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [asignados, setAsignados] = useState<Set<string>>(
    () => new Set(inicial?.asignados ?? []),
  );
  const [fechaLimite, setFechaLimite] = useState(inicial?.fechaLimite ?? "");
  const [urgente, setUrgente] = useState(inicial?.urgente ?? false);
  const [checksForm, setChecksForm] = useState<
    { id: string | null; texto: string }[]
  >(() => inicial?.checks ?? []);
  const [nuevoCheckTexto, setNuevoCheckTexto] = useState("");
  const [guardando, setGuardando] = useState(false);

  function anadirCheck() {
    const texto = nuevoCheckTexto.trim().slice(0, 200).trim();
    if (!texto) return;
    setChecksForm((prev) => [...prev, { id: null, texto }]);
    setNuevoCheckTexto("");
  }

  // Tú primero: «para mí» es un toque en tu propio chip.
  const equipoOrdenado = useMemo(() => {
    const yo = equipo.filter((p) => p.id === personaId);
    return [...yo, ...equipo.filter((p) => p.id !== personaId)];
  }, [equipo, personaId]);

  const tituloLimpio = limpiarTitulo(titulo);
  const valido = tituloLimpio.length > 0 && proyectoId !== "";

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido || guardando) return;
    setGuardando(true);
    const cerrado = await alGuardar({
      titulo: tituloLimpio,
      proyectoId,
      descripcion: descripcion.trim(),
      asignados: [...asignados],
      fechaLimite,
      urgente,
      checks: checksForm
        .map((c) => ({ id: c.id, texto: c.texto.trim().slice(0, 200).trim() }))
        .filter((c) => c.texto.length > 0),
    });
    if (!cerrado) setGuardando(false);
  }

  return (
    <form
      onSubmit={enviar}
      onKeyDown={(e) => {
        if (e.key === "Escape") alCancelar();
      }}
      className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-3"
    >
      <label className="sr-only" htmlFor="tarjeta-titulo">
        Título
      </label>
      <input
        id="tarjeta-titulo"
        type="text"
        autoFocus
        maxLength={120}
        placeholder="Título de la tarjeta"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        className="h-10 rounded-lg border border-borde-fuerte bg-superficie px-2.5 text-sm text-tinta outline-none placeholder:text-texto-suave focus:border-acento focus:ring-2 focus:ring-acento/20"
      />

      <label className="sr-only" htmlFor="tarjeta-proyecto">
        Proyecto
      </label>
      <select
        id="tarjeta-proyecto"
        value={proyectoId}
        onChange={(e) => setProyectoId(e.target.value)}
        className="h-10 rounded-lg border border-borde-fuerte bg-superficie px-2 text-sm text-tinta outline-none focus:border-acento focus:ring-2 focus:ring-acento/20"
      >
        {todosLosClientes
          ? todosLosClientes
              .filter((c) => c.proyectos.length > 0)
              .map((c) => (
                <optgroup key={c.id} label={c.nombre}>
                  {c.proyectos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </optgroup>
              ))
          : (proyectosDelCliente ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
      </select>

      <label className="sr-only" htmlFor="tarjeta-descripcion">
        Descripción (opcional)
      </label>
      <textarea
        id="tarjeta-descripcion"
        rows={2}
        placeholder="Descripción (opcional)"
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        className="rounded-lg border border-borde-fuerte bg-superficie px-2.5 py-1.5 text-sm text-tinta outline-none placeholder:text-texto-suave focus:border-acento focus:ring-2 focus:ring-acento/20"
      />

      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="tarjeta-fecha"
          className="text-[11px] font-medium uppercase tracking-wide text-texto-suave"
        >
          Entrega
        </label>
        <input
          id="tarjeta-fecha"
          type="date"
          value={fechaLimite}
          onChange={(e) => setFechaLimite(e.target.value)}
          className="h-9 rounded-lg border border-borde-fuerte bg-superficie px-2 text-sm text-tinta outline-none focus:border-acento focus:ring-2 focus:ring-acento/20"
        />
        {fechaLimite && (
          <button
            type="button"
            onClick={() => setFechaLimite("")}
            className="text-xs text-texto-suave hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento"
          >
            Quitar
          </button>
        )}
        <button
          type="button"
          aria-pressed={urgente}
          onClick={() => setUrgente((u) => !u)}
          className={`ml-auto h-9 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-acento ${
            urgente
              ? "border-error/40 bg-error-suave text-error"
              : "border-borde text-texto-suave hover:border-borde-fuerte hover:text-tinta"
          }`}
        >
          ⚑ Urgente
        </button>
      </div>

      <fieldset>
        <legend className="pb-1 text-[11px] font-medium uppercase tracking-wide text-texto-suave">
          Subtareas
        </legend>
        {checksForm.length > 0 && (
          <ul className="flex flex-col gap-1 pb-1.5">
            {checksForm.map((c, i) => (
              <li key={c.id ?? `nueva-${i}`} className="flex items-center gap-1.5">
                <label className="sr-only" htmlFor={`subtarea-${i}`}>
                  Subtarea {i + 1}
                </label>
                <input
                  id={`subtarea-${i}`}
                  type="text"
                  maxLength={200}
                  value={c.texto}
                  onChange={(e) =>
                    setChecksForm((prev) =>
                      prev.map((x, j) =>
                        j === i ? { ...x, texto: e.target.value } : x,
                      ),
                    )
                  }
                  className="h-8 min-w-0 flex-1 rounded-md border border-borde bg-superficie px-2 text-sm text-tinta outline-none focus:border-acento focus:ring-2 focus:ring-acento/20"
                />
                <button
                  type="button"
                  onClick={() =>
                    setChecksForm((prev) => prev.filter((_, j) => j !== i))
                  }
                  aria-label={`Quitar subtarea «${c.texto}»`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-texto-suave transition-colors hover:bg-superficie-2 hover:text-error focus-visible:outline-2 focus-visible:outline-acento"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor="subtarea-nueva">
            Nueva subtarea
          </label>
          <input
            id="subtarea-nueva"
            type="text"
            maxLength={200}
            placeholder="Añadir subtarea…"
            value={nuevoCheckTexto}
            onChange={(e) => setNuevoCheckTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter añade la subtarea, no envía el formulario entero.
              if (e.key === "Enter") {
                e.preventDefault();
                anadirCheck();
              }
            }}
            className="h-8 min-w-0 flex-1 rounded-md border border-borde bg-superficie px-2 text-sm text-tinta outline-none placeholder:text-texto-suave focus:border-acento focus:ring-2 focus:ring-acento/20"
          />
          <button
            type="button"
            onClick={anadirCheck}
            disabled={nuevoCheckTexto.trim().length === 0}
            className="h-8 shrink-0 rounded-md border border-borde-fuerte px-2.5 text-xs font-medium text-texto transition-colors hover:border-acento hover:text-acento focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-40"
          >
            Añadir
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="pb-1 text-[11px] font-medium uppercase tracking-wide text-texto-suave">
          Asignar
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {equipoOrdenado.map((p) => {
            const puesta = asignados.has(p.id);
            const esYo = p.id === personaId;
            return (
              <button
                key={p.id}
                type="button"
                disabled={!puedeAsignarOtros && !esYo}
                aria-pressed={puesta}
                onClick={() =>
                  setAsignados((prev) => {
                    const s = new Set(prev);
                    if (puesta) s.delete(p.id);
                    else s.add(p.id);
                    return s;
                  })
                }
                className={`h-9 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-40 ${
                  puesta
                    ? "border-acento bg-acento-suave text-acento"
                    : "border-borde text-texto-suave hover:border-borde-fuerte hover:text-tinta"
                }`}
              >
                {esYo ? `${p.nombre} (yo)` : p.nombre}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!valido || guardando}
          className="rounded-lg bg-marca-accion px-3 py-2 text-sm font-semibold text-sobre-marca transition-colors hover:bg-marca-accion-fuerte focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-40"
        >
          {guardando ? "Guardando…" : etiquetaGuardar}
        </button>
        <button
          type="button"
          onClick={alCancelar}
          className="rounded-lg px-3 py-2 text-sm font-medium text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * Alta de subtarea del modal de detalle. Estado local a propósito: el
 * llamador lo re-monta con key={tarjeta.id}, así el texto a medio
 * escribir no se cuela de una tarjeta a otra.
 */
function FormularioNuevoCheck({ alCrear }: { alCrear: (texto: string) => void }) {
  const [texto, setTexto] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        alCrear(texto);
        setTexto("");
      }}
      className="flex items-center gap-1.5"
    >
      <label className="sr-only" htmlFor="nueva-subtarea">
        Nueva subtarea
      </label>
      <input
        id="nueva-subtarea"
        type="text"
        maxLength={200}
        placeholder="Añadir subtarea…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-md border border-borde bg-superficie px-2 text-sm text-tinta outline-none placeholder:text-texto-suave focus:border-acento focus:ring-2 focus:ring-acento/20"
      />
      <button
        type="submit"
        disabled={texto.trim().length === 0}
        className="h-8 shrink-0 rounded-md border border-borde-fuerte px-2.5 text-xs font-medium text-texto transition-colors hover:border-acento hover:text-acento focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-40"
      >
        Añadir
      </button>
    </form>
  );
}

/* ── Tablero ───────────────────────────────────────────────────── */

export function Tablero({
  personaId,
  esAdmin,
  clientes,
  equipo,
  tarjetasIniciales,
  checksIniciales,
  verArchivadas,
}: {
  personaId: string;
  esAdmin: boolean;
  clientes: ClienteConProyectos[];
  equipo: MiembroEquipo[];
  tarjetasIniciales: TarjetaTablero[];
  checksIniciales: TarjetaCheck[];
  verArchivadas: boolean;
}) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const crono = useCronometros();
  const [tarjetas, setTarjetas] = useState(tarjetasIniciales);
  const [checks, setChecks] = useState(checksIniciales);
  const [anuncio, setAnuncio] = useState("");
  const [creandoEn, setCreandoEn] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [confirmandoBorrar, setConfirmandoBorrar] = useState<string | null>(
    null,
  );
  const [hechasAbiertas, setHechasAbiertas] = useState<Set<string>>(new Set());
  const [clienteMovil, setClienteMovil] = useState<string | null>(null);
  // Detalle tipo Trello: id de la tarjeta cuyo modal está abierto (evita
  // tarjetas kilométricas en el tablero cuando la descripción es larga).
  const [detalle, setDetalle] = useState<string | null>(null);
  const dialogoRef = useRef<HTMLDivElement>(null);
  // Vista «Mías»: solo tarjetas asignadas a ti (y las columnas quedan en
  // consecuencia). Se compone con dos filtros más: por tipo de proyecto
  // (todo el mundo) y por persona (solo admin). Con CUALQUIER filtro
  // activo NO se reordena: mover relativo a una lista con huecos
  // escribiría posiciones confusas para el resto.
  const [soloMias, setSoloMias] = useState(false);
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoTarjeta | "">("");
  const [personaFiltro, setPersonaFiltro] = useState("");
  // Buscador de cliente: oculta columnas enteras según se teclea. No
  // entra en filtroActivo: no deja huecos DENTRO de una columna, así
  // que reordenar con él activo sigue siendo seguro.
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const arrastrandoRef = useRef<string | null>(null);

  // Paneo con el ratón: clic y arrastre en el fondo del tablero mueve el
  // scroll horizontal (escritorio; el móvil ya tiene el selector de
  // cliente y desplaza con el dedo de forma nativa). No debe robar el
  // arrastre HTML5 de las tarjetas ni el clic normal de los controles.
  const tableroRef = useRef<HTMLDivElement>(null);
  const paneoRef = useRef<{ x: number; scrollLeft: number } | null>(null);
  const [paneando, setPaneando] = useState(false);

  function alPulsarTablero(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const objetivo = e.target as HTMLElement;
    if (objetivo.closest('button, a, input, select, textarea, [draggable="true"]'))
      return;
    const contenedor = tableroRef.current;
    if (!contenedor) return;
    paneoRef.current = { x: e.clientX, scrollLeft: contenedor.scrollLeft };
    setPaneando(true);
    contenedor.setPointerCapture(e.pointerId);
  }

  function alMoverTablero(e: React.PointerEvent<HTMLDivElement>) {
    const inicio = paneoRef.current;
    const contenedor = tableroRef.current;
    if (!inicio || !contenedor) return;
    contenedor.scrollLeft = inicio.scrollLeft - (e.clientX - inicio.x);
  }

  function alSoltarTablero(e: React.PointerEvent<HTMLDivElement>) {
    if (!paneoRef.current) return;
    paneoRef.current = null;
    setPaneando(false);
    tableroRef.current?.releasePointerCapture(e.pointerId);
  }

  const filtroActivo =
    soloMias || tipoFiltro !== "" || estadoFiltro !== "" || personaFiltro !== "";

  const proyectoACliente = useMemo(() => {
    const m = new Map<string, ClienteConProyectos>();
    for (const c of clientes) for (const p of c.proyectos) m.set(p.id, c);
    return m;
  }, [clientes]);

  const nombreProyecto = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clientes) for (const p of c.proyectos) m.set(p.id, p.nombre);
    return m;
  }, [clientes]);

  const nombrePersona = useMemo(
    () => new Map(equipo.map((p) => [p.id, p.nombre])),
    [equipo],
  );

  // Modal de detalle: foco al abrir, Escape para cerrar, foco devuelto al
  // disparador al cerrar. El atrapado de Tab vive en useFocoAtrapado.
  useEffect(() => {
    if (!detalle) return;
    const anterior = document.activeElement as HTMLElement | null;
    dialogoRef.current?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetalle(null);
    };
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      anterior?.focus();
    };
  }, [detalle]);
  useFocoAtrapado(detalle !== null, dialogoRef);

  // Tipos de trabajo = nombres de proyecto distintos (Audiovisual,
  // Consultoría, Desarrollo web…). El tipo es un atributo de la tarea —
  // le llega por su proyecto — y no de las personas asignadas, así que
  // el backlog sin asignar también responde a este filtro.
  const tipos = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clientes)
      for (const p of c.proyectos) {
        const clave = normalizar(p.nombre);
        if (!m.has(clave)) m.set(clave, p.nombre);
      }
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [clientes]);

  const tipoPorProyecto = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clientes)
      for (const p of c.proyectos) m.set(p.id, normalizar(p.nombre));
    return m;
  }, [clientes]);

  const tarjetasVista = useMemo(
    () =>
      tarjetas.filter((t) => {
        if (soloMias && !t.asignados.includes(personaId)) return false;
        if (personaFiltro !== "" && !t.asignados.includes(personaFiltro))
          return false;
        if (tipoFiltro !== "" && tipoPorProyecto.get(t.proyecto_id) !== tipoFiltro)
          return false;
        if (estadoFiltro !== "" && t.estado !== estadoFiltro) return false;
        return true;
      }),
    [
      tarjetas,
      soloMias,
      personaId,
      personaFiltro,
      tipoFiltro,
      tipoPorProyecto,
      estadoFiltro,
    ],
  );
  const idsEnVista = useMemo(
    () => new Set(tarjetasVista.map((t) => t.id)),
    [tarjetasVista],
  );

  // Carga por persona del tipo filtrado (audiovisual/diseño/web): quién
  // lleva cuántas tarjetas VIVAS, para repartir de un vistazo. Cuenta
  // sobre todas las tarjetas del tipo —ignora los demás filtros a
  // propósito: la foto de la carga del equipo no debe encogerse porque
  // además estés mirando «Mías»— y las hechas no son carga.
  const resumenCarga = useMemo(() => {
    if (tipoFiltro === "" || !tipoConResumen(tipoFiltro)) return null;
    const cuenta = new Map<string, number>();
    let sinAsignar = 0;
    for (const t of tarjetas) {
      if (t.estado === "hecha") continue;
      if (tipoPorProyecto.get(t.proyecto_id) !== tipoFiltro) continue;
      if (t.asignados.length === 0) sinAsignar++;
      else
        for (const id of t.asignados)
          cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
    }
    return {
      personas: [...cuenta].sort(
        (a, b) =>
          b[1] - a[1] ||
          (nombrePersona.get(a[0]) ?? "").localeCompare(
            nombrePersona.get(b[0]) ?? "",
            "es",
          ),
      ),
      sinAsignar,
    };
  }, [tipoFiltro, tarjetas, tipoPorProyecto, nombrePersona]);
  const nMias = useMemo(
    () => tarjetas.filter((t) => t.asignados.includes(personaId)).length,
    [tarjetas, personaId],
  );

  // Columnas = clientes con alguna tarjeta EN LA VISTA (+ donde se crea),
  // acotadas por el buscador de cliente si hay algo tecleado.
  const columnas = useMemo(() => {
    const conTarjeta = new Set(
      tarjetasVista.map((t) => proyectoACliente.get(t.proyecto_id)?.id),
    );
    const aguja = normalizar(busquedaCliente);
    return clientes.filter(
      (c) =>
        (conTarjeta.has(c.id) || creandoEn === c.id) &&
        (aguja === "" || normalizar(c.nombre).includes(aguja)),
    );
  }, [clientes, tarjetasVista, proyectoACliente, creandoEn, busquedaCliente]);

  const clienteMovilEfectivo =
    clienteMovil && columnas.some((c) => c.id === clienteMovil)
      ? clienteMovil
      : (columnas[0]?.id ?? null);

  function tarjetasDe(clienteId: string) {
    return tarjetas.filter(
      (t) => proyectoACliente.get(t.proyecto_id)?.id === clienteId,
    );
  }

  function visiblesOrdenadas(clienteId: string) {
    return tarjetasDe(clienteId)
      .filter((t) => t.estado !== "hecha")
      .sort(
        (a, b) =>
          a.posicion - b.posicion || a.creada_en.localeCompare(b.creada_en),
      );
  }

  function puedeEditar(t: TarjetaTablero): boolean {
    return (
      esAdmin || t.creada_por === personaId || t.asignados.includes(personaId)
    );
  }

  function puedeBorrar(t: TarjetaTablero): boolean {
    return esAdmin || t.creada_por === personaId;
  }

  /* ── Mutaciones ── */

  async function crearTarjeta(
    clienteId: string,
    d: DatosFormularioTarjeta,
  ): Promise<boolean> {
    const delCliente = tarjetasDe(clienteId);
    const posicion =
      delCliente.length > 0
        ? Math.min(...delCliente.map((t) => t.posicion)) - SALTO
        : SALTO;

    const { data, error } = await supabase
      .from("tarjetas")
      .insert({
        proyecto_id: d.proyectoId,
        titulo: d.titulo,
        descripcion: d.descripcion || null,
        creada_por: personaId,
        posicion,
        fecha_limite: d.fechaLimite || null,
        urgente: d.urgente,
      })
      .select()
      .single();
    if (error || !data) {
      setAnuncio("No se pudo crear la tarjeta.");
      return false;
    }

    let asignados: string[] = [];
    if (d.asignados.length > 0) {
      const { error: errorAsignar } = await supabase
        .from("tarjeta_asignaciones")
        .insert(
          d.asignados.map((id) => ({ tarjeta_id: data.id, persona_id: id })),
        );
      if (errorAsignar) {
        setAnuncio("Tarjeta creada, pero no se pudo asignar.");
      } else {
        asignados = d.asignados;
      }
    }

    if (d.checks.length > 0) {
      const { data: checksCreados, error: errorChecks } = await supabase
        .from("tarjeta_checks")
        .insert(
          d.checks.map((c, i) => ({
            tarjeta_id: data.id,
            texto: c.texto,
            posicion: (i + 1) * SALTO,
          })),
        )
        .select();
      if (errorChecks) {
        setAnuncio("Tarjeta creada, pero alguna subtarea no se pudo añadir.");
      } else if (checksCreados) {
        setChecks((prev) => [...prev, ...checksCreados]);
      }
    }

    setTarjetas((prev) => [...prev, { ...data, asignados }]);
    setCreandoEn(null);
    setAnuncio(`Tarjeta «${data.titulo}» creada.`);
    return true;
  }

  async function guardarEdicion(
    t: TarjetaTablero,
    d: DatosFormularioTarjeta,
  ): Promise<boolean> {
    const { error } = await supabase
      .from("tarjetas")
      .update({
        titulo: d.titulo,
        proyecto_id: d.proyectoId,
        descripcion: d.descripcion || null,
        fecha_limite: d.fechaLimite || null,
        urgente: d.urgente,
      })
      .eq("id", t.id);
    if (error) {
      setAnuncio("No se pudieron guardar los cambios.");
      return false;
    }

    const antes = new Set(t.asignados);
    const despues = new Set(d.asignados);
    const altas = d.asignados.filter((id) => !antes.has(id));
    const bajas = t.asignados.filter((id) => !despues.has(id));
    let asignadosFinal = d.asignados;
    if (altas.length > 0 || bajas.length > 0) {
      const resultados = await Promise.all([
        ...altas.map((personaId) =>
          supabase
            .from("tarjeta_asignaciones")
            .upsert(
              { tarjeta_id: t.id, persona_id: personaId },
              { onConflict: "tarjeta_id,persona_id", ignoreDuplicates: true },
            ),
        ),
        ...bajas.map((personaId) =>
          supabase
            .from("tarjeta_asignaciones")
            .delete()
            .eq("tarjeta_id", t.id)
            .eq("persona_id", personaId),
        ),
      ]);
      if (resultados.some((r) => r.error)) {
        setAnuncio("Guardado, pero alguna asignación no se pudo cambiar.");
        asignadosFinal = t.asignados;
      }
    }

    // Subtareas: diff contra las existentes — nuevas se crean, textos
    // cambiados se actualizan, ausentes se borran (persona/fecha por
    // ítem no se tocan aquí: viven en el modal de detalle).
    {
      const originales = checksDe(t.id);
      const originalPorId = new Map(originales.map((c) => [c.id, c]));
      const idsFinales = new Set(
        d.checks.filter((c) => c.id !== null).map((c) => c.id as string),
      );
      const bajasChecks = originales.filter((c) => !idsFinales.has(c.id));
      const renombrados = d.checks.filter(
        (c): c is { id: string; texto: string } =>
          c.id !== null && originalPorId.get(c.id)?.texto !== c.texto,
      );
      const altasChecks = d.checks.filter((c) => c.id === null);
      const posMax =
        originales.length > 0
          ? Math.max(...originales.map((c) => c.posicion))
          : 0;

      const operaciones: PromiseLike<{ error: unknown }>[] = [];
      if (bajasChecks.length > 0) {
        operaciones.push(
          supabase
            .from("tarjeta_checks")
            .delete()
            .in("id", bajasChecks.map((c) => c.id)),
        );
      }
      for (const c of renombrados) {
        operaciones.push(
          supabase
            .from("tarjeta_checks")
            .update({ texto: c.texto })
            .eq("id", c.id),
        );
      }
      const insercion =
        altasChecks.length > 0
          ? await supabase
              .from("tarjeta_checks")
              .insert(
                altasChecks.map((c, i) => ({
                  tarjeta_id: t.id,
                  texto: c.texto,
                  posicion: posMax + (i + 1) * SALTO,
                })),
              )
              .select()
          : null;
      const resultadosChecks = await Promise.all(operaciones);
      if (
        resultadosChecks.some((r) => r.error) ||
        (insercion && insercion.error)
      ) {
        setAnuncio("Guardado, pero alguna subtarea no se pudo cambiar.");
      }
      const idsBaja = new Set(bajasChecks.map((c) => c.id));
      const textoPorId = new Map(renombrados.map((c) => [c.id, c.texto]));
      setChecks((prev) => [
        ...prev
          .filter((c) => !idsBaja.has(c.id))
          .map((c) =>
            textoPorId.has(c.id) ? { ...c, texto: textoPorId.get(c.id) as string } : c,
          ),
        ...(insercion?.data ?? []),
      ]);
    }

    setTarjetas((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? {
              ...x,
              titulo: d.titulo,
              proyecto_id: d.proyectoId,
              descripcion: d.descripcion || null,
              fecha_limite: d.fechaLimite || null,
              urgente: d.urgente,
              asignados: asignadosFinal,
            }
          : x,
      ),
    );
    setEditando(null);
    setAnuncio(`Tarjeta «${d.titulo}» guardada.`);
    return true;
  }

  async function cambiarEstado(t: TarjetaTablero) {
    const estado = SIGUIENTE_ESTADO[t.estado];
    const previo = t.estado;
    // Optimista: hecha_en real lo fija el trigger; localmente basta para
    // plegar/desplegar (el valor exacto llega al recargar).
    setTarjetas((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? {
              ...x,
              estado,
              hecha_en: estado === "hecha" ? new Date().toISOString() : null,
            }
          : x,
      ),
    );
    const { error } = await supabase
      .from("tarjetas")
      .update({ estado })
      .eq("id", t.id);
    if (error) {
      setTarjetas((prev) =>
        prev.map((x) =>
          x.id === t.id ? { ...x, estado: previo, hecha_en: t.hecha_en } : x,
        ),
      );
      setAnuncio("No se pudo cambiar el estado.");
      return;
    }
    setAnuncio(`«${t.titulo}» → ${ETIQUETA_ESTADO[estado]}.`);
  }

  async function alternarme(t: TarjetaTablero) {
    const estaba = t.asignados.includes(personaId);
    setTarjetas((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? {
              ...x,
              asignados: estaba
                ? x.asignados.filter((id) => id !== personaId)
                : [...x.asignados, personaId],
            }
          : x,
      ),
    );
    const { error } = estaba
      ? await supabase
          .from("tarjeta_asignaciones")
          .delete()
          .eq("tarjeta_id", t.id)
          .eq("persona_id", personaId)
      : await supabase
          .from("tarjeta_asignaciones")
          .upsert(
            { tarjeta_id: t.id, persona_id: personaId },
            { onConflict: "tarjeta_id,persona_id", ignoreDuplicates: true },
          );
    if (error) {
      setTarjetas((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, asignados: t.asignados } : x)),
      );
      setAnuncio("No se pudo cambiar la asignación.");
      return;
    }
    setAnuncio(
      estaba ? `Te has quitado de «${t.titulo}».` : `«${t.titulo}» es tuya.`,
    );
  }

  async function borrar(t: TarjetaTablero) {
    const { error } = await supabase.from("tarjetas").delete().eq("id", t.id);
    if (error) {
      setAnuncio("No se pudo borrar la tarjeta.");
      return;
    }
    setTarjetas((prev) => prev.filter((x) => x.id !== t.id));
    setConfirmandoBorrar(null);
    setAnuncio(`Tarjeta «${t.titulo}» borrada.`);
  }

  /* ── Subtareas (checklist) ── */

  function checksDe(tarjetaId: string): TarjetaCheck[] {
    return checks
      .filter((c) => c.tarjeta_id === tarjetaId)
      .sort((a, b) => a.posicion - b.posicion || a.creada_en.localeCompare(b.creada_en));
  }

  async function crearCheck(tarjetaId: string, texto: string) {
    const limpio = texto.trim().slice(0, 200).trim();
    if (!limpio) return;
    const previos = checksDe(tarjetaId);
    const posicion =
      previos.length > 0
        ? Math.max(...previos.map((c) => c.posicion)) + SALTO
        : SALTO;
    const { data, error } = await supabase
      .from("tarjeta_checks")
      .insert({ tarjeta_id: tarjetaId, texto: limpio, posicion })
      .select()
      .single();
    if (error || !data) {
      setAnuncio("No se pudo añadir la subtarea.");
      return;
    }
    setChecks((prev) => [...prev, data]);
  }

  /** Cambia campos de un check con actualización optimista y reversión. */
  async function actualizarCheck(
    c: TarjetaCheck,
    cambios: Partial<Pick<TarjetaCheck, "hecho" | "persona_id" | "fecha_limite">>,
  ) {
    setChecks((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, ...cambios } : x)),
    );
    const { error } = await supabase
      .from("tarjeta_checks")
      .update(cambios)
      .eq("id", c.id);
    if (error) {
      setChecks((prev) => prev.map((x) => (x.id === c.id ? c : x)));
      setAnuncio("No se pudo actualizar la subtarea.");
    }
  }

  async function borrarCheck(c: TarjetaCheck) {
    const { error } = await supabase
      .from("tarjeta_checks")
      .delete()
      .eq("id", c.id);
    if (error) {
      setAnuncio("No se pudo borrar la subtarea.");
      return;
    }
    setChecks((prev) => prev.filter((x) => x.id !== c.id));
  }

  /**
   * Coloca la tarjeta en el índice `destino` de la lista visible de su
   * columna (índice calculado SIN contarla a ella). Si el hueco entre
   * vecinas se agota, renumera la columna entera con saltos de 1024.
   */
  async function colocar(t: TarjetaTablero, destino: number) {
    const clienteId = proyectoACliente.get(t.proyecto_id)?.id;
    if (!clienteId) return;
    const lista = visiblesOrdenadas(clienteId).filter((x) => x.id !== t.id);
    const i = Math.max(0, Math.min(destino, lista.length));
    const antes = lista[i - 1]?.posicion;
    const despues = lista[i]?.posicion;

    let cambios: { id: string; posicion: number }[];
    if (
      antes !== undefined &&
      despues !== undefined &&
      despues - antes < UMBRAL_RENUMERAR
    ) {
      // Hueco agotado: renumerar toda la columna en su orden nuevo.
      const nuevoOrden = [...lista.slice(0, i), t, ...lista.slice(i)];
      cambios = nuevoOrden.map((x, j) => ({
        id: x.id,
        posicion: (j + 1) * SALTO,
      }));
    } else {
      const posicion =
        antes === undefined && despues === undefined
          ? SALTO
          : antes === undefined
            ? (despues as number) - SALTO
            : despues === undefined
              ? antes + SALTO
              : (antes + despues) / 2;
      cambios = [{ id: t.id, posicion }];
    }

    const previas = new Map(tarjetas.map((x) => [x.id, x.posicion]));
    const porId = new Map(cambios.map((c) => [c.id, c.posicion]));
    setTarjetas((prev) =>
      prev.map((x) =>
        porId.has(x.id) ? { ...x, posicion: porId.get(x.id) as number } : x,
      ),
    );

    const resultados = await Promise.all(
      cambios.map((c) =>
        supabase
          .from("tarjetas")
          .update({ posicion: c.posicion })
          .eq("id", c.id),
      ),
    );
    if (resultados.some((r) => r.error)) {
      setTarjetas((prev) =>
        prev.map((x) =>
          porId.has(x.id)
            ? { ...x, posicion: previas.get(x.id) as number }
            : x,
        ),
      );
      setAnuncio("No se pudo mover la tarjeta.");
    }
  }

  function moverConTeclado(t: TarjetaTablero, delta: -1 | 1) {
    const clienteId = proyectoACliente.get(t.proyecto_id)?.id;
    if (!clienteId) return;
    const lista = visiblesOrdenadas(clienteId);
    const i = lista.findIndex((x) => x.id === t.id);
    const destino = i + delta;
    if (destino < 0 || destino >= lista.length) return;
    void colocar(t, destino);
    setAnuncio(`«${t.titulo}» movida a la posición ${destino + 1}.`);
  }

  /* ── Piezas de render ── */

  /**
   * Play en la tarjeta: arranca un cronómetro con el título como tarea
   * de línea (vínculo por copia, como en «Mis tareas»); al parar, el
   * tiempo se vuelca a la celda de hoy y aparece en Mi semana. Si esa
   * línea ya está en marcha, el botón muestra el tiempo y para.
   */
  function botonCronometro(t: TarjetaTablero) {
    if (!crono || t.estado === "hecha") return null;
    const tarea = limpiarTarea(t.titulo);
    const sesion = crono.sesiones.find(
      (s) => s.proyecto_id === t.proyecto_id && s.tarea === tarea,
    );
    if (sesion) {
      return (
        <button
          type="button"
          onClick={() => void crono.parar(sesion.id)}
          title="Parar el cronómetro (vuelca el tiempo a Mi semana)"
          aria-label={`Parar el cronómetro de «${t.titulo}»`}
          className="flex h-8 items-center gap-1.5 rounded-full bg-acento-suave px-2.5 text-xs font-medium tabular-nums text-acento transition-colors hover:bg-acento/15 focus-visible:outline-2 focus-visible:outline-acento"
        >
          <span
            aria-hidden="true"
            className="punto-pulso size-2 rounded-full bg-acento"
          />
          {formatearDuracionMs(duracionMs(sesion, crono.ahora))}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => void crono.arrancar(t.proyecto_id, tarea)}
        title="Empezar a trabajar (el tiempo cuenta en Mi semana)"
        aria-label={`Empezar a trabajar en «${t.titulo}»`}
        className={`${BOTON_ICONO} h-8 w-8 hover:text-acento`}
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
          <path d="M5.2 3.3v9.4a.5.5 0 0 0 .76.43l7.6-4.7a.5.5 0 0 0 0-.86l-7.6-4.7a.5.5 0 0 0-.76.43Z" />
        </svg>
      </button>
    );
  }

  function chipsAsignados(t: TarjetaTablero) {
    if (t.asignados.length === 0) {
      return <span className="text-xs text-texto-suave">Sin asignar</span>;
    }
    const visibles = t.asignados.slice(0, 4);
    return (
      <span className="flex items-center">
        {visibles.map((id, i) => (
          <span
            key={id}
            title={nombrePersona.get(id) ?? "?"}
            className={`flex h-7 w-7 items-center justify-center rounded-full border border-borde bg-superficie-2 text-[10px] font-semibold text-texto ${i > 0 ? "-ml-1.5" : ""}`}
          >
            {iniciales(nombrePersona.get(id) ?? "?")}
          </span>
        ))}
        {t.asignados.length > visibles.length && (
          <span className="pl-1 text-xs text-texto-suave">
            +{t.asignados.length - visibles.length}
          </span>
        )}
      </span>
    );
  }

  function tarjetaCard(t: TarjetaTablero, indiceVisible: number, total: number) {
    if (editando === t.id) {
      const clienteDeT = proyectoACliente.get(t.proyecto_id);
      return (
        <li key={t.id}>
          <FormularioTarjeta
            todosLosClientes={clientes}
            proyectosDelCliente={clienteDeT?.proyectos}
            equipo={equipo}
            personaId={personaId}
            puedeAsignarOtros={esAdmin || t.creada_por === personaId}
            inicial={{
              titulo: t.titulo,
              proyectoId: t.proyecto_id,
              descripcion: t.descripcion ?? "",
              asignados: t.asignados,
              fechaLimite: t.fecha_limite ?? "",
              urgente: t.urgente,
              checks: checksDe(t.id).map((c) => ({ id: c.id, texto: c.texto })),
            }}
            etiquetaGuardar="Guardar"
            alGuardar={(d) => guardarEdicion(t, d)}
            alCancelar={() => setEditando(null)}
          />
        </li>
      );
    }

    return (
      <li
        key={t.id}
        draggable={!filtroActivo}
        onDragStart={(e) => {
          arrastrandoRef.current = t.id;
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          arrastrandoRef.current = null;
        }}
        onDragOver={(e) => {
          const idArrastrada = arrastrandoRef.current;
          if (!idArrastrada || idArrastrada === t.id) return;
          const otra = tarjetas.find((x) => x.id === idArrastrada);
          if (
            otra &&
            proyectoACliente.get(otra.proyecto_id)?.id ===
              proyectoACliente.get(t.proyecto_id)?.id
          ) {
            e.preventDefault(); // mismo cliente: soltar permitido
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const otra = tarjetas.find((x) => x.id === arrastrandoRef.current);
          arrastrandoRef.current = null;
          if (!otra || otra.id === t.id) return;
          void colocar(otra, indiceVisible);
        }}
        className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-3"
      >
        {/* Superficie clicable: abre el detalle (§ modal). El lápiz vive
            fuera de ella (stopPropagation) porque abre la edición directa;
            el título es un <button> real para que el detalle también se
            pueda abrir por teclado — el resto del área es solo conveniencia
            de ratón (el clic burbujea hasta aquí). */}
        <div
          onClick={() => setDetalle(t.id)}
          className="-m-1 flex cursor-pointer flex-col gap-2 rounded-md p-1"
        >
          <div className="flex items-start justify-between gap-1">
            <button
              type="button"
              className="min-w-0 flex-1 rounded-sm break-words text-left text-sm font-semibold text-tinta focus-visible:outline-2 focus-visible:outline-acento"
            >
              {t.titulo}
            </button>
            {puedeEditar(t) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditando(t.id);
                }}
                title="Editar tarjeta"
                aria-label={`Editar «${t.titulo}»`}
                className={`${BOTON_ICONO} -mr-1.5 -mt-1.5 shrink-0`}
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11.1 2.2 13.8 4.9 5.7 13 2.5 13.5 3 10.3z" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-texto-suave">
              {nombreProyecto.get(t.proyecto_id) ?? "—"}
            </span>
            {chipsAsignados(t)}
          </div>

          {(t.urgente || t.fecha_limite || checksDe(t.id).length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {t.urgente && (
                <span className="rounded-full bg-error-suave px-2 py-0.5 text-[11px] font-semibold text-error">
                  ⚑ Urgente
                </span>
              )}
              {t.fecha_limite && (
                <span
                  title={`Entrega: ${t.fecha_limite}`}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                    t.estado === "hecha"
                      ? "bg-superficie-2 text-texto-suave"
                      : CHIP_PLAZO[plazoDe(t.fecha_limite)]
                  }`}
                >
                  📅 {etiquetaFechaCorta(t.fecha_limite)}
                </span>
              )}
              {(() => {
                const cs = checksDe(t.id);
                if (cs.length === 0) return null;
                const hechos = cs.filter((c) => c.hecho).length;
                const conRetraso = cs.some(
                  (c) =>
                    !c.hecho && c.fecha_limite && diasHasta(c.fecha_limite) < 0,
                );
                return (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                      conRetraso
                        ? "bg-error-suave text-error"
                        : hechos === cs.length
                          ? "bg-exito-suave text-exito"
                          : "bg-superficie-2 text-texto-suave"
                    }`}
                  >
                    ☑ {hechos}/{cs.length}
                  </span>
                );
              })()}
            </div>
          )}

          {t.descripcion && (
            <p className="line-clamp-3 text-xs leading-relaxed whitespace-pre-wrap text-texto-suave">
              {t.descripcion}
            </p>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => void cambiarEstado(t)}
            title={`Pasar a ${ETIQUETA_ESTADO[SIGUIENTE_ESTADO[t.estado]]}`}
            className={`h-8 rounded-full px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-acento ${CHIP_ESTADO[t.estado]}`}
          >
            {ETIQUETA_ESTADO[t.estado]}
          </button>
          {botonCronometro(t)}
          <span className="ml-auto flex items-center">
            {t.estado !== "hecha" && !filtroActivo && (
              <>
                <button
                  type="button"
                  disabled={indiceVisible === 0}
                  onClick={() => moverConTeclado(t, -1)}
                  aria-label={`Subir «${t.titulo}»`}
                  className={BOTON_ICONO}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={indiceVisible === total - 1}
                  onClick={() => moverConTeclado(t, 1)}
                  aria-label={`Bajar «${t.titulo}»`}
                  className={BOTON_ICONO}
                >
                  ↓
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => void alternarme(t)}
              title={
                t.asignados.includes(personaId)
                  ? "Quitarme de la tarjeta"
                  : "Asignármela"
              }
              className={`h-8 rounded-full px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-acento ${
                t.asignados.includes(personaId)
                  ? "text-texto-suave hover:bg-superficie-2 hover:text-tinta"
                  : "text-acento hover:bg-acento-suave"
              }`}
            >
              {t.asignados.includes(personaId) ? "Salirme" : "La cojo"}
            </button>
            {puedeBorrar(t) && (
              <button
                type="button"
                onClick={() =>
                  setConfirmandoBorrar(
                    confirmandoBorrar === t.id ? null : t.id,
                  )
                }
                title="Borrar tarjeta"
                aria-label={`Borrar «${t.titulo}»`}
                aria-expanded={confirmandoBorrar === t.id}
                className={`${BOTON_ICONO} hover:text-error`}
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.8 9.5h6.4L12 4M6.5 7v4M9.5 7v4" />
                </svg>
              </button>
            )}
          </span>
        </div>

        {confirmandoBorrar === t.id && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-error/40 bg-error-suave px-2.5 py-2 text-xs text-error">
            <span className="flex-1">Se borrará la tarjeta.</span>
            <button
              type="button"
              onClick={() => void borrar(t)}
              className="rounded-md border border-error/40 px-2 py-1 font-medium transition-colors hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-error"
            >
              Borrar
            </button>
            <button
              type="button"
              onClick={() => setConfirmandoBorrar(null)}
              className="rounded-md px-2 py-1 font-medium transition-colors hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-error"
            >
              Cancelar
            </button>
          </div>
        )}
      </li>
    );
  }

  /**
   * Subtareas dentro del detalle: checklist tipo Trello con persona y
   * fecha POR ÍTEM. Editar la lista exige poder editar la tarjeta;
   * marcar/desmarcar lo puede hacer además la persona del ítem (es su
   * subtarea) — mismo reparto que las policies de la 014.
   */
  function seccionChecks(t: TarjetaTablero) {
    const cs = checksDe(t.id);
    const editable = puedeEditar(t);
    if (cs.length === 0 && !editable) return null;
    const hechos = cs.filter((c) => c.hecho).length;

    return (
      <div className="flex flex-col gap-1.5 border-t border-borde pt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-texto-suave">
          Subtareas{cs.length > 0 && ` · ${hechos}/${cs.length}`}
        </p>

        {cs.length > 0 && (
          <ul className="flex flex-col gap-1">
            {cs.map((c) => {
              const puedeMarcar = editable || c.persona_id === personaId;
              const vencido =
                !c.hecho && c.fecha_limite && diasHasta(c.fecha_limite) < 0;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={c.hecho}
                    disabled={!puedeMarcar}
                    onChange={() => void actualizarCheck(c, { hecho: !c.hecho })}
                    aria-label={`${c.hecho ? "Desmarcar" : "Marcar"} «${c.texto}»`}
                    className="size-4 shrink-0 accent-[var(--acento)]"
                  />
                  <span
                    className={`min-w-0 flex-1 break-words text-sm ${
                      c.hecho ? "text-texto-suave line-through" : "text-tinta"
                    }`}
                  >
                    {c.texto}
                  </span>
                  {editable ? (
                    <>
                      <label className="sr-only" htmlFor={`check-persona-${c.id}`}>
                        Persona de «{c.texto}»
                      </label>
                      <select
                        id={`check-persona-${c.id}`}
                        value={c.persona_id ?? ""}
                        onChange={(e) =>
                          void actualizarCheck(c, {
                            persona_id: e.target.value || null,
                          })
                        }
                        className="h-7 max-w-28 shrink-0 truncate rounded-md border border-borde bg-superficie px-1 text-xs text-texto outline-none focus:border-acento"
                      >
                        <option value="">Nadie</option>
                        {equipo.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                      <label className="sr-only" htmlFor={`check-fecha-${c.id}`}>
                        Fecha de «{c.texto}»
                      </label>
                      <input
                        id={`check-fecha-${c.id}`}
                        type="date"
                        value={c.fecha_limite ?? ""}
                        onChange={(e) =>
                          void actualizarCheck(c, {
                            fecha_limite: e.target.value || null,
                          })
                        }
                        className={`h-7 shrink-0 rounded-md border border-borde bg-superficie px-1 text-xs outline-none focus:border-acento ${
                          vencido ? "text-error" : "text-texto"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => void borrarCheck(c)}
                        aria-label={`Borrar subtarea «${c.texto}»`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-texto-suave transition-colors hover:bg-superficie-2 hover:text-error focus-visible:outline-2 focus-visible:outline-acento"
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      {c.persona_id && (
                        <span
                          title={nombrePersona.get(c.persona_id) ?? "?"}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-borde bg-superficie-2 text-[10px] font-semibold text-texto"
                        >
                          {iniciales(nombrePersona.get(c.persona_id) ?? "?")}
                        </span>
                      )}
                      {c.fecha_limite && (
                        <span
                          className={`shrink-0 text-[11px] tabular-nums ${
                            vencido ? "font-medium text-error" : "text-texto-suave"
                          }`}
                        >
                          📅 {etiquetaFechaCorta(c.fecha_limite)}
                        </span>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {editable && (
          <FormularioNuevoCheck
            key={t.id}
            alCrear={(texto) => void crearCheck(t.id, texto)}
          />
        )}
      </div>
    );
  }

  /**
   * Modal de detalle (tipo Trello): descripción completa sin recortar y
   * acciones rápidas (estado, asignarme). Editar/Borrar cierran el modal y
   * delegan en los flujos ya existentes de la columna (formulario inline /
   * confirmación de borrado), sin duplicar esa lógica aquí.
   */
  function detalleModal() {
    const t = tarjetas.find((x) => x.id === detalle);
    if (!t) return null;
    const cliente = proyectoACliente.get(t.proyecto_id);
    const asignadosTexto =
      t.asignados.length > 0
        ? t.asignados.map((id) => nombrePersona.get(id) ?? "?").join(", ")
        : "Sin asignar";

    return (
      <div
        className="fixed inset-0 z-20 flex items-center justify-center bg-tinta/40 p-4"
        onClick={() => setDetalle(null)}
      >
        <div
          ref={dialogoRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="detalle-titulo"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-xl border border-borde bg-superficie p-4 shadow-lg outline-none"
        >
          <div className="flex items-start justify-between gap-2">
            <h2
              id="detalle-titulo"
              className="min-w-0 flex-1 break-words text-base font-semibold text-tinta"
            >
              {t.titulo}
            </h2>
            <button
              type="button"
              onClick={() => setDetalle(null)}
              aria-label="Cerrar"
              className={`${BOTON_ICONO} shrink-0`}
            >
              ✕
            </button>
          </div>

          <p className="text-[11px] font-medium uppercase tracking-wide text-texto-suave">
            {cliente?.nombre ?? "—"} — {nombreProyecto.get(t.proyecto_id) ?? "—"}
          </p>

          <p className="text-xs text-texto-suave">
            <span className="font-medium text-texto">Asignada a: </span>
            {asignadosTexto}
          </p>

          {(t.urgente || t.fecha_limite) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {t.urgente && (
                <span className="rounded-full bg-error-suave px-2 py-0.5 text-[11px] font-semibold text-error">
                  ⚑ Urgente
                </span>
              )}
              {t.fecha_limite && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                    t.estado === "hecha"
                      ? "bg-superficie-2 text-texto-suave"
                      : CHIP_PLAZO[plazoDe(t.fecha_limite)]
                  }`}
                >
                  📅 Entrega: {etiquetaFechaCorta(t.fecha_limite)}
                  {t.estado !== "hecha" &&
                    (diasHasta(t.fecha_limite) < 0
                      ? ` (vencida hace ${-diasHasta(t.fecha_limite)} d)`
                      : ` (quedan ${diasHasta(t.fecha_limite)} d)`)}
                </span>
              )}
            </div>
          )}

          {t.descripcion && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-texto">
              {t.descripcion}
            </p>
          )}

          {seccionChecks(t)}

          <div className="flex flex-wrap items-center gap-1.5 border-t border-borde pt-3">
            <button
              type="button"
              onClick={() => void cambiarEstado(t)}
              title={`Pasar a ${ETIQUETA_ESTADO[SIGUIENTE_ESTADO[t.estado]]}`}
              className={`h-8 rounded-full px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-acento ${CHIP_ESTADO[t.estado]}`}
            >
              {ETIQUETA_ESTADO[t.estado]}
            </button>
            {botonCronometro(t)}
            <button
              type="button"
              onClick={() => void alternarme(t)}
              className={`h-8 rounded-full px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-acento ${
                t.asignados.includes(personaId)
                  ? "text-texto-suave hover:bg-superficie-2 hover:text-tinta"
                  : "text-acento hover:bg-acento-suave"
              }`}
            >
              {t.asignados.includes(personaId) ? "Salirme" : "La cojo"}
            </button>
            {puedeEditar(t) && (
              <button
                type="button"
                onClick={() => {
                  setEditando(t.id);
                  setDetalle(null);
                }}
                className="h-8 rounded-full px-2.5 text-xs font-medium text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento"
              >
                Editar
              </button>
            )}
            {puedeBorrar(t) && (
              <button
                type="button"
                onClick={() => {
                  setConfirmandoBorrar(t.id);
                  setDetalle(null);
                }}
                className="ml-auto h-8 rounded-full px-2.5 text-xs font-medium text-texto-suave transition-colors hover:bg-error-suave hover:text-error focus-visible:outline-2 focus-visible:outline-acento"
              >
                Borrar
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  function columna(c: ClienteConProyectos) {
    // La vista filtra lo que se pinta; la aritmética de posiciones
    // (colocar/mover) sigue trabajando sobre la columna completa.
    const enVista = (t: TarjetaTablero) => idsEnVista.has(t.id);
    const visibles = visiblesOrdenadas(c.id).filter(enVista);
    const hechas = tarjetasDe(c.id)
      .filter((t) => t.estado === "hecha" && enVista(t))
      .sort((a, b) => (b.hecha_en ?? "").localeCompare(a.hecha_en ?? ""));
    // Con el filtro «Hechas» activo la sección plegada se abre sola:
    // ocultar justo lo que se pide ver sería absurdo.
    const abiertas = hechasAbiertas.has(c.id) || estadoFiltro === "hecha";
    const activaMovil = clienteMovilEfectivo === c.id;

    return (
      <section
        key={c.id}
        aria-label={`Tarjetas de ${c.nombre}`}
        className={`w-full shrink-0 flex-col gap-2 sm:w-72 ${
          activaMovil ? "flex" : "hidden sm:flex"
        }`}
      >
        <header className="flex items-center justify-between gap-1">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-texto-suave">
            {c.nombre}
          </h2>
          <button
            type="button"
            onClick={() => setCreandoEn(creandoEn === c.id ? null : c.id)}
            title={`Nueva tarjeta en ${c.nombre}`}
            aria-expanded={creandoEn === c.id}
            className={BOTON_ICONO}
          >
            +
          </button>
        </header>

        {creandoEn === c.id && (
          <FormularioTarjeta
            proyectosDelCliente={c.proyectos}
            equipo={equipo}
            personaId={personaId}
            puedeAsignarOtros={true}
            etiquetaGuardar="Crear tarjeta"
            alGuardar={(d) => crearTarjeta(c.id, d)}
            alCancelar={() => setCreandoEn(null)}
          />
        )}

        <ul
          className="flex min-h-16 flex-col gap-2"
          onDragOver={(e) => {
            const otra = tarjetas.find(
              (x) => x.id === arrastrandoRef.current,
            );
            if (otra && proyectoACliente.get(otra.proyecto_id)?.id === c.id) {
              e.preventDefault();
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            const otra = tarjetas.find(
              (x) => x.id === arrastrandoRef.current,
            );
            arrastrandoRef.current = null;
            if (otra) void colocar(otra, visibles.length); // al final
          }}
        >
          {visibles.map((t, i) => tarjetaCard(t, i, visibles.length))}
        </ul>

        {hechas.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() =>
                setHechasAbiertas((prev) => {
                  const s = new Set(prev);
                  if (abiertas) s.delete(c.id);
                  else s.add(c.id);
                  return s;
                })
              }
              aria-expanded={abiertas}
              className="rounded-md px-2 py-1.5 text-xs font-medium text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento"
            >
              ✓ {hechas.length} hecha{hechas.length === 1 ? "" : "s"}{" "}
              {abiertas ? "▾" : "▸"}
            </button>
            {abiertas && (
              <ul className="mt-1 flex flex-col gap-2">
                {hechas.map((t) => tarjetaCard(t, -1, 0))}
              </ul>
            )}
          </div>
        )}
      </section>
    );
  }

  /* ── Render ── */

  return (
    <div className="flex flex-1 flex-col gap-4">
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-marca text-xl font-semibold tracking-tight text-tinta">
          Tareas
        </h1>
        <div
          role="group"
          aria-label="Filtrar tarjetas"
          className="inline-flex rounded-lg bg-superficie-2 p-0.5"
        >
          <button
            type="button"
            aria-pressed={!soloMias}
            onClick={() => setSoloMias(false)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-acento ${
              !soloMias
                ? "bg-tinta font-medium text-superficie"
                : "text-texto-suave hover:text-tinta"
            }`}
          >
            Todas
          </button>
          <button
            type="button"
            aria-pressed={soloMias}
            onClick={() => setSoloMias(true)}
            className={`rounded-md px-3 py-1.5 text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-acento ${
              soloMias
                ? "bg-tinta font-medium text-superficie"
                : "text-texto-suave hover:text-tinta"
            }`}
          >
            Mías{nMias > 0 ? ` (${nMias})` : ""}
          </button>
        </div>
        <label className="sr-only" htmlFor="busqueda-cliente">
          Buscar cliente
        </label>
        <input
          id="busqueda-cliente"
          type="search"
          value={busquedaCliente}
          onChange={(e) => setBusquedaCliente(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setBusquedaCliente("");
          }}
          autoComplete="off"
          placeholder="Buscar cliente…"
          className="h-9 w-40 rounded-lg border border-borde bg-superficie px-2.5 text-sm text-tinta outline-none placeholder:text-texto-suave focus:border-acento focus:ring-2 focus:ring-acento/20"
        />
        <label className="sr-only" htmlFor="filtro-tipo">
          Filtrar por tipo de proyecto
        </label>
        <select
          id="filtro-tipo"
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value)}
          className={SELECT_FILTRO}
        >
          <option value="">Todos los tipos</option>
          {tipos.map(([clave, nombre]) => (
            <option key={clave} value={clave}>
              {nombre}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="filtro-estado">
          Filtrar por estado
        </label>
        <select
          id="filtro-estado"
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value as EstadoTarjeta | "")}
          className={SELECT_FILTRO}
        >
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendientes</option>
          <option value="en_curso">En curso</option>
          <option value="hecha">Hechas</option>
        </select>
        {esAdmin && (
          <>
            <label className="sr-only" htmlFor="filtro-persona">
              Filtrar por persona
            </label>
            <select
              id="filtro-persona"
              value={personaFiltro}
              onChange={(e) => setPersonaFiltro(e.target.value)}
              className={SELECT_FILTRO}
            >
              <option value="">Todas las personas</option>
              {equipo.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </>
        )}
        <span className="ml-auto flex items-center gap-2">
          <Link
            href={verArchivadas ? "/tareas" : "/tareas?archivadas=1"}
            className="rounded-md px-2 py-1.5 text-xs font-medium text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento"
          >
            {verArchivadas ? "Ocultar archivadas" : "Ver archivadas"}
          </Link>
          <BotonNuevaTarjeta
            clientes={clientes}
            equipo={equipo}
            personaId={personaId}
            alCrear={crearTarjeta}
          />
        </span>
      </div>

      {/* Carga por persona del equipo filtrado: el más cargado primero.
          Cada chip filtra por esa persona (y «Sin asignar» es el montón
          pendiente de repartir). */}
      {resumenCarga &&
        (resumenCarga.personas.length > 0 || resumenCarga.sinAsignar > 0) && (
          <div
            role="region"
            aria-label="Carga de trabajo por persona"
            className="flex flex-wrap items-center gap-1.5 rounded-xl border border-borde bg-superficie px-3 py-2"
          >
            <span className="text-[11px] font-medium uppercase tracking-wide text-texto-suave">
              Carga
            </span>
            {resumenCarga.sinAsignar > 0 && (
              <span className="rounded-full bg-aviso-suave px-2.5 py-1 text-xs font-medium tabular-nums text-aviso">
                Sin asignar · {resumenCarga.sinAsignar}
              </span>
            )}
            {resumenCarga.personas.map(([id, n]) => {
              const activa = personaFiltro === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={activa}
                  title={
                    activa
                      ? "Quitar el filtro por persona"
                      : `Ver solo las tarjetas de ${nombrePersona.get(id) ?? "?"}`
                  }
                  onClick={() => setPersonaFiltro(activa ? "" : id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-acento ${
                    activa
                      ? "border-acento bg-acento-suave text-acento"
                      : "border-borde text-texto hover:border-borde-fuerte hover:bg-superficie-2"
                  }`}
                >
                  {nombrePersona.get(id) ?? "?"} · {n}
                </button>
              );
            })}
          </div>
        )}

      {/* Selector de cliente en móvil (mismo patrón que el selector de día). */}
      {columnas.length > 0 && (
        <div
          role="tablist"
          aria-label="Cliente"
          className="flex gap-1.5 overflow-x-auto sm:hidden"
        >
          {columnas.map((c) => {
            const activa = clienteMovilEfectivo === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() => setClienteMovil(c.id)}
                className={`h-11 shrink-0 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-acento ${
                  activa
                    ? "bg-acento text-superficie"
                    : "bg-superficie-2 text-texto-suave"
                }`}
              >
                {c.nombre}
              </button>
            );
          })}
        </div>
      )}

      {columnas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-borde p-8 text-center text-sm text-texto-suave">
          {busquedaCliente.trim() !== ""
            ? "Ningún cliente coincide con la búsqueda."
            : soloMias
              ? "No tienes tarjetas asignadas. Pasa a «Todas» y coge alguna."
              : filtroActivo
                ? "Ninguna tarjeta coincide con el filtro."
                : "Aún no hay tarjetas. Crea la primera con «Nueva tarjeta»."}
        </div>
      ) : (
        <div
          ref={tableroRef}
          onPointerDown={alPulsarTablero}
          onPointerMove={alMoverTablero}
          onPointerUp={alSoltarTablero}
          onPointerCancel={alSoltarTablero}
          className={`flex flex-1 gap-4 overflow-x-auto pb-4 sm:cursor-grab ${
            paneando ? "sm:cursor-grabbing sm:select-none" : ""
          }`}
        >
          {columnas.map((c) => columna(c))}
        </div>
      )}

      {detalle !== null && detalleModal()}
    </div>
  );
}

/* ── «Nueva tarjeta» desde la cabecera del tablero ─────────────── */
// Elegir cliente con el buscador (evita 30 columnas vacías) y crear.

function BotonNuevaTarjeta({
  clientes,
  equipo,
  personaId,
  alCrear,
}: {
  clientes: ClienteConProyectos[];
  equipo: MiembroEquipo[];
  personaId: string;
  alCrear: (clienteId: string, d: DatosFormularioTarjeta) => Promise<boolean>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [clienteId, setClienteId] = useState<string | null>(null);

  const elegibles = clientes.filter((c) => c.proyectos.length > 0);
  const cliente = elegibles.find((c) => c.id === clienteId) ?? null;

  function cerrar() {
    setAbierto(false);
    setClienteId(null);
  }

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        aria-expanded={abierto}
        className="rounded-lg bg-marca-accion px-3 py-2 text-sm font-semibold text-sobre-marca transition-colors hover:bg-marca-accion-fuerte focus-visible:outline-2 focus-visible:outline-acento"
      >
        Nueva tarjeta
      </button>
      {abierto && (
        <div
          onKeyDown={(e) => {
            if (e.key === "Escape") cerrar();
          }}
          className="absolute right-0 top-full z-10 mt-2 w-80 rounded-xl border border-borde bg-superficie p-3 shadow-lg"
        >
          {cliente === null ? (
            <BuscadorCliente
              opciones={elegibles}
              alElegir={(id) => setClienteId(id)}
            />
          ) : (
            <FormularioTarjeta
              proyectosDelCliente={cliente.proyectos}
              equipo={equipo}
              personaId={personaId}
              puedeAsignarOtros={true}
              etiquetaGuardar={`Crear en ${cliente.nombre}`}
              alGuardar={async (d) => {
                const creada = await alCrear(cliente.id, d);
                if (creada) cerrar();
                return creada;
              }}
              alCancelar={cerrar}
            />
          )}
        </div>
      )}
    </span>
  );
}
