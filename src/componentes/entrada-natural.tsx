"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  interpretarFrase,
  type PropuestaHoras,
} from "@/app/acciones-ia";
import { NOMBRES_DIA, deIso, formatearDuracion } from "@/lib/semana";
import { Cargador } from "./cargador";

interface Props {
  alAplicar: (propuestas: PropuestaHoras[]) => Promise<void> | void;
}

function etiquetaFecha(iso: string): string {
  const d = deIso(iso);
  return `${NOMBRES_DIA[(d.getDay() + 6) % 7]} ${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * Input + botón del formulario. Va en componente propio porque el estado
 * "en vuelo" sale de useFormStatus (solo funciona DENTRO del <form>): los
 * setState dentro de una action son parte de la transición y React no los
 * pinta hasta que acaba — un useState "cargando" nunca llega a verse.
 */
function CamposFrase({
  texto,
  onTexto,
}: {
  texto: string;
  onTexto: (v: string) => void;
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <label className="sr-only" htmlFor="frase-horas">
        Apuntar horas con una frase
      </label>
      <input
        id="frase-horas"
        type="text"
        value={texto}
        onChange={(e) => onTexto(e.target.value)}
        maxLength={500}
        readOnly={pending}
        aria-busy={pending}
        placeholder="Apunta con una frase: «ayer 3h en Viamed rrss y 2 en Fesempla prensa»"
        className={`h-10 min-w-0 flex-1 rounded-lg border border-borde bg-superficie px-3 text-sm text-tinta outline-none placeholder:text-texto-suave focus:border-acento focus:ring-2 focus:ring-acento/20 ${
          pending ? "opacity-60" : ""
        }`}
      />
      <button
        type="submit"
        disabled={pending || texto.trim().length < 3}
        className="h-10 shrink-0 rounded-lg border border-borde-fuerte px-3 text-sm font-medium text-texto transition-colors hover:border-acento hover:text-acento focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-40"
      >
        {pending ? (
          <Cargador texto="Interpretando…" tamano="size-6" />
        ) : (
          "Proponer"
        )}
      </button>
    </>
  );
}

/** Entrada por lenguaje natural (fase IA·3): la IA propone, tú confirmas. */
export function EntradaNatural({ alAplicar }: Props) {
  const [texto, setTexto] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [propuestas, setPropuestas] = useState<PropuestaHoras[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());

  async function proponer() {
    if (texto.trim().length < 3) return;
    setError(null);
    setPropuestas(null);
    const resultado = await interpretarFrase(texto);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    setAvisos(resultado.avisos);
    setPropuestas(resultado.propuestas);
    setMarcadas(new Set(resultado.propuestas.map((_, i) => i)));
  }

  function limpiar() {
    setPropuestas(null);
    setAvisos([]);
    setError(null);
    setTexto("");
  }

  async function confirmar() {
    if (!propuestas || aplicando) return;
    const elegidas = propuestas.filter((_, i) => marcadas.has(i));
    if (elegidas.length === 0) return;
    setAplicando(true);
    await alAplicar(elegidas);
    setAplicando(false);
    limpiar();
  }

  return (
    <div className="mb-4">
      <form
        action={proponer}
        className="flex items-center gap-2"
        onKeyDown={(e) => {
          if (e.key === "Escape") limpiar();
        }}
      >
        <CamposFrase texto={texto} onTexto={setTexto} />
      </form>

      {error && (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}

      {propuestas && (
        <div className="mt-2 rounded-xl border border-borde bg-superficie p-3">
          {propuestas.length > 0 && (
            <>
              <p className="mb-1.5 text-xs font-medium text-texto-suave">
                Revisa y confirma — no se guarda nada hasta que apuntes:
              </p>
              <ul>
                {propuestas.map((p, i) => (
                  <li key={i}>
                    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-superficie-2">
                      <input
                        type="checkbox"
                        checked={marcadas.has(i)}
                        onChange={() =>
                          setMarcadas((prev) => {
                            const s = new Set(prev);
                            if (s.has(i)) s.delete(i);
                            else s.add(i);
                            return s;
                          })
                        }
                        className="size-4 shrink-0 accent-[var(--acento)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-tinta">
                        {p.cliente} — {p.proyecto}
                        {p.tarea && (
                          <span className="text-texto-suave"> · {p.tarea}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-texto-suave">
                        {etiquetaFecha(p.fecha)}
                      </span>
                      <span className="w-20 shrink-0 text-right font-semibold tabular-nums text-tinta">
                        {p.sumar ? "+" : ""}
                        {formatearDuracion(p.segundos)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          {avisos.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {avisos.map((a, i) => (
                <li key={i} className="text-xs text-aviso">
                  {a}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2.5 flex items-center gap-2">
            {propuestas.length > 0 && (
              <button
                type="button"
                onClick={() => void confirmar()}
                disabled={marcadas.size === 0 || aplicando}
                className="rounded-lg bg-marca-accion px-3 py-2 text-sm font-semibold text-sobre-marca transition-colors hover:bg-marca-accion-fuerte focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-40"
              >
                {aplicando ? (
                  <Cargador texto="Apuntando…" tamano="size-6" />
                ) : (
                  `Apuntar ${marcadas.size} celda${marcadas.size === 1 ? "" : "s"}`
                )}
              </button>
            )}
            <button
              type="button"
              onClick={limpiar}
              className="rounded-lg px-2.5 py-2 text-sm text-texto-suave transition-colors hover:bg-superficie-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento"
            >
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
