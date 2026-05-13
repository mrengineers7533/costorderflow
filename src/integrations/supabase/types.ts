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
      boqs: {
        Row: {
          boq_date: string
          boq_number: string
          client_name: string | null
          created_at: string
          design_review_status: string
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
          company_name: string | null
          cost_sheet_number: string | null
          created_at: string
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
          company_name?: string | null
          cost_sheet_number?: string | null
          created_at?: string
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
          company_name?: string | null
          cost_sheet_number?: string | null
          created_at?: string
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
          discount_label: string | null
          discount_mode: string
          discount_value: number
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
          discount_label?: string | null
          discount_mode?: string
          discount_value?: number
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
          discount_label?: string | null
          discount_mode?: string
          discount_value?: number
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_domain_allowed: { Args: { _domain: string }; Returns: boolean }
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
