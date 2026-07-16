"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

// Las políticas RLS ya garantizan que solo un admin puede escribir en
// clientes/proyectos/personas; aquí solo se valida forma y se traduce
// el error a la URL (?error=1) para el aviso de la página.

function fallo(): never {
  redirect("/gestion?error=1");
}

export async function crearClienteConProyectos(formulario: FormData) {
  const nombre = String(formulario.get("nombre") ?? "").trim();
  if (!nombre) fallo();
  // "SEO, Campaña vendimia" → proyectos iniciales opcionales.
  const proyectos = String(formulario.get("proyectos") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const supabase = await crearClienteServidor();
  const { data: cliente, error } = await supabase
    .from("clientes")
    .insert({ nombre })
    .select()
    .single();
  if (error || !cliente) fallo();

  if (proyectos.length > 0) {
    const { error: errorProyectos } = await supabase
      .from("proyectos")
      .insert(proyectos.map((n) => ({ cliente_id: cliente.id, nombre: n })));
    if (errorProyectos) fallo();
  }
  revalidatePath("/gestion");
}

export async function crearProyecto(formulario: FormData) {
  const clienteId = String(formulario.get("cliente_id") ?? "");
  const nombre = String(formulario.get("nombre") ?? "").trim();
  if (!clienteId || !nombre) fallo();

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("proyectos")
    .insert({ cliente_id: clienteId, nombre });
  if (error) fallo();
  revalidatePath("/gestion");
}

export async function crearPersona(formulario: FormData) {
  const nombre = String(formulario.get("nombre") ?? "").trim();
  const email = String(formulario.get("email") ?? "")
    .trim()
    .toLowerCase();
  const rol = String(formulario.get("rol") ?? "miembro");
  if (!nombre || !/^[^\s@]+@coonic\.com$/.test(email)) fallo();
  if (rol !== "admin" && rol !== "miembro") fallo();

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("personas")
    .insert({ nombre, email, rol });
  if (error) fallo();
  revalidatePath("/gestion");
}

const TABLAS_ARCHIVABLES = ["clientes", "proyectos", "personas"] as const;

export async function alternarActivo(formulario: FormData) {
  const tabla = String(formulario.get("tabla") ?? "");
  const id = String(formulario.get("id") ?? "");
  const activar = formulario.get("activar") === "1";
  if (!TABLAS_ARCHIVABLES.includes(tabla as (typeof TABLAS_ARCHIVABLES)[number]) || !id)
    fallo();

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from(tabla as (typeof TABLAS_ARCHIVABLES)[number])
    .update({ activo: activar })
    .eq("id", id);
  if (error) fallo();
  revalidatePath("/gestion");
}

export async function alternarRol(formulario: FormData) {
  const id = String(formulario.get("id") ?? "");
  const rol = String(formulario.get("rol") ?? "");
  if (!id || (rol !== "admin" && rol !== "miembro")) fallo();

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("personas").update({ rol }).eq("id", id);
  if (error) fallo();
  revalidatePath("/gestion");
}
