/**
 * Logotipo de Clooki.
 *
 * Hereda de Coonic la geométrica en minúsculas con tracking abierto y el
 * punto sobredimensionado de la "i", que aquí se convierte en un reloj:
 * mismo gesto de marca, referencia al producto. La palabra se escribe con
 * "ı" (U+0131, i sin punto) para que el reloj ocupe el hueco del punto.
 *
 * El rojo de marca aparece solo como relleno del reloj — como borde o texto,
 * el rojo es el canal de error de la app (ver la regla en globals.css).
 *
 * Escala con `font-size` (pasa `text-lg`, `text-4xl`… por className): toda la
 * geometría va en `em`. Las constantes salen de medir Poppins 400 en canvas,
 * no de tantear:
 *   - línea base a 0,85em del top de la caja con line-height:1
 *   - punto original centrado en x=0,12em, y=0,70em sobre la línea base
 * El reloj se agranda a 0,46em (el punto real mide 0,125em) porque por debajo
 * de ese tamaño el aro no admite agujas. Consecuencia asumida: de ~24px para
 * abajo las agujas dejan de leerse y el mark degrada a un aro rojo — que es
 * justo el punto-firma de Coonic. Es el comportamiento buscado, no un fallo.
 */
export function Logotipo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-marca inline-block leading-none font-normal tracking-[0.07em] ${className}`}
    >
      <span className="sr-only">Clooki</span>
      <span aria-hidden="true">
        clook
        <span className="relative inline-block">
          ı
          <svg
            viewBox="0 0 24 24"
            className="absolute top-[-0.18em] left-[-0.11em] h-[0.46em] w-[0.46em]"
            fill="none"
            stroke="var(--marca)"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="9.8" strokeWidth="2.6" />
            <path
              d="M12 6.6 L12 12 L16.4 14.3"
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
    </span>
  );
}
