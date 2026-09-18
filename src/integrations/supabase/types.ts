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
      accounting_report_deliveries: {
        Row: {
          created_at: string
          doctor_slot: number
          error: string | null
          id: string
          month: number
          ok: boolean
          scope: string
          sent_at: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          doctor_slot?: number
          error?: string | null
          id?: string
          month: number
          ok?: boolean
          scope: string
          sent_at?: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          doctor_slot?: number
          error?: string | null
          id?: string
          month?: number
          ok?: boolean
          scope?: string
          sent_at?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      accounting_reviews: {
        Row: {
          created_at: string
          doctor_slot: number
          id: string
          month: number
          reviewed: boolean
          reviewed_at: string
          reviewed_by: string | null
          scope: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          doctor_slot?: number
          id?: string
          month: number
          reviewed?: boolean
          reviewed_at?: string
          reviewed_by?: string | null
          scope: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          doctor_slot?: number
          id?: string
          month?: number
          reviewed?: boolean
          reviewed_at?: string
          reviewed_by?: string | null
          scope?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          bool_value: boolean
          key: string
          updated_at: string
        }
        Insert: {
          bool_value?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          bool_value?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      avatar_overrides: {
        Row: {
          image_url: string
          label: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          image_url: string
          label?: string | null
          subject: string
          updated_at?: string
        }
        Update: {
          image_url?: string
          label?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      case_revision_rounds: {
        Row: {
          case_code: string | null
          case_id: string
          doctor_name: string | null
          doctor_notes: string | null
          doctor_slot: number | null
          html_name: string | null
          html_path: string | null
          html_sent_at: string | null
          id: string
          patient_name: string | null
          rar_name: string | null
          rar_path: string | null
          rar_sent_at: string | null
          requested_at: string
          round: number
          shade: string | null
        }
        Insert: {
          case_code?: string | null
          case_id: string
          doctor_name?: string | null
          doctor_notes?: string | null
          doctor_slot?: number | null
          html_name?: string | null
          html_path?: string | null
          html_sent_at?: string | null
          id?: string
          patient_name?: string | null
          rar_name?: string | null
          rar_path?: string | null
          rar_sent_at?: string | null
          requested_at?: string
          round?: number
          shade?: string | null
        }
        Update: {
          case_code?: string | null
          case_id?: string
          doctor_name?: string | null
          doctor_notes?: string | null
          doctor_slot?: number | null
          html_name?: string | null
          html_path?: string | null
          html_sent_at?: string | null
          id?: string
          patient_name?: string | null
          rar_name?: string | null
          rar_path?: string | null
          rar_sent_at?: string | null
          requested_at?: string
          round?: number
          shade?: string | null
        }
        Relationships: []
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
      device_registry: {
        Row: {
          blocked: boolean
          blocked_at: string | null
          device_id: string
          first_seen: string
          ip: string | null
          label: string | null
          last_path: string | null
          last_role: string | null
          last_seen: string
          platform: string | null
          user_agent: string | null
          visits: number
        }
        Insert: {
          blocked?: boolean
          blocked_at?: string | null
          device_id: string
          first_seen?: string
          ip?: string | null
          label?: string | null
          last_path?: string | null
          last_role?: string | null
          last_seen?: string
          platform?: string | null
          user_agent?: string | null
          visits?: number
        }
        Update: {
          blocked?: boolean
          blocked_at?: string | null
          device_id?: string
          first_seen?: string
          ip?: string | null
          label?: string | null
          last_path?: string | null
          last_role?: string | null
          last_seen?: string
          platform?: string | null
          user_agent?: string | null
          visits?: number
        }
        Relationships: []
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
      doctor_point_withdrawals: {
        Row: {
          created_at: string
          doctor_slot: number
          id: string
          note: string | null
          points: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          doctor_slot: number
          id?: string
          note?: string | null
          points?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          doctor_slot?: number
          id?: string
          note?: string | null
          points?: number
          updated_at?: string
        }
        Relationships: []
      }
      doctor_profiles: {
        Row: {
          active: boolean
          branch: string | null
          created_at: string
          icon: string | null
          name: string
          slot: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          branch?: string | null
          created_at?: string
          icon?: string | null
          name: string
          slot: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          branch?: string | null
          created_at?: string
          icon?: string | null
          name?: string
          slot?: number
          updated_at?: string
        }
        Relationships: []
      }
      doctor_secrets: {
        Row: {
          created_at: string
          password: string
          slot: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          password: string
          slot: number
          updated_at?: string
        }
        Update: {
          created_at?: string
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
      push_config: {
        Row: {
          admin_contact: string
          dispatch_secret: string
          endpoint_url: string
          id: boolean
          vapid_private: string
          vapid_public: string
        }
        Insert: {
          admin_contact?: string
          dispatch_secret: string
          endpoint_url: string
          id?: boolean
          vapid_private: string
          vapid_public: string
        }
        Update: {
          admin_contact?: string
          dispatch_secret?: string
          endpoint_url?: string
          id?: boolean
          vapid_private?: string
          vapid_public?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          doctor_slot: number | null
          endpoint: string
          id: string
          p256dh: string
          role: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          doctor_slot?: number | null
          endpoint: string
          id?: string
          p256dh: string
          role: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          doctor_slot?: number | null
          endpoint?: string
          id?: string
          p256dh?: string
          role?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      slot_cases: {
        Row: {
          after_photo_name: string | null
          after_photo_path: string | null
          after_photo_sent_at: string | null
          archive_approval: string | null
          archive_receipt_mime: string | null
          archive_receipt_name: string | null
          archive_receipt_path: string | null
          archive_receipt_sent_at: string | null
          archive_receipt_size: number | null
          archive_reject_reason: string | null
          archive_request_note: string | null
          archive_reviewed_at: string | null
          archive_reviewed_by: string | null
          archived: boolean
          audit_log: Json
          before_photo_name: string | null
          before_photo_path: string | null
          before_photo_sent_at: string | null
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
          extra_zip_mime: string | null
          extra_zip_name: string | null
          extra_zip_path: string | null
          extra_zip_size: number | null
          fabrication_done: boolean
          fabrication_file_sent: boolean
          final_archived: boolean
          id: string
          idempotency_key: string | null
          new_delivered_at: string | null
          new_read_at: string | null
          notes: string | null
          notes_image_comments: Json
          notes_images: Json
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
          ready_zircon_sent_at: string | null
          received_permanent: boolean
          received_temporary: boolean
          remaining_amount: number | null
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
          tech_exec_notes: string | null
          teeth_count: string | null
          temporary_delivered: boolean
          tooth_number: string | null
          updated_at: string
        }
        Insert: {
          after_photo_name?: string | null
          after_photo_path?: string | null
          after_photo_sent_at?: string | null
          archive_approval?: string | null
          archive_receipt_mime?: string | null
          archive_receipt_name?: string | null
          archive_receipt_path?: string | null
          archive_receipt_sent_at?: string | null
          archive_receipt_size?: number | null
          archive_reject_reason?: string | null
          archive_request_note?: string | null
          archive_reviewed_at?: string | null
          archive_reviewed_by?: string | null
          archived?: boolean
          audit_log?: Json
          before_photo_name?: string | null
          before_photo_path?: string | null
          before_photo_sent_at?: string | null
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
          extra_zip_mime?: string | null
          extra_zip_name?: string | null
          extra_zip_path?: string | null
          extra_zip_size?: number | null
          fabrication_done?: boolean
          fabrication_file_sent?: boolean
          final_archived?: boolean
          id?: string
          idempotency_key?: string | null
          new_delivered_at?: string | null
          new_read_at?: string | null
          notes?: string | null
          notes_image_comments?: Json
          notes_images?: Json
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
          ready_zircon_sent_at?: string | null
          received_permanent?: boolean
          received_temporary?: boolean
          remaining_amount?: number | null
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
          tech_exec_notes?: string | null
          teeth_count?: string | null
          temporary_delivered?: boolean
          tooth_number?: string | null
          updated_at?: string
        }
        Update: {
          after_photo_name?: string | null
          after_photo_path?: string | null
          after_photo_sent_at?: string | null
          archive_approval?: string | null
          archive_receipt_mime?: string | null
          archive_receipt_name?: string | null
          archive_receipt_path?: string | null
          archive_receipt_sent_at?: string | null
          archive_receipt_size?: number | null
          archive_reject_reason?: string | null
          archive_request_note?: string | null
          archive_reviewed_at?: string | null
          archive_reviewed_by?: string | null
          archived?: boolean
          audit_log?: Json
          before_photo_name?: string | null
          before_photo_path?: string | null
          before_photo_sent_at?: string | null
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
          extra_zip_mime?: string | null
          extra_zip_name?: string | null
          extra_zip_path?: string | null
          extra_zip_size?: number | null
          fabrication_done?: boolean
          fabrication_file_sent?: boolean
          final_archived?: boolean
          id?: string
          idempotency_key?: string | null
          new_delivered_at?: string | null
          new_read_at?: string | null
          notes?: string | null
          notes_image_comments?: Json
          notes_images?: Json
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
          ready_zircon_sent_at?: string | null
          received_permanent?: boolean
          received_temporary?: boolean
          remaining_amount?: number | null
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
          tech_exec_notes?: string | null
          teeth_count?: string | null
          temporary_delivered?: boolean
          tooth_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      staff_month_settlements: {
        Row: {
          created_at: string
          id: string
          month: number
          scope: string
          settled: boolean
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          month: number
          scope: string
          settled?: boolean
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          month?: number
          scope?: string
          settled?: boolean
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      staff_secrets: {
        Row: {
          password: string
          role: string
          updated_at: string
        }
        Insert: {
          password: string
          role: string
          updated_at?: string
        }
        Update: {
          password?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_sessions: {
        Row: {
          device_id: string
          role: string
          updated_at: string
        }
        Insert: {
          device_id: string
          role: string
          updated_at?: string
        }
        Update: {
          device_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      telegram_outbox: {
        Row: {
          attempts: number
          caption: string
          caption_sent: boolean
          created_at: string
          documents: Json
          id: string
          last_error: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          caption: string
          caption_sent?: boolean
          created_at?: string
          documents?: Json
          id?: string
          last_error?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          caption?: string
          caption_sent?: boolean
          created_at?: string
          documents?: Json
          id?: string
          last_error?: string | null
          sent_at?: string | null
          status?: string
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
      check_staff_session: {
        Args: { p_device: string; p_role: string }
        Returns: boolean
      }
      claim_staff_session: {
        Args: { p_device: string; p_role: string }
        Returns: undefined
      }
      clear_avatar_override: { Args: { p_subject: string }; Returns: undefined }
      clear_staff_session: {
        Args: { p_device: string; p_role: string }
        Returns: undefined
      }
      delete_device: {
        Args: { p_admin_password?: string; p_device_id: string }
        Returns: undefined
      }
      get_app_flag: { Args: { p_key: string }; Returns: boolean }
      get_primary_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_staff_password: { Args: { p_role: string }; Returns: string }
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
      is_admin_actor: { Args: { p_admin_password?: string }; Returns: boolean }
      is_device_blocked: { Args: { p_device_id: string }; Returns: boolean }
      list_devices: {
        Args: { p_admin_password?: string }
        Returns: {
          blocked: boolean
          blocked_at: string | null
          device_id: string
          first_seen: string
          ip: string | null
          label: string | null
          last_path: string | null
          last_role: string | null
          last_seen: string
          platform: string | null
          user_agent: string | null
          visits: number
        }[]
        SetofOptions: {
          from: "*"
          to: "device_registry"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_doctor_secrets: {
        Args: never
        Returns: {
          active: boolean
          name: string
          password: string
          slot: number
        }[]
      }
      list_staff_secrets: {
        Args: never
        Returns: {
          password: string
          role: string
          updated_at: string
        }[]
      }
      prune_push_subscription: {
        Args: { p_id: string; p_secret: string }
        Returns: undefined
      }
      register_device: {
        Args: {
          p_device_id: string
          p_ip?: string
          p_path?: string
          p_platform?: string
          p_role?: string
          p_user_agent?: string
        }
        Returns: boolean
      }
      remove_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      resolve_push_targets: {
        Args: { p_conversation: string; p_secret: string; p_sender: string }
        Returns: Json
      }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_role: string
          p_slot: number
          p_user_agent: string
        }
        Returns: undefined
      }
      set_app_flag: {
        Args: { p_admin_password?: string; p_key: string; p_value: boolean }
        Returns: undefined
      }
      set_avatar_override: {
        Args: { p_image_url: string; p_label: string; p_subject: string }
        Returns: undefined
      }
      set_device_blocked: {
        Args: {
          p_admin_password?: string
          p_blocked: boolean
          p_device_id: string
        }
        Returns: undefined
      }
      set_device_label: {
        Args: {
          p_admin_password?: string
          p_device_id: string
          p_label: string
        }
        Returns: undefined
      }
      set_doctor_active: {
        Args: { p_active: boolean; p_slot: number }
        Returns: undefined
      }
      set_doctor_secret: {
        Args: { p_password: string; p_slot: number }
        Returns: undefined
      }
      set_staff_secret: {
        Args: { p_password: string; p_role: string }
        Returns: undefined
      }
      upsert_doctor: {
        Args: {
          p_active: boolean
          p_branch: string
          p_name: string
          p_slot: number
        }
        Returns: undefined
      }
      verify_doctor_login: {
        Args: { p_password: string }
        Returns: {
          active: boolean
          name: string
          slot: number
        }[]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
