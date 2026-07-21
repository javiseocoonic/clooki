// Importa un tablero exportado de Trello (JSON) al tablero de tareas de
// Clooki. Pensado para la migración del equipo audiovisual (jul 2026),
// pero los alias son datos: sirve para otro tablero ajustándolos.
//
// El choque de modelos y sus decisiones (Javi, 20 jul 2026):
// - En Clooki la columna es el CLIENTE; en el Trello audiovisual las
//   listas son personas/estados. El cliente se deduce del título de la
//   tarjeta («TURISMO DE MÁLAGA - REEL…») vía ALIAS_CLIENTES.
// - Estados: PENDIENTE POR COMENZAR y PENDIENTE POR APROBAR → pendiente;
//   listas con nombre de persona → en_curso + asignación; FINALIZADAS →
//   hecha (con su fecha real: las de >30 días caen directas al archivo).
// - Solo tarjetas abiertas; las archivadas de Trello no se importan.
// - Clientes que faltan se crean con un proyecto «Audiovisual».
// - Urgencia, fecha límite y checklists van a la descripción (Clooki no
//   tiene esos campos); se añade el enlace a la tarjeta original, que
//   además sirve de guarda de idempotencia: re-ejecutar no duplica.
//
// Uso:
//   node scripts/importar-trello.mjs [ruta.json]            → ensayo
//   node scripts/importar-trello.mjs [ruta.json] --ejecutar → escribe
//
// El ensayo no necesita clave; --ejecutar (y el cruce con clientes ya
// existentes) requiere SUPABASE_SERVICE_ROLE_KEY en .env.local.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const ejecutar = argv.includes("--ejecutar");
const rutaJson =
  argv.find((a) => !a.startsWith("--")) ?? "pOWcF8Au - coonic-audiovisual.json";

/** Quien firma las tarjetas importadas (tarjetas.creada_por es NOT NULL). */
const EMAIL_IMPORTADOR = process.env.IMPORTADOR_EMAIL ?? "jfernandez@coonic.com";

/**
 * Proyecto que se crea bajo cada cliente, según el tablero de origen
 * (clave = campo `name` del JSON exportado).
 */
const PROYECTO_POR_TABLERO = new Map([
  ["Coonic | Audiovisual", "Audiovisual"],
  ["Coonic | Diseño", "Diseño"],
]);

// ---------- Alias ----------

// Orden = prioridad: gana el primer patrón que case sobre el título
// normalizado (mayúsculas, sin acentos). «TURISMO COSTA DEL SOL» va
// antes que «TURISMO … MALAGA»; «CAMARA DE COMERCIO» antes que «MARI
// PAZ HURTADO» (la entrevista a María Paz es un trabajo de la Cámara).
const ALIAS_CLIENTES = [
  [/TURISMO COSTA DEL SOL|\bTCS\b/, "Turismo Costa del Sol"],
  [/TURISMO (DE )?MALAGA|AYTO\.? TURISMO/, "Turismo de Málaga"],
  [/MI ?COLCHON|MICOLHON/, "Micolchón"],
  [/EL INGENIO/, "El Ingenio"],
  // El distrito 6 (Cruz de Humilladero) es cliente propio, como
  // Campanillas o Ciudad Jardín. Va antes que Limasam a propósito: en
  // títulos mixtos («LIMASAM - CRUZ HUMILLADERO») gana el distrito.
  [/CRUZ DEL? ?HUMILLADERO|DISTRITO 6/, "Cruz de Humilladero"],
  [/LIMASAM?\b|BALDEO JACARANDA|LIMPIEZA DE MALAGA/, "Limasam"],
  [/(MUSEO )?THYS+E+N( MALAGA)?/, "Museo Thyssen"],
  [/HUTESA/, "Hutesa"],
  [/\bIAD\b/, "IAD"],
  [/NESSEN/, "Nessen"],
  [/CAMARA (DE )?COMERCIO/, "Cámara de Comercio"],
  [/CANAL MALAGA/, "Canal Málaga"],
  [/BENDITA ?KATALI\w*/, "Bendita Katalina"],
  [/\bRUT\b/, "Rut"],
  [/FAY ?HOTEL|FAY ?VICTORIA\w*/, "Fayhotel"],
  [/B BOU( HOTEL)?/, "B Bou Hotel"],
  [/ANORETA( ?GOLF)?/, "Añoreta Golf"],
  [/JUNTA( DE)? ANDALUCIA/, "Junta de Andalucía"],
  [/MALAGA COMERCIO/, "Málaga Comercio"],
  [/ACADEMIA GASTRONOMICA( DE MALAGA)?|\bA\.?G\.? FRITURA|CONCURSO FRITURA|\bAGM\b/, "Academia Gastronómica"],
  [/ESSCA/, "Essca"],
  [/ARCHIVO MUNICIPAL/, "Archivo Municipal"],
  [/AEPLAYAS|ASOC?\w*\.? (DE )?PLAYAS|EXPL?OPLAYAS?\s?(2026)?/, "Faeplayas"],
  [/EVENOR/, "Evenor Abogados"],
  [/MONTERO ARAMBURU/, "Montero Aramburu"],
  [/LORING/, "Loring International"],
  [/MERCASA/, "Mercasa"],
  [/MARI ?A? PAZ HURTADO/, "Mari Paz Hurtado"],
  [/CLUB MEDITERRANEO/, "Club Mediterráneo"],
  [/RSSB/, "RSSB"],
  [/\bSALSA\b/, "Salsa"],
  [/PAVIMENTOS/, "Pavimentos"],
  [/ZORROCALLAO/, "Zorrocallao"],
  [/CORDIA/, "Cordia Formación"],
  [/MENDALERENDA/, "Mendalerenda"],
  [/GUAJES/, "Guajes"],
  // ---- Añadidos para el tablero de Diseño (jul 2026) ----
  [/AEHCOS/, "Aehcos"],
  [/JUSTICIA/, "Justicia"],
  [/PARTICIPACION CIUDADANA/, "Participación Ciudadana"],
  [/PENA JUAN BREVA/, "Peña Juan Breva"],
  [/FESEMPLA/, "Fesempla"],
  [/CERVEZAS VICTORIA/, "Cervezas Victoria"],
  [/LA OPINION( DE MALAGA)?/, "La Opinión de Málaga"],
  [/CAMPANILLAS/, "Campanillas"],
  [/(DISTRITO )?CIUDAD JARDIN/, "Ciudad Jardín"],
  [/SENDA AZUL/, "Senda Azul"],
  [/GALEON/, "Galeón"],
  [/RED BIBLIOTECAS MALAGA|BIBLIOTECA/, "Red Bibliotecas Málaga"],
  [/(TORNEO (DE )?GOLF )?LA CALA( RESORT)?/, "La Cala Resort"],
  [/DEL PARQUE FLATS?/, "Del Parque Flats"],
  [/DO (SIERRAS|VINOS) DE MALAGA|RUTA (DE )?VINOS|MUSEOS VINO/, "DO Vinos de Málaga"],
  [/TOURISM HUB/, "Tourism Hub"],
  [/ADMUNDI/, "Admundi"],
  [/CIO MIJAS/, "CIO Mijas"],
  [/DONA FRANCISQUITA/, "Doña Francisquita"],
  [/MEDIOLANUM/, "Mediolanum"],
  [/MCARTHUR ?GLEN/, "McArthurGlen"],
  [/\bPEBAR\b/, "Pebar"],
  [/SARDELLA/, "Sardella"],
  [/\bHRUM\b/, "Hrum"],
  [/LOS APRENDEDORES/, "Los Aprendedores"],
  [/AMIGOS ESPIGA/, "Amigos de la Espiga"],
  [/GETAFE ?3/, "C.C. Getafe 3"],
  // Genéricos al final a propósito: que primero casen los específicos
  // («AYTO. TURISMO» → Turismo de Málaga, «JUNTA ANDALUCÍA», TCS…).
  [/\bAYTO\b/, "Ayuntamiento de Málaga"],
  [/\bJUNTA\b/, "Junta de Andalucía"],
  [/\bTURISMO\b|\bCAPITALIDAD\b/, "Turismo de Málaga"],
  [/\bACADEMIA\b/, "Academia Gastronómica"],
  [/\bCOONIC\b/, "Coonic (interno)"],
];

// Tarjetas cuyo cliente no se deduce del título: shortLink de Trello →
// nombre de cliente. Rellenar tras revisar el ensayo; vacías se omiten.
const CLIENTE_MANUAL = new Map([
  // Diseño: el Premio de la Infancia es de la Junta; los logos de golf,
  // del torneo de La Cala (mismo lote que las otras tarjetas La Cala).
  ["4dx513J1", "Junta de Andalucía"],
  ["kwF4PNDm", "La Cala Resort"],
  // Sin cliente deducible → cajón interno (decisión Javi, 21 jul 2026).
  ["5CLLADtM", "Coonic (interno)"],
  ["d6ncoxNa", "Coonic (interno)"],
  ["Q3knPXPC", "Coonic (interno)"],
]);

// Lista de Trello con nombre de persona → palabras que deben aparecer
// en el nombre de la persona en Clooki (basta una).
const LISTA_PERSONA = new Map([
  ["PAULA", ["PAULA"]],
  ["CLAUDIA", ["CLAUDIA"]],
  ["ROYER", ["ROYER", "ROGERIO"]],
  ["JOSE MANUEL", ["JOSE MANUEL", "CASADO"]],
  ["PEPE", ["PEPE", "JOSE CASADO"]],
  // Tablero de Diseño
  ["NOR", ["NORBERTO"]],
  ["CARLOS", ["CARLOS"]],
  ["ANDRES", ["ANDRES"]],
  ["ALICE", ["ALICE"]],
]);

// Miembro de Trello → nombre en Clooki, para los casos que el cruce
// automático por tokens (con prefijos: ALE≈ALEJANDRO) no resuelve.
const ALIAS_PERSONAS = new Map([
  ["ELISABET", "ELIZABET BELDA"],
  ["ROGERIO MATOS DE SOUZA", "ROYER MATOS"],
  ["JOSE CASADO", "JOSE MANUEL CASADO"],
]);

const ESTADO_POR_LISTA = new Map([
  ["PENDIENTE POR COMENZAR", "pendiente"],
  ["PENDIENTE POR APROBAR", "pendiente"],
  ["FINALIZADAS", "hecha"],
  // Tablero de Diseño
  ["POR ASIGNAR O COMENZAR", "pendiente"],
  ["PENDIENTES APROBACION", "pendiente"],
  ["FINALIZADO", "hecha"],
]);

// ---------- Utilidades ----------

/** MAYÚSCULAS sin acentos, 1:1 por carácter (conserva índices). */
function normalizar(s) {
  return [...s]
    .map((c) => c.normalize("NFD").replace(/[̀-ͯ]/g, "")[0] ?? c)
    .join("")
    .toUpperCase();
}

/** Ruido al inicio del título: «20JUL -», «OK 17MAR», «ACT. », «URGE -»… */
const RUIDO_INICIO =
  /^(?:(?:OK|ACT\.?|URGE)\s*[-–.]?\s*)?(?:\d{1,2}\s*(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s*(?:OK)?)?\s*[-–.:]?\s*/i;

function detectarCliente(nombre) {
  const limpio = nombre.replace(RUIDO_INICIO, "").trim() || nombre.trim();
  const norm = normalizar(limpio);
  for (const [patron, cliente] of ALIAS_CLIENTES) {
    const m = norm.match(patron);
    if (!m) continue;
    let titulo = limpio;
    // Si el cliente encabeza el título, se recorta (la columna ya lo dice).
    if (m.index <= 3) {
      titulo = limpio.slice(m.index + m[0].length).replace(/^[\s\-–.:,/]+/, "");
    }
    if (!titulo) titulo = limpio;
    return { cliente, titulo: titulo.slice(0, 120).trim() || limpio.slice(0, 120) };
  }
  return { cliente: null, titulo: limpio.slice(0, 120) };
}

/** Cruce de nombres por tokens; un token casa si es igual o prefijo (≥3). */
function casaNombre(nombreClooki, nombreTrello) {
  const objetivo = normalizar(nombreTrello);
  const alias = ALIAS_PERSONAS.get(objetivo);
  if (alias) return normalizar(nombreClooki) === normalizar(alias);
  const tokensC = normalizar(nombreClooki).split(/\s+/);
  const tokensT = objetivo.split(/\s+/);
  return tokensC.every((tc) =>
    tokensT.some(
      (tt) =>
        tc === tt ||
        (tc.length >= 3 && tt.startsWith(tc)) ||
        (tt.length >= 3 && tc.startsWith(tt)),
    ),
  );
}

function fecha(iso) {
  return iso ? iso.slice(0, 10) : null;
}

// ---------- Carga y transformación ----------

/** Umbral de «reciente» para la lista Pendientes aprobación (60 días). */
const CORTE_APROBACION = new Date(Date.now() - 60 * 86400000).toISOString();

const datos = JSON.parse(readFileSync(join(raiz, rutaJson), "utf8"));
const NOMBRE_PROYECTO = PROYECTO_POR_TABLERO.get(datos.name);
if (!NOMBRE_PROYECTO) {
  console.error(
    `Tablero desconocido «${datos.name}»: añádelo a PROYECTO_POR_TABLERO.`,
  );
  process.exit(1);
}
const listasPorId = new Map(datos.lists.map((l) => [l.id, l]));
const miembrosPorId = new Map(datos.members.map((m) => [m.id, m.fullName]));
const checklistsPorId = new Map(datos.checklists.map((c) => [c.id, c]));

const abiertas = datos.cards.filter(
  (c) => !c.closed && !listasPorId.get(c.idList)?.closed,
);

const plan = [];
const sinCliente = [];
for (const tarjeta of abiertas) {
  const lista = listasPorId.get(tarjeta.idList).name.trim();
  const listaNorm = normalizar(lista);
  let { cliente, titulo } = detectarCliente(tarjeta.name);
  if (!cliente) cliente = CLIENTE_MANUAL.get(tarjeta.shortLink) ?? null;

  let estado = ESTADO_POR_LISTA.get(listaNorm) ?? "en_curso";
  // «Pendientes aprobación» (Diseño) es el aparcamiento de casi todo el
  // tablero (413 tarjetas desde enero). Decisión Javi (21 jul 2026):
  // recientes (≤60 días de actividad) → pendiente; el resto → hecha con
  // su fecha real, así las viejas caen directas al archivo del tablero.
  if (
    listaNorm === "PENDIENTES APROBACION" &&
    tarjeta.dateLastActivity < CORTE_APROBACION
  ) {
    estado = "hecha";
  }
  // Asignados: la lista con nombre de persona + los miembros de Trello.
  const asignados = new Set(
    (tarjeta.idMembers ?? [])
      .map((id) => miembrosPorId.get(id))
      .filter(Boolean),
  );
  if (LISTA_PERSONA.has(listaNorm)) asignados.add(listaNorm);

  // Descripción: la de Trello + lo que no tiene campo en Clooki.
  const partes = [];
  if (tarjeta.desc?.trim()) partes.push(tarjeta.desc.trim());
  const meta = [];
  const etiquetas = (tarjeta.labels ?? []).map((l) => l.name).filter(Boolean);
  if (etiquetas.length) meta.push(`Prioridad: ${etiquetas.join(", ")}`);
  if (tarjeta.due) meta.push(`Fecha límite: ${fecha(tarjeta.due)}`);
  if (meta.length) partes.push(meta.join(" · "));
  for (const idCl of tarjeta.idChecklists ?? []) {
    const cl = checklistsPorId.get(idCl);
    if (!cl?.checkItems?.length) continue;
    const items = [...cl.checkItems]
      .sort((a, b) => a.pos - b.pos)
      .map((i) => `${i.state === "complete" ? "[x]" : "[ ]"} ${i.name}`);
    partes.push(`${cl.name}:\n${items.join("\n")}`);
  }
  partes.push(`— Importada de Trello (lista «${lista}») · ${tarjeta.shortUrl}`);

  const fila = {
    shortLink: tarjeta.shortLink,
    shortUrl: tarjeta.shortUrl,
    lista,
    cliente,
    titulo,
    estado,
    asignados: [...asignados],
    descripcion: partes.join("\n\n"),
    pos: tarjeta.pos,
    hechaEn: estado === "hecha" ? tarjeta.dateLastActivity : null,
  };
  if (cliente) plan.push(fila);
  else sinCliente.push(fila);
}

// ---------- Informe (siempre) ----------

const porCliente = new Map();
for (const f of plan) {
  const c = porCliente.get(f.cliente) ?? { pendiente: 0, en_curso: 0, hecha: 0 };
  c[f.estado]++;
  porCliente.set(f.cliente, c);
}

const lineas = [];
lineas.push(`Tablero: ${datos.name}`);
lineas.push(
  `Tarjetas abiertas: ${abiertas.length} → importables ${plan.length}, sin cliente ${sinCliente.length}`,
);
lineas.push("");
lineas.push("CLIENTE                      pend  curso  hecha");
for (const [c, n] of [...porCliente].sort((a, b) => a[0].localeCompare(b[0]))) {
  lineas.push(
    `${c.padEnd(28)} ${String(n.pendiente).padStart(4)} ${String(n.en_curso).padStart(6)} ${String(n.hecha).padStart(6)}`,
  );
}
if (sinCliente.length) {
  lineas.push("");
  lineas.push("SIN CLIENTE (se omiten salvo que se añadan a CLIENTE_MANUAL):");
  for (const f of sinCliente)
    lineas.push(`  ${f.shortLink}  [${f.lista}] ${f.titulo}`);
}
lineas.push("");
lineas.push("DETALLE (estado | cliente | título | asignados):");
for (const f of plan) {
  lineas.push(
    `  ${f.estado.padEnd(9)} | ${f.cliente.padEnd(24)} | ${f.titulo.slice(0, 60).padEnd(60)} | ${f.asignados.join(", ")}`,
  );
}

const rutaInforme = join(raiz, "scripts", "informe-trello.txt");
writeFileSync(rutaInforme, lineas.join("\n"), "utf8");
console.log(lineas.slice(0, sinCliente.length + porCliente.size + 8).join("\n"));
console.log(`\nInforme completo: scripts/informe-trello.txt`);

if (!ejecutar) {
  console.log("\nEnsayo: no se ha escrito nada. Añade --ejecutar para importar.");
  process.exit(0);
}

// ---------- Escritura ----------

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
    "\nFaltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}
const supabase = createClient(url, claveSecreta);

async function ok(consulta, contexto) {
  const res = await consulta;
  if (res.error) {
    console.error(`Error en ${contexto}:`, res.error.message);
    process.exit(1);
  }
  return res.data;
}

const personas = await ok(
  supabase.from("personas").select("id, nombre, email").eq("activo", true),
  "personas",
);
const importador = personas.find((p) => p.email === EMAIL_IMPORTADOR);
if (!importador) {
  console.error(`No existe la persona importadora ${EMAIL_IMPORTADOR}.`);
  process.exit(1);
}

// Guarda de idempotencia: shortLink → id de las tarjetas ya importadas
// (el enlace de Trello vive en la descripción). Re-ejecutar no duplica
// tarjetas, pero SÍ completa asignaciones que faltasen (p. ej. tras dar
// de alta a una persona o añadir un alias).
const existentes = await ok(
  supabase
    .from("tarjetas")
    .select("id, descripcion")
    .like("descripcion", "%trello.com/c/%"),
  "tarjetas existentes",
);
const idPorShortLink = new Map();
for (const t of existentes) {
  for (const m of t.descripcion?.matchAll(/trello\.com\/c\/([\w-]+)/g) ?? []) {
    idPorShortLink.set(m[1], t.id);
  }
}
const pendientesImportar = plan.filter((f) => !idPorShortLink.has(f.shortLink));
if (pendientesImportar.length < plan.length) {
  console.log(
    `\nYa importadas antes (se saltan): ${plan.length - pendientesImportar.length}`,
  );
}

// Clientes: reutilizar por nombre normalizado, crear los que falten.
const clientesBd = await ok(
  supabase.from("clientes").select("id, nombre"),
  "clientes",
);
const clientePorNorm = new Map(clientesBd.map((c) => [normalizar(c.nombre), c]));
const proyectoPorCliente = new Map();
for (const nombre of new Set(pendientesImportar.map((f) => f.cliente))) {
  let cliente = clientePorNorm.get(normalizar(nombre));
  if (!cliente) {
    [cliente] = await ok(
      supabase.from("clientes").insert({ nombre }).select("id, nombre"),
      `crear cliente ${nombre}`,
    );
    console.log(`+ cliente «${nombre}»`);
  } else {
    console.log(`= cliente existente «${cliente.nombre}»`);
  }
  const proyectos = await ok(
    supabase
      .from("proyectos")
      .select("id, nombre")
      .eq("cliente_id", cliente.id),
    `proyectos de ${nombre}`,
  );
  let proyecto = proyectos.find(
    (p) => normalizar(p.nombre) === normalizar(NOMBRE_PROYECTO),
  );
  if (!proyecto) {
    [proyecto] = await ok(
      supabase
        .from("proyectos")
        .insert({ cliente_id: cliente.id, nombre: NOMBRE_PROYECTO })
        .select("id, nombre"),
      `crear proyecto de ${nombre}`,
    );
  }
  proyectoPorCliente.set(nombre, proyecto.id);
}

// Personas: resolver asignados una vez y avisar de los que no casan.
const sinPersona = new Set();
function resolverPersona(nombreTrello) {
  const claves = LISTA_PERSONA.get(nombreTrello);
  const candidata = claves
    ? personas.find((p) => claves.some((k) => normalizar(p.nombre).includes(k)))
    : personas.find((p) => casaNombre(p.nombre, nombreTrello));
  if (!candidata) sinPersona.add(nombreTrello);
  return candidata?.id ?? null;
}

// Tarjetas: posición fraccional por proyecto respetando el orden Trello.
const contadorPos = new Map();
let creadas = 0;
for (const f of pendientesImportar.sort((a, b) => a.pos - b.pos)) {
  const proyectoId = proyectoPorCliente.get(f.cliente);
  const pos = (contadorPos.get(proyectoId) ?? 0) + 1024;
  contadorPos.set(proyectoId, pos);
  const [tarjeta] = await ok(
    supabase
      .from("tarjetas")
      .insert({
        proyecto_id: proyectoId,
        titulo: f.titulo,
        descripcion: f.descripcion,
        creada_por: importador.id,
        estado: f.estado,
        posicion: pos,
      })
      .select("id"),
    `crear tarjeta ${f.shortLink}`,
  );
  creadas++;
  // hecha_en real (el trigger lo puso a now() en el insert): las hechas
  // hace >30 días caen así directamente al archivo del tablero.
  if (f.hechaEn) {
    await ok(
      supabase
        .from("tarjetas")
        .update({ hecha_en: f.hechaEn })
        .eq("id", tarjeta.id),
      `hecha_en de ${f.shortLink}`,
    );
  }
  const ids = [...new Set(f.asignados.map(resolverPersona))].filter(Boolean);
  if (ids.length) {
    await ok(
      supabase
        .from("tarjeta_asignaciones")
        .insert(ids.map((persona_id) => ({ tarjeta_id: tarjeta.id, persona_id }))),
      `asignaciones de ${f.shortLink}`,
    );
  }
}

// Tarjetas ya importadas en pasadas anteriores: sincronizar asignaciones
// que falten (inserción idempotente sobre la clave tarjeta+persona).
let asignacionesNuevas = 0;
for (const f of plan) {
  const tarjetaId = idPorShortLink.get(f.shortLink);
  if (!tarjetaId || !f.asignados.length) continue;
  const ids = [...new Set(f.asignados.map(resolverPersona))].filter(Boolean);
  if (!ids.length) continue;
  const filas = await ok(
    supabase
      .from("tarjeta_asignaciones")
      .upsert(
        ids.map((persona_id) => ({ tarjeta_id: tarjetaId, persona_id })),
        { onConflict: "tarjeta_id,persona_id", ignoreDuplicates: true },
      )
      .select("persona_id"),
    `sincronizar asignaciones de ${f.shortLink}`,
  );
  asignacionesNuevas += filas.length;
}

console.log(`\nImportadas ${creadas} tarjetas.`);
if (asignacionesNuevas) {
  console.log(`Asignaciones añadidas a tarjetas ya importadas: ${asignacionesNuevas}`);
}
if (sinPersona.size) {
  console.log(
    "Asignaciones omitidas (persona no encontrada en Clooki):",
    [...sinPersona].join(", "),
  );
  console.log("Créalas en /gestion y re-ejecuta si quieres esas asignaciones.");
}
