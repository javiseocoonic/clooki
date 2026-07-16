"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export interface EstadoLogin {
  mensaje: string | null;
}

const CORREO_COONIC = /^[^\s@]+@coonic\.com$/i;

export async function iniciarSesion(
  _estadoAnterior: EstadoLogin,
  formulario: FormData,
): Promise<EstadoLogin> {
  const email = String(formulario.get("email") ?? "")
    .trim()
    .toLowerCase();
  const contrasena = String(formulario.get("contrasena") ?? "");

  if (!CORREO_COONIC.test(email)) {
    return { mensaje: "Usa tu correo @coonic.com." };
  }
  if (!contrasena) {
    return { mensaje: "Escribe tu contraseña." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: contrasena,
  });

  if (error) {
    return { mensaje: "Correo o contraseña incorrectos." };
  }

  redirect("/");
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
