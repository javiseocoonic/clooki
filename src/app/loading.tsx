// Skeleton de la rejilla durante la navegación de semanas (brief §6).
export default function CargandoMiSemana() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 sm:px-6" aria-busy="true">
      <div className="h-7 w-40 animate-pulse rounded-md bg-superficie-2" />
      <div className="mt-8 h-6 w-64 animate-pulse rounded-md bg-superficie-2" />
      <div className="mt-6 space-y-3 rounded-xl border border-borde bg-superficie p-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-9 w-48 animate-pulse rounded-md bg-superficie-2" />
            {Array.from({ length: 5 }, (_, j) => (
              <div
                key={j}
                className="h-9 flex-1 animate-pulse rounded-md bg-superficie-2"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
