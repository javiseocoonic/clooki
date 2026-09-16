// Sincroniza un tablero exportado de Trello (JSON) con el tablero de
// tareas de Clooki. Nació como importador de una sola dirección para la
// migración del equipo audiovisual (jul 2026); desde sep 2026 es un
// espejo: el JSON manda sobre lo que Clooki tiene de ese tablero.
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
// - El enlace a la tarjeta original va al final de la descripción y es
//   la clave de cruce: re-ejecutar no duplica.
//
// Sincronización (Javi, 16 sep 2026):
// - Tarjeta nueva en el JSON → se crea. Tarjeta ya importada → se PISA
//   entera con lo del JSON (título, cliente, estado, descripción, fecha,
//   urgencia, asignadas y subtareas). Tarjeta de Clooki de este tablero
//   (proyecto del tablero + enlace Trello) que ya no está abierta en el
//   JSON → se borra. Las tarjetas creadas a mano en Clooki no se tocan.
// - Campos nativos desde la migración 014: `due` → fecha_limite, la
//   etiqueta «Urgente» → urgente, checklists → tarjeta_checks. Otras
//   etiquetas siguen yendo a la descripción como «Prioridad: …».
// - Las menciones @usuario de Trello se traducen al nombre en Clooki
//   (o al nombre completo de Trello si esa persona ya no está) y además
//   ASIGNAN la tarjeta a esa persona, igual que ser miembro de ella.
//
// Uso:
//   node scripts/importar-trello.mjs [ruta.json]            → ensayo
//   node scripts/importar-trello.mjs [ruta.json] --ejecutar → escribe
//
// El ensayo sin clave solo clasifica el JSON; con la clave además lista
// qué se pisaría y qué se borraría. --ejecutar requiere
// SUPABASE_SERVICE_ROLE_KEY en .env.local.

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
 * (clave = campo `name` del JSON exportado). También delimita qué
 * tarjetas de Clooki pertenecen al tablero a efectos de borrado.
 */
const PROYECTO_POR_TABLERO = new Map([
  ["Coonic | Audiovisual", "Audiovisual"],
  ["Coonic | Diseño", "Diseño"],
  ["Coonic | WEB", "Desarrollo web"],
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
  [/(EL )?INGENIO\b/, "El Ingenio"],
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
  [/FAY ?HOTEL|FAY ?VICTORIA\w*|^FAY\b|\bWEB FAY\b/, "Fayhotel"],
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
  [/MARI ?A? PAZ HURTADO|\bPAZ HURTADO/, "Mari Paz Hurtado"],
  [/CLUB MEDITERRANEO/, "Club Mediterráneo"],
  [/RSSB/, "RSSB"],
  [/\bSALSA\b/, "Salsa"],
  [/PAVIMENTOS/, "Pavimentos"],
  [/ZORROCALLAO/, "Zorrocallao"],
  [/CORDIA/, "Cordia Formación"],
  [/MENDALERENDA/, "Mendalerenda"],
  [/GUAJES?\b/, "Guajes"],
  // ---- Añadidos para el tablero de Diseño (jul 2026) ----
  [/AEHCOS|AECHOS/, "Aehcos"],
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
  // ---- Añadidos en la sincronización de Audiovisual (sep 2026) ----
  [/ASOCIACION CONTRA EL CANCER( DE)?( MARBELLA)?|\bAECC\b/, "Asociación contra el Cáncer Marbella"],
  [/FUNDACION LY COMPANY|\bLY COMPANY\b/, "Fundación LY Company"],
  // ---- Añadidos para el tablero WEB (sep 2026) ----
  [/ANTIGUA CASA DE GUARDIA/, "Antigua Casa de Guardia"],
  [/ALPHABIO/, "Alphabio Iberia"],
  [/ELINGENIO/, "El Ingenio"],
  [/FARFAN/, "Farfán estudio"],
  [/GREENING|LIDERA ENERGIA/, "Greening"],
  [/SERVILIMPCE|LIMPIEZA CEUTA/, "Limpieza Ceuta"],
  [/CIUDAD CORRESPONSABLE/, "Ayuntamiento de Málaga"],
  [/VIAMED|VIANEXO|\bVAULT\b/, "Viamed"],
  [/\bAPECOM\b/, "Apecom"],
  [/HOSPITAL REGIONAL/, "Hospital Regional Universitario"],
  // ---- Añadidos en la sincronización de Diseño (sep 2026) ----
  [/FUNDACION PEREZ ESTRADA|PEREZ ESTRADA/, "Fundación Pérez Estrada"],
  [/CONSEJERIA IA|\bIA JUNTA/, "IA Junta de Andalucía"],
  [/RUTA DEL VINO (DE )?RONDA/, "Ruta del Vino de Ronda"],
  [/\bIGUALDAD\b/, "Ayuntamiento de Málaga"],
  [/\bACET\b/, "ACET Torre del Mar"],
  // Genéricos al final a propósito: que primero casen los específicos
  // («AYTO. TURISMO» → Turismo de Málaga, «JUNTA ANDALUCÍA», TCS…).
  [/\bAYTO\b/, "Ayuntamiento de Málaga"],
  [/\bJUNTA\b/, "Junta de Andalucía"],
  [/\bTURISMO\b|\bCAPITALIDAD\b/, "Turismo de Málaga"],
  [/\bACADEMIA\b/, "Academia Gastronómica"],
  // Los concursos (propuestas a licitación) son trabajo propio hasta
  // que se ganan; el de fritura casa antes con Academia Gastronómica.
  [/\bCONCURSO\b|\bCOONIC\b/, "Coonic (interno)"],
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
  // Audiovisual, sep 2026: sin cliente claro en el título ni en la
  // descripción; al cajón interno hasta que alguien las mueva.
  ["MKSmbizK", "Coonic (interno)"], // Teaser cumpleaños Javi Hurtado
  ["7UYAOFgl", "Coonic (interno)"], // Hospital · vídeo residentes
  ["2xMYKhka", "Coonic (interno)"], // FAMTrip · cambiar formato
  // WEB, sep 2026.
  ["jiyanVMd", "Alphabio Iberia"], // solo un enlace a la tarjeta de Alphabio
  ["fV8B1Qi7", "Coonic (interno)"], // Traducción EN IFV
  ["oG22WJrk", "Coonic (interno)"], // Kit Digital · subsanación
  ["cP39uMIT", "Coonic (interno)"], // Repositorio normativas
  ["aNSOpZkE", "Coonic (interno)"], // Banner en publicaciones
  ["tiIJiEAx", "Coonic (interno)"], // Gálvez cambios
  ["ORDsyCSM", "Coonic (interno)"], // Transferencia ARGCISA
  // Diseño, sep 2026.
  ["IbI7gWKT", "Coonic (interno)"], // Reconocimiento Arturo Bernal
  ["5ZSXA5FU", "Coonic (interno)"], // Esther Arroyo · Black Days
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
  // Tablero WEB
  ["JAVIER", ["JAVIER FERNANDEZ"]],
  ["ALBERTO", ["ALBERTO"]],
  ["PEPOTE", ["PEPE SALES"]],
]);

// Miembro de Trello → nombre en Clooki, para los casos que el cruce
// automático por tokens (con prefijos: ALE≈ALEJANDRO) no resuelve.
const ALIAS_PERSONAS = new Map([
  ["ELISABET", "ELIZABET BELDA"],
  ["ROGERIO MATOS DE SOUZA", "ROYER MATOS"],
  ["JOSE CASADO", "JOSE MANUEL CASADO"],
  ["FRANCISCO RAMON PEREZ GARRIDO", "RAMON PEREZ"],
  ["MCASTANOS", "MERCEDES"],
  ["ALICE", "ALICE BERTHOUD"],
  ["ALBERTO MOYANO SANCHEZ", "ALBERTO MOYANO"],
]);

// Personas del Trello que ya no están en el equipo (Javi, 16 sep 2026):
// no se les asigna nada aunque exista una ficha con la que casen (ni
// por miembro ni por lista con su nombre). Sus menciones @ se traducen
// a su nombre completo de Trello.
const PERSONAS_FUERA = new Set([
  "DIANA MARTIN SEPULVEDA",
  "JOSE CASADO",
  "PEPE",
  // Tablero WEB (sep 2026): ya no están en el equipo.
  "PEPE SALES",
  "PEPOTE",
  "DANIEL COELHO",
]);

const ESTADO_POR_LISTA = new Map([
  ["PENDIENTE POR COMENZAR", "pendiente"],
  ["PENDIENTE POR APROBAR", "pendiente"],
  ["FINALIZADAS", "hecha"],
  // Tablero de Diseño
  ["POR ASIGNAR O COMENZAR", "pendiente"],
  ["PENDIENTES APROBACION", "pendiente"],
  ["FINALIZADO", "hecha"],
  // Tablero WEB
  ["PENDIENTES POR INICIAR", "pendiente"],
  ["FINALIZADOS", "hecha"],
]);

/** Etiqueta de Trello que se traduce al campo `urgente` (014). */
const ETIQUETA_URGENTE = /^URGENTE$/;

/**
 * Etiqueta de prioridad (020) a partir de las etiquetas de Trello, por
 * orden de prioridad si hay varias. Devuelve la clave de Clooki.
 */
const ETIQUETAS_TRELLO = [
  [/^URGENTE$/, "urgente"],
  [/PAUSADO/, "pausado"],
  [/PENDIENTE APROBACION/, "pendiente_aprobacion"],
  [/MEDIANA/, "mediana"],
  [/NO URGENTE|NO ES EMERGENCIA/, "no_urgente"],
];
function etiquetaDeTrello(nombres) {
  const norm = nombres.map(normalizar);
  for (const [patron, clave] of ETIQUETAS_TRELLO) {
    if (norm.some((n) => patron.test(n))) return clave;
  }
  return "ninguna";
}

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

/** Texto válido para tarjeta_checks.texto (btrim, 1..200). */
function textoCheck(s) {
  return s.replace(/\s+/g, " ").trim().slice(0, 200).trim();
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
const miembrosPorUsuario = new Map(
  datos.members.map((m) => [m.username, m.fullName]),
);
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
  // Asignados: la lista con nombre de persona + los miembros de Trello
  // + las personas mencionadas con @ en la descripción (Javi, 16 sep
  // 2026: «si pone @JAGAPI, asigna la tarea a Javi Garijo»).
  const asignados = new Set(
    (tarjeta.idMembers ?? [])
      .map((id) => miembrosPorId.get(id))
      .filter(Boolean),
  );
  if (LISTA_PERSONA.has(listaNorm)) asignados.add(listaNorm);
  for (const m of (tarjeta.desc ?? "").matchAll(/@([\w.-]+)/g)) {
    const mencionada = miembrosPorUsuario.get(m[1]);
    if (mencionada) asignados.add(mencionada);
  }

  // Etiquetas: «Urgente» al campo; el resto, a la descripción.
  const etiquetas = (tarjeta.labels ?? []).map((l) => l.name).filter(Boolean);
  const urgente = etiquetas.some((e) => ETIQUETA_URGENTE.test(normalizar(e)));
  const otrasEtiquetas = etiquetas.filter(
    (e) => !ETIQUETA_URGENTE.test(normalizar(e)),
  );

  // Descripción: la de Trello (menciones traducidas más abajo, cuando
  // se conozcan las personas de Clooki) + prioridad + enlace original.
  const partes = [];
  if (tarjeta.desc?.trim()) partes.push(tarjeta.desc.trim());
  if (otrasEtiquetas.length) partes.push(`Prioridad: ${otrasEtiquetas.join(", ")}`);
  partes.push(`— Importada de Trello (lista «${lista}») · ${tarjeta.shortUrl}`);

  // Subtareas: todos los checklists, en orden, aplanados.
  const checks = [];
  for (const idCl of tarjeta.idChecklists ?? []) {
    const cl = checklistsPorId.get(idCl);
    if (!cl?.checkItems?.length) continue;
    for (const i of [...cl.checkItems].sort((a, b) => a.pos - b.pos)) {
      const texto = textoCheck(i.name);
      if (texto) checks.push({ texto, hecho: i.state === "complete" });
    }
  }

  const fila = {
    shortLink: tarjeta.shortLink,
    shortUrl: tarjeta.shortUrl,
    lista,
    cliente,
    titulo,
    estado,
    asignados: [...asignados],
    descripcion: partes.join("\n\n"),
    fechaLimite: fecha(tarjeta.due),
    urgente,
    etiqueta: etiquetaDeTrello(etiquetas),
    checks,
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
function guardarInforme() {
  writeFileSync(rutaInforme, lineas.join("\n"), "utf8");
}
guardarInforme();
console.log(lineas.slice(0, sinCliente.length + porCliente.size + 8).join("\n"));

// ---------- Conexión ----------

function leerEnvLocal() {
  let contenido;
  try {
    contenido = readFileSync(join(raiz, ".env.local"), "utf8");
  } catch {
    return {};
  }
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
  if (ejecutar) {
    console.error(
      "\nFaltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
    );
    process.exit(1);
  }
  console.log(`\nInforme completo: scripts/informe-trello.txt`);
  console.log(
    "\nEnsayo sin clave: no se puede calcular qué se pisaría o borraría.",
  );
  process.exit(0);
}
const supabase = createClient(url, claveSecreta);

// Sonda: ¿existe ya la columna etiqueta (020)? Si no, solo se escribe
// `urgente` y la prioridad queda en la línea «Prioridad: …».
const ETIQUETAS_DISPONIBLES = !(
  await supabase.from("tarjetas").select("etiqueta").limit(1)
).error;

async function ok(consulta, contexto) {
  const res = await consulta;
  if (res.error) {
    console.error(`Error en ${contexto}:`, res.error.message);
    process.exit(1);
  }
  return res.data;
}

// ---------- Personas ----------

const personas = await ok(
  supabase.from("personas").select("id, nombre, email").eq("activo", true),
  "personas",
);
const importador = personas.find((p) => p.email === EMAIL_IMPORTADOR);
if (!importador) {
  console.error(`No existe la persona importadora ${EMAIL_IMPORTADOR}.`);
  process.exit(1);
}

// Resolver asignados una vez y avisar de los que no casan.
const sinPersona = new Set();
const cachePersona = new Map();
function buscarPersona(nombreTrello) {
  if (cachePersona.has(nombreTrello)) return cachePersona.get(nombreTrello);
  const claves = LISTA_PERSONA.get(nombreTrello);
  const candidata = claves
    ? personas.find((p) => claves.some((k) => normalizar(p.nombre).includes(k)))
    : personas.find((p) => casaNombre(p.nombre, nombreTrello));
  cachePersona.set(nombreTrello, candidata ?? null);
  return candidata ?? null;
}
function resolverPersona(nombreTrello) {
  if (PERSONAS_FUERA.has(normalizar(nombreTrello))) return null;
  const candidata = buscarPersona(nombreTrello);
  if (!candidata) sinPersona.add(nombreTrello);
  return candidata?.id ?? null;
}

// Menciones @usuario → @Nombre en Clooki (o nombre completo de Trello).
function traducirMenciones(texto) {
  return texto.replace(/@([\w.-]+)/g, (todo, usuario) => {
    const nombreTrello = miembrosPorUsuario.get(usuario);
    if (!nombreTrello) return todo;
    const enClooki = PERSONAS_FUERA.has(normalizar(nombreTrello))
      ? null
      : buscarPersona(nombreTrello);
    return `@${enClooki?.nombre ?? nombreTrello}`;
  });
}
for (const f of [...plan, ...sinCliente]) {
  f.descripcion = traducirMenciones(f.descripcion);
}

// ---------- Cruce con Clooki: qué se crea, se pisa y se borra ----------

// Tarjetas de Clooki que vienen de un Trello: el enlace vive en la
// descripción. Las de ESTE tablero son las que están bajo un proyecto
// con el nombre del tablero; las demás (otro tablero) no se tocan.
const existentes = await ok(
  supabase
    .from("tarjetas")
    .select(
      "id, titulo, estado, descripcion, proyecto_id, proyectos(nombre, clientes(nombre))",
    )
    .like("descripcion", "%trello.com/c/%"),
  "tarjetas existentes",
);
const existentePorShortLink = new Map();
const delTablero = [];
for (const t of existentes) {
  const m = t.descripcion?.match(/trello\.com\/c\/([\w-]+)/);
  if (!m) continue;
  existentePorShortLink.set(m[1], t);
  if (normalizar(t.proyectos?.nombre ?? "") === normalizar(NOMBRE_PROYECTO)) {
    delTablero.push({ ...t, shortLink: m[1] });
  }
}
const abiertasPorShortLink = new Set(plan.map((f) => f.shortLink));
const aCrear = plan.filter((f) => !existentePorShortLink.has(f.shortLink));
const aPisar = plan.filter((f) => existentePorShortLink.has(f.shortLink));
const aBorrar = delTablero.filter((t) => !abiertasPorShortLink.has(t.shortLink));

// Cruce de personas, para revisarlo en el ensayo.
const nombresTrello = new Set(plan.flatMap((f) => f.asignados));
lineas.push("");
lineas.push("PERSONAS (Trello → Clooki):");
for (const n of [...nombresTrello].sort()) {
  const fuera = PERSONAS_FUERA.has(normalizar(n));
  const p = fuera ? null : buscarPersona(n);
  lineas.push(
    `  ${n.padEnd(32)} → ${fuera ? "(ya no está: no se asigna)" : (p?.nombre ?? "¡SIN FICHA EN CLOOKI!")}`,
  );
}

lineas.push("");
lineas.push(
  `SINCRONIZACIÓN: crear ${aCrear.length} · pisar ${aPisar.length} · borrar ${aBorrar.length}`,
);
if (aBorrar.length) {
  lineas.push("");
  lineas.push("A BORRAR (ya no están abiertas en el JSON):");
  for (const t of aBorrar) {
    lineas.push(
      `  ${t.estado.padEnd(9)} | ${(t.proyectos?.clientes?.nombre ?? "").padEnd(24)} | ${t.titulo.slice(0, 60)}`,
    );
  }
}
guardarInforme();
console.log("\n" + lineas.slice(-(aBorrar.length + (aBorrar.length ? 3 : 1))).join("\n"));
console.log(`\nInforme completo: scripts/informe-trello.txt`);

if (!ejecutar) {
  console.log("\nEnsayo: no se ha escrito nada. Añade --ejecutar para sincronizar.");
  process.exit(0);
}

// ---------- Escritura ----------

// Clientes: reutilizar por nombre normalizado, crear los que falten.
const clientesBd = await ok(
  supabase.from("clientes").select("id, nombre"),
  "clientes",
);
const clientePorNorm = new Map(clientesBd.map((c) => [normalizar(c.nombre), c]));
const proyectoPorCliente = new Map();
for (const nombre of new Set(plan.map((f) => f.cliente))) {
  let cliente = clientePorNorm.get(normalizar(nombre));
  if (!cliente) {
    [cliente] = await ok(
      supabase.from("clientes").insert({ nombre }).select("id, nombre"),
      `crear cliente ${nombre}`,
    );
    console.log(`+ cliente «${nombre}»`);
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

/** Asignaciones y subtareas de una tarjeta, reemplazadas por las del JSON. */
async function escribirHijas(tarjetaId, f, reemplazar) {
  if (reemplazar) {
    await ok(
      supabase.from("tarjeta_asignaciones").delete().eq("tarjeta_id", tarjetaId),
      `limpiar asignaciones de ${f.shortLink}`,
    );
    await ok(
      supabase.from("tarjeta_checks").delete().eq("tarjeta_id", tarjetaId),
      `limpiar subtareas de ${f.shortLink}`,
    );
  }
  const ids = [...new Set(f.asignados.map(resolverPersona))].filter(Boolean);
  if (ids.length) {
    await ok(
      supabase
        .from("tarjeta_asignaciones")
        .insert(ids.map((persona_id) => ({ tarjeta_id: tarjetaId, persona_id }))),
      `asignaciones de ${f.shortLink}`,
    );
  }
  if (f.checks.length) {
    await ok(
      supabase.from("tarjeta_checks").insert(
        f.checks.map((c, i) => ({
          tarjeta_id: tarjetaId,
          texto: c.texto,
          hecho: c.hecho,
          posicion: (i + 1) * 1024,
        })),
      ),
      `subtareas de ${f.shortLink}`,
    );
  }
}

/** hecha_en real: el trigger lo pone a now() al entrar en 'hecha'. */
async function fijarHechaEn(tarjetaId, f) {
  if (!f.hechaEn) return;
  await ok(
    supabase.from("tarjetas").update({ hecha_en: f.hechaEn }).eq("id", tarjetaId),
    `hecha_en de ${f.shortLink}`,
  );
}

// 1. Borrar las que ya no están abiertas en Trello (asignaciones y
//    subtareas caen en cascada; las horas no enlazan por FK).
if (aBorrar.length) {
  await ok(
    supabase.from("tarjetas").delete().in("id", aBorrar.map((t) => t.id)),
    "borrar tarjetas",
  );
}

// 2. Pisar las ya importadas con lo del JSON.
for (const f of aPisar) {
  const t = existentePorShortLink.get(f.shortLink);
  await ok(
    supabase
      .from("tarjetas")
      .update({
        proyecto_id: proyectoPorCliente.get(f.cliente),
        titulo: f.titulo,
        descripcion: f.descripcion,
        estado: f.estado,
        fecha_limite: f.fechaLimite,
        urgente: f.urgente,
        ...(ETIQUETAS_DISPONIBLES ? { etiqueta: f.etiqueta } : {}),
      })
      .eq("id", t.id),
    `pisar tarjeta ${f.shortLink}`,
  );
  await fijarHechaEn(t.id, f);
  await escribirHijas(t.id, f, true);
}

// 3. Crear las nuevas: posición fraccional por proyecto, detrás de las
//    que ya haya en esa columna, respetando el orden de Trello.
const contadorPos = new Map();
for (const proyectoId of new Set(aCrear.map((f) => proyectoPorCliente.get(f.cliente)))) {
  const [ultima] = await ok(
    supabase
      .from("tarjetas")
      .select("posicion")
      .eq("proyecto_id", proyectoId)
      .order("posicion", { ascending: false })
      .limit(1),
    "posición máxima",
  );
  contadorPos.set(proyectoId, Number(ultima?.posicion ?? 0));
}
for (const f of aCrear.sort((a, b) => a.pos - b.pos)) {
  const proyectoId = proyectoPorCliente.get(f.cliente);
  const pos = contadorPos.get(proyectoId) + 1024;
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
        fecha_limite: f.fechaLimite,
        urgente: f.urgente,
        ...(ETIQUETAS_DISPONIBLES ? { etiqueta: f.etiqueta } : {}),
      })
      .select("id"),
    `crear tarjeta ${f.shortLink}`,
  );
  await fijarHechaEn(tarjeta.id, f);
  await escribirHijas(tarjeta.id, f, false);
}

console.log(
  `\nSincronizado: ${aCrear.length} creadas, ${aPisar.length} pisadas, ${aBorrar.length} borradas.`,
);
if (sinPersona.size) {
  console.log(
    "Asignaciones omitidas (persona no encontrada en Clooki):",
    [...sinPersona].join(", "),
  );
  console.log("Créalas en /gestion y re-ejecuta si quieres esas asignaciones.");
}
