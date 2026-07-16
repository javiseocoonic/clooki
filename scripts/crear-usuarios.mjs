// Crea (o actualiza) los usuarios de Supabase Auth con su contraseña inicial.
//
// Uso:
//   1. Copia scripts/usuarios.ejemplo.csv a scripts/usuarios.csv y rellena
//      las contraseñas (DNI para miembros; los admin, la que elijan o una
//      temporal que luego cambian en /cambiar-contrasena).
//   2. Añade SUPABASE_SERVICE_ROLE_KEY a .env.local (Dashboard → Settings →
//      API keys → service_role / secret). NUNCA con prefijo NEXT_PUBLIC_.
//   3. node scripts/crear-usuarios.mjs
//
// Es idempotente: si el usuario ya existe, le actualiza la contraseña.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

function leerEnvLocal() {
  const contenido = readFileSync(join(raiz, ".env.local"), "utf8");
  const env = {};
  for (const linea of contenido.split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = leerEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const claveSecreta = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;

if (!url || !claveSecreta) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}

let csv;
try {
  csv = readFileSync(join(raiz, "scripts", "usuarios.csv"), "utf8");
} catch {
  console.error(
    "No existe scripts/usuarios.csv — copia usuarios.ejemplo.csv y rellénalo.",
  );
  process.exit(1);
}

const usuarios = csv
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#") && !l.toLowerCase().startsWith("email"))
  .map((l) => {
    const [email, contrasena] = l.split(/[;,]/).map((c) => c.trim());
    return { email: email?.toLowerCase(), contrasena };
  })
  .filter((u) => u.email && u.contrasena);

if (usuarios.length === 0) {
  console.error("usuarios.csv no tiene filas válidas (email;contraseña).");
  process.exit(1);
}

const supabase = createClient(url, claveSecreta, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Mapa email → id de los usuarios ya existentes (para re-ejecuciones).
const existentes = new Map();
for (let pagina = 1; ; pagina++) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: pagina,
    perPage: 1000,
  });
  if (error) {
    console.error("Error listando usuarios:", error.message);
    process.exit(1);
  }
  for (const u of data.users) existentes.set(u.email?.toLowerCase(), u.id);
  if (data.users.length < 1000) break;
}

let creados = 0;
let actualizados = 0;
let fallos = 0;

for (const { email, contrasena } of usuarios) {
  const idExistente = existentes.get(email);
  if (idExistente) {
    const { error } = await supabase.auth.admin.updateUserById(idExistente, {
      password: contrasena,
    });
    if (error) {
      console.error(`✗ ${email}: ${error.message}`);
      fallos++;
    } else {
      console.log(`↻ ${email}: contraseña actualizada`);
      actualizados++;
    }
  } else {
    const { error } = await supabase.auth.admin.createUser({
      email,
      password: contrasena,
      email_confirm: true,
    });
    if (error) {
      console.error(`✗ ${email}: ${error.message}`);
      fallos++;
    } else {
      console.log(`✓ ${email}: creado`);
      creados++;
    }
  }
}

console.log(
  `\nHecho: ${creados} creados, ${actualizados} actualizados, ${fallos} fallos.`,
);
if (fallos > 0) process.exit(1);
