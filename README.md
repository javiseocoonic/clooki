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

## Entrada por lenguaje natural (en la app)

La caja sobre la rejilla interpreta frases («ayer 3h en Viamed rrss») y
propone celdas que se confirman antes de guardar. Identidad = sesión de
Clooki (sin cuentas de Claude por persona). Requiere la variable
`ANTHROPIC_API_KEY` (clave de empresa) en Vercel — sin ella la caja muestra
un aviso y el resto de la app funciona igual.

## Conexión con Claude (MCP)

Cada persona genera su token en **/conexion-ia** (actúa en su nombre, con
sus mismos permisos: miembro = sus horas; admin = también el resumen).

- **claude.ai (sin terminal; se sincroniza en todos los dispositivos de la
  cuenta):** Ajustes → Conectores → Añadir conector personalizado con
  `https://<dominio>/api/mcp?clave=clk_...` (la URL exacta se muestra al
  generar el token).
- **Claude Code (por máquina):**

```bash
claude mcp add --transport http clooki https://<dominio>/api/mcp --header "Authorization: Bearer clk_..."
``` Herramientas: `apuntar_horas`, `mis_horas`,
`resumen_horas` (admin), `listar_catalogo`. Requiere la migración
`004_mcp.sql`. El endpoint no usa service role: la seguridad vive en
funciones `SECURITY DEFINER` que validan el token en cada llamada.

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
