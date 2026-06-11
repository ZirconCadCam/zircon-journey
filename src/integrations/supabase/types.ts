export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      case_files: {
        Row: {
          case_id: string
          created_at: string
          file_kind: string
          file_name: string
          file_path: string
          file_type: string | null
          id: string
          size_bytes: number | null
          uploader_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          file_kind?: string
          file_name: string
          file_path: string
          file_type?: string | null
          id?: string
          size_bytes?: number | null
          uploader_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          file_kind?: string
          file_name?: string
          file_path?: string
          file_type?: string | null
          id?: string
          size_bytes?: number | null
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_files_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_messages: {
        Row: {
          case_id: string
          content: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          case_id: string
          content: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          case_id?: string
          content?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          branch: Database["public"]["Enums"]["branch"]
          case_code: string
          created_at: string
          designer_id: string | null
          doctor_id: string
          id: string
          notes: string | null
          patient_age: number | null
          patient_name: string
          patient_phone: string | null
          shade: string | null
          status: Database["public"]["Enums"]["case_status"]
          technician_id: string | null
          tooth_number: string | null
          updated_at: string
        }
        Insert: {
          branch: Database["public"]["Enums"]["branch"]
          case_code?: string
          created_at?: string
          designer_id?: string | null
          doctor_id: string
          id?: string
          notes?: string | null
          patient_age?: number | null
          patient_name: string
          patient_phone?: string | null
          shade?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          technician_id?: string | null
          tooth_number?: string | null
          updated_at?: string
        }
        Update: {
          branch?: Database["public"]["Enums"]["branch"]
          case_code?: string
          created_at?: string
          designer_id?: string | null
          doctor_id?: string
          id?: string
          notes?: string | null
          patient_age?: number | null
          patient_name?: string
          patient_phone?: string | null
          shade?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          technician_id?: string | null
          tooth_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string
          doctor_slot: number
          id: string
          last_message_at: string
          participants: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string
          doctor_slot: number
          id?: string
          last_message_at?: string
          participants: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string
          doctor_slot?: number
          id?: string
          last_message_at?: string
          participants?: string[]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_doctor_slot_fkey"
            columns: ["doctor_slot"]
            isOneToOne: false
            referencedRelation: "doctor_profiles"
            referencedColumns: ["slot"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachment_mime: string | null
          attachment_name: string | null
          attachment_path: string | null
          attachment_size: number | null
          content: string
          conversation_id: string
          created_at: string
          delivered_at: string | null
          edited_at: string | null
          id: string
          message_type: string
          read_at: string | null
          read_by: string[]
          sender: string
          sender_name: string | null
        }
        Insert: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          content?: string
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          read_at?: string | null
          read_by?: string[]
          sender: string
          sender_name?: string | null
        }
        Update: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          content?: string
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          read_at?: string | null
          read_by?: string[]
          sender?: string
          sender_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_files: {
        Row: {
          archived: boolean
          created_at: string
          doctor_slot: number
          file_name: string
          file_path: string
          id: string
          public_url: string | null
          size_bytes: number | null
          uploaded_by: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          doctor_slot: number
          file_name: string
          file_path: string
          id?: string
          public_url?: string | null
          size_bytes?: number | null
          uploaded_by?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          doctor_slot?: number
          file_name?: string
          file_path?: string
          id?: string
          public_url?: string | null
          size_bytes?: number | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_files_doctor_slot_fkey"
            columns: ["doctor_slot"]
            isOneToOne: false
            referencedRelation: "doctor_profiles"
            referencedColumns: ["slot"]
          },
        ]
      }
      doctor_messages: {
        Row: {
          attachment_mime: string | null
          attachment_name: string | null
          attachment_size: number | null
          attachment_url: string | null
          content: string
          created_at: string
          doctor_slot: number
          id: string
          message_type: string
          read_by_admin: boolean
          read_by_designer: boolean
          read_by_doctor: boolean
          read_by_secretary: boolean
          read_by_technician: boolean
          sender: string
          sender_name: string | null
        }
        Insert: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_url?: string | null
          content: string
          created_at?: string
          doctor_slot: number
          id?: string
          message_type?: string
          read_by_admin?: boolean
          read_by_designer?: boolean
          read_by_doctor?: boolean
          read_by_secretary?: boolean
          read_by_technician?: boolean
          sender: string
          sender_name?: string | null
        }
        Update: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_url?: string | null
          content?: string
          created_at?: string
          doctor_slot?: number
          id?: string
          message_type?: string
          read_by_admin?: boolean
          read_by_designer?: boolean
          read_by_doctor?: boolean
          read_by_secretary?: boolean
          read_by_technician?: boolean
          sender?: string
          sender_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_messages_doctor_slot_fkey"
            columns: ["doctor_slot"]
            isOneToOne: false
            referencedRelation: "doctor_profiles"
            referencedColumns: ["slot"]
          },
        ]
      }
      doctor_profiles: {
        Row: {
          active: boolean
          branch: string | null
          created_at: string
          icon: string | null
          name: string
          password: string
          slot: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          branch?: string | null
          created_at?: string
          icon?: string | null
          name: string
          password: string
          slot: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          branch?: string | null
          created_at?: string
          icon?: string | null
          name?: string
          password?: string
          slot?: number
          updated_at?: string
        }
        Relationships: []
      }
      file_activity: {
        Row: {
          action: string
          actor: string | null
          actor_role: string | null
          case_id: string
          created_at: string
          file_name: string
          id: string
          size_bytes: number | null
          status: string
        }
        Insert: {
          action: string
          actor?: string | null
          actor_role?: string | null
          case_id: string
          created_at?: string
          file_name: string
          id?: string
          size_bytes?: number | null
          status?: string
        }
        Update: {
          action?: string
          actor?: string | null
          actor_role?: string | null
          case_id?: string
          created_at?: string
          file_name?: string
          id?: string
          size_bytes?: number | null
          status?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          case_id: string | null
          created_at: string
          id: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          case_id?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          case_id?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          branch: Database["public"]["Enums"]["branch"] | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          branch?: Database["public"]["Enums"]["branch"] | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          branch?: Database["public"]["Enums"]["branch"] | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      slot_cases: {
        Row: {
          archived: boolean
          audit_log: Json
          case_code: string
          case_type: string | null
          created_at: string
          created_by: string
          design_delivered_at: string | null
          design_done: boolean
          design_file_sent: boolean
          design_html_name: string | null
          design_html_path: string | null
          design_html_sent: boolean
          design_read_at: string | null
          design_received_by_tech: boolean
          design_sent_at: string | null
          doctor_decision: string | null
          doctor_slot: number
          fabrication_done: boolean
          fabrication_file_sent: boolean
          final_archived: boolean
          id: string
          idempotency_key: string | null
          new_delivered_at: string | null
          new_read_at: string | null
          notes: string | null
          patient_age: number | null
          patient_gender: string | null
          patient_name: string
          patient_phone: string | null
          perm_delivered_at: string | null
          perm_read_at: string | null
          perm_sent_at: string | null
          perm_ship_delivered_at: string | null
          perm_ship_read_at: string | null
          perm_ship_sent_at: string | null
          permanent_delivered_to_doctor: boolean
          permanent_fabrication_done: boolean
          permanent_installed_by_doctor: boolean
          permanent_received_by_secretary: boolean
          permanent_shipped_to_secretary: boolean
          pinned: boolean
          received_permanent: boolean
          received_temporary: boolean
          review_delivered_at: string | null
          review_read_at: string | null
          review_sent_at: string | null
          revision_approved_by_tech: boolean
          revision_design_done: boolean
          revision_design_file_name: string | null
          revision_design_file_path: string | null
          revision_notes: string | null
          scan_mime: string | null
          scan_name: string | null
          scan_path: string | null
          scan_size: number | null
          secretary_received: boolean
          shade: string | null
          shade_confirmed_designer: boolean
          shade_confirmed_doctor: boolean
          shade_confirmed_technician: boolean
          shipped_to_doctor: boolean
          status: string
          tech_data_sent_to_secretary: boolean
          teeth_count: string | null
          temporary_delivered: boolean
          tooth_number: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          audit_log?: Json
          case_code?: string
          case_type?: string | null
          created_at?: string
          created_by?: string
          design_delivered_at?: string | null
          design_done?: boolean
          design_file_sent?: boolean
          design_html_name?: string | null
          design_html_path?: string | null
          design_html_sent?: boolean
          design_read_at?: string | null
          design_received_by_tech?: boolean
          design_sent_at?: string | null
          doctor_decision?: string | null
          doctor_slot: number
          fabrication_done?: boolean
          fabrication_file_sent?: boolean
          final_archived?: boolean
          id?: string
          idempotency_key?: string | null
          new_delivered_at?: string | null
          new_read_at?: string | null
          notes?: string | null
          patient_age?: number | null
          patient_gender?: string | null
          patient_name: string
          patient_phone?: string | null
          perm_delivered_at?: string | null
          perm_read_at?: string | null
          perm_sent_at?: string | null
          perm_ship_delivered_at?: string | null
          perm_ship_read_at?: string | null
          perm_ship_sent_at?: string | null
          permanent_delivered_to_doctor?: boolean
          permanent_fabrication_done?: boolean
          permanent_installed_by_doctor?: boolean
          permanent_received_by_secretary?: boolean
          permanent_shipped_to_secretary?: boolean
          pinned?: boolean
          received_permanent?: boolean
          received_temporary?: boolean
          review_delivered_at?: string | null
          review_read_at?: string | null
          review_sent_at?: string | null
          revision_approved_by_tech?: boolean
          revision_design_done?: boolean
          revision_design_file_name?: string | null
          revision_design_file_path?: string | null
          revision_notes?: string | null
          scan_mime?: string | null
          scan_name?: string | null
          scan_path?: string | null
          scan_size?: number | null
          secretary_received?: boolean
          shade?: string | null
          shade_confirmed_designer?: boolean
          shade_confirmed_doctor?: boolean
          shade_confirmed_technician?: boolean
          shipped_to_doctor?: boolean
          status?: string
          tech_data_sent_to_secretary?: boolean
          teeth_count?: string | null
          temporary_delivered?: boolean
          tooth_number?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          audit_log?: Json
          case_code?: string
          case_type?: string | null
          created_at?: string
          created_by?: string
          design_delivered_at?: string | null
          design_done?: boolean
          design_file_sent?: boolean
          design_html_name?: string | null
          design_html_path?: string | null
          design_html_sent?: boolean
          design_read_at?: string | null
          design_received_by_tech?: boolean
          design_sent_at?: string | null
          doctor_decision?: string | null
          doctor_slot?: number
          fabrication_done?: boolean
          fabrication_file_sent?: boolean
          final_archived?: boolean
          id?: string
          idempotency_key?: string | null
          new_delivered_at?: string | null
          new_read_at?: string | null
          notes?: string | null
          patient_age?: number | null
          patient_gender?: string | null
          patient_name?: string
          patient_phone?: string | null
          perm_delivered_at?: string | null
          perm_read_at?: string | null
          perm_sent_at?: string | null
          perm_ship_delivered_at?: string | null
          perm_ship_read_at?: string | null
          perm_ship_sent_at?: string | null
          permanent_delivered_to_doctor?: boolean
          permanent_fabrication_done?: boolean
          permanent_installed_by_doctor?: boolean
          permanent_received_by_secretary?: boolean
          permanent_shipped_to_secretary?: boolean
          pinned?: boolean
          received_permanent?: boolean
          received_temporary?: boolean
          review_delivered_at?: string | null
          review_read_at?: string | null
          review_sent_at?: string | null
          revision_approved_by_tech?: boolean
          revision_design_done?: boolean
          revision_design_file_name?: string | null
          revision_design_file_path?: string | null
          revision_notes?: string | null
          scan_mime?: string | null
          scan_name?: string | null
          scan_path?: string | null
          scan_size?: number | null
          secretary_received?: boolean
          shade?: string | null
          shade_confirmed_designer?: boolean
          shade_confirmed_doctor?: boolean
          shade_confirmed_technician?: boolean
          shipped_to_doctor?: boolean
          status?: string
          tech_data_sent_to_secretary?: boolean
          teeth_count?: string | null
          temporary_delivered?: boolean
          tooth_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          branch: Database["public"]["Enums"]["branch"] | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          branch?: Database["public"]["Enums"]["branch"] | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          branch?: Database["public"]["Enums"]["branch"] | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_primary_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_branch: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["branch"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "doctor" | "designer" | "technician" | "secretary"
      branch: "sanaa" | "ibb"
      case_status:
        | "new"
        | "designing"
        | "design_ready"
        | "milling"
        | "ready"
        | "delivered"
        | "archived"
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
      app_role: ["admin", "doctor", "designer", "technician", "secretary"],
      branch: ["sanaa", "ibb"],
      case_status: [
        "new",
        "designing",
        "design_ready",
        "milling",
        "ready",
        "delivered",
        "archived",
      ],
    },
  },
} as const
