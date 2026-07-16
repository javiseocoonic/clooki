"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export interface EstadoToken {
  token: string | null;
  mensaje: string | null;
}

async function personaActualId(): Promise<string | null> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabase
    .from("personas")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .eq("activo", true)
    .maybeSingle();
  return data?.id ?? null;
}

export async function generarToken(): Promise<EstadoToken> {
  const personaId = await personaActualId();
  if (!personaId) {
    return { token: null, mensaje: "Tu usuario no está dado de alta." };
  }

  const token = `clk_${randomBytes(24).toString("base64url")}`;
  const hash = createHash("sha256").update(token).digest("hex");

  const supabase = await crearClienteServidor();
  // Regenerar = revocar la anterior (una clave por persona).
  await supabase.from("claves_api").delete().eq("persona_id", personaId);
  const { error } = await supabase
    .from("claves_api")
    .insert({ persona_id: personaId, hash });

  if (error) {
    return {
      token: null,
      mensaje:
        "No se pudo generar el token. ¿Está ejecutada la migración 004 en Supabase?",
    };
  }
  revalidatePath("/conexion-ia");
  return { token, mensaje: null };
}

export async function revocarToken(): Promise<void> {
  const personaId = await personaActualId();
  if (!personaId) return;
  const supabase = await crearClienteServidor();
  await supabase.from("claves_api").delete().eq("persona_id", personaId);
  revalidatePath("/conexion-ia");
}
