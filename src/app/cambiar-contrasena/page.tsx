import type { Metadata } from "next";
import Link from "next/link";
import { FormularioCambio } from "./formulario";

export const metadata: Metadata = { title: "Cambiar contraseña · Clooki" };

export default function PaginaCambiarContrasena() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="font-marca text-2xl font-semibold tracking-tight text-tinta">
          Cambiar contraseña
        </h1>
        <p className="mt-1 mb-8 text-sm text-texto-suave">
          Mínimo 8 caracteres. Se aplica a partir del próximo inicio de sesión.
        </p>
        <FormularioCambio />
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-texto-suave transition-colors hover:text-tinta"
        >
          ← Volver a Mi semana
        </Link>
      </div>
    </main>
  );
}
