import type { Metadata } from "next";
import { FormularioLogin } from "./formulario";
import { LogoClooki } from "@/componentes/logo-clooki";

export const metadata: Metadata = { title: "Entrar · Clooki" };

export default function PaginaLogin() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-tinta">
          <LogoClooki className="h-7 w-7 text-acento" />
          Clooki
        </h1>
        <p className="mt-1 mb-8 text-sm text-texto-suave">
          Registro de horas de Coonic. Entra con tu correo y contraseña.
        </p>
        <FormularioLogin />
      </div>
    </main>
  );
}
