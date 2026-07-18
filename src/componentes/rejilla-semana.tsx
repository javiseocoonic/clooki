"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import {
  DIAS_SEMANA,
  NOMBRES_DIA,
  PASO_STEPPER_SEGUNDOS,
  SEGUNDOS_DIA,
  SEP_LINEA,
  aIso,
  diasDeSemana,
  etiquetaDia,
  formatearDuracion,
  idLinea,
  interpretarDuracion,
  limpiarTarea,
} from "@/lib/semana";
import type {
  Cliente,
  Proyecto,
  RegistroHoras,
  SesionCronometro,
} from "@/lib/tipos";
import type { LineaSemana, TarjetaMia } from "@/lib/datos/mi-semana";
import { MisTareas } from "./mis-tareas";
import { AnadirLinea } from "./anadir-linea";
import { EntradaNatural } from "./entrada-natural";
import type { PropuestaHoras } from "@/app/acciones-ia";
import {
  duracionMs,
  formatearDuracionMs,
  useCronometros,
} from "./cronometros";

type EstadoCelda = "guardando" | "error" | "invalido" | "confirmado";

interface Props {
  personaId: string;
  lunesIso: string;
  lineas: LineaSemana[];
  clientes: (Cliente & { proyectos: Proyecto[] })[];
  /** Ids de clientes con horas recientes de la persona, más reciente primero. */
  clientesRecientes: string[];
  horas: RegistroHoras[];
  /** Tarjetas pendientes/en curso asignadas a la persona («Mis tareas»). */
  misTarjetas: TarjetaMia[];
}

// "Hoy" solo se conoce con certeza en el cliente (zona horaria del usuario).
const sinSuscripcion = () => () => {};
function useHoy(): string | null {
  return useSyncExternalStore(
    sinSuscripcion,
    () => aIso(new Date()),
    () => null,
  );
}

// Conexión: true en servidor/hidratación, luego navigator.onLine en vivo.
function suscribirConexion(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
function useConectado(): boolean {
  return useSyncExternalStore(
    suscribirConexion,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Clave de celda: `proyectoId␟tarea␟fecha` (SEP_LINEA, filtrado de toda
 * entrada de usuario, así el split de 3 partes es siempre seguro).
 */
function clave(proyectoId: string, tarea: string, fecha: string): string {
  return `${proyectoId}${SEP_LINEA}${tarea}${SEP_LINEA}${fecha}`;
}

/** Clave estable de una línea visible. */
function claveLinea(l: LineaSemana): string {
  return idLinea(l.id, l.tarea);
}

const AYUDA_ENTRADA =
  "Escribe horas («1,5»), reloj («1:30» o «1:30:45») o minutos («45m»). Máximo 24 h.";

export function RejillaSemana({
  personaId,
  lunesIso,
  lineas,
  clientes,
  clientesRecientes,
  horas,
  misTarjetas,
}: Props) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const dias = useMemo(() => diasDeSemana(lunesIso), [lunesIso]);
  const tablaRef = useRef<HTMLDivElement>(null);
  // «Mis tareas» registra aquí su oyente: cada guardado de horas con éxito
  // le avisa para el automatismo pendiente → en curso (roadmap §4).
  const avisarGuardadoRef = useRef<
    ((proyectoId: string, tarea: string) => void) | null
  >(null);
  const versionesRef = useRef<Record<string, number>>({});
  const debouncesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );
  const badgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Estado fuente (se reinicializa por semana vía key en el padre) ──
  // `valores` = texto en pantalla; `guardadas` = SEGUNDOS confirmados en BD.
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const h of horas)
      m[clave(h.proyecto_id, h.tarea, h.fecha)] = formatearDuracion(h.segundos);
    return m;
  });
  const [guardadas, setGuardadas] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const h of horas)
      m[clave(h.proyecto_id, h.tarea, h.fecha)] = h.segundos;
    return m;
  });
  // Espejos para leer el último valor desde timeouts/listeners sin closures rancias.
  const valoresRef = useRef(valores);
  const guardadasRef = useRef(guardadas);

  const [estadoCeldas, setEstadoCeldas] = useState<
    Record<string, EstadoCelda>
  >({});
  const [extras, setExtras] = useState<LineaSemana[]>([]);
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [verFinde, setVerFinde] = useState(() =>
    horas.some((h) => h.fecha === dias[5] || h.fecha === dias[6]),
  );
  const [badge, setBadge] = useState<string | null>(null);
  const [lineasNuevas, setLineasNuevas] = useState<Set<string>>(new Set());
  // Papelera: clave de la línea cuya confirmación de borrado está abierta.
  const [confirmandoBorrado, setConfirmandoBorrado] = useState<string | null>(
    null,
  );
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  // Lápiz: clave de la línea cuya tarea se está editando.
  const [editandoTarea, setEditandoTarea] = useState<string | null>(null);
  const [textoTarea, setTextoTarea] = useState("");
  const [errorTarea, setErrorTarea] = useState<string | null>(null);
  const pendienteFocoRef = useRef<string | null>(null);
  const autoenfocadoRef = useRef(false);

  const hoy = useHoy();
  const conectado = useConectado();
  const crono = useCronometros();
  const sesionPorLinea = useMemo(() => {
    const m = new Map<string, SesionCronometro>();
    crono?.sesiones.forEach((s) => m.set(idLinea(s.proyecto_id, s.tarea), s));
    return m;

  }, [crono?.sesiones]);

  function sesionEnCelda(
    proyectoId: string,
    tarea: string,
    fecha: string,
  ): SesionCronometro | undefined {
    const s = sesionPorLinea.get(idLinea(proyectoId, tarea));
    return s && s.dia_atribuido === fecha ? s : undefined;
  }
  const [diaMovilElegido, setDiaMovilElegido] = useState<string | null>(null);
  const diaMovil =
    diaMovilElegido ?? (hoy && dias.includes(hoy) ? hoy : dias[0]);

  const lineasVisibles = useMemo(
    () => [
      ...lineas.filter((l) => !ocultas.has(claveLinea(l))),
      ...extras.filter((l) => !ocultas.has(claveLinea(l))),
    ],
    [lineas, extras, ocultas],
  );

  const indicesVisibles = verFinde ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
  const hayHorasFinde = dias
    .slice(5)
    .some((f) =>
      lineasVisibles.some(
        (l) => guardadas[clave(l.id, l.tarea, f)] !== undefined,
      ),
    );

  // ── Estado por celda ──

  function ponerEstado(k: string, estado?: EstadoCelda) {
    setEstadoCeldas((prev) => {
      if (!estado && !(k in prev)) return prev;
      const s = { ...prev };
      if (estado) s[k] = estado;
      else delete s[k];
      return s;
    });
  }

  function mostrarBadge(texto: string, ms = 1900) {
    if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
    setBadge(texto);
    badgeTimerRef.current = setTimeout(() => setBadge(null), ms);
  }

  // ── Autoguardado ──

  async function guardarCelda(
    proyectoId: string,
    tarea: string,
    fecha: string,
    segundos: number | null,
  ) {
    const k = clave(proyectoId, tarea, fecha);
    const version = (versionesRef.current[k] ?? 0) + 1;
    versionesRef.current[k] = version;
    ponerEstado(k, "guardando");

    const ejecutar = async (): Promise<boolean> => {
      if (segundos === null) {
        const { error } = await supabase
          .from("horas")
          .delete()
          .eq("persona_id", personaId)
          .eq("proyecto_id", proyectoId)
          .eq("tarea", tarea)
          .eq("fecha", fecha);
        return !error;
      }
      const { error } = await supabase.from("horas").upsert(
        { persona_id: personaId, proyecto_id: proyectoId, fecha, tarea, segundos },
        { onConflict: "persona_id,proyecto_id,fecha,tarea" },
      );
      return !error;
    };

    let ok = await ejecutar();
    if (!ok && versionesRef.current[k] === version) ok = await ejecutar();
    if (versionesRef.current[k] !== version) return; // llegó una edición posterior

    if (ok) {
      if (segundos !== null) avisarGuardadoRef.current?.(proyectoId, tarea);
      setGuardadas((prev) => {
        const s = { ...prev };
        if (segundos === null) delete s[k];
        else s[k] = segundos;
        guardadasRef.current = s;
        return s;
      });
      ponerEstado(k, "confirmado");
      setTimeout(() => {
        setEstadoCeldas((prev) => {
          if (prev[k] !== "confirmado") return prev;
          const s = { ...prev };
          delete s[k];
          return s;
        });
      }, 900);
      mostrarBadge("Guardado ✓");
    } else {
      ponerEstado(k, "error");
    }
  }

  /**
   * Valida y persiste lo que haya escrito en la celda.
   * `normalizar` = true en blur (reformatea "1,5"→"1:30:00" y marca inválidos);
   * false en el debounce (guarda en silencio sin tocar lo que se teclea).
   */
  function persistirCelda(
    proyectoId: string,
    tarea: string,
    fecha: string,
    normalizar: boolean,
  ) {
    const k = clave(proyectoId, tarea, fecha);
    const texto = valoresRef.current[k] ?? "";
    const resultado = interpretarDuracion(texto);

    if (resultado === "error") {
      if (normalizar) ponerEstado(k, "invalido");
      return;
    }

    if (resultado === null) {
      if (normalizar && texto !== "") ponerValor(k, "");
      if (guardadasRef.current[k] === undefined) {
        if (normalizar) ponerEstado(k);
        return;
      }
      void guardarCelda(proyectoId, tarea, fecha, null);
      return;
    }

    if (normalizar) ponerValor(k, formatearDuracion(resultado));
    if (guardadasRef.current[k] === resultado) {
      if (normalizar) ponerEstado(k);
      return;
    }
    void guardarCelda(proyectoId, tarea, fecha, resultado);
  }

  function ponerValor(k: string, texto: string) {
    valoresRef.current = { ...valoresRef.current, [k]: texto };
    setValores(valoresRef.current);
  }

  function cancelarDebounce(k: string) {
    const t = debouncesRef.current[k];
    if (t) {
      clearTimeout(t);
      delete debouncesRef.current[k];
    }
  }

  function programarGuardado(proyectoId: string, tarea: string, fecha: string) {
    const k = clave(proyectoId, tarea, fecha);
    cancelarDebounce(k);
    debouncesRef.current[k] = setTimeout(() => {
      delete debouncesRef.current[k];
      persistirCelda(proyectoId, tarea, fecha, false);
    }, 800);
  }

  function alSalirDeCelda(proyectoId: string, tarea: string, fecha: string) {
    cancelarDebounce(clave(proyectoId, tarea, fecha));
    persistirCelda(proyectoId, tarea, fecha, true);
  }

  // Vaciado best-effort al ocultarse la pestaña (§12.1) + limpieza al desmontar.
  useEffect(() => {
    const vaciar = () => {
      if (document.visibilityState !== "hidden") return;
      for (const k of Object.keys(debouncesRef.current)) {
        cancelarDebounce(k);
        const [pid, tarea, fecha] = k.split(SEP_LINEA);
        persistirCelda(pid, tarea, fecha, false);
      }
    };
    document.addEventListener("visibilitychange", vaciar);
    return () => document.removeEventListener("visibilitychange", vaciar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al recuperar conexión, reintentar solos los guardados fallidos (§12.2).
  const reintentarRef = useRef<() => void>(() => {});
  useEffect(() => {
    const alVolver = () => reintentarRef.current();
    window.addEventListener("online", alVolver);
    return () => window.removeEventListener("online", alVolver);
  }, []);

  // Eventos de cronómetro: volcar el total a la celda al parar y añadir
  // la línea automáticamente al arrancar desde la bandeja (§11.3.e).
  const lineasVisiblesRef = useRef<LineaSemana[]>([]);
  useEffect(() => {
    lineasVisiblesRef.current = lineasVisibles;
  });
  useEffect(() => {
    if (!crono) return;
    return crono.suscribir((e) => {
      if (e.tipo === "volcado") {
        if (!e.fecha || !dias.includes(e.fecha)) return;
        const k = clave(e.proyectoId, e.tarea, e.fecha);
        const total = e.segundosTotal ?? 0;
        if (total > 0) {
          ponerValor(k, formatearDuracion(total));
          setGuardadas((prev) => {
            const s = { ...prev, [k]: total };
            guardadasRef.current = s;
            return s;
          });
        }
        return;
      }
      // inicio
      const kLinea = idLinea(e.proyectoId, e.tarea);
      if (lineasVisiblesRef.current.some((l) => claveLinea(l) === kLinea))
        return;
      for (const c of clientes) {
        const p = c.proyectos.find((pr) => pr.id === e.proyectoId);
        if (p) {
          anadirLineas([
            {
              ...p,
              cliente: { id: c.id, nombre: c.nombre, activo: c.activo },
              tarea: e.tarea,
            },
          ]);
          return;
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crono?.suscribir, dias]);

  function reintentarErrores() {
    for (const [k, estado] of Object.entries(estadoCeldas)) {
      if (estado !== "error") continue;
      const [pid, tarea, fecha] = k.split(SEP_LINEA);
      persistirCelda(pid, tarea, fecha, true);
    }
  }
  useEffect(() => {
    reintentarRef.current = reintentarErrores;
  });

  // ── Pegado tipo hoja de cálculo (§11.2) ──

  function alPegar(
    e: React.ClipboardEvent<HTMLInputElement>,
    linea: LineaSemana,
    col: number,
  ) {
    const texto = e.clipboardData.getData("text").trim();
    // Separadores de celda: tabulador, salto de línea o espacios.
    // La coma NUNCA separa celdas: siempre es decimal (§12.6).
    if (!/[\t\n ]/.test(texto)) return; // un solo valor → pegado nativo
    e.preventDefault();

    const trozos = texto.split(/[\t\n]+|\s+/).filter(Boolean);
    const desde = indicesVisibles.indexOf(col);
    if (desde === -1) return;

    let guardadasOk = 0;
    let sinGuardar = 0;
    let omitidas = 0;
    trozos.forEach((trozo, i) => {
      const idxDia = indicesVisibles[desde + i];
      if (idxDia === undefined) return; // sobrantes: se ignoran
      const fecha = dias[idxDia];
      if (sesionEnCelda(linea.id, linea.tarea, fecha)) {
        omitidas++; // no se pisa una celda con cronómetro en marcha
        return;
      }
      const k = clave(linea.id, linea.tarea, fecha);
      const res = interpretarDuracion(trozo);
      if (typeof res === "number") {
        ponerValor(k, formatearDuracion(res));
        if (guardadasRef.current[k] !== res)
          void guardarCelda(linea.id, linea.tarea, fecha, res);
        guardadasOk++;
      } else if (res === "error") {
        ponerValor(k, trozo);
        ponerEstado(k, "invalido");
        sinGuardar++;
      }
    });

    mostrarBadge(
      `Pegadas ${guardadasOk} celda${guardadasOk === 1 ? "" : "s"}` +
        (sinGuardar > 0 ? ` · ${sinGuardar} sin guardar` : "") +
        (omitidas > 0
          ? ` · ${omitidas} omitida${omitidas === 1 ? "" : "s"}: cronómetro en marcha`
          : ""),
      3000,
    );
  }

  // ── Entrada por lenguaje natural (fase IA·3): aplicar confirmadas ──

  async function aplicarPropuestas(props: PropuestaHoras[]) {
    let aplicadas = 0;
    let fuera = 0;
    let omitidas = 0;

    for (const p of props) {
      const tarea = limpiarTarea(p.tarea);
      if (sesionEnCelda(p.proyecto_id, tarea, p.fecha)) {
        omitidas++; // celda con cronómetro en marcha: no se pisa
        continue;
      }

      if (dias.includes(p.fecha)) {
        // Semana visible: mismo camino que la edición manual.
        const kLinea = idLinea(p.proyecto_id, tarea);
        if (
          !lineasVisiblesRef.current.some((l) => claveLinea(l) === kLinea)
        ) {
          const c = clientes.find((cl) =>
            cl.proyectos.some((pr) => pr.id === p.proyecto_id),
          );
          const pr = c?.proyectos.find((pr) => pr.id === p.proyecto_id);
          if (c && pr) {
            anadirLineas([
              {
                ...pr,
                cliente: { id: c.id, nombre: c.nombre, activo: c.activo },
                tarea,
              },
            ]);
          }
        }
        const k = clave(p.proyecto_id, tarea, p.fecha);
        const base = guardadasRef.current[k] ?? 0;
        const valor = p.sumar
          ? Math.min(SEGUNDOS_DIA, base + p.segundos)
          : p.segundos;
        ponerValor(k, formatearDuracion(valor));
        await guardarCelda(p.proyecto_id, tarea, p.fecha, valor);
        aplicadas++;
      } else {
        // Fuera de la semana visible: escritura directa (mismo upsert).
        let valor = p.segundos;
        if (p.sumar) {
          const { data } = await supabase
            .from("horas")
            .select("segundos")
            .eq("persona_id", personaId)
            .eq("proyecto_id", p.proyecto_id)
            .eq("tarea", tarea)
            .eq("fecha", p.fecha)
            .maybeSingle();
          valor = Math.min(SEGUNDOS_DIA, (data?.segundos ?? 0) + p.segundos);
        }
        const { error } = await supabase.from("horas").upsert(
          {
            persona_id: personaId,
            proyecto_id: p.proyecto_id,
            fecha: p.fecha,
            tarea,
            segundos: valor,
          },
          { onConflict: "persona_id,proyecto_id,fecha,tarea" },
        );
        if (error) omitidas++;
        else {
          aplicadas++;
          fuera++;
        }
      }
    }

    mostrarBadge(
      `Apuntada${aplicadas === 1 ? "" : "s"} ${aplicadas} celda${aplicadas === 1 ? "" : "s"}` +
        (fuera > 0 ? ` · ${fuera} fuera de la semana visible` : "") +
        (omitidas > 0 ? ` · ${omitidas} sin aplicar` : ""),
      4000,
    );
  }

  // ── Steppers móviles (§13.3): ±15 min ──

  function ajustarCelda(linea: LineaSemana, fecha: string, delta: number) {
    const k = clave(linea.id, linea.tarea, fecha);
    const escrito = interpretarDuracion(valoresRef.current[k] ?? "");
    const base =
      typeof escrito === "number"
        ? escrito
        : (guardadasRef.current[k] ?? 0);
    const nuevo = Math.min(SEGUNDOS_DIA, Math.max(0, base + delta));

    if (nuevo === 0) {
      ponerValor(k, "");
      cancelarDebounce(k);
      ponerEstado(k);
      if (guardadasRef.current[k] !== undefined)
        void guardarCelda(linea.id, linea.tarea, fecha, null);
      return;
    }
    ponerValor(k, formatearDuracion(nuevo));
    ponerEstado(k);
    programarGuardado(linea.id, linea.tarea, fecha); // toques rápidos → un solo guardado
  }

  // ── Líneas ──

  function anadirLineas(nuevas: LineaSemana[]) {
    if (nuevas.length === 0) return;
    setOcultas((prev) => {
      const s = new Set(prev);
      nuevas.forEach((l) => s.delete(claveLinea(l)));
      return s;
    });
    setExtras((prev) => [
      ...prev,
      ...nuevas.filter(
        (l) =>
          !prev.some((p) => claveLinea(p) === claveLinea(l)) &&
          !lineas.some((p) => claveLinea(p) === claveLinea(l)),
      ),
    ]);
    pendienteFocoRef.current = claveLinea(nuevas[0]);
    const ids = new Set(nuevas.map(claveLinea));
    setLineasNuevas(ids);
    setTimeout(() => setLineasNuevas(new Set()), 1000);
  }

  // Foco a la primera celda de la línea recién añadida (D8).
  useEffect(() => {
    const id = pendienteFocoRef.current;
    if (!id) return;
    const fila = lineasVisibles.findIndex((l) => claveLinea(l) === id);
    if (fila === -1) return;
    pendienteFocoRef.current = null;
    const col =
      hoy && dias.includes(hoy) && indicesVisibles.includes(dias.indexOf(hoy))
        ? dias.indexOf(hoy)
        : indicesVisibles[0];
    tablaRef.current
      ?.querySelector<HTMLInputElement>(`[data-celda="${fila}-${col}"]`)
      ?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineasVisibles]);

  // Foco inicial en escritorio, semana con "hoy" visible (§12.7, opcional).
  useEffect(() => {
    if (autoenfocadoRef.current || !hoy || !dias.includes(hoy)) return;
    if (lineasVisibles.length === 0) return;
    if (!window.matchMedia("(min-width: 640px)").matches) return;
    const activo = document.activeElement;
    if (activo && activo !== document.body) return;
    autoenfocadoRef.current = true;
    tablaRef.current
      ?.querySelector<HTMLInputElement>(`[data-celda="0-${dias.indexOf(hoy)}"]`)
      ?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoy]);

  function quitarLinea(kLinea: string) {
    setExtras((prev) => prev.filter((l) => claveLinea(l) !== kLinea));
    setOcultas((prev) => new Set(prev).add(kLinea));
    if (confirmandoBorrado === kLinea) setConfirmandoBorrado(null);
    if (editandoTarea === kLinea) setEditandoTarea(null);
  }

  function sinHoras(linea: LineaSemana): boolean {
    return dias.every((f) => {
      const k = clave(linea.id, linea.tarea, f);
      return guardadas[k] === undefined && (valores[k] ?? "").trim() === "";
    });
  }

  /** Días de la semana visible con horas guardadas en la línea. */
  function diasConHoras(linea: LineaSemana): number {
    return dias.filter(
      (f) => guardadasRef.current[clave(linea.id, linea.tarea, f)] !== undefined,
    ).length;
  }

  // ── Papelera: borrar la línea (y sus horas) de la semana visible ──

  async function borrarLinea(linea: LineaSemana) {
    if (borrando) return;
    setBorrando(true);
    setErrorBorrado(null);
    const claves = dias.map((f) => clave(linea.id, linea.tarea, f));
    // Nada en vuelo debe resucitar la línea tras el borrado.
    for (const k of claves) {
      cancelarDebounce(k);
      versionesRef.current[k] = (versionesRef.current[k] ?? 0) + 1;
    }
    const { error } = await supabase
      .from("horas")
      .delete()
      .eq("persona_id", personaId)
      .eq("proyecto_id", linea.id)
      .eq("tarea", linea.tarea)
      .gte("fecha", dias[0])
      .lte("fecha", dias[6]);
    setBorrando(false);
    if (error) {
      setErrorBorrado("No se pudo borrar. Comprueba la conexión e inténtalo de nuevo.");
      return;
    }
    const vs = { ...valoresRef.current };
    const gs = { ...guardadasRef.current };
    for (const k of claves) {
      delete vs[k];
      delete gs[k];
    }
    valoresRef.current = vs;
    setValores(vs);
    guardadasRef.current = gs;
    setGuardadas(gs);
    setEstadoCeldas((prev) => {
      const s = { ...prev };
      for (const k of claves) delete s[k];
      return s;
    });
    quitarLinea(claveLinea(linea));
    mostrarBadge("Línea borrada");
  }

  // ── Lápiz: editar la tarea de una línea (renombra la semana visible) ──

  function abrirEditorTarea(linea: LineaSemana) {
    setEditandoTarea(claveLinea(linea));
    setTextoTarea(linea.tarea);
    setErrorTarea(null);
    setConfirmandoBorrado(null);
  }

  async function guardarTarea(linea: LineaSemana) {
    const nueva = limpiarTarea(textoTarea);
    if (nueva === linea.tarea) {
      setEditandoTarea(null);
      return;
    }
    const kNueva = idLinea(linea.id, nueva);
    if (lineasVisibles.some((l) => claveLinea(l) === kNueva)) {
      setErrorTarea("Ya hay una línea de este proyecto con esa tarea.");
      return;
    }

    const clavesViejas = dias.map((f) => clave(linea.id, linea.tarea, f));
    for (const k of clavesViejas) cancelarDebounce(k);

    if (diasConHoras(linea) > 0) {
      const { error } = await supabase
        .from("horas")
        .update({ tarea: nueva })
        .eq("persona_id", personaId)
        .eq("proyecto_id", linea.id)
        .eq("tarea", linea.tarea)
        .gte("fecha", dias[0])
        .lte("fecha", dias[6]);
      if (error) {
        setErrorTarea("No se pudo guardar la tarea. Inténtalo de nuevo.");
        return;
      }
    }

    // Remapear el estado local de las celdas a la clave nueva.
    const vs = { ...valoresRef.current };
    const gs = { ...guardadasRef.current };
    for (const f of dias) {
      const kV = clave(linea.id, linea.tarea, f);
      const kN = clave(linea.id, nueva, f);
      if (kV in vs) {
        vs[kN] = vs[kV];
        delete vs[kV];
      }
      if (kV in gs) {
        gs[kN] = gs[kV];
        delete gs[kV];
      }
    }
    valoresRef.current = vs;
    setValores(vs);
    guardadasRef.current = gs;
    setGuardadas(gs);
    setEstadoCeldas((prev) => {
      const s: Record<string, EstadoCelda> = {};
      for (const [k, v] of Object.entries(prev)) {
        const [pid, t, fecha] = k.split(SEP_LINEA);
        if (pid === linea.id && t === linea.tarea)
          s[clave(pid, nueva, fecha)] = v;
        else s[k] = v;
      }
      return s;
    });

    // Sustituir la línea visible (la vieja se oculta; la nueva entra en extras).
    const nuevaLinea: LineaSemana = { ...linea, tarea: nueva };
    setExtras((prev) => [
      ...prev.filter((l) => claveLinea(l) !== claveLinea(linea)),
      nuevaLinea,
    ]);
    setOcultas((prev) => {
      const s = new Set(prev);
      s.add(claveLinea(linea));
      s.delete(kNueva);
      return s;
    });
    setEditandoTarea(null);
    mostrarBadge("Tarea guardada ✓");
  }

  // ── Totales (optimistas: sobre lo escrito y válido, en segundos) ──

  function valorNumerico(linea: LineaSemana, fecha: string): number {
    const res = interpretarDuracion(
      valores[clave(linea.id, linea.tarea, fecha)] ?? "",
    );
    return typeof res === "number" ? res : 0;
  }

  const totalLinea = (linea: LineaSemana) =>
    dias.reduce((suma, f) => suma + valorNumerico(linea, f), 0);
  const totalDia = (fecha: string) =>
    lineasVisibles.reduce((suma, l) => suma + valorNumerico(l, fecha), 0);
  const totalSemana = lineasVisibles.reduce(
    (suma, l) => suma + totalLinea(l),
    0,
  );

  /** Regla única para totales a 0: guion tenue (D11). */
  function pintarTotal(total: number, extraClase = "") {
    return total > 0 ? (
      <span className={extraClase}>{formatearDuracion(total)}</span>
    ) : (
      <span className="font-normal text-texto-suave">—</span>
    );
  }

  // ── Indicador global ──

  const estados = Object.values(estadoCeldas);
  const guardando = estados.includes("guardando");
  const numErrores = estados.filter((e) => e === "error").length;

  // ── Teclado ──

  function enfocarCelda(fila: number, col: number) {
    tablaRef.current
      ?.querySelector<HTMLInputElement>(`[data-celda="${fila}-${col}"]`)
      ?.focus();
  }

  function alTeclearEnCelda(
    e: React.KeyboardEvent<HTMLInputElement>,
    linea: LineaSemana,
    fecha: string,
    fila: number,
    col: number,
  ) {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      if (fila + 1 < lineasVisibles.length) enfocarCelda(fila + 1, col);
      else e.currentTarget.blur();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (fila > 0) enfocarCelda(fila - 1, col);
    } else if (e.key === "Escape") {
      // Revierte al último valor guardado (D12).
      e.preventDefault();
      const k = clave(linea.id, linea.tarea, fecha);
      cancelarDebounce(k);
      const guardado = guardadasRef.current[k];
      ponerValor(k, guardado !== undefined ? formatearDuracion(guardado) : "");
      ponerEstado(k);
      e.currentTarget.blur();
    }
  }

  // ── Render de una celda ──

  function celdaInput(
    linea: LineaSemana,
    fecha: string,
    opciones?: { fila: number; col: number },
  ) {
    const k = clave(linea.id, linea.tarea, fecha);
    const estado = estadoCeldas[k];
    const idxDia = dias.indexOf(fecha);
    const esHoy = hoy === fecha;
    const enTabla = opciones !== undefined;
    const nombreLinea = linea.tarea
      ? `${linea.cliente.nombre} — ${linea.nombre} · ${linea.tarea}`
      : `${linea.cliente.nombre} — ${linea.nombre}`;

    // Celda con cronómetro en marcha: solo lectura (§11.3.c).
    const sesion = crono
      ? sesionEnCelda(linea.id, linea.tarea, fecha)
      : undefined;
    if (sesion && crono) {
      const guardado = guardadas[k];
      return (
        <div
          role="status"
          tabIndex={-1}
          title="Cronómetro en marcha. Páralo para editar a mano."
          aria-label={`Cronómetro en marcha en ${nombreLinea}`}
          className={`flex w-full cursor-not-allowed items-center justify-center gap-1 rounded-md border border-acento bg-acento-suave px-1 text-xs font-medium text-acento ${
            enTabla ? "h-10" : "h-11"
          }`}
        >
          <span
            aria-hidden="true"
            className="punto-pulso size-1.5 shrink-0 rounded-full bg-acento"
          />
          <span className="truncate tabular-nums">
            {guardado !== undefined
              ? `${formatearDuracion(guardado)} · `
              : ""}
            +{formatearDuracionMs(duracionMs(sesion, crono.ahora))}
          </span>
        </div>
      );
    }

    const clasesEstado =
      estado === "invalido"
        ? "border-aviso bg-aviso-suave text-aviso focus:ring-2 focus:ring-aviso/25"
        : estado === "error"
          ? "border-error bg-error-suave text-error focus:ring-2 focus:ring-error/25"
          : estado === "confirmado"
            ? "border-exito bg-superficie text-texto"
            : `${esHoy && enTabla ? "bg-superficie" : "bg-superficie"} border-borde text-texto hover:border-borde-fuerte focus:border-acento focus:ring-2 focus:ring-acento/20`;

    return (
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="next"
        data-celda={enTabla ? `${opciones.fila}-${opciones.col}` : undefined}
        aria-label={`Horas de ${nombreLinea}, ${NOMBRES_DIA[idxDia]} ${etiquetaDia(fecha)}`}
        aria-invalid={estado === "invalido" || estado === "error" || undefined}
        title={
          estado === "invalido"
            ? AYUDA_ENTRADA
            : estado === "error"
              ? "No se guardó. Toca Reintentar."
              : undefined
        }
        value={valores[k] ?? ""}
        onChange={(e) => {
          ponerValor(k, e.target.value);
          if (estadoCeldas[k] === "invalido") ponerEstado(k);
          programarGuardado(linea.id, linea.tarea, fecha);
        }}
        onBlur={() => alSalirDeCelda(linea.id, linea.tarea, fecha)}
        onFocus={(e) => e.currentTarget.select()}
        onPaste={enTabla ? (e) => alPegar(e, linea, opciones.col) : undefined}
        onKeyDown={
          enTabla
            ? (e) =>
                alTeclearEnCelda(e, linea, fecha, opciones.fila, opciones.col)
            : undefined
        }
        className={`w-full rounded-md border text-center tabular-nums outline-none transition-colors ${
          enTabla
            ? "h-10 min-w-[4.5rem] text-[15px] font-medium"
            : "h-11 text-base font-medium"
        } ${clasesEstado} ${estado === "guardando" ? "opacity-70" : ""}`}
      />
    );
  }

  function botonesLinea(linea: LineaSemana) {
    const kLinea = claveLinea(linea);
    const sesion = sesionPorLinea.get(kLinea);
    const vacia = sinHoras(linea);
    return (
      <span className="flex items-center">
        {crono && (
          <button
            type="button"
            onClick={() =>
              sesion
                ? void crono.parar(sesion.id)
                : void crono.arrancar(linea.id, linea.tarea)
            }
            aria-label={
              sesion
                ? `Parar cronómetro de ${linea.nombre}`
                : `Empezar cronómetro de ${linea.nombre}`
            }
            title={sesion ? "Parar" : "Empezar cronómetro (cuenta para hoy)"}
            className={`flex size-11 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-acento sm:size-10 ${
              sesion
                ? "text-acento hover:bg-acento-suave"
                : "text-texto-suave hover:bg-superficie-2 hover:text-acento"
            }`}
          >
            {sesion ? (
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <rect
                  x="2.5"
                  y="2.5"
                  width="9"
                  height="9"
                  rx="1.5"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M4 2.8v8.4a.6.6 0 0 0 .9.5l7-4.2a.6.6 0 0 0 0-1l-7-4.2a.6.6 0 0 0-.9.5Z"
                  fill="currentColor"
                />
              </svg>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => abrirEditorTarea(linea)}
          disabled={Boolean(sesion)}
          aria-expanded={editandoTarea === kLinea}
          aria-label={`Editar la tarea de ${linea.cliente.nombre} — ${linea.nombre}`}
          title={
            sesion
              ? "Para el cronómetro antes de editar la tarea"
              : linea.tarea
                ? `Editar tarea: ${linea.tarea}`
                : "Añadir tarea"
          }
          className={`flex size-10 items-center justify-center rounded-md transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-40 ${
            linea.tarea ? "text-acento" : "text-texto-suave"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
            <path
              d="M10.6 2.2a1.4 1.4 0 0 1 2 2L5.4 11.4l-2.7.7.7-2.7 7.2-7.2Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {!sesion && (
          <button
            type="button"
            onClick={() =>
              vacia ? quitarLinea(kLinea) : abrirConfirmacionBorrado(kLinea)
            }
            aria-expanded={!vacia ? confirmandoBorrado === kLinea : undefined}
            aria-label={`Borrar la línea ${linea.cliente.nombre} — ${linea.nombre}`}
            title={
              vacia
                ? "Quitar línea"
                : "Borrar la línea y sus horas de esta semana"
            }
            className="flex size-10 items-center justify-center rounded-md text-texto-suave transition-colors hover:bg-superficie-2 hover:text-error focus-visible:outline-2 focus-visible:outline-acento"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <path
                d="M2.5 4h10M6 4V2.8a.8.8 0 0 1 .8-.8h1.4a.8.8 0 0 1 .8.8V4m2.2 0-.5 8a1 1 0 0 1-1 .9H5.3a1 1 0 0 1-1-.9l-.5-8M6.2 6.5v4M8.8 6.5v4"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </span>
    );
  }

  function abrirConfirmacionBorrado(kLinea: string) {
    setErrorBorrado(null);
    setEditandoTarea(null);
    setConfirmandoBorrado((prev) => (prev === kLinea ? null : kLinea));
  }

  /** Banda de confirmación de borrado (compartida por escritorio y móvil). */
  function confirmacionBorrado(linea: LineaSemana) {
    const total = totalLinea(linea);
    const n = diasConHoras(linea);
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-error/40 bg-error-suave px-3 py-2 text-sm text-error">
        <span className="min-w-0 flex-1 basis-52">
          {errorBorrado ??
            `Se borrarán ${formatearDuracion(total)} de ${n} día${n === 1 ? "" : "s"} de esta semana.`}
        </span>
        <button
          type="button"
          onClick={() => void borrarLinea(linea)}
          disabled={borrando}
          className="rounded-lg bg-error px-3 py-1.5 text-sm font-semibold text-superficie transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-error disabled:opacity-40"
        >
          {borrando ? "Borrando…" : errorBorrado ? "Reintentar" : "Borrar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmandoBorrado(null)}
          className="rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-error"
        >
          Cancelar
        </button>
      </div>
    );
  }

  /** Editor inline de la tarea (compartido por escritorio y móvil). */
  function editorTarea(linea: LineaSemana) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`tarea-${claveLinea(linea)}`}>
          Tarea de {linea.nombre}
        </label>
        <input
          id={`tarea-${claveLinea(linea)}`}
          type="text"
          value={textoTarea}
          onChange={(e) => {
            setTextoTarea(e.target.value);
            setErrorTarea(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void guardarTarea(linea);
            if (e.key === "Escape") setEditandoTarea(null);
          }}
          maxLength={120}
          placeholder="Tarea (opcional) — en qué trabajas"
          autoFocus
          className={`h-9 min-w-0 flex-1 basis-52 rounded-md border bg-superficie-2 px-2.5 text-xs text-texto outline-none focus:ring-2 ${
            errorTarea
              ? "border-error focus:ring-error/25"
              : "border-borde focus:border-acento focus:ring-acento/20"
          }`}
        />
        {errorTarea && (
          <span role="alert" className="text-xs text-error">
            {errorTarea}
          </span>
        )}
        <button
          type="button"
          onClick={() => void guardarTarea(linea)}
          className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-acento transition-colors hover:bg-acento-suave focus-visible:outline-2 focus-visible:outline-acento"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={() => setEditandoTarea(null)}
          className="rounded-md px-2 py-1.5 text-xs text-texto-suave transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento"
        >
          Cancelar
        </button>
      </div>
    );
  }

  const clavesVisibles = lineasVisibles.map(claveLinea);

  return (
    <div>
      <EntradaNatural alAplicar={aplicarPropuestas} />

      {/* Indicador global (transitorio; errores y offline persisten) */}
      <div
        className="mb-2 flex min-h-6 items-center justify-end gap-2 text-xs"
        aria-live="polite"
      >
        {!conectado ? (
          <span className="rounded-md bg-aviso-suave px-2 py-0.5 text-aviso">
            Sin conexión — tus cambios se guardarán al volver
          </span>
        ) : guardando ? (
          <span className="text-texto-suave">Guardando…</span>
        ) : numErrores > 0 ? (
          <span className="flex items-center gap-2 text-error">
            No se guardaron {numErrores} cambio{numErrores === 1 ? "" : "s"}.
            <button
              type="button"
              onClick={reintentarErrores}
              className="rounded-md border border-error/40 px-2 py-0.5 font-medium transition-colors hover:bg-error-suave focus-visible:outline-2 focus-visible:outline-error"
            >
              Reintentar
            </button>
          </span>
        ) : badge ? (
          <span className="text-exito transition-opacity duration-300">
            {badge}
          </span>
        ) : null}
      </div>

      {lineasVisibles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-borde-fuerte px-6 py-10 text-center text-sm text-texto-suave">
          Aún no tienes líneas. Añade la primera con + Añadir línea.
        </div>
      ) : (
        <>
          {/* ── Rejilla de escritorio ── */}
          <div
            ref={tablaRef}
            className="hidden overflow-x-auto rounded-xl border border-borde bg-superficie px-3 pb-1 sm:block"
          >
            <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-xs text-texto-suave">
                  <th scope="col" className="w-56 py-2.5 pr-3 text-left font-semibold">
                    Cliente — proyecto
                  </th>
                  {indicesVisibles.map((i) => {
                    const esHoy = hoy === dias[i];
                    const finde = i >= 5;
                    return (
                      <th
                        key={dias[i]}
                        scope="col"
                        className={`px-1 py-2.5 text-center font-semibold ${
                          esHoy
                            ? "border-b-2 border-acento text-acento"
                            : finde
                              ? "text-texto-suave/80"
                              : ""
                        }`}
                      >
                        {DIAS_SEMANA[i]}
                        <span className="mt-0.5 block text-[11px] font-normal">
                          {etiquetaDia(dias[i])}
                        </span>
                      </th>
                    );
                  })}
                  <th scope="col" className="w-20 px-1 py-2.5 text-right font-semibold">
                    Total
                  </th>
                  <th scope="col" className="w-24 py-2.5">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineasVisibles.map((linea, fila) => {
                  const kLinea = claveLinea(linea);
                  return (
                    <Fragment key={kLinea}>
                      <tr
                        className={`transition-colors hover:bg-superficie-2/60 ${
                          lineasNuevas.has(kLinea) ? "bg-acento-suave" : ""
                        }`}
                      >
                        <th
                          scope="row"
                          className="border-t border-borde py-2 pr-3 text-left font-normal"
                        >
                          <span
                            className="block text-[11px] font-medium uppercase tracking-wide text-texto-suave"
                            title={linea.cliente.nombre}
                          >
                            {linea.cliente.nombre}
                          </span>
                          <span
                            className="block truncate text-sm font-semibold text-tinta"
                            title={linea.nombre}
                          >
                            {linea.nombre}
                          </span>
                          {linea.tarea && (
                            <span
                              className="block truncate text-xs text-texto-suave"
                              title={linea.tarea}
                            >
                              {linea.tarea}
                            </span>
                          )}
                        </th>
                        {indicesVisibles.map((i) => (
                          <td
                            key={dias[i]}
                            className={`border-t border-borde px-1 py-2 ${
                              hoy === dias[i] ? "bg-acento-suave" : ""
                            }`}
                          >
                            {celdaInput(linea, dias[i], { fila, col: i })}
                          </td>
                        ))}
                        <td className="border-t border-borde px-1 py-2 text-right text-sm font-semibold tabular-nums text-tinta">
                          {pintarTotal(totalLinea(linea))}
                        </td>
                        <td className="border-t border-borde py-2 pl-1 text-right">
                          {botonesLinea(linea)}
                        </td>
                      </tr>
                      {editandoTarea === kLinea && (
                        <tr>
                          <td />
                          <td colSpan={indicesVisibles.length + 2} className="pb-2">
                            {editorTarea(linea)}
                          </td>
                        </tr>
                      )}
                      {confirmandoBorrado === kLinea && (
                        <tr>
                          <td />
                          <td colSpan={indicesVisibles.length + 2} className="pb-2">
                            {confirmacionBorrado(linea)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th
                    scope="row"
                    className="border-t border-borde-fuerte py-2.5 pr-3 text-left text-xs font-medium text-texto-suave"
                  >
                    Total por día
                  </th>
                  {indicesVisibles.map((i) => (
                    <td
                      key={dias[i]}
                      className={`border-t border-borde-fuerte px-1 py-2.5 text-center text-sm font-semibold tabular-nums text-texto ${
                        hoy === dias[i] ? "bg-acento-suave text-acento" : ""
                      }`}
                    >
                      {pintarTotal(totalDia(dias[i]))}
                    </td>
                  ))}
                  <td className="border-t border-borde-fuerte px-1 py-2.5 text-right">
                    <span className="block text-[10px] font-medium uppercase tracking-wide text-texto-suave">
                      Semana
                    </span>
                    <span className="text-base font-bold tabular-nums text-tinta">
                      {totalSemana > 0 ? formatearDuracion(totalSemana) : "—"}
                    </span>
                  </td>
                  <td className="border-t border-borde-fuerte" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Vista móvil: día a día ── */}
          <div className="sm:hidden">
            <div
              role="tablist"
              aria-label="Día de la semana"
              className="mb-4 grid grid-cols-7 gap-1"
            >
              {dias.map((f, i) => {
                const activo = diaMovil === f;
                const esHoy = hoy === f;
                const conHoras = totalDia(f) > 0;
                return (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={activo}
                    onClick={() => setDiaMovilElegido(f)}
                    className={`flex h-11 flex-col items-center justify-center rounded-lg text-xs transition-colors focus-visible:outline-2 focus-visible:outline-acento ${
                      activo
                        ? "bg-acento font-semibold text-superficie"
                        : esHoy
                          ? "border-b-2 border-acento bg-superficie-2 font-semibold text-acento"
                          : "bg-superficie-2 text-texto-suave"
                    }`}
                  >
                    <span>{DIAS_SEMANA[i]}</span>
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 size-1 rounded-full ${
                        conHoras
                          ? activo
                            ? "bg-superficie"
                            : "bg-acento"
                          : "bg-transparent"
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            <p className="mb-2 text-sm text-texto-suave">
              {NOMBRES_DIA[dias.indexOf(diaMovil)].charAt(0).toUpperCase() +
                NOMBRES_DIA[dias.indexOf(diaMovil)].slice(1)}{" "}
              {etiquetaDia(diaMovil)}
              {hoy === diaMovil ? " · hoy" : ""}
            </p>

            <ul className="divide-y divide-borde">
              {lineasVisibles.map((linea) => {
                const kLinea = claveLinea(linea);
                return (
                  <li key={kLinea} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="block text-[11px] font-medium uppercase tracking-wide text-texto-suave">
                          {linea.cliente.nombre}
                        </span>
                        <span className="block truncate text-sm font-semibold text-tinta">
                          {linea.nombre}
                        </span>
                        {linea.tarea && (
                          <span className="block truncate text-xs text-texto-suave">
                            {linea.tarea}
                          </span>
                        )}
                      </div>
                      {botonesLinea(linea)}
                      {crono &&
                      sesionEnCelda(linea.id, linea.tarea, diaMovil) ? (
                        <div className="w-36 shrink-0">
                          {celdaInput(linea, diaMovil)}
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              ajustarCelda(
                                linea,
                                diaMovil,
                                -PASO_STEPPER_SEGUNDOS,
                              )
                            }
                            aria-label={`Quitar 15 min de ${linea.nombre}`}
                            className="flex size-11 shrink-0 items-center justify-center rounded-md border border-borde text-lg text-texto transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento"
                          >
                            −
                          </button>
                          <div className="w-24 shrink-0">
                            {celdaInput(linea, diaMovil)}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              ajustarCelda(
                                linea,
                                diaMovil,
                                PASO_STEPPER_SEGUNDOS,
                              )
                            }
                            aria-label={`Añadir 15 min a ${linea.nombre}`}
                            className="flex size-11 shrink-0 items-center justify-center rounded-md border border-borde text-lg text-texto transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento"
                          >
                            +
                          </button>
                        </>
                      )}
                    </div>
                    {editandoTarea === kLinea && (
                      <div className="mt-2">{editorTarea(linea)}</div>
                    )}
                    {confirmandoBorrado === kLinea && (
                      <div className="mt-2">{confirmacionBorrado(linea)}</div>
                    )}
                  </li>
                );
              })}
            </ul>

            <dl className="mt-3 flex items-baseline justify-between gap-4 border-t border-borde-fuerte pt-3">
              <div className="flex items-baseline gap-2">
                <dt className="text-sm text-texto-suave">Total del día</dt>
                <dd className="text-base font-bold tabular-nums text-tinta">
                  {formatearDuracion(totalDia(diaMovil))}
                </dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="text-sm text-texto-suave">Semana</dt>
                <dd className="text-sm font-semibold tabular-nums text-texto">
                  {formatearDuracion(totalSemana)}
                </dd>
              </div>
            </dl>
          </div>
        </>
      )}

      {/* ── Acciones bajo la rejilla ── */}
      <div className="mt-4 flex flex-wrap items-start gap-3">
        <AnadirLinea
          clientes={clientes}
          clientesRecientes={clientesRecientes}
          clavesExistentes={clavesVisibles}
          alAnadir={anadirLineas}
        />
        <MisTareas
          clientes={clientes}
          tarjetasIniciales={misTarjetas}
          clavesExistentes={clavesVisibles}
          alAnadir={anadirLineas}
          conectarGuardado={(fn) => {
            avisarGuardadoRef.current = fn;
          }}
        />
        {(!verFinde || !hayHorasFinde) && (
          <button
            type="button"
            onClick={() => setVerFinde((v) => !v)}
            title={
              verFinde
                ? undefined
                : "Muestra sábado y domingo en la rejilla"
            }
            className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento sm:inline-flex"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
              className={`transition-transform ${verFinde ? "rotate-90" : ""}`}
            >
              <path
                d="M4 2l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Fin de semana
          </button>
        )}
      </div>

      <p className="mt-3 hidden text-xs text-texto-suave sm:block">
        Consejo: copia una fila de tu hoja de cálculo y pégala sobre una celda
        para rellenar varios días.
      </p>
    </div>
  );
}
