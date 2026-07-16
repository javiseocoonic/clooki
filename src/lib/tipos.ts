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
  /** Pasos de 0,5; > 0 y <= 24 */
  horas: number;
  nota: string | null;
  actualizado_en: string;
}

export type SesionCronometro = {
  id: string;
  persona_id: string;
  proyecto_id: string;
  /** timestamptz ISO */
  inicio: string;
  /** `YYYY-MM-DD` local del usuario al arrancar */
  dia_atribuido: string;
  fin: string | null;
  horas_volcadas: number | null;
}

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
  horas: number;
  nota: string | null;
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
        Row: RegistroHoras;
        Insert: Omit<RegistroHoras, "id" | "nota" | "actualizado_en"> &
          Partial<Pick<RegistroHoras, "id" | "nota">>;
        Update: Partial<Omit<RegistroHoras, "id">>;
        Relationships: [];
      };
      cronometros: {
        Row: SesionCronometro;
        Insert: Pick<
          SesionCronometro,
          "persona_id" | "proyecto_id" | "dia_atribuido"
        > &
          Partial<SesionCronometro>;
        Update: Partial<Omit<SesionCronometro, "id">>;
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
        Args: { p_id: string; p_horas?: number | null };
        Returns: { volcado: number; total: number };
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
        };
        Returns: { accion: string; total: number };
      };
    };
    Enums: { rol_persona: Rol };
    CompositeTypes: Record<string, never>;
  };
}
