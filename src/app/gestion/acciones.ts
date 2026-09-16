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

// Los tipos de proyecto son un catálogo común (019): un cliente nuevo
// nace con los tipos marcados en el select múltiple; cada uno es una
// fila en proyectos con el nombre del tipo copiado.
export async function crearClienteConProyectos(formulario: FormData) {
  const nombre = String(formulario.get("nombre") ?? "").trim();
  if (!nombre) fallo();
  const tipoIds = formulario
    .getAll("tipos")
    .map((t) => String(t))
    .filter(Boolean);

  const supabase = await crearClienteServidor();
  const { data: tipos, error: errorTipos } = await supabase
    .from("tipos")
    .select("id, nombre")
    .in("id", tipoIds)
    .eq("activo", true);
  if (errorTipos) fallo();

  const { data: cliente, error } = await supabase
    .from("clientes")
    .insert({ nombre })
    .select()
    .single();
  if (error || !cliente) fallo();

  if (tipos && tipos.length > 0) {
    const { error: errorProyectos } = await supabase.from("proyectos").insert(
      tipos.map((t) => ({
        cliente_id: cliente.id,
        tipo_id: t.id,
        nombre: t.nombre,
      })),
    );
    if (errorProyectos) fallo();
  }
  revalidatePath("/gestion");
}

export async function crearTipo(formulario: FormData) {
  const nombre = String(formulario.get("nombre") ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!nombre || nombre.length > 60) fallo();

  const supabase = await crearClienteServidor();
  // El nombre es único en la BD; un duplicado cae en fallo() y la
  // página avisa.
  const { error } = await supabase.from("tipos").insert({ nombre });
  if (error) fallo();
  revalidatePath("/gestion");
}

// Casilla de tipo en un cliente. Marcar crea la fila de proyectos si no
// existía (o la reactiva); desmarcar solo la desactiva: nunca se borra,
// porque horas, cronómetros y tarjetas cuelgan de ella.
export async function alternarTipoCliente(formulario: FormData) {
  const clienteId = String(formulario.get("cliente_id") ?? "");
  const tipoId = String(formulario.get("tipo_id") ?? "");
  const activar = formulario.get("activar") === "1";
  if (!clienteId || !tipoId) fallo();

  const supabase = await crearClienteServidor();
  const { data: existente, error: errorBusqueda } = await supabase
    .from("proyectos")
    .select("id, activo")
    .eq("cliente_id", clienteId)
    .eq("tipo_id", tipoId)
    .maybeSingle();
  if (errorBusqueda) fallo();

  if (existente) {
    if (existente.activo !== activar) {
      const { error } = await supabase
        .from("proyectos")
        .update({ activo: activar })
        .eq("id", existente.id);
      if (error) fallo();
    }
  } else if (activar) {
    const { data: tipo } = await supabase
      .from("tipos")
      .select("id, nombre")
      .eq("id", tipoId)
      .maybeSingle();
    if (!tipo) fallo();
    const { error } = await supabase
      .from("proyectos")
      .insert({ cliente_id: clienteId, tipo_id: tipo.id, nombre: tipo.nombre });
    if (error) fallo();
  }
  revalidatePath("/gestion");
}

export async function crearPersona(formulario: FormData) {
  const nombre = String(formulario.get("nombre") ?? "").trim();
  const email = String(formulario.get("email") ?? "")
    .trim()
    .toLowerCase();
  const rol = String(formulario.get("rol") ?? "miembro");
  if (!nombre || !/^[^\s@]+@(coonic\.com|proyectoscoonic\.com)$/.test(email)) fallo();
  if (rol !== "admin" && rol !== "miembro") fallo();

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("personas")
    .insert({ nombre, email, rol });
  if (error) fallo();
  revalidatePath("/gestion");
}

const TABLAS_ARCHIVABLES = ["clientes", "proyectos", "personas", "tipos"] as const;

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

// Renombrar una persona sin tocar su correo: los correos de becarios
// (digital.m@, contenidos.m@…) pasan de una persona a otra y basta con
// cambiar el nombre para que las horas y tarjetas sigan colgando de la
// misma ficha. Solo admin (policy personas_update_admin).
export async function renombrarPersona(formulario: FormData) {
  const id = String(formulario.get("id") ?? "");
  const nombre = String(formulario.get("nombre") ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!id || !nombre || nombre.length > 80) fallo();

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("personas")
    .update({ nombre })
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
