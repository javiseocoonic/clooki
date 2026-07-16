"use client";

import { useState } from "react";

interface Props {
  id: string;
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}

/** Campo de contraseña con toggle "Mostrar" (brief §12.3). */
export function CampoContrasena({
  id,
  name,
  label,
  autoComplete,
  minLength,
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          className="w-full rounded-lg border border-borde-fuerte bg-superficie px-4 py-2.5 pr-12 text-base text-tinta outline-none focus:border-acento focus:ring-2 focus:ring-acento/20"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          title={visible ? "Ocultar" : "Mostrar"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-texto-suave transition-colors hover:text-tinta focus-visible:outline-2 focus-visible:outline-acento"
        >
          {visible ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M2 9s2.5-4.5 7-4.5S16 9 16 9s-2.5 4.5-7 4.5S2 9 2 9Z"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M3 15 15 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M2 9s2.5-4.5 7-4.5S16 9 16 9s-2.5 4.5-7 4.5S2 9 2 9Z"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
