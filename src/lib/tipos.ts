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
    };
    Views: Record<string, never>;
    Functions: {
      persona_actual_id: { Args: Record<string, never>; Returns: string | null };
      es_admin: { Args: Record<string, never>; Returns: boolean };
      parar_cronometro: {
        Args: { p_id: string; p_horas?: number | null };
        Returns: { volcado: number; total: number };
      };
    };
    Enums: { rol_persona: Rol };
    CompositeTypes: Record<string, never>;
  };
}
