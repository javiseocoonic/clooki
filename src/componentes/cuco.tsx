// El cuco de Clooki (Clooki ≈ reloj de cuco): mascota SVG propia, sin
// librerías. Asoma en momentos contados de la fase Cuco — al desbloquear
// el Wordle y al cerrar la partida. El cuerpo toma `currentColor`, así que
// el color lo pone quien lo usa (className); el pico va en ámbar fijo.

type Animo = "normal" | "duerme" | "feliz";

export function Cuco({
  animo = "normal",
  className = "",
}: {
  animo?: Animo;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-hidden="true"
      fill="none"
    >
      {/* Cuerpo */}
      <path
        d="M24 8c-7.2 0-12 5-12 12v6c0 6.6 5.4 12 12 12s12-5.4 12-12v-6c0-7-4.8-12-12-12Z"
        fill="currentColor"
      />
      {/* Cresta de cuco */}
      <path
        d="M24 8c.4-2.2 2-3.8 4-4.2-1 1.8-1 3.4-.4 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Ala */}
      <path
        d="M33 22c1.8.6 3.2 2 3.8 3.8-2 .4-3.8-.2-5-1.6"
        fill="var(--superficie)"
        opacity="0.25"
      />
      {/* Pico */}
      <path d="M12 21l-5 2.4 5 2.2v-4.6Z" fill="#e0a11a" />

      {/* Ojo según ánimo */}
      {animo === "duerme" ? (
        <>
          <path
            d="M17 22.5c1.2-1 3-1 4.2 0"
            stroke="var(--superficie)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <text
            x="34"
            y="16"
            fontSize="7"
            fill="currentColor"
            fontWeight="700"
          >
            z
          </text>
        </>
      ) : animo === "feliz" ? (
        <path
          d="M17 23c1-1.4 3.2-1.4 4.2 0"
          stroke="var(--superficie)"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <circle cx="19" cy="22.5" r="1.8" fill="var(--superficie)" />
      )}

      {/* Patas */}
      <path
        d="M20 37.5v3M27 37.5v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
