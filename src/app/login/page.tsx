import type { Metadata } from "next";
import { FormularioLogin } from "./formulario";
import { Logotipo } from "@/componentes/logotipo";

export const metadata: Metadata = { title: "Entrar · Clooki" };

export default function PaginaLogin() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-tinta">
          <Logotipo className="text-4xl" />
        </h1>
        <p className="mt-3 mb-8 text-sm text-texto-suave">
          Registro de horas de Coonic. Entra con tu correo y contraseña.
        </p>
        <FormularioLogin />
      </div>
    </main>
  );
}
