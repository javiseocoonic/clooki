# Clooki · Registro de horas de Coonic

App interna para apuntar horas por cliente y proyecto. MVP definido en
[`coonic-horas-mvp.md`](./coonic-horas-mvp.md) — ese documento manda.

Stack: Next.js 16 + TypeScript + Tailwind v4, Supabase (Postgres + Auth + RLS,
región EU), deploy en Vercel.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # build de producción
```

Variables de entorno en `.env.local` (ver `.env.example`).

## Configuración de Supabase (una sola vez)

1. **SQL**: ejecutar en el SQL Editor, en orden:
   - `supabase/migrations/001_esquema_rls.sql`
   - `supabase/seed.sql` (revisar personas/clientes antes)
2. **Usuarios y contraseñas** (login con email + contraseña, sin magic link):
   - Copiar `scripts/usuarios.ejemplo.csv` a `scripts/usuarios.csv` y rellenar
     las contraseñas: **miembros → su DNI**; **admins → la que elijan** (o una
     temporal que luego cambian en `/cambiar-contrasena`).
   - Añadir `SUPABASE_SERVICE_ROLE_KEY` a `.env.local` (ver `.env.example`).
   - `node scripts/crear-usuarios.mjs` — crea los usuarios en Supabase Auth
     (idempotente: re-ejecutar actualiza contraseñas).
   - `usuarios.csv` está en `.gitignore` y no se sube al repositorio.
3. El acceso está restringido a correos `@coonic.com` en el login; quien no
   tenga fila activa en `personas` no ve ningún dato (RLS).

## Estructura

- `src/app/` — pantallas (login, Mi semana, cambiar contraseña, Resumen y
  Gestión — estas dos, solo admin)
- `scripts/crear-usuarios.mjs` — alta de usuarios en Supabase Auth
- `src/lib/tipos.ts` — tipos del esquema
- `src/lib/semana.ts` — utilidades de semana/horas
- `src/lib/supabase/` — clientes navegador/servidor (`@supabase/ssr`)
- `src/lib/datos/` — consultas de servidor
- `src/proxy.ts` — refresco de sesión + redirección a /login (en Next 16 el
  middleware se llama *proxy*)
- `supabase/` — migraciones y semilla
