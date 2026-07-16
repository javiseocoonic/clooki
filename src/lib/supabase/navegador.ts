import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/tipos";

// Cliente para componentes 'use client' (la rejilla y su autoguardado).
export function crearClienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
