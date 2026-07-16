import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { GeneradorToken } from "./generador";
import { revocarToken } from "./acciones";

export const metadata: Metadata = { title: "Conexión con Claude · Clooki" };

export default async function PaginaConexionIa() {
  const supabase = await crearClienteServidor();
  // RLS: solo devuelve la clave propia.
  const { data: clave } = await supabase
    .from("claves_api")
    .select("creada_en, usada_en")
    .maybeSingle();

  const cabeceras = await headers();
  const host = cabeceras.get("host") ?? "localhost:3000";
  const proto = cabeceras.get("x-forwarded-proto") ?? "http";
  const urlMcp = `${proto}://${host}/api/mcp`;

  return (
    <main className="flex flex-1 justify-center p-6">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold tracking-tight text-tinta">
          Conexión con Claude
        </h1>
        <p className="mt-1 text-sm text-texto-suave">
          Genera tu token personal y podrás apuntar horas y consultar tus
          datos desde Claude, sin abrir Clooki. El token actúa en tu nombre:
          trátalo como una contraseña.
        </p>

        <div className="mt-6 space-y-4">
          {clave && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-borde bg-superficie px-3 py-2.5 text-sm">
              <span className="flex-1 text-texto">
                Tienes un token activo desde el{" "}
                {new Date(clave.creada_en).toLocaleDateString("es-ES")}
                {clave.usada_en
                  ? ` · usado por última vez el ${new Date(clave.usada_en).toLocaleDateString("es-ES")}`
                  : " · aún sin usar"}
                .
              </span>
              <form action={revocarToken}>
                <button
                  type="submit"
                  className="rounded-md px-2 py-1 text-xs font-medium text-error transition-colors hover:bg-error-suave focus-visible:outline-2 focus-visible:outline-error"
                >
                  Revocar
                </button>
              </form>
            </div>
          )}

          <GeneradorToken yaExiste={Boolean(clave)} urlMcp={urlMcp} />

          <div className="rounded-lg bg-superficie-2 p-3 text-xs text-texto-suave">
            <p className="font-medium text-texto">Qué puedes pedirle a Claude:</p>
            <ul className="mt-1.5 list-inside list-disc space-y-1">
              <li>«Apunta 2 h de hoy a Viamed, desarrollo web»</li>
              <li>«¿Cuántas horas llevo esta semana?»</li>
              <li>
                «¿Cuántas horas lleva Capitalidad este mes?» (solo admins)
              </li>
            </ul>
            <p className="mt-2">
              Dos formas de conectar (se muestran al generar el token): en{" "}
              <strong>claude.ai</strong> como conector personalizado con la URL
              que incluye tu clave (sin terminal, vale para todos tus
              dispositivos), o en <strong>Claude Code</strong> con{" "}
              <code>claude mcp add</code> y la cabecera{" "}
              <code>Authorization: Bearer</code>.
            </p>
          </div>
        </div>

        <Link
          href="/"
          className="mt-6 inline-block text-sm text-texto-suave transition-colors hover:text-tinta"
        >
          ← Volver a Mi semana
        </Link>
      </div>
    </main>
  );
}
