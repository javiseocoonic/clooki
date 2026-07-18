// Skeleton con forma de tablero (columnas de tarjetas), no de rejilla:
// cada ruta con estructura propia merece su propio esqueleto.
export default function CargandoTareas() {
  return (
    <div
      className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6"
      aria-busy="true"
    >
      <div className="h-7 w-40 animate-pulse rounded-md bg-superficie-2" />
      <div className="mt-8 flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex w-72 shrink-0 flex-col gap-2">
            <div className="h-4 w-28 animate-pulse rounded-md bg-superficie-2" />
            {Array.from({ length: 3 - (i % 2) }, (_, j) => (
              <div
                key={j}
                className="h-24 animate-pulse rounded-lg bg-superficie-2"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
