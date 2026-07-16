"use server";

import { crearClienteServidor } from "@/lib/supabase/servidor";

export interface EstadoCambio {
  hecho: boolean;
  mensaje: string | null;
}

export async function cambiarContrasena(
  _estadoAnterior: EstadoCambio,
  formulario: FormData,
): Promise<EstadoCambio> {
  const nueva = String(formulario.get("nueva") ?? "");
  const repetida = String(formulario.get("repetida") ?? "");

  if (nueva.length < 8) {
    return {
      hecho: false,
      mensaje: "La contraseña debe tener al menos 8 caracteres.",
    };
  }
  if (nueva !== repetida) {
    return { hecho: false, mensaje: "Las contraseñas no coinciden." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: nueva });

  if (error) {
    return {
      hecho: false,
      mensaje: "No se pudo cambiar la contraseña. Inténtalo de nuevo.",
    };
  }

  return { hecho: true, mensaje: "Contraseña cambiada." };
}
