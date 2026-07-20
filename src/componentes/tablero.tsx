"use client";

// Tablero de tareas (roadmap-tareas.md §3): columnas por cliente activo,
// tarjeta = proyecto + título. Muta con el cliente de navegador y RLS
// (mismo patrón que la rejilla); optimista con reversión donde el fallo
// es recuperable. Un solo árbol para móvil y escritorio: en móvil, el
// selector de cliente decide qué columna se ve (nada se renderiza doble).

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import { EQUIPOS, NOMBRE_EQUIPO } from "@/lib/equipos";
import { BuscadorCliente } from "./buscador-cliente";
import type { TarjetaTablero } from "@/lib/datos/tareas";
import type {
  Cliente,
  Equipo,
  EstadoTarjeta,
  Persona,
  PersonaEquipo,
  Proyecto,
} from "@/lib/tipos";

type ClienteConProyectos = Cliente & { proyectos: Proyecto[] };
type MiembroEquipo = Pick<Persona, "id" | "nombre">;

/** Posición: insertar con saltos grandes; renumerar bajo umbral (007). */
const SALTO = 1024;
const UMBRAL_RENUMERAR = 0.001;

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
  const [guardando, setGuardando] = useState(false);

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

/* ── Tablero ───────────────────────────────────────────────────── */

export function Tablero({
  personaId,
  esAdmin,
  clientes,
  equipo,
  equiposPersonas,
  tarjetasIniciales,
  verArchivadas,
}: {
  personaId: string;
  esAdmin: boolean;
  clientes: ClienteConProyectos[];
  equipo: MiembroEquipo[];
  /** Pertenencia a equipos de trabajo (alimenta el filtro por equipo). */
  equiposPersonas: PersonaEquipo[];
  tarjetasIniciales: TarjetaTablero[];
  verArchivadas: boolean;
}) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const [tarjetas, setTarjetas] = useState(tarjetasIniciales);
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
  // consecuencia). Se compone con dos filtros más: por equipo de trabajo
  // (todo el mundo) y por persona (solo admin). Con CUALQUIER filtro
  // activo NO se reordena: mover relativo a una lista con huecos
  // escribiría posiciones confusas para el resto.
  const [soloMias, setSoloMias] = useState(false);
  const [equipoFiltro, setEquipoFiltro] = useState<Equipo | "">("");
  const [personaFiltro, setPersonaFiltro] = useState("");
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

  const filtroActivo = soloMias || equipoFiltro !== "" || personaFiltro !== "";

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

  // Miembros del equipo de trabajo elegido; null = sin filtro de equipo.
  const miembrosEquipoFiltro = useMemo(() => {
    if (equipoFiltro === "") return null;
    return new Set(
      equiposPersonas
        .filter((pe) => pe.equipo === equipoFiltro)
        .map((pe) => pe.persona_id),
    );
  }, [equiposPersonas, equipoFiltro]);

  // Una tarjeta «es» de un equipo si alguna persona asignada pertenece;
  // el backlog (sin asignar) solo aparece sin filtros de gente.
  const tarjetasVista = useMemo(
    () =>
      tarjetas.filter((t) => {
        if (soloMias && !t.asignados.includes(personaId)) return false;
        if (personaFiltro !== "" && !t.asignados.includes(personaFiltro))
          return false;
        if (
          miembrosEquipoFiltro !== null &&
          !t.asignados.some((id) => miembrosEquipoFiltro.has(id))
        )
          return false;
        return true;
      }),
    [tarjetas, soloMias, personaId, personaFiltro, miembrosEquipoFiltro],
  );
  const idsEnVista = useMemo(
    () => new Set(tarjetasVista.map((t) => t.id)),
    [tarjetasVista],
  );
  const nMias = useMemo(
    () => tarjetas.filter((t) => t.asignados.includes(personaId)).length,
    [tarjetas, personaId],
  );

  // Columnas = clientes con alguna tarjeta EN LA VISTA (+ donde se crea).
  const columnas = useMemo(() => {
    const conTarjeta = new Set(
      tarjetasVista.map((t) => proyectoACliente.get(t.proyecto_id)?.id),
    );
    return clientes.filter((c) => conTarjeta.has(c.id) || creandoEn === c.id);
  }, [clientes, tarjetasVista, proyectoACliente, creandoEn]);

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

    setTarjetas((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? {
              ...x,
              titulo: d.titulo,
              proyecto_id: d.proyectoId,
              descripcion: d.descripcion || null,
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

          {t.descripcion && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-texto">
              {t.descripcion}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 border-t border-borde pt-3">
            <button
              type="button"
              onClick={() => void cambiarEstado(t)}
              title={`Pasar a ${ETIQUETA_ESTADO[SIGUIENTE_ESTADO[t.estado]]}`}
              className={`h-8 rounded-full px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-acento ${CHIP_ESTADO[t.estado]}`}
            >
              {ETIQUETA_ESTADO[t.estado]}
            </button>
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
    const abiertas = hechasAbiertas.has(c.id);
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
        <label className="sr-only" htmlFor="filtro-equipo">
          Filtrar por equipo de trabajo
        </label>
        <select
          id="filtro-equipo"
          value={equipoFiltro}
          onChange={(e) => setEquipoFiltro(e.target.value as Equipo | "")}
          className={SELECT_FILTRO}
        >
          <option value="">Todos los equipos</option>
          {EQUIPOS.map((e) => (
            <option key={e} value={e}>
              {NOMBRE_EQUIPO[e]}
            </option>
          ))}
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
          {soloMias
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
