"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { deIso, esFechaIso } from "@/lib/semana";

// Las políticas RLS ya garantizan que cada cual solo escribe sus propias
// vacaciones; aquí se valida la forma y se traduce el error a la URL
// (?error=codigo) para el aviso de la página.

function fallo(codigo: string): never {
  redirect(`/vacaciones?error=${codigo}`);
}

/** Máximo de días naturales por periodo (espejo del check de la BD). */
const MAX_DIAS_PERIODO = 60;

export async function anadirVacaciones(formulario: FormData) {
  const desde = String(formulario.get("desde") ?? "");
  const hasta = String(formulario.get("hasta") ?? "");
  const nota = String(formulario.get("nota") ?? "")
    .trim()
    .slice(0, 120)
    .trim();
  if (!esFechaIso(desde) || !esFechaIso(hasta) || desde > hasta) fallo("fechas");
  const naturales =
    Math.round((deIso(hasta).getTime() - deIso(desde).getTime()) / 86400000) + 1;
  if (naturales > MAX_DIAS_PERIODO) fallo("fechas");

  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) fallo("1");
  const { data: persona } = await supabase
    .from("personas")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .eq("activo", true)
    .maybeSingle();
  if (!persona) fallo("1");

  const { error } = await supabase
    .from("vacaciones")
    .insert({ persona_id: persona.id, desde, hasta, nota });
  // 23P01 = exclusion_violation: el periodo pisa otro ya apuntado.
  // CL022 = trigger del cupo (018): más de 22 laborables en el año.
  if (error)
    fallo(
      error.code === "23P01"
        ? "solape"
        : error.code === "CL022"
          ? "limite"
          : "1",
    );
  revalidatePath("/vacaciones");
  revalidatePath("/resumen");
}

export async function borrarVacaciones(formulario: FormData) {
  const id = String(formulario.get("id") ?? "");
  if (!id) fallo("1");

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("vacaciones").delete().eq("id", id);
  if (error) fallo("1");
  revalidatePath("/vacaciones");
  revalidatePath("/resumen");
}
