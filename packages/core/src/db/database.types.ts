export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_permissions: {
        Row: {
          created_at: string
          email: string | null
          is_full: boolean
          perms: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          is_full?: boolean
          perms?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          is_full?: boolean
          perms?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assignments: {
        Row: {
          break_minutes: number
          clock_in: string | null
          clock_out: string | null
          created_at: string
          crew_id: string
          distance_km: number | null
          event_id: string
          hours_approved: boolean
          hours_worked: number | null
          id: string
          responded_at: string | null
          role: string | null
          status: Database["public"]["Enums"]["assignment_status"]
          transport_group: string | null
          updated_at: string
        }
        Insert: {
          break_minutes?: number
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          crew_id: string
          distance_km?: number | null
          event_id: string
          hours_approved?: boolean
          hours_worked?: number | null
          id?: string
          responded_at?: string | null
          role?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          transport_group?: string | null
          updated_at?: string
        }
        Update: {
          break_minutes?: number
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          crew_id?: string
          distance_km?: number | null
          event_id?: string
          hours_approved?: boolean
          hours_worked?: number | null
          id?: string
          responded_at?: string | null
          role?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          transport_group?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      availability: {
        Row: {
          created_at: string
          crew_id: string
          date: string
          id: string
          status: Database["public"]["Enums"]["availability_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          date: string
          id?: string
          status: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          date?: string
          id?: string
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      crew: {
        Row: {
          address_2: string | null
          address_2_label: string | null
          address_label: string | null
          created_at: string
          crew_code: string
          date_of_birth: string | null
          drivers_license_number: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          external_id: string | null
          first_name: string
          has_car: boolean
          has_license: boolean
          home_city: string | null
          home_city_2: string | null
          hourly_cost: number | null
          iban: string | null
          id: string
          last_name: string
          latitude: number | null
          latitude_2: number | null
          longitude: number | null
          longitude_2: number | null
          nationality: string | null
          notes: string | null
          phone: string | null
          postcode: string | null
          postcode_2: string | null
          prospect_applied_on: string | null
          prospect_next_action_on: string | null
          prospect_notes: string | null
          prospect_source: string | null
          prospect_status:
            | Database["public"]["Enums"]["prospect_pipeline_status"]
            | null
          seniority: Database["public"]["Enums"]["crew_seniority"]
          shirt_size: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["crew_status"]
          street: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_2?: string | null
          address_2_label?: string | null
          address_label?: string | null
          created_at?: string
          crew_code: string
          date_of_birth?: string | null
          drivers_license_number?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          external_id?: string | null
          first_name: string
          has_car?: boolean
          has_license?: boolean
          home_city?: string | null
          home_city_2?: string | null
          hourly_cost?: number | null
          iban?: string | null
          id?: string
          last_name: string
          latitude?: number | null
          latitude_2?: number | null
          longitude?: number | null
          longitude_2?: number | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          postcode?: string | null
          postcode_2?: string | null
          prospect_applied_on?: string | null
          prospect_next_action_on?: string | null
          prospect_notes?: string | null
          prospect_source?: string | null
          prospect_status?:
            | Database["public"]["Enums"]["prospect_pipeline_status"]
            | null
          seniority?: Database["public"]["Enums"]["crew_seniority"]
          shirt_size?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["crew_status"]
          street?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_2?: string | null
          address_2_label?: string | null
          address_label?: string | null
          created_at?: string
          crew_code?: string
          date_of_birth?: string | null
          drivers_license_number?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          external_id?: string | null
          first_name?: string
          has_car?: boolean
          has_license?: boolean
          home_city?: string | null
          home_city_2?: string | null
          hourly_cost?: number | null
          iban?: string | null
          id?: string
          last_name?: string
          latitude?: number | null
          latitude_2?: number | null
          longitude?: number | null
          longitude_2?: number | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          postcode?: string | null
          postcode_2?: string | null
          prospect_applied_on?: string | null
          prospect_next_action_on?: string | null
          prospect_notes?: string | null
          prospect_source?: string | null
          prospect_status?:
            | Database["public"]["Enums"]["prospect_pipeline_status"]
            | null
          seniority?: Database["public"]["Enums"]["crew_seniority"]
          shirt_size?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["crew_status"]
          street?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      crew_documents: {
        Row: {
          created_at: string
          crew_id: string
          doc_type: Database["public"]["Enums"]["crew_document_type"]
          expires_on: string | null
          file_path: string | null
          id: string
          issued_on: string | null
          notes: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          doc_type?: Database["public"]["Enums"]["crew_document_type"]
          expires_on?: string | null
          file_path?: string | null
          id?: string
          issued_on?: string | null
          notes?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          doc_type?: Database["public"]["Enums"]["crew_document_type"]
          expires_on?: string | null
          file_path?: string | null
          id?: string
          issued_on?: string | null
          notes?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_documents_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_skills: {
        Row: {
          certified: boolean
          created_at: string
          crew_id: string
          id: string
          level: Database["public"]["Enums"]["skill_level"]
          skill_id: string
        }
        Insert: {
          certified?: boolean
          created_at?: string
          crew_id: string
          id?: string
          level?: Database["public"]["Enums"]["skill_level"]
          skill_id: string
        }
        Update: {
          certified?: boolean
          created_at?: string
          crew_id?: string
          id?: string
          level?: Database["public"]["Enums"]["skill_level"]
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_skills_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      event_required_skills: {
        Row: {
          count: number
          event_id: string
          id: string
          skill_id: string
        }
        Insert: {
          count?: number
          event_id: string
          id?: string
          skill_id: string
        }
        Update: {
          count?: number
          event_id?: string
          id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_required_skills_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_required_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      event_transport: {
        Row: {
          created_at: string
          driver_crew_id: string
          event_id: string
          id: string
          pickup_point: string | null
          vehicle_capacity: number
        }
        Insert: {
          created_at?: string
          driver_crew_id: string
          event_id: string
          id?: string
          pickup_point?: string | null
          vehicle_capacity?: number
        }
        Update: {
          created_at?: string
          driver_crew_id?: string
          event_id?: string
          id?: string
          pickup_point?: string | null
          vehicle_capacity?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_transport_driver_crew_id_fkey"
            columns: ["driver_crew_id"]
            isOneToOne: false
            referencedRelation: "crew"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_transport_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address: string | null
          charge_rate: number | null
          client: string | null
          created_at: string
          crew_needed: number
          end_datetime: string
          external_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          recurrence_group_id: string | null
          start_datetime: string
          status: Database["public"]["Enums"]["event_status"]
          updated_at: string
          venue: string | null
        }
        Insert: {
          address?: string | null
          charge_rate?: number | null
          client?: string | null
          created_at?: string
          crew_needed?: number
          end_datetime: string
          external_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          recurrence_group_id?: string | null
          start_datetime: string
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
          venue?: string | null
        }
        Update: {
          address?: string | null
          charge_rate?: number | null
          client?: string | null
          created_at?: string
          crew_needed?: number
          end_datetime?: string
          external_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          recurrence_group_id?: string | null
          start_datetime?: string
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          channel: string
          created_at: string
          created_by: string | null
          crew_id: string | null
          error: string | null
          event_id: string | null
          id: string
          sent_at: string | null
          status: string
          subject: string | null
          to_address: string | null
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          error?: string | null
          event_id?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_address?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          error?: string | null
          event_id?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          }
        ]
      }
      integration_sync: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          external_id: string
          id: string
          last_synced_at: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          sync_data: Json | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          external_id: string
          id?: string
          last_synced_at?: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          sync_data?: Json | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          external_id?: string
          id?: string
          last_synced_at?: string | null
          provider?: Database["public"]["Enums"]["integration_provider"]
          sync_data?: Json | null
        }
        Relationships: []
      }
      skills: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_has: { Args: { perm: string }; Returns: boolean }
      current_crew_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      assignment_status:
        | "proposed"
        | "invited"
        | "confirmed"
        | "declined"
        | "checked_in"
      availability_status: "B" | "M" | "X" | "W" | "V"
      crew_document_type:
        | "vog"
        | "vca"
        | "bhv"
        | "ehbo"
        | "drivers_license"
        | "id_document"
        | "insurance"
        | "contract"
        | "diploma"
        | "other"
      crew_seniority: "sitecrew" | "senior" | "teamlead"
      crew_status: "active" | "inactive" | "prospect"
      entity_type: "crew" | "event" | "assignment"
      event_status: "draft" | "planned" | "confirmed" | "done" | "cancelled"
      integration_provider:
        | "shift_platform"
        | "calcom"
        | "whatsapp"
        | "google_workspace"
        | "manual"
      prospect_pipeline_status:
        | "new"
        | "contacted"
        | "intake_planned"
        | "intake_done"
        | "hired"
        | "rejected"
      skill_level: "basic" | "intermediate" | "expert"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      assignment_status: [
        "proposed",
        "invited",
        "confirmed",
        "declined",
        "checked_in",
      ],
      availability_status: ["B", "M", "X", "W", "V"],
      crew_document_type: [
        "vog",
        "vca",
        "bhv",
        "ehbo",
        "drivers_license",
        "id_document",
        "insurance",
        "contract",
        "diploma",
        "other",
      ],
      crew_seniority: ["sitecrew", "senior", "teamlead"],
      crew_status: ["active", "inactive", "prospect"],
      entity_type: ["crew", "event", "assignment"],
      event_status: ["draft", "planned", "confirmed", "done", "cancelled"],
      integration_provider: [
        "shift_platform",
        "calcom",
        "whatsapp",
        "google_workspace",
        "manual",
      ],
      prospect_pipeline_status: [
        "new",
        "contacted",
        "intake_planned",
        "intake_done",
        "hired",
        "rejected",
      ],
      skill_level: ["basic", "intermediate", "expert"],
    },
  },
} as const
