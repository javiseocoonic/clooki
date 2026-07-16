import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/tipos";

// Cliente para Server Components, Server Actions y Route Handlers.
// En Next 16 `cookies()` es async: siempre `await crearClienteServidor()`.
export async function crearClienteServidor() {
  const almacen = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return almacen.getAll();
        },
        setAll(cookiesAEscribir) {
          try {
            cookiesAEscribir.forEach(({ name, value, options }) =>
              almacen.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component durante el render: ahí no se
            // pueden escribir cookies. No pasa nada — proxy.ts ya refresca
            // la sesión en cada petición.
          }
        },
      },
    },
  );
}
