// Tipos del esquema de Clooki (supabase/migrations/001_esquema_rls.sql).
// Mantener sincronizados con la BD; cuando haya CLI de Supabase configurado
// se pueden regenerar con `supabase gen types`.

export type Rol = "admin" | "miembro";

export type Persona = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
}

export type Cliente = {
  id: string;
  nombre: string;
  activo: boolean;
}

export type Proyecto = {
  id: string;
  cliente_id: string;
  nombre: string;
  activo: boolean;
}

export type RegistroHoras = {
  id: string;
  persona_id: string;
  proyecto_id: string;
  /** Fecha en formato ISO `YYYY-MM-DD` */
  fecha: string;
  /** Parte de la identidad de la línea; "" = sin tarea. Recortada, máx. 120. */
  tarea: string;
  /** Duración exacta en segundos; > 0 y <= 86400 */
  segundos: number;
  /** Columna GENERADA (segundos/3600). Solo lectura: nunca en escrituras. */
  horas: number;
  actualizado_en: string;
}

export type SesionCronometro = {
  id: string;
  persona_id: string;
  proyecto_id: string;
  /** Misma semántica que en `horas`: "" = sin tarea. */
  tarea: string;
  /** timestamptz ISO */
  inicio: string;
  /** `YYYY-MM-DD` local del usuario al arrancar */
  dia_atribuido: string;
  fin: string | null;
  segundos_volcados: number | null;
}

/** Equipos de trabajo (lista cerrada; check en persona_equipos, 008). */
export type Equipo =
  | "contenidos_rrss"
  | "diseno"
  | "audiovisual"
  | "desarrollo"
  | "practicas";

/** Pertenencia a un equipo (0..n por persona); se asigna en Gestión. */
export type PersonaEquipo = {
  persona_id: string;
  equipo: Equipo;
}

export type EstadoTarjeta = "pendiente" | "en_curso" | "hecha";

export type Tarjeta = {
  id: string;
  proyecto_id: string;
  /** Mismo límite que `horas.tarea` (120, recortado): al llevarla a la
   *  rejilla, el título SE COPIA como tarea de línea. */
  titulo: string;
  descripcion: string | null;
  creada_por: string;
  estado: EstadoTarjeta;
  /** Orden dentro de la columna. Fraccional: mover = media entre vecinas. */
  posicion: number;
  /** La fija/limpia el trigger al entrar/salir de 'hecha'; base del
   *  autoarchivado a 30 días. Solo lectura desde la app. */
  hecha_en: string | null;
  creada_en: string;
  actualizado_en: string;
}

/** Asignación múltiple (0..n por tarjeta); sin filas = backlog. */
export type TarjetaAsignacion = {
  tarjeta_id: string;
  persona_id: string;
}

/* ── Wordle semanal (fase Cuco) ── */

export type ColorPista = "correcto" | "presente" | "ausente";
export type EstadoPartida = "en_curso" | "ganada" | "perdida";

/** Un intento ya jugado: la palabra y el color de cada una de sus 5 letras. */
export type IntentoWordle = { palabra: string; pistas: ColorPista[] };

/** Lo que devuelve wordle_estado(): bloqueado o partida en marcha/terminada. */
export type EstadoWordle = {
  /** Lunes ISO de la semana. */
  semana: string;
  desbloqueado: boolean;
  /** Días L–V con registro (0..5); base del mensaje «te faltan N». */
  dias_completos: number;
  max_intentos: number;
  // Solo si desbloqueado:
  intentos?: IntentoWordle[];
  usados?: number;
  estado?: EstadoPartida;
  /** Se revela solo con la partida terminada (ganada o agotada). */
  palabra?: string | null;
};

/** Una fila del ranking mensual (solo agregados; nunca intentos). */
export type FilaRanking = {
  persona_id: string;
  nombre: string;
  /** Semanas jugadas (terminadas) del mes. */
  semanas: number;
  /** Media de intentos (golf: 1–6 al acertar, 7 al fallar). Menor = mejor. */
  media: number;
  /** true = 2+ semanas, compite por el premio; false = fuera de concurso. */
  en_concurso: boolean;
};

/** Lo que devuelve wordle_intentar(): intento válido o rechazo sin gastar turno. */
export type ResultadoIntento =
  | { ok: false; motivo: "formato" | "desconocida" }
  | {
      ok: true;
      palabra_intentada: string;
      pistas: ColorPista[];
      usados: number;
      estado: EstadoPartida;
      palabra: string | null;
    };

export type ClaveApi = {
  id: string;
  persona_id: string;
  /** SHA-256 hex del token; el token en claro nunca se guarda. */
  hash: string;
  creada_en: string;
  usada_en: string | null;
}

/** Fila que devuelve mcp_horas_rango. */
export type FilaHorasMcp = {
  persona_id: string;
  persona: string;
  cliente: string;
  proyecto: string;
  fecha: string;
  tarea: string;
  segundos: number;
  horas: number;
  actualizado_en: string;
}

export type Database = {
  public: {
    Tables: {
      personas: {
        Row: Persona;
        Insert: Omit<Persona, "id" | "rol" | "activo"> &
          Partial<Pick<Persona, "id" | "rol" | "activo">>;
        Update: Partial<Persona>;
        Relationships: [];
      };
      clientes: {
        Row: Cliente;
        Insert: Omit<Cliente, "id" | "activo"> &
          Partial<Pick<Cliente, "id" | "activo">>;
        Update: Partial<Cliente>;
        Relationships: [];
      };
      proyectos: {
        Row: Proyecto;
        Insert: Omit<Proyecto, "id" | "activo"> &
          Partial<Pick<Proyecto, "id" | "activo">>;
        Update: Partial<Proyecto>;
        Relationships: [];
      };
      horas: {
        // `horas` es columna generada: fuera de Insert/Update a propósito.
        Row: RegistroHoras;
        Insert: Omit<RegistroHoras, "id" | "horas" | "actualizado_en"> &
          Partial<Pick<RegistroHoras, "id">>;
        Update: Partial<Omit<RegistroHoras, "id" | "horas">>;
        Relationships: [];
      };
      cronometros: {
        Row: SesionCronometro;
        Insert: Pick<
          SesionCronometro,
          "persona_id" | "proyecto_id" | "dia_atribuido" | "tarea"
        > &
          Partial<SesionCronometro>;
        Update: Partial<Omit<SesionCronometro, "id">>;
        Relationships: [];
      };
      tarjetas: {
        // hecha_en y actualizado_en los gobiernan triggers: fuera de
        // Insert/Update a propósito.
        Row: Tarjeta;
        Insert: Pick<Tarjeta, "proyecto_id" | "titulo" | "creada_por" | "posicion"> &
          Partial<Pick<Tarjeta, "id" | "descripcion" | "estado">>;
        Update: Partial<
          Pick<Tarjeta, "proyecto_id" | "titulo" | "descripcion" | "estado" | "posicion">
        >;
        Relationships: [];
      };
      tarjeta_asignaciones: {
        // Filas (tarjeta, persona) puras: se crean y se borran, sin update.
        Row: TarjetaAsignacion;
        Insert: TarjetaAsignacion;
        Update: Partial<TarjetaAsignacion>;
        Relationships: [];
      };
      persona_equipos: {
        // Filas (persona, equipo) puras: se crean y se borran, sin update.
        Row: PersonaEquipo;
        Insert: PersonaEquipo;
        Update: Partial<PersonaEquipo>;
        Relationships: [];
      };
      claves_api: {
        Row: ClaveApi;
        Insert: Pick<ClaveApi, "persona_id" | "hash"> & Partial<ClaveApi>;
        Update: Partial<Omit<ClaveApi, "id">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      persona_actual_id: { Args: Record<string, never>; Returns: string | null };
      es_admin: { Args: Record<string, never>; Returns: boolean };
      parar_cronometro: {
        Args: { p_id: string; p_horas?: number | null; p_segundos?: number | null };
        Returns: {
          segundos_volcados: number;
          segundos_total: number;
          volcado: number;
          total: number;
        };
      };
      mcp_persona: {
        Args: { p_clave: string };
        Returns: { id: string; nombre: string; rol: Rol };
      };
      mcp_catalogo: {
        Args: { p_clave: string };
        Returns: {
          id: string;
          nombre: string;
          proyectos: { id: string; nombre: string }[];
        }[];
      };
      mcp_horas_rango: {
        Args: { p_clave: string; p_desde: string; p_hasta: string };
        Returns: FilaHorasMcp[];
      };
      mcp_personas: {
        Args: { p_clave: string };
        Returns: { id: string; nombre: string }[];
      };
      mcp_apuntar: {
        Args: {
          p_clave: string;
          p_proyecto_id: string;
          p_fecha: string;
          p_horas: number;
          p_nota?: string | null;
          p_sumar?: boolean;
          p_tarea?: string | null;
        };
        Returns: { accion: string; segundos_total: number; total: number };
      };
      wordle_estado: {
        Args: Record<string, never>;
        Returns: EstadoWordle;
      };
      wordle_intentar: {
        Args: { p_palabra: string };
        Returns: ResultadoIntento;
      };
      wordle_ranking: {
        Args: { p_mes?: string | null };
        Returns: FilaRanking[];
      };
    };
    Enums: { rol_persona: Rol };
    CompositeTypes: Record<string, never>;
  };
}
