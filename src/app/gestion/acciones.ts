"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLIENTE_INTERNO } from "@/lib/datos/admin";
import { crearClienteServidor } from "@/lib/supabase/servidor";

// Las políticas RLS ya garantizan que solo un admin puede escribir en
// clientes/proyectos/personas; aquí solo se valida forma y se traduce
// el error a la URL (?error=1) para el aviso de la página.

function fallo(): never {
  redirect("/gestion?error=1");
}

// ---------- Tipos de proyecto ----------
// Decisión Javi (16 sep 2026): los tipos (Diseño, Audiovisual, RRSS…)
// son un catálogo común a todos los clientes y cada cliente marca con
// una casilla cuáles tiene. Sin tabla nueva: el catálogo es el conjunto
// de nombres distintos de `proyectos` (activos o no). Un tipo recién
// creado, que aún no tiene ningún cliente, se persiste como fila
// DESACTIVADA del cliente interno «Coonic (interno)», que existe
// siempre; así aparece como casilla sin marcar en todos los clientes.
// Marcar crea la fila (o la reactiva); desmarcar solo la desactiva:
// nunca se borra, porque horas, cronómetros y tarjetas cuelgan de ella.

function limpiarNombreTipo(valor: FormDataEntryValue | null): string {
  return String(valor ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nombres del catálogo actual (distintos, sin importar activo). */
async function catalogoTipos(
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("proyectos")
    .select("nombre")
    .range(0, 9999);
  if (error) fallo();
  return new Set((data ?? []).map((p) => p.nombre));
}

export async function crearClienteConProyectos(formulario: FormData) {
  const nombre = String(formulario.get("nombre") ?? "").trim();
  if (!nombre) fallo();

  const supabase = await crearClienteServidor();
  const catalogo = await catalogoTipos(supabase);
  // Solo nombres que existan en el catálogo: el select no inventa tipos.
  const tipos = [
    ...new Set(
      formulario
        .getAll("tipos")
        .map(limpiarNombreTipo)
        .filter((t) => catalogo.has(t)),
    ),
  ];

  const { data: cliente, error } = await supabase
    .from("clientes")
    .insert({ nombre })
    .select()
    .single();
  if (error || !cliente) fallo();

  if (tipos.length > 0) {
    const { error: errorProyectos } = await supabase
      .from("proyectos")
      .insert(tipos.map((t) => ({ cliente_id: cliente.id, nombre: t })));
    if (errorProyectos) fallo();
  }
  revalidatePath("/gestion");
}

export async function crearTipo(formulario: FormData) {
  const nombre = limpiarNombreTipo(formulario.get("nombre"));
  if (!nombre || nombre.length > 60) fallo();

  const supabase = await crearClienteServidor();
  const catalogo = await catalogoTipos(supabase);
  const repetido = [...catalogo].some(
    (t) => t.localeCompare(nombre, "es", { sensitivity: "base" }) === 0,
  );
  if (repetido) fallo();

  const { data: interno } = await supabase
    .from("clientes")
    .select("id")
    .eq("nombre", CLIENTE_INTERNO)
    .maybeSingle();
  if (!interno) fallo();

  const { error } = await supabase
    .from("proyectos")
    .insert({ cliente_id: interno.id, nombre, activo: false });
  if (error) fallo();
  revalidatePath("/gestion");
}

export async function alternarTipoCliente(formulario: FormData) {
  const clienteId = String(formulario.get("cliente_id") ?? "");
  const nombre = limpiarNombreTipo(formulario.get("nombre"));
  const activar = formulario.get("activar") === "1";
  if (!clienteId || !nombre) fallo();

  const supabase = await crearClienteServidor();
  const { data: existentes, error: errorBusqueda } = await supabase
    .from("proyectos")
    .select("id, activo")
    .eq("cliente_id", clienteId)
    .eq("nombre", nombre);
  if (errorBusqueda) fallo();

  if (existentes && existentes.length > 0) {
    const { error } = await supabase
      .from("proyectos")
      .update({ activo: activar })
      .in(
        "id",
        existentes.map((p) => p.id),
      );
    if (error) fallo();
  } else if (activar) {
    const catalogo = await catalogoTipos(supabase);
    if (!catalogo.has(nombre)) fallo();
    const { error } = await supabase
      .from("proyectos")
      .insert({ cliente_id: clienteId, nombre });
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
