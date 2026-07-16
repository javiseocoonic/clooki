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
  PASO_HORAS,
  aIso,
  diasDeSemana,
  etiquetaDia,
  formatearHoras,
  interpretarHoras,
  redondearAPaso,
} from "@/lib/semana";
import type {
  Cliente,
  Proyecto,
  RegistroHoras,
  SesionCronometro,
} from "@/lib/tipos";
import type { ProyectoConCliente } from "@/lib/datos/mi-semana";
import { AnadirLinea } from "./anadir-linea";
import {
  duracionMs,
  formatearDuracion,
  useCronometros,
} from "./cronometros";

type EstadoCelda = "guardando" | "error" | "invalido" | "confirmado";

interface Props {
  personaId: string;
  lunesIso: string;
  lineas: ProyectoConCliente[];
  clientes: (Cliente & { proyectos: Proyecto[] })[];
  /** Ids de clientes con horas recientes de la persona, más reciente primero. */
  clientesRecientes: string[];
  horas: RegistroHoras[];
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

/** Clave de celda: `proyectoId|fecha`. Para notas: `nota|proyectoId`. */
function clave(proyectoId: string, fecha: string): string {
  return `${proyectoId}|${fecha}`;
}

function notasIniciales(horas: RegistroHoras[]): Record<string, string> {
  const notas: Record<string, string> = {};
  const ordenadas = [...horas].sort((a, b) =>
    a.actualizado_en.localeCompare(b.actualizado_en),
  );
  for (const h of ordenadas) {
    if (h.nota) notas[h.proyecto_id] = h.nota;
  }
  return notas;
}

const AYUDA_PASOS = "Usa pasos de 0,25, entre 0,25 y 24.";

export function RejillaSemana({
  personaId,
  lunesIso,
  lineas,
  clientes,
  clientesRecientes,
  horas,
}: Props) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const dias = useMemo(() => diasDeSemana(lunesIso), [lunesIso]);
  const tablaRef = useRef<HTMLDivElement>(null);
  const versionesRef = useRef<Record<string, number>>({});
  const debouncesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );
  const badgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Estado fuente (se reinicializa por semana vía key en el padre) ──
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const h of horas)
      m[clave(h.proyecto_id, h.fecha)] = formatearHoras(h.horas);
    return m;
  });
  const [guardadas, setGuardadas] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const h of horas) m[clave(h.proyecto_id, h.fecha)] = h.horas;
    return m;
  });
  // Espejos para leer el último valor desde timeouts/listeners sin closures rancias.
  const valoresRef = useRef(valores);
  const guardadasRef = useRef(guardadas);

  const [estadoCeldas, setEstadoCeldas] = useState<
    Record<string, EstadoCelda>
  >({});
  const [notas, setNotas] = useState<Record<string, string>>(() =>
    notasIniciales(horas),
  );
  const [notasGuardadas, setNotasGuardadas] = useState<Record<string, string>>(
    () => notasIniciales(horas),
  );
  const [notasAbiertas, setNotasAbiertas] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<ProyectoConCliente[]>([]);
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [verFinde, setVerFinde] = useState(() =>
    horas.some((h) => h.fecha === dias[5] || h.fecha === dias[6]),
  );
  const [badge, setBadge] = useState<string | null>(null);
  const [lineasNuevas, setLineasNuevas] = useState<Set<string>>(new Set());
  const pendienteFocoRef = useRef<string | null>(null);
  const autoenfocadoRef = useRef(false);

  const hoy = useHoy();
  const conectado = useConectado();
  const crono = useCronometros();
  const sesionPorProyecto = useMemo(() => {
    const m = new Map<string, SesionCronometro>();
    crono?.sesiones.forEach((s) => m.set(s.proyecto_id, s));
    return m;
     
  }, [crono?.sesiones]);

  function sesionEnCelda(
    proyectoId: string,
    fecha: string,
  ): SesionCronometro | undefined {
    const s = sesionPorProyecto.get(proyectoId);
    return s && s.dia_atribuido === fecha ? s : undefined;
  }
  const [diaMovilElegido, setDiaMovilElegido] = useState<string | null>(null);
  const diaMovil =
    diaMovilElegido ?? (hoy && dias.includes(hoy) ? hoy : dias[0]);

  const lineasVisibles = useMemo(
    () => [
      ...lineas.filter((l) => !ocultas.has(l.id)),
      ...extras.filter((l) => !ocultas.has(l.id)),
    ],
    [lineas, extras, ocultas],
  );

  const indicesVisibles = verFinde ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
  const hayHorasFinde = dias
    .slice(5)
    .some((f) =>
      lineasVisibles.some((l) => guardadas[clave(l.id, f)] !== undefined),
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
    fecha: string,
    valor: number | null,
  ) {
    const k = clave(proyectoId, fecha);
    const version = (versionesRef.current[k] ?? 0) + 1;
    versionesRef.current[k] = version;
    ponerEstado(k, "guardando");

    const nota = (notas[proyectoId] ?? "").trim() || null;
    const ejecutar = async (): Promise<boolean> => {
      if (valor === null) {
        const { error } = await supabase
          .from("horas")
          .delete()
          .eq("persona_id", personaId)
          .eq("proyecto_id", proyectoId)
          .eq("fecha", fecha);
        return !error;
      }
      const { error } = await supabase.from("horas").upsert(
        { persona_id: personaId, proyecto_id: proyectoId, fecha, horas: valor, nota },
        { onConflict: "persona_id,proyecto_id,fecha" },
      );
      return !error;
    };

    let ok = await ejecutar();
    if (!ok && versionesRef.current[k] === version) ok = await ejecutar();
    if (versionesRef.current[k] !== version) return; // llegó una edición posterior

    if (ok) {
      setGuardadas((prev) => {
        const s = { ...prev };
        if (valor === null) delete s[k];
        else s[k] = valor;
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
   * `normalizar` = true en blur (reformatea "1:30"→"1,5" y marca inválidos);
   * false en el debounce (guarda en silencio sin tocar lo que se teclea).
   */
  function persistirCelda(
    proyectoId: string,
    fecha: string,
    normalizar: boolean,
  ) {
    const k = clave(proyectoId, fecha);
    const texto = valoresRef.current[k] ?? "";
    const resultado = interpretarHoras(texto);

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
      void guardarCelda(proyectoId, fecha, null);
      return;
    }

    if (normalizar) ponerValor(k, formatearHoras(resultado));
    if (guardadasRef.current[k] === resultado) {
      if (normalizar) ponerEstado(k);
      return;
    }
    void guardarCelda(proyectoId, fecha, resultado);
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

  function programarGuardado(proyectoId: string, fecha: string) {
    const k = clave(proyectoId, fecha);
    cancelarDebounce(k);
    debouncesRef.current[k] = setTimeout(() => {
      delete debouncesRef.current[k];
      persistirCelda(proyectoId, fecha, false);
    }, 800);
  }

  function alSalirDeCelda(proyectoId: string, fecha: string) {
    cancelarDebounce(clave(proyectoId, fecha));
    persistirCelda(proyectoId, fecha, true);
  }

  // Vaciado best-effort al ocultarse la pestaña (§12.1) + limpieza al desmontar.
  useEffect(() => {
    const vaciar = () => {
      if (document.visibilityState !== "hidden") return;
      for (const k of Object.keys(debouncesRef.current)) {
        cancelarDebounce(k);
        const [pid, fecha] = k.split("|");
        persistirCelda(pid, fecha, false);
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
  const lineasVisiblesRef = useRef<ProyectoConCliente[]>([]);
  useEffect(() => {
    lineasVisiblesRef.current = lineasVisibles;
  });
  useEffect(() => {
    if (!crono) return;
    return crono.suscribir((e) => {
      if (e.tipo === "volcado") {
        if (!e.fecha || !dias.includes(e.fecha)) return;
        const k = clave(e.proyectoId, e.fecha);
        const total = e.total ?? 0;
        if (total > 0) {
          ponerValor(k, formatearHoras(total));
          setGuardadas((prev) => {
            const s = { ...prev, [k]: total };
            guardadasRef.current = s;
            return s;
          });
        }
        return;
      }
      // inicio
      if (lineasVisiblesRef.current.some((l) => l.id === e.proyectoId)) return;
      for (const c of clientes) {
        const p = c.proyectos.find((pr) => pr.id === e.proyectoId);
        if (p) {
          anadirLineas([
            { ...p, cliente: { id: c.id, nombre: c.nombre, activo: c.activo } },
          ]);
          return;
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crono?.suscribir, dias]);

  // ── Notas ──

  async function guardarNota(proyectoId: string) {
    const nota = (notas[proyectoId] ?? "").trim();
    if (nota === (notasGuardadas[proyectoId] ?? "")) return;

    const hayRegistros = dias.some(
      (f) => guardadasRef.current[clave(proyectoId, f)] !== undefined,
    );
    if (!hayRegistros) {
      setNotasGuardadas((prev) => ({ ...prev, [proyectoId]: nota }));
      return;
    }

    const k = `nota|${proyectoId}`;
    const version = (versionesRef.current[k] ?? 0) + 1;
    versionesRef.current[k] = version;
    ponerEstado(k, "guardando");

    const ejecutar = async (): Promise<boolean> => {
      const { error } = await supabase
        .from("horas")
        .update({ nota: nota || null })
        .eq("persona_id", personaId)
        .eq("proyecto_id", proyectoId)
        .gte("fecha", dias[0])
        .lte("fecha", dias[6]);
      return !error;
    };

    let ok = await ejecutar();
    if (!ok && versionesRef.current[k] === version) ok = await ejecutar();
    if (versionesRef.current[k] !== version) return;

    if (ok) {
      setNotasGuardadas((prev) => ({ ...prev, [proyectoId]: nota }));
      ponerEstado(k);
      mostrarBadge("Guardado ✓");
    } else {
      ponerEstado(k, "error");
    }
  }

  function reintentarErrores() {
    for (const [k, estado] of Object.entries(estadoCeldas)) {
      if (estado !== "error") continue;
      const [a, b] = k.split("|");
      if (a === "nota") void guardarNota(b);
      else persistirCelda(a, b, true);
    }
  }
  useEffect(() => {
    reintentarRef.current = reintentarErrores;
  });

  // ── Pegado tipo hoja de cálculo (§11.2) ──

  function alPegar(
    e: React.ClipboardEvent<HTMLInputElement>,
    linea: ProyectoConCliente,
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
      if (sesionEnCelda(linea.id, fecha)) {
        omitidas++; // no se pisa una celda con cronómetro en marcha
        return;
      }
      const k = clave(linea.id, fecha);
      const res = interpretarHoras(trozo);
      if (typeof res === "number") {
        ponerValor(k, formatearHoras(res));
        if (guardadasRef.current[k] !== res) void guardarCelda(linea.id, fecha, res);
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

  // ── Steppers móviles (§13.3) ──

  function ajustarCelda(linea: ProyectoConCliente, fecha: string, delta: number) {
    const k = clave(linea.id, fecha);
    const escrito = interpretarHoras(valoresRef.current[k] ?? "");
    const base =
      typeof escrito === "number"
        ? escrito
        : (guardadasRef.current[k] ?? 0);
    const nuevo = Math.min(24, Math.max(0, redondearAPaso(base + delta)));

    if (nuevo === 0) {
      ponerValor(k, "");
      cancelarDebounce(k);
      ponerEstado(k);
      if (guardadasRef.current[k] !== undefined)
        void guardarCelda(linea.id, fecha, null);
      return;
    }
    ponerValor(k, formatearHoras(nuevo));
    ponerEstado(k);
    programarGuardado(linea.id, fecha); // toques rápidos → un solo guardado
  }

  // ── Líneas ──

  function anadirLineas(nuevas: ProyectoConCliente[]) {
    if (nuevas.length === 0) return;
    setOcultas((prev) => {
      const s = new Set(prev);
      nuevas.forEach((l) => s.delete(l.id));
      return s;
    });
    setExtras((prev) => [
      ...prev,
      ...nuevas.filter(
        (l) =>
          !prev.some((p) => p.id === l.id) && !lineas.some((p) => p.id === l.id),
      ),
    ]);
    pendienteFocoRef.current = nuevas[0].id;
    const ids = new Set(nuevas.map((l) => l.id));
    setLineasNuevas(ids);
    setTimeout(() => setLineasNuevas(new Set()), 1000);
  }

  // Foco a la primera celda de la línea recién añadida (D8).
  useEffect(() => {
    const id = pendienteFocoRef.current;
    if (!id) return;
    const fila = lineasVisibles.findIndex((l) => l.id === id);
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

  function quitarLinea(id: string) {
    setExtras((prev) => prev.filter((l) => l.id !== id));
    setOcultas((prev) => new Set(prev).add(id));
    setNotasAbiertas((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  }

  function sinHoras(proyectoId: string): boolean {
    return dias.every((f) => {
      const k = clave(proyectoId, f);
      return guardadas[k] === undefined && (valores[k] ?? "").trim() === "";
    });
  }

  function alternarNota(proyectoId: string) {
    setNotasAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(proyectoId)) s.delete(proyectoId);
      else s.add(proyectoId);
      return s;
    });
  }

  // ── Totales (optimistas: sobre lo escrito y válido) ──

  function valorNumerico(proyectoId: string, fecha: string): number {
    const res = interpretarHoras(valores[clave(proyectoId, fecha)] ?? "");
    return typeof res === "number" ? res : 0;
  }

  const totalLinea = (proyectoId: string) =>
    dias.reduce((suma, f) => suma + valorNumerico(proyectoId, f), 0);
  const totalDia = (fecha: string) =>
    lineasVisibles.reduce((suma, l) => suma + valorNumerico(l.id, fecha), 0);
  const totalSemana = lineasVisibles.reduce(
    (suma, l) => suma + totalLinea(l.id),
    0,
  );

  /** Regla única para totales a 0: guion tenue (D11). */
  function pintarTotal(total: number, extraClase = "") {
    return total > 0 ? (
      <span className={extraClase}>{formatearHoras(total)}</span>
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
    linea: ProyectoConCliente,
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
      const k = clave(linea.id, fecha);
      cancelarDebounce(k);
      const guardado = guardadasRef.current[k];
      ponerValor(k, guardado !== undefined ? formatearHoras(guardado) : "");
      ponerEstado(k);
      e.currentTarget.blur();
    }
  }

  // ── Render de una celda ──

  function celdaInput(
    linea: ProyectoConCliente,
    fecha: string,
    opciones?: { fila: number; col: number },
  ) {
    const k = clave(linea.id, fecha);
    const estado = estadoCeldas[k];
    const idxDia = dias.indexOf(fecha);
    const esHoy = hoy === fecha;
    const enTabla = opciones !== undefined;

    // Celda con cronómetro en marcha: solo lectura (§11.3.c).
    const sesion = crono ? sesionEnCelda(linea.id, fecha) : undefined;
    if (sesion && crono) {
      const guardado = guardadas[k];
      return (
        <div
          role="status"
          tabIndex={-1}
          title="Cronómetro en marcha. Páralo para editar a mano."
          aria-label={`Cronómetro en marcha en ${linea.cliente.nombre} — ${linea.nombre}`}
          className={`flex w-full cursor-not-allowed items-center justify-center gap-1 rounded-md border border-acento bg-acento-suave px-1 text-xs font-medium text-acento ${
            enTabla ? "h-10" : "h-11"
          }`}
        >
          <span
            aria-hidden="true"
            className="punto-pulso size-1.5 shrink-0 rounded-full bg-acento"
          />
          <span className="truncate tabular-nums">
            {guardado !== undefined ? `${formatearHoras(guardado)} · ` : ""}+
            {formatearDuracion(duracionMs(sesion, crono.ahora))}
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
        aria-label={`Horas de ${linea.cliente.nombre} — ${linea.nombre}, ${NOMBRES_DIA[idxDia]} ${etiquetaDia(fecha)}`}
        aria-invalid={estado === "invalido" || estado === "error" || undefined}
        title={
          estado === "invalido"
            ? AYUDA_PASOS
            : estado === "error"
              ? "No se guardó. Toca Reintentar."
              : undefined
        }
        value={valores[k] ?? ""}
        onChange={(e) => {
          ponerValor(k, e.target.value);
          if (estadoCeldas[k] === "invalido") ponerEstado(k);
          programarGuardado(linea.id, fecha);
        }}
        onBlur={() => alSalirDeCelda(linea.id, fecha)}
        onFocus={(e) => e.currentTarget.select()}
        onPaste={enTabla ? (e) => alPegar(e, linea, opciones.col) : undefined}
        onKeyDown={
          enTabla
            ? (e) =>
                alTeclearEnCelda(e, linea, fecha, opciones.fila, opciones.col)
            : undefined
        }
        className={`w-full rounded-md border text-center tabular-nums outline-none transition-colors ${
          enTabla ? "h-10 min-w-12 text-[15px] font-medium" : "h-11 text-base font-medium"
        } ${clasesEstado} ${estado === "guardando" ? "opacity-70" : ""}`}
      />
    );
  }

  function botonesLinea(linea: ProyectoConCliente) {
    const notaPuesta = Boolean((notas[linea.id] ?? "").trim());
    const sesion = sesionPorProyecto.get(linea.id);
    return (
      <span className="flex items-center">
        {crono && (
          <button
            type="button"
            onClick={() =>
              sesion
                ? void crono.parar(sesion.id)
                : void crono.arrancar(linea.id)
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
          onClick={() => alternarNota(linea.id)}
          aria-expanded={notasAbiertas.has(linea.id)}
          aria-label={`Nota de ${linea.cliente.nombre} — ${linea.nombre}`}
          title={notaPuesta ? `Nota: ${notas[linea.id]}` : "Añadir nota"}
          className={`flex size-10 items-center justify-center rounded-md transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento ${
            notaPuesta ? "text-acento" : "text-texto-suave"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H8l-3.5 3v-3h-1A1.5 1.5 0 0 1 2 9.5v-6Z"
              stroke="currentColor"
              strokeWidth="1.4"
              fill={notaPuesta ? "currentColor" : "none"}
            />
          </svg>
        </button>
        {sinHoras(linea.id) && !sesion && (
          <button
            type="button"
            onClick={() => quitarLinea(linea.id)}
            aria-label={`Quitar la línea ${linea.cliente.nombre} — ${linea.nombre}`}
            title="Quitar línea"
            className="flex size-10 items-center justify-center rounded-md text-texto-suave transition-colors hover:bg-superficie-2 hover:text-error focus-visible:outline-2 focus-visible:outline-acento"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </span>
    );
  }

  function inputNota(linea: ProyectoConCliente) {
    return (
      <input
        type="text"
        value={notas[linea.id] ?? ""}
        placeholder="Nota (opcional)"
        aria-label={`Nota para ${linea.cliente.nombre} — ${linea.nombre}`}
        onChange={(e) =>
          setNotas((prev) => ({ ...prev, [linea.id]: e.target.value }))
        }
        onBlur={() => void guardarNota(linea.id)}
        className="h-9 w-full rounded-md border border-borde bg-superficie-2 px-2.5 text-xs text-texto outline-none focus:border-acento focus:ring-2 focus:ring-acento/20"
      />
    );
  }

  const idsVisibles = lineasVisibles.map((l) => l.id);

  return (
    <div>
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
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
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
                  <th scope="col" className="w-16 px-1 py-2.5 text-right font-semibold">
                    Total
                  </th>
                  <th scope="col" className="w-20 py-2.5">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineasVisibles.map((linea, fila) => (
                  <Fragment key={linea.id}>
                    <tr
                      className={`transition-colors hover:bg-superficie-2/60 ${
                        lineasNuevas.has(linea.id) ? "bg-acento-suave" : ""
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
                        {pintarTotal(totalLinea(linea.id))}
                      </td>
                      <td className="border-t border-borde py-2 pl-1 text-right">
                        {botonesLinea(linea)}
                      </td>
                    </tr>
                    {notasAbiertas.has(linea.id) && (
                      <tr>
                        <td />
                        <td colSpan={indicesVisibles.length + 2} className="pb-2">
                          {inputNota(linea)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
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
                      {totalSemana > 0 ? formatearHoras(totalSemana) : "—"}
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
              {lineasVisibles.map((linea) => (
                <li key={linea.id} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-texto-suave">
                        {linea.cliente.nombre}
                      </span>
                      <span className="block truncate text-sm font-semibold text-tinta">
                        {linea.nombre}
                      </span>
                    </div>
                    {botonesLinea(linea)}
                    {crono && sesionEnCelda(linea.id, diaMovil) ? (
                      <div className="w-32 shrink-0">
                        {celdaInput(linea, diaMovil)}
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            ajustarCelda(linea, diaMovil, -PASO_HORAS)
                          }
                          aria-label={`Quitar 0,25 h de ${linea.nombre}`}
                          className="flex size-11 shrink-0 items-center justify-center rounded-md border border-borde text-lg text-texto transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento"
                        >
                          −
                        </button>
                        <div className="w-14 shrink-0">
                          {celdaInput(linea, diaMovil)}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            ajustarCelda(linea, diaMovil, PASO_HORAS)
                          }
                          aria-label={`Añadir 0,25 h a ${linea.nombre}`}
                          className="flex size-11 shrink-0 items-center justify-center rounded-md border border-borde text-lg text-texto transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento"
                        >
                          +
                        </button>
                      </>
                    )}
                  </div>
                  {notasAbiertas.has(linea.id) && (
                    <div className="mt-2">{inputNota(linea)}</div>
                  )}
                </li>
              ))}
            </ul>

            <dl className="mt-3 flex items-baseline justify-between gap-4 border-t border-borde-fuerte pt-3">
              <div className="flex items-baseline gap-2">
                <dt className="text-sm text-texto-suave">Total del día</dt>
                <dd className="text-base font-bold tabular-nums text-tinta">
                  {formatearHoras(totalDia(diaMovil))}
                </dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="text-sm text-texto-suave">Semana</dt>
                <dd className="text-sm font-semibold tabular-nums text-texto">
                  {formatearHoras(totalSemana)}
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
          idsExcluidos={idsVisibles}
          alAnadir={anadirLineas}
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
