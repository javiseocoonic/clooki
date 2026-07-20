import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cargarTareas } from "@/lib/datos/tareas";
import { Cabecera } from "@/componentes/cabecera";
import {
  BandejaCronometros,
  ProveedorCronometros,
} from "@/componentes/cronometros";
import { Tablero } from "@/componentes/tablero";

export const metadata: Metadata = { title: "Tareas · Clooki" };

export default async function PaginaTareas({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const { archivadas } = await searchParams;
  const verArchivadas = archivadas === "1";

  const datos = await cargarTareas(verArchivadas);
  if (!datos) redirect("/");

  const { persona } = datos;

  return (
    <ProveedorCronometros
      personaId={persona.id}
      sesionesIniciales={datos.sesiones}
      clientes={datos.clientes}
    >
      {/* max-w-6xl (y no 5xl): las columnas agradecen el ancho extra. */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-4 sm:px-6">
        <Cabecera persona={persona} seccion="tareas">
          <BandejaCronometros clientes={datos.clientes} />
        </Cabecera>

        <main className="mt-5 flex flex-1 flex-col">
          <Tablero
            personaId={persona.id}
            esAdmin={persona.rol === "admin"}
            clientes={datos.clientes}
            equipo={datos.equipo}
            equiposPersonas={datos.equiposPersonas}
            tarjetasIniciales={datos.tarjetas}
            verArchivadas={verArchivadas}
          />
        </main>
      </div>
    </ProveedorCronometros>
  );
}
