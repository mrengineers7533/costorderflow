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
      activity_event_reads: {
        Row: {
          event_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          event_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          event_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_event_reads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_events: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          actor_name: string | null
          boq_id: string | null
          created_at: string
          event_type: string
          id: string
          message: string | null
          metadata: Json
          module: string
          order_id: string | null
          order_root_id: string | null
          pi_id: string | null
          requisition_id: string | null
          status: string
          title: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          actor_name?: string | null
          boq_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json
          module: string
          order_id?: string | null
          order_root_id?: string | null
          pi_id?: string | null
          requisition_id?: string | null
          status?: string
          title: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          actor_name?: string | null
          boq_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json
          module?: string
          order_id?: string | null
          order_root_id?: string | null
          pi_id?: string | null
          requisition_id?: string | null
          status?: string
          title?: string
        }
        Relationships: []
      }
      allowed_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          is_protected: boolean
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          is_protected?: boolean
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          is_protected?: boolean
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      boq_design_review_documents: {
        Row: {
          boq_item_id: string | null
          created_at: string
          file_name: string
          file_path: string
          id: string
          review_id: string
          source: string
          uploaded_by_email: string | null
        }
        Insert: {
          boq_item_id?: string | null
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          review_id: string
          source: string
          uploaded_by_email?: string | null
        }
        Update: {
          boq_item_id?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          review_id?: string
          source?: string
          uploaded_by_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boq_design_review_documents_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "boq_design_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      boq_design_review_email_log: {
        Row: {
          created_at: string
          error: string | null
          gmail_message_id: string | null
          id: string
          review_id: string | null
          status: string
          subject: string | null
          to_email: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          gmail_message_id?: string | null
          id?: string
          review_id?: string | null
          status: string
          subject?: string | null
          to_email: string
        }
        Update: {
          created_at?: string
          error?: string | null
          gmail_message_id?: string | null
          id?: string
          review_id?: string | null
          status?: string
          subject?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "boq_design_review_email_log_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "boq_design_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      boq_design_review_items: {
        Row: {
          boq_item_id: string
          column_comments: Json
          comment: string | null
          created_at: string
          decided_at: string | null
          decision: string
          description: string | null
          design_change_note: string | null
          id: string
          item_no: string | null
          model_number: string | null
          quantity: number | null
          remarks: string | null
          review_id: string
          unit: string | null
        }
        Insert: {
          boq_item_id: string
          column_comments?: Json
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decision?: string
          description?: string | null
          design_change_note?: string | null
          id?: string
          item_no?: string | null
          model_number?: string | null
          quantity?: number | null
          remarks?: string | null
          review_id: string
          unit?: string | null
        }
        Update: {
          boq_item_id?: string
          column_comments?: Json
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decision?: string
          description?: string | null
          design_change_note?: string | null
          id?: string
          item_no?: string | null
          model_number?: string | null
          quantity?: number | null
          remarks?: string | null
          review_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boq_design_review_items_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "boq_design_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      boq_design_reviews: {
        Row: {
          boq_id: string
          boq_snapshot: Json
          created_at: string
          expires_at: string
          id: string
          kind: string
          overall_outcome: string | null
          recipients: string[]
          reviewer_contact: string | null
          reviewer_design_team: string | null
          reviewer_name: string | null
          round_no: number
          sent_at: string
          sent_by: string | null
          sent_by_email: string | null
          sent_message: string | null
          status: string
          submitted_at: string | null
          submitted_by_email: string | null
          token: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          boq_id: string
          boq_snapshot?: Json
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          overall_outcome?: string | null
          recipients?: string[]
          reviewer_contact?: string | null
          reviewer_design_team?: string | null
          reviewer_name?: string | null
          round_no?: number
          sent_at?: string
          sent_by?: string | null
          sent_by_email?: string | null
          sent_message?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by_email?: string | null
          token?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          boq_id?: string
          boq_snapshot?: Json
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          overall_outcome?: string | null
          recipients?: string[]
          reviewer_contact?: string | null
          reviewer_design_team?: string | null
          reviewer_name?: string | null
          round_no?: number
          sent_at?: string
          sent_by?: string | null
          sent_by_email?: string | null
          sent_message?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by_email?: string | null
          token?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      boq_distribution_log: {
        Row: {
          boq_id: string
          created_at: string
          error: string | null
          factory_emails: string[]
          family_token: string
          id: string
          message: string | null
          order_root_id: string
          purchase_emails: string[]
          revision: number
          sent_by: string | null
          sent_by_email: string | null
          status: string
        }
        Insert: {
          boq_id: string
          created_at?: string
          error?: string | null
          factory_emails?: string[]
          family_token: string
          id?: string
          message?: string | null
          order_root_id: string
          purchase_emails?: string[]
          revision: number
          sent_by?: string | null
          sent_by_email?: string | null
          status?: string
        }
        Update: {
          boq_id?: string
          created_at?: string
          error?: string | null
          factory_emails?: string[]
          family_token?: string
          id?: string
          message?: string | null
          order_root_id?: string
          purchase_emails?: string[]
          revision?: number
          sent_by?: string | null
          sent_by_email?: string | null
          status?: string
        }
        Relationships: []
      }
      boq_family_share_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          order_root_id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          order_root_id: string
          revoked_at?: string | null
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          order_root_id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: []
      }
      boq_item_attachments: {
        Row: {
          boq_id: string
          boq_item_id: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          boq_id: string
          boq_item_id: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          boq_id?: string
          boq_item_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boq_item_attachments_boq_id_fkey"
            columns: ["boq_id"]
            isOneToOne: false
            referencedRelation: "boqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boq_item_attachments_boq_id_fkey"
            columns: ["boq_id"]
            isOneToOne: false
            referencedRelation: "v_entity_pending_state"
            referencedColumns: ["latest_boq_id"]
          },
        ]
      }
      boq_remarks_audit_log: {
        Row: {
          boq_id: string
          changed_by: string | null
          changed_by_email: string | null
          changed_by_name: string | null
          created_at: string
          id: string
          item_id: string
          item_no: string | null
          model_number: string | null
          new_remarks: string
          old_remarks: string | null
        }
        Insert: {
          boq_id: string
          changed_by?: string | null
          changed_by_email?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          item_id: string
          item_no?: string | null
          model_number?: string | null
          new_remarks: string
          old_remarks?: string | null
        }
        Update: {
          boq_id?: string
          changed_by?: string | null
          changed_by_email?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          item_id?: string
          item_no?: string | null
          model_number?: string | null
          new_remarks?: string
          old_remarks?: string | null
        }
        Relationships: []
      }
      boq_revisions: {
        Row: {
          boq_id: string
          created_at: string
          created_by: string | null
          design_review_status: string | null
          id: string
          line_items: Json
          review_items: Json
          reviewer_outcome: string | null
          revision_label: string
          revision_no: number
          round_no: number | null
          snapshot_note: string | null
        }
        Insert: {
          boq_id: string
          created_at?: string
          created_by?: string | null
          design_review_status?: string | null
          id?: string
          line_items?: Json
          review_items?: Json
          reviewer_outcome?: string | null
          revision_label: string
          revision_no: number
          round_no?: number | null
          snapshot_note?: string | null
        }
        Update: {
          boq_id?: string
          created_at?: string
          created_by?: string | null
          design_review_status?: string | null
          id?: string
          line_items?: Json
          review_items?: Json
          reviewer_outcome?: string | null
          revision_label?: string
          revision_no?: number
          round_no?: number | null
          snapshot_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boq_revisions_boq_id_fkey"
            columns: ["boq_id"]
            isOneToOne: false
            referencedRelation: "boqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boq_revisions_boq_id_fkey"
            columns: ["boq_id"]
            isOneToOne: false
            referencedRelation: "v_entity_pending_state"
            referencedColumns: ["latest_boq_id"]
          },
        ]
      }
      boqs: {
        Row: {
          boq_date: string
          boq_number: string
          client_name: string | null
          created_at: string
          design_review_status: string
          final_sent_at: string | null
          final_share_token: string | null
          format: Database["public"]["Enums"]["order_format"]
          id: string
          is_current: boolean
          line_items: Json
          notes: string | null
          order_id: string
          prepared_by: string | null
          project_number: string | null
          reference_oa_number: string | null
          revised_from_id: string | null
          revision: number
          source_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          terms: string | null
          updated_at: string
          user_id: string | null
          verification_requested_at: string | null
          verification_status: string
          verification_token: string | null
          verified_at: string | null
          verified_by_email: string | null
          version: number
        }
        Insert: {
          boq_date?: string
          boq_number: string
          client_name?: string | null
          created_at?: string
          design_review_status?: string
          final_sent_at?: string | null
          final_share_token?: string | null
          format: Database["public"]["Enums"]["order_format"]
          id?: string
          is_current?: boolean
          line_items?: Json
          notes?: string | null
          order_id: string
          prepared_by?: string | null
          project_number?: string | null
          reference_oa_number?: string | null
          revised_from_id?: string | null
          revision?: number
          source_order_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          terms?: string | null
          updated_at?: string
          user_id?: string | null
          verification_requested_at?: string | null
          verification_status?: string
          verification_token?: string | null
          verified_at?: string | null
          verified_by_email?: string | null
          version?: number
        }
        Update: {
          boq_date?: string
          boq_number?: string
          client_name?: string | null
          created_at?: string
          design_review_status?: string
          final_sent_at?: string | null
          final_share_token?: string | null
          format?: Database["public"]["Enums"]["order_format"]
          id?: string
          is_current?: boolean
          line_items?: Json
          notes?: string | null
          order_id?: string
          prepared_by?: string | null
          project_number?: string | null
          reference_oa_number?: string | null
          revised_from_id?: string | null
          revision?: number
          source_order_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          terms?: string | null
          updated_at?: string
          user_id?: string | null
          verification_requested_at?: string | null
          verification_status?: string
          verification_token?: string | null
          verified_at?: string | null
          verified_by_email?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "boqs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boqs_revised_from_id_fkey"
            columns: ["revised_from_id"]
            isOneToOne: false
            referencedRelation: "boqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boqs_revised_from_id_fkey"
            columns: ["revised_from_id"]
            isOneToOne: false
            referencedRelation: "v_entity_pending_state"
            referencedColumns: ["latest_boq_id"]
          },
          {
            foreignKeyName: "boqs_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      client_copies: {
        Row: {
          charges: Json
          created_at: string
          file_name: string
          file_path: string
          format: Database["public"]["Enums"]["order_format"]
          id: string
          line_items: Json
          order_id: string
          snapshot: Json
          totals: Json
          user_id: string | null
          version_label: string
        }
        Insert: {
          charges?: Json
          created_at?: string
          file_name: string
          file_path: string
          format: Database["public"]["Enums"]["order_format"]
          id?: string
          line_items?: Json
          order_id: string
          snapshot?: Json
          totals?: Json
          user_id?: string | null
          version_label: string
        }
        Update: {
          charges?: Json
          created_at?: string
          file_name?: string
          file_path?: string
          format?: Database["public"]["Enums"]["order_format"]
          id?: string
          line_items?: Json
          order_id?: string
          snapshot?: Json
          totals?: Json
          user_id?: string | null
          version_label?: string
        }
        Relationships: []
      }
      cost_sheets: {
        Row: {
          created_at: string
          extracted: Json
          file_path: string
          id: string
          original_filename: string
          parse_error: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          extracted?: Json
          file_path: string
          id?: string
          original_filename: string
          parse_error?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          extracted?: Json
          file_path?: string
          id?: string
          original_filename?: string
          parse_error?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      credit_removal_attempts: {
        Row: {
          action: string | null
          attempted_at: string
          id: string
          success: boolean
          user_identifier: string | null
        }
        Insert: {
          action?: string | null
          attempted_at?: string
          id?: string
          success: boolean
          user_identifier?: string | null
        }
        Update: {
          action?: string | null
          attempted_at?: string
          id?: string
          success?: boolean
          user_identifier?: string | null
        }
        Relationships: []
      }
      fg_raw_material_map: {
        Row: {
          created_at: string
          fg_description_full: string | null
          id: string
          is_direct_purchase: boolean
          model_number: string
          notes: string | null
          raw_materials: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          fg_description_full?: string | null
          id?: string
          is_direct_purchase?: boolean
          model_number: string
          notes?: string | null
          raw_materials?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          fg_description_full?: string | null
          id?: string
          is_direct_purchase?: boolean
          model_number?: string
          notes?: string | null
          raw_materials?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      login_activity: {
        Row: {
          created_at: string
          email: string
          id: string
          ip: string | null
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip?: string | null
          status: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      notification_recipients: {
        Row: {
          channels: string[]
          created_at: string
          department: string
          email: string | null
          id: string
          is_active: boolean
          name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          channels?: string[]
          created_at?: string
          department: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          channels?: string[]
          created_at?: string
          department?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oa_counters: {
        Row: {
          financial_year: string
          format: Database["public"]["Enums"]["order_format"]
          id: string
          last_number: number
          updated_at: string
        }
        Insert: {
          financial_year: string
          format: Database["public"]["Enums"]["order_format"]
          id?: string
          last_number?: number
          updated_at?: string
        }
        Update: {
          financial_year?: string
          format?: Database["public"]["Enums"]["order_format"]
          id?: string
          last_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_revision_notifications: {
        Row: {
          audience: Json
          channel_status: Json
          client_name: string | null
          created_at: string
          error: string | null
          format: Database["public"]["Enums"]["order_format"] | null
          id: string
          oa_number: string
          order_id: string
          order_root_id: string
          payload: Json
          previous_revision: number | null
          recipients: Json
          revised_from_id: string | null
          revision: number
          sent_at: string | null
          status: string
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          audience?: Json
          channel_status?: Json
          client_name?: string | null
          created_at?: string
          error?: string | null
          format?: Database["public"]["Enums"]["order_format"] | null
          id?: string
          oa_number: string
          order_id: string
          order_root_id: string
          payload?: Json
          previous_revision?: number | null
          recipients?: Json
          revised_from_id?: string | null
          revision: number
          sent_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          audience?: Json
          channel_status?: Json
          client_name?: string | null
          created_at?: string
          error?: string | null
          format?: Database["public"]["Enums"]["order_format"] | null
          id?: string
          oa_number?: string
          order_id?: string
          order_root_id?: string
          payload?: Json
          previous_revision?: number | null
          recipients?: Json
          revised_from_id?: string | null
          revision?: number
          sent_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      order_templates: {
        Row: {
          created_at: string
          field_map: Json
          file_path: string
          format: Database["public"]["Enums"]["order_format"]
          id: string
          page_count: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          field_map?: Json
          file_path: string
          format: Database["public"]["Enums"]["order_format"]
          id?: string
          page_count?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          field_map?: Json
          file_path?: string
          format?: Database["public"]["Enums"]["order_format"]
          id?: string
          page_count?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_in_words: string | null
          bill_to: Json
          charges: Json
          charges_gms: Json | null
          client_copy_grouping: boolean
          company_name: string | null
          cost_sheet_number: string | null
          created_at: string
          currency_mode: string
          exchange_rate: number | null
          format: Database["public"]["Enums"]["order_format"]
          id: string
          is_current: boolean
          line_items: Json
          notes: string | null
          oa_number: string
          order_date: string
          parent_order_id: string | null
          prepared_by: string | null
          reference: string | null
          revised_from_id: string | null
          revision: number
          ship_to: Json
          status: Database["public"]["Enums"]["order_status"]
          tc_note: string | null
          totals: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_in_words?: string | null
          bill_to?: Json
          charges?: Json
          charges_gms?: Json | null
          client_copy_grouping?: boolean
          company_name?: string | null
          cost_sheet_number?: string | null
          created_at?: string
          currency_mode?: string
          exchange_rate?: number | null
          format: Database["public"]["Enums"]["order_format"]
          id?: string
          is_current?: boolean
          line_items?: Json
          notes?: string | null
          oa_number: string
          order_date?: string
          parent_order_id?: string | null
          prepared_by?: string | null
          reference?: string | null
          revised_from_id?: string | null
          revision?: number
          ship_to?: Json
          status?: Database["public"]["Enums"]["order_status"]
          tc_note?: string | null
          totals?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_in_words?: string | null
          bill_to?: Json
          charges?: Json
          charges_gms?: Json | null
          client_copy_grouping?: boolean
          company_name?: string | null
          cost_sheet_number?: string | null
          created_at?: string
          currency_mode?: string
          exchange_rate?: number | null
          format?: Database["public"]["Enums"]["order_format"]
          id?: string
          is_current?: boolean
          line_items?: Json
          notes?: string | null
          oa_number?: string
          order_date?: string
          parent_order_id?: string | null
          prepared_by?: string | null
          reference?: string | null
          revised_from_id?: string | null
          revision?: number
          ship_to?: Json
          status?: Database["public"]["Enums"]["order_status"]
          tc_note?: string | null
          totals?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_parent_fk"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_revised_from_id_fkey"
            columns: ["revised_from_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pi_counters: {
        Row: {
          financial_year: string
          format: Database["public"]["Enums"]["order_format"]
          id: string
          last_number: number
          updated_at: string
        }
        Insert: {
          financial_year: string
          format: Database["public"]["Enums"]["order_format"]
          id?: string
          last_number?: number
          updated_at?: string
        }
        Update: {
          financial_year?: string
          format?: Database["public"]["Enums"]["order_format"]
          id?: string
          last_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      po_counters: {
        Row: {
          financial_year: string
          last_number: number
          updated_at: string
        }
        Insert: {
          financial_year: string
          last_number?: number
          updated_at?: string
        }
        Update: {
          financial_year?: string
          last_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          email_notifications: boolean
          full_name: string | null
          id: string
          is_active: boolean
          prepared_by: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          email_notifications?: boolean
          full_name?: string | null
          id: string
          is_active?: boolean
          prepared_by?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          email_notifications?: boolean
          full_name?: string | null
          id?: string
          is_active?: boolean
          prepared_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      proforma_invoice_documents: {
        Row: {
          created_at: string
          document_type: string
          file_name: string
          file_path: string
          id: string
          parent_pi_id: string | null
          pi_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          document_type: string
          file_name: string
          file_path: string
          id?: string
          parent_pi_id?: string | null
          pi_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string
          file_path?: string
          id?: string
          parent_pi_id?: string | null
          pi_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      proforma_invoices: {
        Row: {
          advance_adjustment_percent: number
          advance_amount: number
          advance_mode: string
          amount_in_words: string | null
          apply_discount: boolean
          base_pi_number: string
          bill_to: Json
          charges: Json
          company_name: string | null
          created_at: string
          currency_mode: string
          discount_label: string | null
          discount_mode: string
          discount_value: number
          exchange_rate: number | null
          format: Database["public"]["Enums"]["order_format"]
          id: string
          is_current: boolean
          line_items: Json
          notes: string | null
          one_time_discount_percent: number
          other_charges: number
          parent_pi_id: string | null
          pi_date: string
          pi_number: string
          prepared_by: string | null
          reference_oa_id: string | null
          reference_oa_number: string | null
          revised_from_id: string | null
          revision: number
          ship_to: Json
          status: Database["public"]["Enums"]["order_status"]
          totals: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          advance_adjustment_percent?: number
          advance_amount?: number
          advance_mode?: string
          amount_in_words?: string | null
          apply_discount?: boolean
          base_pi_number: string
          bill_to?: Json
          charges?: Json
          company_name?: string | null
          created_at?: string
          currency_mode?: string
          discount_label?: string | null
          discount_mode?: string
          discount_value?: number
          exchange_rate?: number | null
          format: Database["public"]["Enums"]["order_format"]
          id?: string
          is_current?: boolean
          line_items?: Json
          notes?: string | null
          one_time_discount_percent?: number
          other_charges?: number
          parent_pi_id?: string | null
          pi_date?: string
          pi_number: string
          prepared_by?: string | null
          reference_oa_id?: string | null
          reference_oa_number?: string | null
          revised_from_id?: string | null
          revision?: number
          ship_to?: Json
          status?: Database["public"]["Enums"]["order_status"]
          totals?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          advance_adjustment_percent?: number
          advance_amount?: number
          advance_mode?: string
          amount_in_words?: string | null
          apply_discount?: boolean
          base_pi_number?: string
          bill_to?: Json
          charges?: Json
          company_name?: string | null
          created_at?: string
          currency_mode?: string
          discount_label?: string | null
          discount_mode?: string
          discount_value?: number
          exchange_rate?: number | null
          format?: Database["public"]["Enums"]["order_format"]
          id?: string
          is_current?: boolean
          line_items?: Json
          notes?: string | null
          one_time_discount_percent?: number
          other_charges?: number
          parent_pi_id?: string | null
          pi_date?: string
          pi_number?: string
          prepared_by?: string | null
          reference_oa_id?: string | null
          reference_oa_number?: string | null
          revised_from_id?: string | null
          revision?: number
          ship_to?: Json
          status?: Database["public"]["Enums"]["order_status"]
          totals?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      purchase_order_rows: {
        Row: {
          created_at: string
          id: string
          lot_no: string | null
          make: string | null
          material: string
          po_id: string
          qty: number | null
          raw_material_id: string | null
          size_model: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lot_no?: string | null
          make?: string | null
          material: string
          po_id: string
          qty?: number | null
          raw_material_id?: string | null
          size_model?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lot_no?: string | null
          make?: string | null
          material?: string
          po_id?: string
          qty?: number | null
          raw_material_id?: string | null
          size_model?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_rows_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          annexure_ids: string[]
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: string
          created_at: string
          created_by: string | null
          id: string
          lot_numbers: string[]
          notes: string | null
          po_number: string
          requisition_ids: string[]
          status: string
          updated_at: string
          vendor_contact: string | null
          vendor_name: string
        }
        Insert: {
          annexure_ids?: string[]
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          lot_numbers?: string[]
          notes?: string | null
          po_number: string
          requisition_ids?: string[]
          status?: string
          updated_at?: string
          vendor_contact?: string | null
          vendor_name: string
        }
        Update: {
          annexure_ids?: string[]
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lot_numbers?: string[]
          notes?: string | null
          po_number?: string
          requisition_ids?: string[]
          status?: string
          updated_at?: string
          vendor_contact?: string | null
          vendor_name?: string
        }
        Relationships: []
      }
      requisition_annexure_rows: {
        Row: {
          annexure_id: string
          created_at: string
          id: string
          lot_no: string
          make: string | null
          material: string
          plan_status: string
          size_model: string | null
          source_rm_ids: string[]
          total_qty: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          annexure_id: string
          created_at?: string
          id?: string
          lot_no: string
          make?: string | null
          material: string
          plan_status: string
          size_model?: string | null
          source_rm_ids?: string[]
          total_qty?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          annexure_id?: string
          created_at?: string
          id?: string
          lot_no?: string
          make?: string | null
          material?: string
          plan_status?: string
          size_model?: string | null
          source_rm_ids?: string[]
          total_qty?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisition_annexure_rows_annexure_id_fkey"
            columns: ["annexure_id"]
            isOneToOne: false
            referencedRelation: "requisition_annexures"
            referencedColumns: ["id"]
          },
        ]
      }
      requisition_annexures: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          id: string
          lot_numbers: string[]
          notes: string | null
          requisition_ids: string[]
          status: string
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lot_numbers?: string[]
          notes?: string | null
          requisition_ids?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lot_numbers?: string[]
          notes?: string | null
          requisition_ids?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      requisition_counters: {
        Row: {
          id: string
          last_number: number
          order_root_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          last_number?: number
          order_root_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          last_number?: number
          order_root_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      requisition_distribution_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          message: string | null
          purchase_emails: string[]
          requisition_id: string
          sent_by: string | null
          sent_by_email: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          message?: string | null
          purchase_emails?: string[]
          requisition_id: string
          sent_by?: string | null
          sent_by_email?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          message?: string | null
          purchase_emails?: string[]
          requisition_id?: string
          sent_by?: string | null
          sent_by_email?: string | null
          status?: string
        }
        Relationships: []
      }
      requisition_items: {
        Row: {
          boq_item_id: string
          created_at: string
          description: string | null
          fg_snapshot: Json
          id: string
          included_in_requisition: boolean
          item_no: string | null
          lot_no: string | null
          model_number: string | null
          purchase_category: string | null
          purchase_status: string
          quantity: number | null
          remarks: string | null
          requisition_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          boq_item_id: string
          created_at?: string
          description?: string | null
          fg_snapshot?: Json
          id?: string
          included_in_requisition?: boolean
          item_no?: string | null
          lot_no?: string | null
          model_number?: string | null
          purchase_category?: string | null
          purchase_status?: string
          quantity?: number | null
          remarks?: string | null
          requisition_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          boq_item_id?: string
          created_at?: string
          description?: string | null
          fg_snapshot?: Json
          id?: string
          included_in_requisition?: boolean
          item_no?: string | null
          lot_no?: string | null
          model_number?: string | null
          purchase_category?: string | null
          purchase_status?: string
          quantity?: number | null
          remarks?: string | null
          requisition_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisition_items_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      requisition_lots: {
        Row: {
          category: string
          created_at: string
          id: string
          lot_no: string
          notes: string | null
          requisition_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          lot_no: string
          notes?: string | null
          requisition_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          lot_no?: string
          notes?: string | null
          requisition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisition_lots_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      requisition_raw_materials: {
        Row: {
          annexure_id: string | null
          annexure_status: string | null
          created_at: string
          fg_quantity: number | null
          id: string
          lot_no: string | null
          make: string | null
          material: string
          model_number: string | null
          notes: string | null
          plan_status: string | null
          po_id: string | null
          po_status: string | null
          purchase_status: string
          qty_per_unit: number | null
          required_qty: number | null
          requisition_id: string
          requisition_item_id: string | null
          size_model: string | null
          source: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          annexure_id?: string | null
          annexure_status?: string | null
          created_at?: string
          fg_quantity?: number | null
          id?: string
          lot_no?: string | null
          make?: string | null
          material: string
          model_number?: string | null
          notes?: string | null
          plan_status?: string | null
          po_id?: string | null
          po_status?: string | null
          purchase_status?: string
          qty_per_unit?: number | null
          required_qty?: number | null
          requisition_id: string
          requisition_item_id?: string | null
          size_model?: string | null
          source?: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          annexure_id?: string | null
          annexure_status?: string | null
          created_at?: string
          fg_quantity?: number | null
          id?: string
          lot_no?: string | null
          make?: string | null
          material?: string
          model_number?: string | null
          notes?: string | null
          plan_status?: string | null
          po_id?: string | null
          po_status?: string | null
          purchase_status?: string
          qty_per_unit?: number | null
          required_qty?: number | null
          requisition_id?: string
          requisition_item_id?: string | null
          size_model?: string | null
          source?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisition_raw_materials_annexure_id_fkey"
            columns: ["annexure_id"]
            isOneToOne: false
            referencedRelation: "requisition_annexures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_raw_materials_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      requisitions: {
        Row: {
          boq_id: string
          boq_revision: number
          created_at: string
          family_token: string | null
          id: string
          notes: string | null
          order_root_id: string
          pdf_path: string | null
          requisition_number: string
          share_token: string
          status: string
          superseded_by_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          boq_id: string
          boq_revision?: number
          created_at?: string
          family_token?: string | null
          id?: string
          notes?: string | null
          order_root_id: string
          pdf_path?: string | null
          requisition_number: string
          share_token?: string
          status?: string
          superseded_by_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          boq_id?: string
          boq_revision?: number
          created_at?: string
          family_token?: string | null
          id?: string
          notes?: string | null
          order_root_id?: string
          pdf_path?: string | null
          requisition_number?: string
          share_token?: string
          status?: string
          superseded_by_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      rm_master_uploads: {
        Row: {
          created_at: string
          fg_count: number
          file_path: string
          id: string
          original_filename: string
          row_count: number
          sheet_count: number
          uploaded_by: string | null
          uploaded_by_email: string | null
        }
        Insert: {
          created_at?: string
          fg_count?: number
          file_path: string
          id?: string
          original_filename: string
          row_count?: number
          sheet_count?: number
          uploaded_by?: string | null
          uploaded_by_email?: string | null
        }
        Update: {
          created_at?: string
          fg_count?: number
          file_path?: string
          id?: string
          original_filename?: string
          row_count?: number
          sheet_count?: number
          uploaded_by?: string | null
          uploaded_by_email?: string | null
        }
        Relationships: []
      }
      user_module_access: {
        Row: {
          granted_at: string
          granted_by: string | null
          module: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          module: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          module?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_entity_pending_state: {
        Row: {
          design_review_status: string | null
          has_stale_requisition: boolean | null
          latest_boq_id: string | null
          latest_boq_revision: number | null
          order_root_id: string | null
          verification_status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_boq_by_verification_token: {
        Args: { _token: string }
        Returns: {
          boq_date: string
          boq_number: string
          client_name: string | null
          created_at: string
          design_review_status: string
          final_sent_at: string | null
          final_share_token: string | null
          format: Database["public"]["Enums"]["order_format"]
          id: string
          is_current: boolean
          line_items: Json
          notes: string | null
          order_id: string
          prepared_by: string | null
          project_number: string | null
          reference_oa_number: string | null
          revised_from_id: string | null
          revision: number
          source_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          terms: string | null
          updated_at: string
          user_id: string | null
          verification_requested_at: string | null
          verification_status: string
          verification_token: string | null
          verified_at: string | null
          verified_by_email: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "boqs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_boq_item_attachments_by_token: {
        Args: { _token: string }
        Returns: {
          boq_id: string
          boq_item_id: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "boq_item_attachments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_design_review_by_token: {
        Args: { _token: string }
        Returns: {
          boq_id: string
          boq_snapshot: Json
          created_at: string
          expires_at: string
          id: string
          kind: string
          overall_outcome: string | null
          recipients: string[]
          reviewer_contact: string | null
          reviewer_design_team: string | null
          reviewer_name: string | null
          round_no: number
          sent_at: string
          sent_by: string | null
          sent_by_email: string | null
          sent_message: string | null
          status: string
          submitted_at: string | null
          submitted_by_email: string | null
          token: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "boq_design_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_design_review_docs_by_token: {
        Args: { _token: string }
        Returns: {
          boq_item_id: string | null
          created_at: string
          file_name: string
          file_path: string
          id: string
          review_id: string
          source: string
          uploaded_by_email: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "boq_design_review_documents"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_design_review_items_by_token: {
        Args: { _token: string }
        Returns: {
          boq_item_id: string
          column_comments: Json
          comment: string | null
          created_at: string
          decided_at: string | null
          decision: string
          description: string | null
          design_change_note: string | null
          id: string
          item_no: string | null
          model_number: string | null
          quantity: number | null
          remarks: string | null
          review_id: string
          unit: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "boq_design_review_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_final_boq_by_token: {
        Args: { _token: string }
        Returns: {
          boq_date: string
          boq_number: string
          client_name: string | null
          created_at: string
          design_review_status: string
          final_sent_at: string | null
          final_share_token: string | null
          format: Database["public"]["Enums"]["order_format"]
          id: string
          is_current: boolean
          line_items: Json
          notes: string | null
          order_id: string
          prepared_by: string | null
          project_number: string | null
          reference_oa_number: string | null
          revised_from_id: string | null
          revision: number
          source_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          terms: string | null
          updated_at: string
          user_id: string | null
          verification_requested_at: string | null
          verification_status: string
          verification_token: string | null
          verified_at: string | null
          verified_by_email: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "boqs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_latest_approved_boq_by_family_token: {
        Args: { _token: string }
        Returns: {
          boq_date: string
          boq_number: string
          client_name: string | null
          created_at: string
          design_review_status: string
          final_sent_at: string | null
          final_share_token: string | null
          format: Database["public"]["Enums"]["order_format"]
          id: string
          is_current: boolean
          line_items: Json
          notes: string | null
          order_id: string
          prepared_by: string | null
          project_number: string | null
          reference_oa_number: string | null
          revised_from_id: string | null
          revision: number
          source_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          terms: string | null
          updated_at: string
          user_id: string | null
          verification_requested_at: string | null
          verification_status: string
          verification_token: string | null
          verified_at: string | null
          verified_by_email: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "boqs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_requisition_by_token: {
        Args: { _token: string }
        Returns: {
          client_name: string
          created_at: string
          current_boq_id: string
          current_boq_number: string
          current_boq_revision: number
          order_root_id: string
          reference_oa_number: string
          requisition_id: string
          requisition_number: string
          requisition_revision: number
          requisition_status: string
        }[]
      }
      get_requisition_items_by_token: {
        Args: { _token: string }
        Returns: {
          boq_item_id: string
          created_at: string
          description: string | null
          fg_snapshot: Json
          id: string
          included_in_requisition: boolean
          item_no: string | null
          lot_no: string | null
          model_number: string | null
          purchase_category: string | null
          purchase_status: string
          quantity: number | null
          remarks: string | null
          requisition_id: string
          unit: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "requisition_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_requisition_raw_materials_by_token: {
        Args: { _token: string }
        Returns: {
          annexure_id: string | null
          annexure_status: string | null
          created_at: string
          fg_quantity: number | null
          id: string
          lot_no: string | null
          make: string | null
          material: string
          model_number: string | null
          notes: string | null
          plan_status: string | null
          po_id: string | null
          po_status: string | null
          purchase_status: string
          qty_per_unit: number | null
          required_qty: number | null
          requisition_id: string
          requisition_item_id: string | null
          size_model: string | null
          source: string
          unit: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "requisition_raw_materials"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_module_access: {
        Args: { _module: string; _user: string }
        Returns: boolean
      }
      has_open_review_for_boq: { Args: { _boq_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_design_review_owner: { Args: { _review_id: string }; Returns: boolean }
      is_domain_allowed: { Args: { _domain: string }; Returns: boolean }
      is_open_design_review: { Args: { _review_id: string }; Returns: boolean }
      next_oa_number: {
        Args: {
          _financial_year: string
          _format: Database["public"]["Enums"]["order_format"]
        }
        Returns: string
      }
      next_pi_number: {
        Args: {
          _financial_year: string
          _format: Database["public"]["Enums"]["order_format"]
        }
        Returns: string
      }
      next_po_number: { Args: { _fy: string }; Returns: string }
      next_requisition_number: {
        Args: { _oa_number: string; _revision: number; _root: string }
        Returns: string
      }
      sign_boq_item_doc_by_token: {
        Args: { _path: string; _token: string }
        Returns: string
      }
      submit_design_review_with_token: {
        Args: {
          _docs?: Json
          _items: Json
          _reviewer_contact?: string
          _reviewer_design_team?: string
          _reviewer_email: string
          _reviewer_name?: string
          _token: string
        }
        Returns: {
          boq_id: string
          boq_snapshot: Json
          created_at: string
          expires_at: string
          id: string
          kind: string
          overall_outcome: string | null
          recipients: string[]
          reviewer_contact: string | null
          reviewer_design_team: string | null
          reviewer_name: string | null
          round_no: number
          sent_at: string
          sent_by: string | null
          sent_by_email: string | null
          sent_message: string | null
          status: string
          submitted_at: string | null
          submitted_by_email: string | null
          token: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "boq_design_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verify_boq_items_with_token: {
        Args: { _items: Json; _token: string; _verifier_email: string }
        Returns: {
          boq_date: string
          boq_number: string
          client_name: string | null
          created_at: string
          design_review_status: string
          final_sent_at: string | null
          final_share_token: string | null
          format: Database["public"]["Enums"]["order_format"]
          id: string
          is_current: boolean
          line_items: Json
          notes: string | null
          order_id: string
          prepared_by: string | null
          project_number: string | null
          reference_oa_number: string | null
          revised_from_id: string | null
          revision: number
          source_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          terms: string | null
          updated_at: string
          user_id: string | null
          verification_requested_at: string | null
          verification_status: string
          verification_token: string | null
          verified_at: string | null
          verified_by_email: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "boqs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verify_boq_with_token: {
        Args: { _token: string; _verifier_email: string }
        Returns: {
          boq_date: string
          boq_number: string
          client_name: string | null
          created_at: string
          design_review_status: string
          final_sent_at: string | null
          final_share_token: string | null
          format: Database["public"]["Enums"]["order_format"]
          id: string
          is_current: boolean
          line_items: Json
          notes: string | null
          order_id: string
          prepared_by: string | null
          project_number: string | null
          reference_oa_number: string | null
          revised_from_id: string | null
          revision: number
          source_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          terms: string | null
          updated_at: string
          user_id: string | null
          verification_requested_at: string | null
          verification_status: string
          verification_token: string | null
          verified_at: string | null
          verified_by_email: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "boqs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "user"
      order_format: "MR" | "GMS"
      order_status: "draft" | "finalized"
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
      app_role: ["admin", "user"],
      order_format: ["MR", "GMS"],
      order_status: ["draft", "finalized"],
    },
  },
} as const
