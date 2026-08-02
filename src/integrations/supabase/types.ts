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
      _backup_instapay_dup_2026_08_02: {
        Row: {
          account_id: string | null
          amount: number | null
          attachment_url: string | null
          brand_id: string | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string | null
          reference_id: string | null
          reference_type: string | null
          rn: number | null
          supplier_id: string | null
          to_account_id: string | null
          transaction_date: string | null
          txn_type: string | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number | null
          attachment_url?: string | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          rn?: number | null
          supplier_id?: string | null
          to_account_id?: string | null
          transaction_date?: string | null
          txn_type?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number | null
          attachment_url?: string | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          rn?: number | null
          supplier_id?: string | null
          to_account_id?: string | null
          transaction_date?: string | null
          txn_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      _backup_instapay_dup_exp_2026_08_02: {
        Row: {
          account_id: string | null
          amount: number | null
          attachment_url: string | null
          brand_id: string | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string | null
          reference_id: string | null
          reference_type: string | null
          supplier_id: string | null
          to_account_id: string | null
          transaction_date: string | null
          txn_type: string | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number | null
          attachment_url?: string | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          supplier_id?: string | null
          to_account_id?: string | null
          transaction_date?: string | null
          txn_type?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number | null
          attachment_url?: string | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          supplier_id?: string | null
          to_account_id?: string | null
          transaction_date?: string | null
          txn_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      _backup_phase4b_brand_remap: {
        Row: {
          prior_brand_id: string | null
          ref: string | null
          row_id: string | null
          tbl: string | null
        }
        Insert: {
          prior_brand_id?: string | null
          ref?: string | null
          row_id?: string | null
          tbl?: string | null
        }
        Update: {
          prior_brand_id?: string | null
          ref?: string | null
          row_id?: string | null
          tbl?: string | null
        }
        Relationships: []
      }
      _backup_status_migration_2026_07_12: {
        Row: {
          backed_up_at: string | null
          id: string | null
          old_paid_at: string | null
          old_payment_status:
            | Database["public"]["Enums"]["payment_status"]
            | null
          old_status: string | null
          old_updated_at: string | null
        }
        Insert: {
          backed_up_at?: string | null
          id?: string | null
          old_paid_at?: string | null
          old_payment_status?:
            | Database["public"]["Enums"]["payment_status"]
            | null
          old_status?: string | null
          old_updated_at?: string | null
        }
        Update: {
          backed_up_at?: string | null
          id?: string | null
          old_paid_at?: string | null
          old_payment_status?:
            | Database["public"]["Enums"]["payment_status"]
            | null
          old_status?: string | null
          old_updated_at?: string | null
        }
        Relationships: []
      }
      _backup_step3_categorize: {
        Row: {
          amount: number | null
          brand_id: string | null
          category_id: string | null
          description: string | null
          id: string | null
          snapshot_at: string | null
          transaction_date: string | null
          txn_type: string | null
        }
        Insert: {
          amount?: number | null
          brand_id?: string | null
          category_id?: string | null
          description?: string | null
          id?: string | null
          snapshot_at?: string | null
          transaction_date?: string | null
          txn_type?: string | null
        }
        Update: {
          amount?: number | null
          brand_id?: string | null
          category_id?: string | null
          description?: string | null
          id?: string | null
          snapshot_at?: string | null
          transaction_date?: string | null
          txn_type?: string | null
        }
        Relationships: []
      }
      abandoned_cart_messages: {
        Row: {
          brand_id: string | null
          cart_id: string
          channel: string
          delivery_status: string
          id: string
          message_body: string | null
          meta: Json
          sent_at: string
          sent_by: string | null
        }
        Insert: {
          brand_id?: string | null
          cart_id: string
          channel: string
          delivery_status?: string
          id?: string
          message_body?: string | null
          meta?: Json
          sent_at?: string
          sent_by?: string | null
        }
        Update: {
          brand_id?: string | null
          cart_id?: string
          channel?: string
          delivery_status?: string
          id?: string
          message_body?: string | null
          meta?: Json
          sent_at?: string
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_cart_messages_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "abandoned_carts"
            referencedColumns: ["id"]
          },
        ]
      }
      abandoned_carts: {
        Row: {
          brand_id: string | null
          cart_items: Json
          converted_order_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          followup_count: number
          followup_status: string
          id: string
          is_converted: boolean
          last_followup_at: string | null
          last_followup_channel: string | null
          last_step: string | null
          session_id: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_district: string | null
          shipping_thana: string | null
          subtotal: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          brand_id?: string | null
          cart_items?: Json
          converted_order_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          followup_count?: number
          followup_status?: string
          id?: string
          is_converted?: boolean
          last_followup_at?: string | null
          last_followup_channel?: string | null
          last_step?: string | null
          session_id?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_district?: string | null
          shipping_thana?: string | null
          subtotal?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          brand_id?: string | null
          cart_items?: Json
          converted_order_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          followup_count?: number
          followup_status?: string
          id?: string
          is_converted?: boolean
          last_followup_at?: string | null
          last_followup_channel?: string | null
          last_step?: string | null
          session_id?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_district?: string | null
          shipping_thana?: string | null
          subtotal?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_carts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      active_sessions: {
        Row: {
          brand_id: string | null
          country: string | null
          first_seen_at: string
          last_seen_at: string
          path: string | null
          referrer: string | null
          session_id: string
          user_agent: string | null
        }
        Insert: {
          brand_id?: string | null
          country?: string | null
          first_seen_at?: string
          last_seen_at?: string
          path?: string | null
          referrer?: string | null
          session_id: string
          user_agent?: string | null
        }
        Update: {
          brand_id?: string | null
          country?: string | null
          first_seen_at?: string
          last_seen_at?: string
          path?: string | null
          referrer?: string | null
          session_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "active_sessions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          details: Json | null
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          performed_at: string | null
          performed_by: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          details?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          performed_at?: string | null
          performed_by?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          details?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          performed_at?: string | null
          performed_by?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_value: Json | null
          note: string | null
          old_value: Json | null
          order_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          order_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          order_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      addresses: {
        Row: {
          address_line: string
          city: string
          created_at: string
          district: string
          full_name: string
          id: string
          is_default: boolean
          label: string | null
          phone: string
          postal_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line: string
          city: string
          created_at?: string
          district: string
          full_name: string
          id?: string
          is_default?: boolean
          label?: string | null
          phone: string
          postal_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line?: string
          city?: string
          created_at?: string
          district?: string
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string | null
          phone?: string
          postal_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          brand_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          brand_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          brand_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          brand_id: string | null
          created_at: string
          currency: string | null
          device_type: string | null
          event_name: string
          fb_browser_pixel: string | null
          fb_click_id: string | null
          id: string
          order_id: string | null
          page_type: string | null
          params: Json
          path: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          referrer: string | null
          session_id: string
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          value: number | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          currency?: string | null
          device_type?: string | null
          event_name: string
          fb_browser_pixel?: string | null
          fb_click_id?: string | null
          id?: string
          order_id?: string | null
          page_type?: string | null
          params?: Json
          path?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          referrer?: string | null
          session_id: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          value?: number | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          currency?: string | null
          device_type?: string | null
          event_name?: string
          fb_browser_pixel?: string | null
          fb_click_id?: string | null
          id?: string
          order_id?: string | null
          page_type?: string | null
          params?: Json
          path?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          referrer?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      bd_areas: {
        Row: {
          created_at: string | null
          delivery_charge_pathao: number | null
          delivery_charge_redx: number | null
          delivery_charge_steadfast: number | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name_bn: string | null
          name_en: string
          pathao_area_id: string | null
          pathao_zone_id: string | null
          postal_code: string | null
          zone_id: string
        }
        Insert: {
          created_at?: string | null
          delivery_charge_pathao?: number | null
          delivery_charge_redx?: number | null
          delivery_charge_steadfast?: number | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name_bn?: string | null
          name_en: string
          pathao_area_id?: string | null
          pathao_zone_id?: string | null
          postal_code?: string | null
          zone_id: string
        }
        Update: {
          created_at?: string | null
          delivery_charge_pathao?: number | null
          delivery_charge_redx?: number | null
          delivery_charge_steadfast?: number | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name_bn?: string | null
          name_en?: string
          pathao_area_id?: string | null
          pathao_zone_id?: string | null
          postal_code?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bd_areas_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "bd_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      bd_cities: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name_bn: string | null
          name_en: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name_bn?: string | null
          name_en: string
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name_bn?: string | null
          name_en?: string
        }
        Relationships: []
      }
      bd_zones: {
        Row: {
          city_id: string
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name_bn: string | null
          name_en: string
        }
        Insert: {
          city_id: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name_bn?: string | null
          name_en: string
        }
        Update: {
          city_id?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name_bn?: string | null
          name_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "bd_zones_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "bd_cities"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          brand_id: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_usage: {
        Row: {
          coupon_id: string
          created_at: string
          discount_amount: number
          id: string
          order_id: string
          user_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          discount_amount?: number
          id?: string
          order_id: string
          user_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          discount_amount?: number
          id?: string
          order_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usage_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          applicable_categories: Json | null
          applicable_products: Json | null
          brand_id: string | null
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_discount: number | null
          min_order_amount: number
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at: string
          usage_limit: number | null
          used_count: number
          valid_from: string
          valid_until: string | null
          value: number
        }
        Insert: {
          applicable_categories?: Json | null
          applicable_products?: Json | null
          brand_id?: string | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_order_amount?: number
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          valid_from?: string
          valid_until?: string | null
          value: number
        }
        Update: {
          applicable_categories?: Json | null
          applicable_products?: Json | null
          brand_id?: string | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_order_amount?: number
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          valid_from?: string
          valid_until?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_credentials: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          provider: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      courier_history_cache: {
        Row: {
          data: Json
          fetched_at: string
          phone: string
        }
        Insert: {
          data: Json
          fetched_at?: string
          phone: string
        }
        Update: {
          data?: Json
          fetched_at?: string
          phone?: string
        }
        Relationships: []
      }
      courier_shipments: {
        Row: {
          brand_id: string | null
          consignment_id: string | null
          created_at: string
          created_by: string | null
          delivery_fee: number | null
          id: string
          merchant_order_id: string | null
          order_id: string
          provider: string
          request_payload: Json
          response_payload: Json
          rider_name: string | null
          rider_phone: string | null
          status: string | null
          tracking_code: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          consignment_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_fee?: number | null
          id?: string
          merchant_order_id?: string | null
          order_id: string
          provider: string
          request_payload?: Json
          response_payload?: Json
          rider_name?: string | null
          rider_phone?: string | null
          status?: string | null
          tracking_code?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          consignment_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_fee?: number | null
          id?: string
          merchant_order_id?: string | null
          order_id?: string
          provider?: string
          request_payload?: Json
          response_payload?: Json
          rider_name?: string | null
          rider_phone?: string | null
          status?: string | null
          tracking_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_shipments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          body: string | null
          brand_id: string | null
          created_at: string
          created_by: string | null
          customer_key: string
          direction: string | null
          duration_seconds: number | null
          id: string
          metadata: Json
          title: string | null
          type: string
          updated_at: string
          whatsapp_url: string | null
        }
        Insert: {
          body?: string | null
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_key: string
          direction?: string | null
          duration_seconds?: number | null
          id?: string
          metadata?: Json
          title?: string | null
          type: string
          updated_at?: string
          whatsapp_url?: string | null
        }
        Update: {
          body?: string | null
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_key?: string
          direction?: string | null
          duration_seconds?: number | null
          id?: string
          metadata?: Json
          title?: string | null
          type?: string
          updated_at?: string
          whatsapp_url?: string | null
        }
        Relationships: []
      }
      crm_custom_field_definitions: {
        Row: {
          brand_id: string | null
          created_at: string
          field_key: string
          field_type: string
          id: string
          is_required: boolean
          label: string
          options: Json | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          field_key: string
          field_type?: string
          id?: string
          is_required?: boolean
          label: string
          options?: Json | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          field_key?: string
          field_type?: string
          id?: string
          is_required?: boolean
          label?: string
          options?: Json | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_customer_meta: {
        Row: {
          churn_risk: string | null
          churn_score: number | null
          custom_fields: Json
          customer_key: string
          internal_email: string | null
          is_merged: boolean
          last_rfm_calculated_at: string | null
          merged_into: string | null
          rfm_frequency: number | null
          rfm_frequency_score: number | null
          rfm_monetary: number | null
          rfm_monetary_score: number | null
          rfm_recency: number | null
          rfm_recency_score: number | null
          rfm_score: number | null
          rfm_segment: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          churn_risk?: string | null
          churn_score?: number | null
          custom_fields?: Json
          customer_key: string
          internal_email?: string | null
          is_merged?: boolean
          last_rfm_calculated_at?: string | null
          merged_into?: string | null
          rfm_frequency?: number | null
          rfm_frequency_score?: number | null
          rfm_monetary?: number | null
          rfm_monetary_score?: number | null
          rfm_recency?: number | null
          rfm_recency_score?: number | null
          rfm_score?: number | null
          rfm_segment?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          churn_risk?: string | null
          churn_score?: number | null
          custom_fields?: Json
          customer_key?: string
          internal_email?: string | null
          is_merged?: boolean
          last_rfm_calculated_at?: string | null
          merged_into?: string | null
          rfm_frequency?: number | null
          rfm_frequency_score?: number | null
          rfm_monetary?: number | null
          rfm_monetary_score?: number | null
          rfm_recency?: number | null
          rfm_recency_score?: number | null
          rfm_score?: number | null
          rfm_segment?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      crm_customer_notes: {
        Row: {
          created_at: string
          created_by: string | null
          customer_key: string
          id: string
          note: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_key: string
          id?: string
          note: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_key?: string
          id?: string
          note?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_customer_tags: {
        Row: {
          created_at: string
          created_by: string | null
          customer_key: string
          id: string
          tag: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_key: string
          id?: string
          tag: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_key?: string
          id?: string
          tag?: string
        }
        Relationships: []
      }
      crm_imported_customers: {
        Row: {
          created_at: string
          customer_key: string
          email: string | null
          imported_by: string | null
          name: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_key: string
          email?: string | null
          imported_by?: string | null
          name?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_key?: string
          email?: string | null
          imported_by?: string | null
          name?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_saved_filters: {
        Row: {
          brand_id: string | null
          created_at: string
          created_by: string | null
          filters: Json
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_tasks: {
        Row: {
          assigned_to: string | null
          brand_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          customer_key: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          brand_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_key: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          brand_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_key?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      erp_accounts: {
        Row: {
          account_number: string | null
          account_subtype: string | null
          account_type: string
          brand_id: string | null
          created_at: string
          current_balance: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          opening_balance: number
          updated_at: string
          wallet_type: string
        }
        Insert: {
          account_number?: string | null
          account_subtype?: string | null
          account_type: string
          brand_id?: string | null
          created_at?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
          wallet_type?: string
        }
        Update: {
          account_number?: string | null
          account_subtype?: string | null
          account_type?: string
          brand_id?: string | null
          created_at?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
          wallet_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ar_payments: {
        Row: {
          amount: number
          ar_account_id: string | null
          brand_id: string
          cash_account_id: string
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          notes: string | null
          order_id: string
          payment_date: string
          reference_no: string | null
        }
        Insert: {
          amount: number
          ar_account_id?: string | null
          brand_id: string
          cash_account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          order_id: string
          payment_date?: string
          reference_no?: string | null
        }
        Update: {
          amount?: number
          ar_account_id?: string | null
          brand_id?: string
          cash_account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          order_id?: string
          payment_date?: string
          reference_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_ar_payments_ar_account_id_fkey"
            columns: ["ar_account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ar_payments_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ar_payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ar_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_bills: {
        Row: {
          amount: number
          ap_account_id: string | null
          bill_date: string
          bill_no: string
          brand_id: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          expense_account_id: string | null
          id: string
          journal_entry_id: string | null
          paid_amount: number
          source_id: string | null
          source_type: string | null
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          ap_account_id?: string | null
          bill_date?: string
          bill_no: string
          brand_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          expense_account_id?: string | null
          id?: string
          journal_entry_id?: string | null
          paid_amount?: number
          source_id?: string | null
          source_type?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          ap_account_id?: string | null
          bill_date?: string
          bill_no?: string
          brand_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          expense_account_id?: string | null
          id?: string
          journal_entry_id?: string | null
          paid_amount?: number
          source_id?: string | null
          source_type?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_bills_ap_account_id_fkey"
            columns: ["ap_account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_bills_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_bills_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "erp_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_budgets: {
        Row: {
          account_id: string
          amount: number
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          month: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          amount?: number
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          month: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          month?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_budgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_chart_accounts: {
        Row: {
          account_type: string
          brand_id: string
          code: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_archived: boolean
          name: string
          normal_balance: string
          opening_balance: number
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          account_type: string
          brand_id: string
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          name: string
          normal_balance: string
          opening_balance?: number
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          brand_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          name?: string
          normal_balance?: string
          opening_balance?: number
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_chart_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_chart_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_cod_remittances: {
        Row: {
          amount: number
          brand_id: string
          courier: string
          created_at: string
          created_by: string | null
          expected_amount: number | null
          id: string
          journal_entry_id: string | null
          notes: string | null
          received_date: string | null
          received_to: string | null
          reference_no: string | null
          remittance_date: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          brand_id: string
          courier: string
          created_at?: string
          created_by?: string | null
          expected_amount?: number | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          received_date?: string | null
          received_to?: string | null
          reference_no?: string | null
          remittance_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          brand_id?: string
          courier?: string
          created_at?: string
          created_by?: string | null
          expected_amount?: number | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          received_date?: string | null
          received_to?: string | null
          reference_no?: string | null
          remittance_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_cod_remittances_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_cod_remittances_received_to_fkey"
            columns: ["received_to"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_courier_settings: {
        Row: {
          base_url: string | null
          brand_id: string
          client_id: string | null
          client_secret: string | null
          created_at: string
          id: string
          is_active: boolean
          password: string | null
          provider: string
          store_id: string | null
          updated_at: string
          username: string | null
          wallet_id: string | null
        }
        Insert: {
          base_url?: string | null
          brand_id: string
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          password?: string | null
          provider?: string
          store_id?: string | null
          updated_at?: string
          username?: string | null
          wallet_id?: string | null
        }
        Update: {
          base_url?: string | null
          brand_id?: string
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          password?: string | null
          provider?: string
          store_id?: string | null
          updated_at?: string
          username?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_courier_settings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_courier_settings_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_courier_settlement_lines: {
        Row: {
          additional_charge: number
          brand_id: string
          cod_fee: number
          collectable_amount: number
          collected_amount: number
          compensation_cost: number
          consignment_id: string | null
          courier: string
          created_at: string
          created_date: string | null
          delivery_fee: number
          discount: number
          expected_amount: number | null
          final_fee: number
          id: string
          invoice_type: string | null
          match_status: string
          matched_order_id: string | null
          merchant_order_id: string | null
          notes: string | null
          payout: number
          promo_discount: number
          raw: Json | null
          recipient_name: string | null
          recipient_phone: string | null
          remittance_id: string
          store_name: string | null
          variance: number | null
        }
        Insert: {
          additional_charge?: number
          brand_id: string
          cod_fee?: number
          collectable_amount?: number
          collected_amount?: number
          compensation_cost?: number
          consignment_id?: string | null
          courier: string
          created_at?: string
          created_date?: string | null
          delivery_fee?: number
          discount?: number
          expected_amount?: number | null
          final_fee?: number
          id?: string
          invoice_type?: string | null
          match_status?: string
          matched_order_id?: string | null
          merchant_order_id?: string | null
          notes?: string | null
          payout?: number
          promo_discount?: number
          raw?: Json | null
          recipient_name?: string | null
          recipient_phone?: string | null
          remittance_id: string
          store_name?: string | null
          variance?: number | null
        }
        Update: {
          additional_charge?: number
          brand_id?: string
          cod_fee?: number
          collectable_amount?: number
          collected_amount?: number
          compensation_cost?: number
          consignment_id?: string | null
          courier?: string
          created_at?: string
          created_date?: string | null
          delivery_fee?: number
          discount?: number
          expected_amount?: number | null
          final_fee?: number
          id?: string
          invoice_type?: string | null
          match_status?: string
          matched_order_id?: string | null
          merchant_order_id?: string | null
          notes?: string | null
          payout?: number
          promo_discount?: number
          raw?: Json | null
          recipient_name?: string | null
          recipient_phone?: string | null
          remittance_id?: string
          store_name?: string | null
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_courier_settlement_lines_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "erp_cod_remittances"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_exchange_cases: {
        Row: {
          brand_id: string
          case_number: string | null
          courier_tracking_id: string | null
          created_at: string
          created_by: string | null
          exchange_charge_collected: number
          exchange_status: string
          exchange_type: string
          exchange_type_detail: string | null
          id: string
          new_order_id: string | null
          note: string | null
          old_item_condition: string
          original_item_restocked: boolean
          original_order_id: string
          original_order_item_id: string | null
          original_product_id: string | null
          original_sku: string | null
          original_variant_id: string | null
          product_cost_loss: number
          refund_amount: number
          replacement_courier: string | null
          replacement_delivery_cost: number
          replacement_order_id: string | null
          replacement_product_id: string | null
          replacement_qty: number
          replacement_sku: string | null
          replacement_tracking_id: string | null
          replacement_variant_id: string | null
          resolved_at: string | null
          return_delivery_cost: number
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          case_number?: string | null
          courier_tracking_id?: string | null
          created_at?: string
          created_by?: string | null
          exchange_charge_collected?: number
          exchange_status?: string
          exchange_type: string
          exchange_type_detail?: string | null
          id?: string
          new_order_id?: string | null
          note?: string | null
          old_item_condition: string
          original_item_restocked?: boolean
          original_order_id: string
          original_order_item_id?: string | null
          original_product_id?: string | null
          original_sku?: string | null
          original_variant_id?: string | null
          product_cost_loss?: number
          refund_amount?: number
          replacement_courier?: string | null
          replacement_delivery_cost?: number
          replacement_order_id?: string | null
          replacement_product_id?: string | null
          replacement_qty?: number
          replacement_sku?: string | null
          replacement_tracking_id?: string | null
          replacement_variant_id?: string | null
          resolved_at?: string | null
          return_delivery_cost?: number
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          case_number?: string | null
          courier_tracking_id?: string | null
          created_at?: string
          created_by?: string | null
          exchange_charge_collected?: number
          exchange_status?: string
          exchange_type?: string
          exchange_type_detail?: string | null
          id?: string
          new_order_id?: string | null
          note?: string | null
          old_item_condition?: string
          original_item_restocked?: boolean
          original_order_id?: string
          original_order_item_id?: string | null
          original_product_id?: string | null
          original_sku?: string | null
          original_variant_id?: string | null
          product_cost_loss?: number
          refund_amount?: number
          replacement_courier?: string | null
          replacement_delivery_cost?: number
          replacement_order_id?: string | null
          replacement_product_id?: string | null
          replacement_qty?: number
          replacement_sku?: string | null
          replacement_tracking_id?: string | null
          replacement_variant_id?: string | null
          resolved_at?: string | null
          return_delivery_cost?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_exchange_cases_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_new_order_id_fkey"
            columns: ["new_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_original_order_id_fkey"
            columns: ["original_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_original_order_item_id_fkey"
            columns: ["original_order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_original_product_id_fkey"
            columns: ["original_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_original_product_id_fkey"
            columns: ["original_product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_original_variant_id_fkey"
            columns: ["original_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_replacement_order_id_fkey"
            columns: ["replacement_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_replacement_product_id_fkey"
            columns: ["replacement_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_replacement_product_id_fkey"
            columns: ["replacement_product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_replacement_variant_id_fkey"
            columns: ["replacement_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_expense_categories: {
        Row: {
          brand_id: string | null
          created_at: string
          excluded_from_pnl: boolean
          id: string
          is_active: boolean
          is_cogs_category: boolean
          kind: string
          name: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          excluded_from_pnl?: boolean
          id?: string
          is_active?: boolean
          is_cogs_category?: boolean
          kind?: string
          name: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          excluded_from_pnl?: boolean
          id?: string
          is_active?: boolean
          is_cogs_category?: boolean
          kind?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_expense_categories_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_finance_attachments: {
        Row: {
          brand_id: string
          created_at: string
          file_name: string | null
          id: string
          journal_entry_id: string | null
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          transaction_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          file_name?: string | null
          id?: string
          journal_entry_id?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          transaction_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          file_name?: string | null
          id?: string
          journal_entry_id?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          transaction_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_finance_attachments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_finance_attachments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_finance_audit: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          brand_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          brand_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          brand_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      erp_fx_rates: {
        Row: {
          brand_id: string
          created_at: string
          from_ccy: string
          id: string
          rate: number
          rate_date: string
          to_ccy: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          from_ccy: string
          id?: string
          rate: number
          rate_date: string
          to_ccy: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          from_ccy?: string
          id?: string
          rate?: number
          rate_date?: string
          to_ccy?: string
        }
        Relationships: []
      }
      erp_journal_entries: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          entry_date: string
          entry_no: string
          id: string
          is_locked: boolean
          source_id: string | null
          source_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          entry_date: string
          entry_no: string
          id?: string
          is_locked?: boolean
          source_id?: string | null
          source_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          entry_date?: string
          entry_no?: string
          id?: string
          is_locked?: boolean
          source_id?: string | null
          source_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_journal_entries_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_journal_lines: {
        Row: {
          account_id: string
          brand_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
          line_order: number
        }
        Insert: {
          account_id: string
          brand_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
          line_order?: number
        }
        Update: {
          account_id?: string
          brand_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
          line_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_journal_lines_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_product_expense_allocations: {
        Row: {
          allocation_date: string
          allocation_method: string
          amount: number
          brand_id: string
          campaign_id: string | null
          created_at: string
          expense_transaction_id: string | null
          expense_type: string
          id: string
          mkt_ad_account_id: string | null
          note: string | null
          product_id: string
          source: string
          updated_at: string
        }
        Insert: {
          allocation_date: string
          allocation_method?: string
          amount?: number
          brand_id: string
          campaign_id?: string | null
          created_at?: string
          expense_transaction_id?: string | null
          expense_type: string
          id?: string
          mkt_ad_account_id?: string | null
          note?: string | null
          product_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          allocation_date?: string
          allocation_method?: string
          amount?: number
          brand_id?: string
          campaign_id?: string | null
          created_at?: string
          expense_transaction_id?: string | null
          expense_type?: string
          id?: string
          mkt_ad_account_id?: string | null
          note?: string | null
          product_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      erp_reconciliation_rows: {
        Row: {
          amount_diff: number | null
          applied_expense_txn_id: string | null
          applied_income_txn_id: string | null
          brand_id: string | null
          cod_fee: number
          collected: number
          consignment_id: string | null
          created_at: string
          delivery_fee: number
          discount: number
          id: string
          invoice_date: string | null
          match_status: string
          match_type: string | null
          matched_order_id: string | null
          matched_via: string | null
          merchant_order_id: string | null
          note: string | null
          other_fee: number
          partial_amount: number | null
          payout: number
          raw: Json | null
          recipient_name: string | null
          recipient_phone: string | null
          return_fee: number | null
          run_id: string
          store_name: string | null
          total_fee: number
          updated_at: string
        }
        Insert: {
          amount_diff?: number | null
          applied_expense_txn_id?: string | null
          applied_income_txn_id?: string | null
          brand_id?: string | null
          cod_fee?: number
          collected?: number
          consignment_id?: string | null
          created_at?: string
          delivery_fee?: number
          discount?: number
          id?: string
          invoice_date?: string | null
          match_status?: string
          match_type?: string | null
          matched_order_id?: string | null
          matched_via?: string | null
          merchant_order_id?: string | null
          note?: string | null
          other_fee?: number
          partial_amount?: number | null
          payout?: number
          raw?: Json | null
          recipient_name?: string | null
          recipient_phone?: string | null
          return_fee?: number | null
          run_id: string
          store_name?: string | null
          total_fee?: number
          updated_at?: string
        }
        Update: {
          amount_diff?: number | null
          applied_expense_txn_id?: string | null
          applied_income_txn_id?: string | null
          brand_id?: string | null
          cod_fee?: number
          collected?: number
          consignment_id?: string | null
          created_at?: string
          delivery_fee?: number
          discount?: number
          id?: string
          invoice_date?: string | null
          match_status?: string
          match_type?: string | null
          matched_order_id?: string | null
          matched_via?: string | null
          merchant_order_id?: string | null
          note?: string | null
          other_fee?: number
          partial_amount?: number | null
          payout?: number
          raw?: Json | null
          recipient_name?: string | null
          recipient_phone?: string | null
          return_fee?: number | null
          run_id?: string
          store_name?: string | null
          total_fee?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_reconciliation_rows_applied_expense_txn_id_fkey"
            columns: ["applied_expense_txn_id"]
            isOneToOne: false
            referencedRelation: "erp_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_reconciliation_rows_applied_income_txn_id_fkey"
            columns: ["applied_income_txn_id"]
            isOneToOne: false
            referencedRelation: "erp_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_reconciliation_rows_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_reconciliation_rows_matched_order_id_fkey"
            columns: ["matched_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_reconciliation_rows_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "erp_reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_reconciliation_runs: {
        Row: {
          applied_at: string | null
          brand_id: string | null
          courier: string
          created_at: string
          id: string
          matched_count: number
          mismatched_count: number
          notes: string | null
          reverted_at: string | null
          source_filename: string | null
          status: string
          total_collected: number
          total_fee: number
          total_payout: number
          total_rows: number
          unmatched_count: number
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          applied_at?: string | null
          brand_id?: string | null
          courier?: string
          created_at?: string
          id?: string
          matched_count?: number
          mismatched_count?: number
          notes?: string | null
          reverted_at?: string | null
          source_filename?: string | null
          status?: string
          total_collected?: number
          total_fee?: number
          total_payout?: number
          total_rows?: number
          unmatched_count?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          applied_at?: string | null
          brand_id?: string | null
          courier?: string
          created_at?: string
          id?: string
          matched_count?: number
          mismatched_count?: number
          notes?: string | null
          reverted_at?: string | null
          source_filename?: string | null
          status?: string
          total_collected?: number
          total_fee?: number
          total_payout?: number
          total_rows?: number
          unmatched_count?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_reconciliation_runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_recurring_rules: {
        Row: {
          amount: number
          auto_post: boolean
          brand_id: string
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          frequency: string
          id: string
          interval_n: number
          is_active: boolean
          last_run_at: string | null
          lines: Json
          name: string
          next_run_date: string
          start_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          auto_post?: boolean
          brand_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          frequency: string
          id?: string
          interval_n?: number
          is_active?: boolean
          last_run_at?: string | null
          lines: Json
          name: string
          next_run_date: string
          start_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          auto_post?: boolean
          brand_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          interval_n?: number
          is_active?: boolean
          last_run_at?: string | null
          lines?: Json
          name?: string
          next_run_date?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      erp_recurring_runs: {
        Row: {
          brand_id: string
          created_at: string
          error: string | null
          id: string
          journal_entry_id: string | null
          rule_id: string
          run_date: string
          status: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          error?: string | null
          id?: string
          journal_entry_id?: string | null
          rule_id: string
          run_date: string
          status?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          error?: string | null
          id?: string
          journal_entry_id?: string | null
          rule_id?: string
          run_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_recurring_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_recurring_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "erp_recurring_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_return_cases: {
        Row: {
          brand_id: string
          case_number: string | null
          courier_name: string | null
          courier_tracking_id: string | null
          created_at: string
          created_by: string | null
          customer_paid_delivery: number
          id: string
          item_condition: string
          note: string | null
          order_id: string
          order_item_id: string | null
          outbound_delivery_cost: number
          packaging_loss: number
          product_cost_loss: number
          product_id: string | null
          qc_condition: string | null
          qc_done_at: string | null
          qc_done_by: string | null
          qc_notes: string | null
          qty: number
          refund_amount: number
          refund_status: string
          resolved_at: string | null
          return_delivery_cost: number
          return_status: string
          return_type: string
          sku: string | null
          status: string
          stock_restored: boolean
          stock_restored_at: string | null
          stock_updated: boolean
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          brand_id: string
          case_number?: string | null
          courier_name?: string | null
          courier_tracking_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_paid_delivery?: number
          id?: string
          item_condition: string
          note?: string | null
          order_id: string
          order_item_id?: string | null
          outbound_delivery_cost?: number
          packaging_loss?: number
          product_cost_loss?: number
          product_id?: string | null
          qc_condition?: string | null
          qc_done_at?: string | null
          qc_done_by?: string | null
          qc_notes?: string | null
          qty?: number
          refund_amount?: number
          refund_status?: string
          resolved_at?: string | null
          return_delivery_cost?: number
          return_status?: string
          return_type: string
          sku?: string | null
          status?: string
          stock_restored?: boolean
          stock_restored_at?: string | null
          stock_updated?: boolean
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          brand_id?: string
          case_number?: string | null
          courier_name?: string | null
          courier_tracking_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_paid_delivery?: number
          id?: string
          item_condition?: string
          note?: string | null
          order_id?: string
          order_item_id?: string | null
          outbound_delivery_cost?: number
          packaging_loss?: number
          product_cost_loss?: number
          product_id?: string | null
          qc_condition?: string | null
          qc_done_at?: string | null
          qc_done_by?: string | null
          qc_notes?: string | null
          qty?: number
          refund_amount?: number
          refund_status?: string
          resolved_at?: string | null
          return_delivery_cost?: number
          return_status?: string
          return_type?: string
          sku?: string | null
          status?: string
          stock_restored?: boolean
          stock_restored_at?: string | null
          stock_updated?: boolean
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_return_cases_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_return_cases_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_return_cases_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_return_cases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_return_cases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
          {
            foreignKeyName: "erp_return_cases_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_return_timeline: {
        Row: {
          case_id: string
          case_type: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          status: string
        }
        Insert: {
          case_id: string
          case_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          status: string
        }
        Update: {
          case_id?: string
          case_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          status?: string
        }
        Relationships: []
      }
      erp_settings: {
        Row: {
          brand_id: string
          config: Json
          created_at: string
          default_cod_fee_category_id: string | null
          default_cod_wallet_id: string | null
          default_courier: string | null
          id: string
          invoice_footer: string | null
          invoice_pad: number
          invoice_prefix: string | null
          invoice_seq: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          config?: Json
          created_at?: string
          default_cod_fee_category_id?: string | null
          default_cod_wallet_id?: string | null
          default_courier?: string | null
          id?: string
          invoice_footer?: string | null
          invoice_pad?: number
          invoice_prefix?: string | null
          invoice_seq?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          config?: Json
          created_at?: string
          default_cod_fee_category_id?: string | null
          default_cod_wallet_id?: string | null
          default_courier?: string | null
          id?: string
          invoice_footer?: string | null
          invoice_pad?: number
          invoice_prefix?: string | null
          invoice_seq?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_settings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_settings_default_cod_fee_category_id_fkey"
            columns: ["default_cod_fee_category_id"]
            isOneToOne: false
            referencedRelation: "erp_expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_settings_default_cod_wallet_id_fkey"
            columns: ["default_cod_wallet_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_suppliers: {
        Row: {
          address: string | null
          brand_id: string
          contact_person: string | null
          country: string
          created_at: string
          credit_limit_bdt: number
          currency: string
          current_due: number
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          opening_balance: number
          payment_terms_days: number
          phone: string | null
          source_link: string | null
          supplier_type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_id: string
          contact_person?: string | null
          country?: string
          created_at?: string
          credit_limit_bdt?: number
          currency?: string
          current_due?: number
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          source_link?: string | null
          supplier_type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_id?: string
          contact_person?: string | null
          country?: string
          created_at?: string
          credit_limit_bdt?: number
          currency?: string
          current_due?: number
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          source_link?: string | null
          supplier_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_suppliers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_tax_entries: {
        Row: {
          brand_id: string
          created_at: string
          direction: string
          entry_date: string
          id: string
          journal_entry_id: string | null
          note: string | null
          tax_amount: number
          tax_rate_id: string
          taxable_amount: number
        }
        Insert: {
          brand_id: string
          created_at?: string
          direction: string
          entry_date: string
          id?: string
          journal_entry_id?: string | null
          note?: string | null
          tax_amount: number
          tax_rate_id: string
          taxable_amount: number
        }
        Update: {
          brand_id?: string
          created_at?: string
          direction?: string
          entry_date?: string
          id?: string
          journal_entry_id?: string | null
          note?: string | null
          tax_amount?: number
          tax_rate_id?: string
          taxable_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_tax_entries_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_tax_entries_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "erp_tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_tax_rates: {
        Row: {
          brand_id: string
          code: string
          created_at: string
          id: string
          input_account_id: string | null
          is_active: boolean
          kind: string
          name: string
          output_account_id: string | null
          rate: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          code: string
          created_at?: string
          id?: string
          input_account_id?: string | null
          is_active?: boolean
          kind: string
          name: string
          output_account_id?: string | null
          rate: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          code?: string
          created_at?: string
          id?: string
          input_account_id?: string | null
          is_active?: boolean
          kind?: string
          name?: string
          output_account_id?: string | null
          rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_tax_rates_input_account_id_fkey"
            columns: ["input_account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_tax_rates_output_account_id_fkey"
            columns: ["output_account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_transactions: {
        Row: {
          account_id: string | null
          amount: number
          attachment_url: string | null
          brand_id: string
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          supplier_id: string | null
          to_account_id: string | null
          transaction_date: string
          txn_type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          attachment_url?: string | null
          brand_id: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          supplier_id?: string | null
          to_account_id?: string | null
          transaction_date?: string
          txn_type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          attachment_url?: string | null
          brand_id?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          supplier_id?: string | null
          to_account_id?: string | null
          transaction_date?: string
          txn_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transactions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "erp_expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "erp_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transactions_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          sections: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          sections: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          sections?: Json
        }
        Relationships: []
      }
      imp_cargo_agents: {
        Row: {
          address: string | null
          brand_id: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_id?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_id?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imp_cargo_agents_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_cargo_bills: {
        Row: {
          attachment_url: string | null
          bill_date: string
          bill_number: string | null
          brand_id: string
          cargo_agent_id: string
          created_at: string
          created_by: string | null
          customs_charge: number
          id: string
          local_delivery_charge: number
          note: string | null
          other_charge: number
          paid_from_account_bdt: number
          paid_from_balance_bdt: number
          payable_bdt: number
          payment_account_id: string | null
          payment_source: string
          po_id: string | null
          service_charge: number
          shipment_ref: string | null
          shipping_charge: number
          total_bdt: number
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          attachment_url?: string | null
          bill_date?: string
          bill_number?: string | null
          brand_id: string
          cargo_agent_id: string
          created_at?: string
          created_by?: string | null
          customs_charge?: number
          id?: string
          local_delivery_charge?: number
          note?: string | null
          other_charge?: number
          paid_from_account_bdt?: number
          paid_from_balance_bdt?: number
          payable_bdt?: number
          payment_account_id?: string | null
          payment_source?: string
          po_id?: string | null
          service_charge?: number
          shipment_ref?: string | null
          shipping_charge?: number
          total_bdt?: number
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          attachment_url?: string | null
          bill_date?: string
          bill_number?: string | null
          brand_id?: string
          cargo_agent_id?: string
          created_at?: string
          created_by?: string | null
          customs_charge?: number
          id?: string
          local_delivery_charge?: number
          note?: string | null
          other_charge?: number
          paid_from_account_bdt?: number
          paid_from_balance_bdt?: number
          payable_bdt?: number
          payment_account_id?: string | null
          payment_source?: string
          po_id?: string | null
          service_charge?: number
          shipment_ref?: string | null
          shipping_charge?: number
          total_bdt?: number
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_cargo_bills_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_cargo_bills_cargo_agent_id_fkey"
            columns: ["cargo_agent_id"]
            isOneToOne: false
            referencedRelation: "imp_cargo_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_cargo_bills_cargo_agent_id_fkey"
            columns: ["cargo_agent_id"]
            isOneToOne: false
            referencedRelation: "imp_cargo_balances"
            referencedColumns: ["cargo_agent_id"]
          },
          {
            foreignKeyName: "imp_cargo_bills_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_cargo_bills_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "imp_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_cargo_ledger: {
        Row: {
          attachment_url: string | null
          brand_id: string
          cargo_agent_id: string
          created_at: string
          created_by: string | null
          credit_bdt: number
          debit_bdt: number
          entry_date: string
          entry_type: string
          id: string
          note: string | null
          payment_account_id: string | null
          ref_id: string | null
          ref_label: string | null
          ref_type: string | null
        }
        Insert: {
          attachment_url?: string | null
          brand_id: string
          cargo_agent_id: string
          created_at?: string
          created_by?: string | null
          credit_bdt?: number
          debit_bdt?: number
          entry_date?: string
          entry_type: string
          id?: string
          note?: string | null
          payment_account_id?: string | null
          ref_id?: string | null
          ref_label?: string | null
          ref_type?: string | null
        }
        Update: {
          attachment_url?: string | null
          brand_id?: string
          cargo_agent_id?: string
          created_at?: string
          created_by?: string | null
          credit_bdt?: number
          debit_bdt?: number
          entry_date?: string
          entry_type?: string
          id?: string
          note?: string | null
          payment_account_id?: string | null
          ref_id?: string | null
          ref_label?: string | null
          ref_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_cargo_ledger_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_cargo_ledger_cargo_agent_id_fkey"
            columns: ["cargo_agent_id"]
            isOneToOne: false
            referencedRelation: "imp_cargo_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_cargo_ledger_cargo_agent_id_fkey"
            columns: ["cargo_agent_id"]
            isOneToOne: false
            referencedRelation: "imp_cargo_balances"
            referencedColumns: ["cargo_agent_id"]
          },
          {
            foreignKeyName: "imp_cargo_ledger_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_carton_items: {
        Row: {
          carton_id: string
          created_at: string
          damaged_qty: number
          id: string
          po_item_id: string
          product_id: string | null
          quantity_damaged: number
          quantity_expected: number
          quantity_missing: number
          quantity_ok: number
          received_qty: number | null
          sku_snapshot: string | null
          supplier_cost_portion_bdt: number
          usable_qty: number | null
          variant_id: string | null
        }
        Insert: {
          carton_id: string
          created_at?: string
          damaged_qty?: number
          id?: string
          po_item_id: string
          product_id?: string | null
          quantity_damaged?: number
          quantity_expected: number
          quantity_missing?: number
          quantity_ok?: number
          received_qty?: number | null
          sku_snapshot?: string | null
          supplier_cost_portion_bdt?: number
          usable_qty?: number | null
          variant_id?: string | null
        }
        Update: {
          carton_id?: string
          created_at?: string
          damaged_qty?: number
          id?: string
          po_item_id?: string
          product_id?: string | null
          quantity_damaged?: number
          quantity_expected?: number
          quantity_missing?: number
          quantity_ok?: number
          received_qty?: number | null
          sku_snapshot?: string | null
          supplier_cost_portion_bdt?: number
          usable_qty?: number | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_carton_items_carton_id_fkey"
            columns: ["carton_id"]
            isOneToOne: false
            referencedRelation: "imp_cartons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_carton_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "imp_po_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_carton_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_carton_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
          {
            foreignKeyName: "imp_carton_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_cartons: {
        Row: {
          barcode: string
          carton_number: number
          cost_share_bdt: number | null
          created_at: string
          expected_quantity: number
          id: string
          local_courier_bdt: number
          notes: string | null
          paid_bdt: number
          po_id: string
          posted_at: string | null
          qc_at: string | null
          received_at: string | null
          released_at: string | null
          shipping_charge_bdt: number
          status: Database["public"]["Enums"]["imp_carton_status"]
          supplier_cost_bdt: number
          total_landed_bdt: number
          updated_at: string
          warehouse_id: string | null
          weight_kg: number | null
        }
        Insert: {
          barcode: string
          carton_number: number
          cost_share_bdt?: number | null
          created_at?: string
          expected_quantity?: number
          id?: string
          local_courier_bdt?: number
          notes?: string | null
          paid_bdt?: number
          po_id: string
          posted_at?: string | null
          qc_at?: string | null
          received_at?: string | null
          released_at?: string | null
          shipping_charge_bdt?: number
          status?: Database["public"]["Enums"]["imp_carton_status"]
          supplier_cost_bdt?: number
          total_landed_bdt?: number
          updated_at?: string
          warehouse_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          barcode?: string
          carton_number?: number
          cost_share_bdt?: number | null
          created_at?: string
          expected_quantity?: number
          id?: string
          local_courier_bdt?: number
          notes?: string | null
          paid_bdt?: number
          po_id?: string
          posted_at?: string | null
          qc_at?: string | null
          received_at?: string | null
          released_at?: string | null
          shipping_charge_bdt?: number
          status?: Database["public"]["Enums"]["imp_carton_status"]
          supplier_cost_bdt?: number
          total_landed_bdt?: number
          updated_at?: string
          warehouse_id?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_cartons_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "imp_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_cartons_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_payments: {
        Row: {
          amount_bdt: number
          brand_id: string
          carton_id: string | null
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          is_reversed: boolean
          journal_entry_id: string | null
          notes: string | null
          payment_date: string
          payment_type: Database["public"]["Enums"]["imp_payment_type"]
          po_id: string
          reference: string | null
          reversed_at: string | null
          reverses_id: string | null
          wallet_id: string
        }
        Insert: {
          amount_bdt: number
          brand_id: string
          carton_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key: string
          is_reversed?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_type: Database["public"]["Enums"]["imp_payment_type"]
          po_id: string
          reference?: string | null
          reversed_at?: string | null
          reverses_id?: string | null
          wallet_id: string
        }
        Update: {
          amount_bdt?: number
          brand_id?: string
          carton_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string
          is_reversed?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_type?: Database["public"]["Enums"]["imp_payment_type"]
          po_id?: string
          reference?: string | null
          reversed_at?: string | null
          reverses_id?: string | null
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imp_payments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_payments_carton_id_fkey"
            columns: ["carton_id"]
            isOneToOne: false
            referencedRelation: "imp_cartons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_payments_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "imp_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_payments_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "imp_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_payments_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_po_items: {
        Row: {
          created_at: string
          id: string
          image_snapshot: string | null
          landed_cost_bdt: number | null
          name_snapshot: string
          po_id: string
          product_id: string | null
          quantity: number
          sku_snapshot: string | null
          subtotal_bdt: number
          unit_cost_bdt: number
          unit_cost_cny: number | null
          unit_cost_foreign: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_snapshot?: string | null
          landed_cost_bdt?: number | null
          name_snapshot: string
          po_id: string
          product_id?: string | null
          quantity: number
          sku_snapshot?: string | null
          subtotal_bdt?: number
          unit_cost_bdt?: number
          unit_cost_cny?: number | null
          unit_cost_foreign?: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_snapshot?: string | null
          landed_cost_bdt?: number | null
          name_snapshot?: string
          po_id?: string
          product_id?: string | null
          quantity?: number
          sku_snapshot?: string | null
          subtotal_bdt?: number
          unit_cost_bdt?: number
          unit_cost_cny?: number | null
          unit_cost_foreign?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_po_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "imp_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_po_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_po_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
          {
            foreignKeyName: "imp_po_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_po_release_items: {
        Row: {
          created_at: string
          damaged_qty: number
          id: string
          po_item_id: string
          product_id: string | null
          quantity: number
          release_id: string
          sku_snapshot: string | null
          stock_movement_id: string | null
          unit_landed_cost_bdt: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          damaged_qty?: number
          id?: string
          po_item_id: string
          product_id?: string | null
          quantity: number
          release_id: string
          sku_snapshot?: string | null
          stock_movement_id?: string | null
          unit_landed_cost_bdt?: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          damaged_qty?: number
          id?: string
          po_item_id?: string
          product_id?: string | null
          quantity?: number
          release_id?: string
          sku_snapshot?: string | null
          stock_movement_id?: string | null
          unit_landed_cost_bdt?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_po_release_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "imp_po_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_po_release_items_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "imp_po_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_po_releases: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          po_id: string
          release_number: number
          released_at: string
          warehouse_id: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          po_id: string
          release_number: number
          released_at?: string
          warehouse_id?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          po_id?: string
          release_number?: number
          released_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_po_releases_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "imp_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_po_sequences: {
        Row: {
          brand_id: string
          last_number: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          last_number?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          last_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imp_po_sequences_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_purchase_orders: {
        Row: {
          agent_commission_cny: number
          agent_commission_per_unit_bdt: number | null
          agent_commission_total_bdt: number | null
          brand_id: string
          cargo_agent_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          customs_duty_bdt: number
          due_bdt: number
          freight_cost_bdt: number
          fx_rate: number
          fx_rate_cny_bdt: number | null
          fx_rate_locked_at: string | null
          fx_rate_source: string | null
          grand_total_bdt: number
          id: string
          landed_cost_per_unit_bdt: number | null
          local_courier_total_bdt: number
          notes: string | null
          order_date: string
          other_charges_bdt: number
          paid_bdt: number
          po_number: string
          product_subtotal_bdt: number
          receive_mode: string
          shipped_at: string | null
          shipping_cost_bdt: number | null
          shipping_rate_per_kg: number | null
          shipping_total_bdt: number
          shipping_weight_kg: number | null
          status: Database["public"]["Enums"]["imp_po_status"]
          submitted_by_agent_id: string | null
          supplier_id: string | null
          total_units: number | null
          total_weight_kg: number | null
          updated_at: string
        }
        Insert: {
          agent_commission_cny?: number
          agent_commission_per_unit_bdt?: number | null
          agent_commission_total_bdt?: number | null
          brand_id: string
          cargo_agent_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customs_duty_bdt?: number
          due_bdt?: number
          freight_cost_bdt?: number
          fx_rate?: number
          fx_rate_cny_bdt?: number | null
          fx_rate_locked_at?: string | null
          fx_rate_source?: string | null
          grand_total_bdt?: number
          id?: string
          landed_cost_per_unit_bdt?: number | null
          local_courier_total_bdt?: number
          notes?: string | null
          order_date?: string
          other_charges_bdt?: number
          paid_bdt?: number
          po_number: string
          product_subtotal_bdt?: number
          receive_mode?: string
          shipped_at?: string | null
          shipping_cost_bdt?: number | null
          shipping_rate_per_kg?: number | null
          shipping_total_bdt?: number
          shipping_weight_kg?: number | null
          status?: Database["public"]["Enums"]["imp_po_status"]
          submitted_by_agent_id?: string | null
          supplier_id?: string | null
          total_units?: number | null
          total_weight_kg?: number | null
          updated_at?: string
        }
        Update: {
          agent_commission_cny?: number
          agent_commission_per_unit_bdt?: number | null
          agent_commission_total_bdt?: number | null
          brand_id?: string
          cargo_agent_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customs_duty_bdt?: number
          due_bdt?: number
          freight_cost_bdt?: number
          fx_rate?: number
          fx_rate_cny_bdt?: number | null
          fx_rate_locked_at?: string | null
          fx_rate_source?: string | null
          grand_total_bdt?: number
          id?: string
          landed_cost_per_unit_bdt?: number | null
          local_courier_total_bdt?: number
          notes?: string | null
          order_date?: string
          other_charges_bdt?: number
          paid_bdt?: number
          po_number?: string
          product_subtotal_bdt?: number
          receive_mode?: string
          shipped_at?: string | null
          shipping_cost_bdt?: number | null
          shipping_rate_per_kg?: number | null
          shipping_total_bdt?: number
          shipping_weight_kg?: number | null
          status?: Database["public"]["Enums"]["imp_po_status"]
          submitted_by_agent_id?: string | null
          supplier_id?: string | null
          total_units?: number | null
          total_weight_kg?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imp_purchase_orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_purchase_orders_cargo_agent_id_fkey"
            columns: ["cargo_agent_id"]
            isOneToOne: false
            referencedRelation: "imp_cargo_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_purchase_orders_cargo_agent_id_fkey"
            columns: ["cargo_agent_id"]
            isOneToOne: false
            referencedRelation: "imp_cargo_balances"
            referencedColumns: ["cargo_agent_id"]
          },
          {
            foreignKeyName: "imp_purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "erp_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_status_history: {
        Row: {
          action: string | null
          after_data: Json | null
          before_data: Json | null
          brand_id: string
          changed_by: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_status: string | null
          notes: string | null
          previous_status: string | null
        }
        Insert: {
          action?: string | null
          after_data?: Json | null
          before_data?: Json | null
          brand_id: string
          changed_by?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          new_status?: string | null
          notes?: string | null
          previous_status?: string | null
        }
        Update: {
          action?: string | null
          after_data?: Json | null
          before_data?: Json | null
          brand_id?: string
          changed_by?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_status?: string | null
          notes?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_status_history_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      local_po_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          ordered_qty: number
          pending_qty: number | null
          po_id: string
          product_id: string | null
          received_qty: number
          total_cost: number | null
          unit_cost: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          ordered_qty: number
          pending_qty?: number | null
          po_id: string
          product_id?: string | null
          received_qty?: number
          total_cost?: number | null
          unit_cost?: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          ordered_qty?: number
          pending_qty?: number | null
          po_id?: string
          product_id?: string | null
          received_qty?: number
          total_cost?: number | null
          unit_cost?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "local_po_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "local_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_po_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_po_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
          {
            foreignKeyName: "local_po_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      local_po_receipt_items: {
        Row: {
          created_at: string
          id: string
          po_item_id: string | null
          product_id: string | null
          receipt_id: string
          received_qty: number
          unit_cost: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          po_item_id?: string | null
          product_id?: string | null
          receipt_id: string
          received_qty: number
          unit_cost?: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          po_item_id?: string | null
          product_id?: string | null
          receipt_id?: string
          received_qty?: number
          unit_cost?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "local_po_receipt_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "local_po_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_po_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_po_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
          {
            foreignKeyName: "local_po_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "local_po_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_po_receipt_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      local_po_receipts: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          po_id: string
          received_date: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          po_id: string
          received_date?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          po_id?: string
          received_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_po_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "local_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      local_purchase_orders: {
        Row: {
          amount_paid: number
          balance_due: number | null
          bill_id: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          discount: number
          expected_date: string | null
          id: string
          notes: string | null
          order_date: string
          po_number: string
          received_date: string | null
          shipping_cost: number
          status: string
          subtotal: number
          supplier_id: string
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          balance_due?: number | null
          bill_id?: string | null
          brand_id: string
          created_at?: string
          created_by?: string | null
          discount?: number
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          po_number: string
          received_date?: string | null
          shipping_cost?: number
          status?: string
          subtotal?: number
          supplier_id: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          balance_due?: number | null
          bill_id?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          discount?: number
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          po_number?: string
          received_date?: string | null
          shipping_cost?: number
          status?: string
          subtotal?: number
          supplier_id?: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "erp_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      low_stock_alerts: {
        Row: {
          brand_id: string | null
          created_at: string
          current_stock: number
          id: string
          is_resolved: boolean
          product_id: string
          resolved_at: string | null
          threshold: number
          variant_id: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          current_stock: number
          id?: string
          is_resolved?: boolean
          product_id: string
          resolved_at?: string | null
          threshold: number
          variant_id?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          current_stock?: number
          id?: string
          is_resolved?: boolean
          product_id?: string
          resolved_at?: string | null
          threshold?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "low_stock_alerts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_wallet_ledger: {
        Row: {
          ad_account_id: string
          balance_usd_after: number | null
          bdt_value: number
          conversion_source: string | null
          created_at: string
          created_by: string | null
          entry_date: string
          entry_type: string
          id: string
          note: string | null
          rate_used: number | null
          source_purchase_id: string | null
          source_spend_ref: string | null
          usd_delta: number
        }
        Insert: {
          ad_account_id: string
          balance_usd_after?: number | null
          bdt_value?: number
          conversion_source?: string | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_type: string
          id?: string
          note?: string | null
          rate_used?: number | null
          source_purchase_id?: string | null
          source_spend_ref?: string | null
          usd_delta: number
        }
        Update: {
          ad_account_id?: string
          balance_usd_after?: number | null
          bdt_value?: number
          conversion_source?: string | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_type?: string
          id?: string
          note?: string | null
          rate_used?: number | null
          source_purchase_id?: string | null
          source_spend_ref?: string | null
          usd_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_wallet_ledger_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_wallet_ledger_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "v_meta_ad_wallet_summary"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "meta_ad_wallet_ledger_source_purchase_id_fkey"
            columns: ["source_purchase_id"]
            isOneToOne: false
            referencedRelation: "meta_dollar_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_capi_log: {
        Row: {
          brand_id: string | null
          created_at: string
          error: string | null
          event_id: string | null
          event_name: string
          events_received: number | null
          fbtrace_id: string | null
          id: string
          response: Json | null
          source: string | null
          status: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          error?: string | null
          event_id?: string | null
          event_name: string
          events_received?: number | null
          fbtrace_id?: string | null
          id?: string
          response?: Json | null
          source?: string | null
          status: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          error?: string | null
          event_id?: string | null
          event_name?: string
          events_received?: number | null
          fbtrace_id?: string | null
          id?: string
          response?: Json | null
          source?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_capi_log_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_dollar_purchases: {
        Row: {
          ad_account_id: string
          attachment_url: string | null
          bdt_amount: number | null
          brand_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          effective_rate: number | null
          fee_bdt: number
          id: string
          note: string | null
          paid_from_account_id: string
          payment_method: string | null
          purchase_date: string
          reference: string | null
          status: string
          supplier_name: string | null
          total_bdt: number | null
          updated_at: string
          usd_amount: number
          usd_rate: number
        }
        Insert: {
          ad_account_id: string
          attachment_url?: string | null
          bdt_amount?: number | null
          brand_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          effective_rate?: number | null
          fee_bdt?: number
          id?: string
          note?: string | null
          paid_from_account_id: string
          payment_method?: string | null
          purchase_date?: string
          reference?: string | null
          status?: string
          supplier_name?: string | null
          total_bdt?: number | null
          updated_at?: string
          usd_amount: number
          usd_rate: number
        }
        Update: {
          ad_account_id?: string
          attachment_url?: string | null
          bdt_amount?: number | null
          brand_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          effective_rate?: number | null
          fee_bdt?: number
          id?: string
          note?: string | null
          paid_from_account_id?: string
          payment_method?: string | null
          purchase_date?: string
          reference?: string | null
          status?: string
          supplier_name?: string | null
          total_bdt?: number | null
          updated_at?: string
          usd_amount?: number
          usd_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "meta_dollar_purchases_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_dollar_purchases_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "v_meta_ad_wallet_summary"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "meta_dollar_purchases_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_dollar_purchases_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_fifo_lots: {
        Row: {
          ad_account_id: string
          created_at: string
          effective_rate: number
          id: string
          is_active: boolean
          lot_date: string
          purchase_id: string | null
          usd_remaining: number
          usd_total: number
        }
        Insert: {
          ad_account_id: string
          created_at?: string
          effective_rate: number
          id?: string
          is_active?: boolean
          lot_date: string
          purchase_id?: string | null
          usd_remaining: number
          usd_total: number
        }
        Update: {
          ad_account_id?: string
          created_at?: string
          effective_rate?: number
          id?: string
          is_active?: boolean
          lot_date?: string
          purchase_id?: string | null
          usd_remaining?: number
          usd_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "meta_fifo_lots_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_fifo_lots_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "v_meta_ad_wallet_summary"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "meta_fifo_lots_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "meta_dollar_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_spend_consumptions: {
        Row: {
          ad_account_id: string
          bdt_cost: number
          conversion_source: string
          created_at: string
          id: string
          insight_id: string | null
          lots_used: Json
          spend_ref: string
          updated_at: string
          usd_consumed: number
          usd_spend_recorded: number
        }
        Insert: {
          ad_account_id: string
          bdt_cost?: number
          conversion_source?: string
          created_at?: string
          id?: string
          insight_id?: string | null
          lots_used?: Json
          spend_ref: string
          updated_at?: string
          usd_consumed?: number
          usd_spend_recorded?: number
        }
        Update: {
          ad_account_id?: string
          bdt_cost?: number
          conversion_source?: string
          created_at?: string
          id?: string
          insight_id?: string | null
          lots_used?: Json
          spend_ref?: string
          updated_at?: string
          usd_consumed?: number
          usd_spend_recorded?: number
        }
        Relationships: [
          {
            foreignKeyName: "meta_spend_consumptions_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_spend_consumptions_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "v_meta_ad_wallet_summary"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "meta_spend_consumptions_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "mkt_insights_daily"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_tracking_config: {
        Row: {
          brand_id: string
          capi_access_token: string | null
          capi_enabled: boolean
          created_at: string
          enabled_events: Json
          pixel_id: string | null
          site_key: string | null
          test_event_code: string | null
          token_secret_name: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          capi_access_token?: string | null
          capi_enabled?: boolean
          created_at?: string
          enabled_events?: Json
          pixel_id?: string | null
          site_key?: string | null
          test_event_code?: string | null
          token_secret_name?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          capi_access_token?: string | null
          capi_enabled?: boolean
          created_at?: string
          enabled_events?: Json
          pixel_id?: string | null
          site_key?: string | null
          test_event_code?: string | null
          token_secret_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_tracking_config_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_ad_account_brands: {
        Row: {
          ad_account_id: string
          brand_id: string
          created_at: string
          id: string
          is_primary: boolean
        }
        Insert: {
          ad_account_id: string
          brand_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
        }
        Update: {
          ad_account_id?: string
          brand_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "mkt_ad_account_brands_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ad_account_brands_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "v_meta_ad_wallet_summary"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "mkt_ad_account_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_ad_accounts: {
        Row: {
          access_token: string | null
          app_id: string | null
          app_secret: string | null
          auto_post_to_finance: boolean
          brand_id: string
          business_id: string | null
          created_at: string
          currency: string | null
          external_id: string
          finance_wallet_id: string | null
          id: string
          last_error: string | null
          last_insights_sync_at: string | null
          last_structure_sync_at: string | null
          name: string
          status: Database["public"]["Enums"]["mkt_account_status"]
          timezone: string | null
          updated_at: string
          usd_to_bdt_rate: number
        }
        Insert: {
          access_token?: string | null
          app_id?: string | null
          app_secret?: string | null
          auto_post_to_finance?: boolean
          brand_id: string
          business_id?: string | null
          created_at?: string
          currency?: string | null
          external_id: string
          finance_wallet_id?: string | null
          id?: string
          last_error?: string | null
          last_insights_sync_at?: string | null
          last_structure_sync_at?: string | null
          name: string
          status?: Database["public"]["Enums"]["mkt_account_status"]
          timezone?: string | null
          updated_at?: string
          usd_to_bdt_rate?: number
        }
        Update: {
          access_token?: string | null
          app_id?: string | null
          app_secret?: string | null
          auto_post_to_finance?: boolean
          brand_id?: string
          business_id?: string | null
          created_at?: string
          currency?: string | null
          external_id?: string
          finance_wallet_id?: string | null
          id?: string
          last_error?: string | null
          last_insights_sync_at?: string | null
          last_structure_sync_at?: string | null
          name?: string
          status?: Database["public"]["Enums"]["mkt_account_status"]
          timezone?: string | null
          updated_at?: string
          usd_to_bdt_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "mkt_ad_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ad_accounts_finance_wallet_id_fkey"
            columns: ["finance_wallet_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_ads: {
        Row: {
          account_id: string
          adset_id: string
          brand_id: string | null
          campaign_id: string
          created_at: string
          creative_body: string | null
          creative_thumbnail: string | null
          effective_status: string | null
          external_id: string
          id: string
          name: string
          raw: Json | null
          status: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          adset_id: string
          brand_id?: string | null
          campaign_id: string
          created_at?: string
          creative_body?: string | null
          creative_thumbnail?: string | null
          effective_status?: string | null
          external_id: string
          id?: string
          name: string
          raw?: Json | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          adset_id?: string
          brand_id?: string | null
          campaign_id?: string
          created_at?: string
          creative_body?: string | null
          creative_thumbnail?: string | null
          effective_status?: string | null
          external_id?: string
          id?: string
          name?: string
          raw?: Json | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_ads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_meta_ad_wallet_summary"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "mkt_ads_adset_id_fkey"
            columns: ["adset_id"]
            isOneToOne: false
            referencedRelation: "mkt_adsets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ads_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_adsets: {
        Row: {
          account_id: string
          brand_id: string | null
          campaign_id: string
          created_at: string
          daily_budget: number | null
          effective_status: string | null
          external_id: string
          id: string
          lifetime_budget: number | null
          name: string
          raw: Json | null
          status: string | null
          targeting_summary: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          brand_id?: string | null
          campaign_id: string
          created_at?: string
          daily_budget?: number | null
          effective_status?: string | null
          external_id: string
          id?: string
          lifetime_budget?: number | null
          name: string
          raw?: Json | null
          status?: string | null
          targeting_summary?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          brand_id?: string | null
          campaign_id?: string
          created_at?: string
          daily_budget?: number | null
          effective_status?: string | null
          external_id?: string
          id?: string
          lifetime_budget?: number | null
          name?: string
          raw?: Json | null
          status?: string | null
          targeting_summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_adsets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_adsets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_meta_ad_wallet_summary"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "mkt_adsets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_adsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_attribution_candidates: {
        Row: {
          brand_id: string
          confidence: number
          created_at: string
          id: string
          matched_signal: Json
          order_id: string
          source: string
          status: string
          suggested_campaign_id: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          confidence: number
          created_at?: string
          id?: string
          matched_signal?: Json
          order_id: string
          source: string
          status?: string
          suggested_campaign_id?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          confidence?: number
          created_at?: string
          id?: string
          matched_signal?: Json
          order_id?: string
          source?: string
          status?: string
          suggested_campaign_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mkt_campaign_products: {
        Row: {
          brand_id: string
          campaign_id: string
          created_at: string
          id: string
          note: string | null
          product_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          brand_id: string
          campaign_id: string
          created_at?: string
          id?: string
          note?: string | null
          product_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          brand_id?: string
          campaign_id?: string
          created_at?: string
          id?: string
          note?: string | null
          product_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "mkt_campaign_products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_campaign_products_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_campaign_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_campaign_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
        ]
      }
      mkt_campaigns: {
        Row: {
          account_id: string
          brand_id: string | null
          created_at: string
          daily_budget: number | null
          effective_status: string | null
          external_id: string
          id: string
          lifetime_budget: number | null
          name: string
          objective: string | null
          raw: Json | null
          start_time: string | null
          status: string | null
          stop_time: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          brand_id?: string | null
          created_at?: string
          daily_budget?: number | null
          effective_status?: string | null
          external_id: string
          id?: string
          lifetime_budget?: number | null
          name: string
          objective?: string | null
          raw?: Json | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          brand_id?: string | null
          created_at?: string
          daily_budget?: number | null
          effective_status?: string | null
          external_id?: string
          id?: string
          lifetime_budget?: number | null
          name?: string
          objective?: string | null
          raw?: Json | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_meta_ad_wallet_summary"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "mkt_campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_insights_daily: {
        Row: {
          account_id: string
          ad_id: string | null
          adset_id: string | null
          brand_id: string
          campaign_id: string | null
          clicks: number
          conversion_source: string | null
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          date: string
          estimated_bdt_cost: boolean
          fifo_consumed_at: string | null
          fifo_consumption_ref: string | null
          id: string
          impressions: number
          meta_add_to_cart: number
          meta_initiate_checkout: number
          meta_leads: number
          meta_purchase_value: number
          meta_purchases: number
          raw: Json | null
          reach: number
          spend: number
          spend_bdt_fifo: number | null
          updated_at: string
        }
        Insert: {
          account_id: string
          ad_id?: string | null
          adset_id?: string | null
          brand_id: string
          campaign_id?: string | null
          clicks?: number
          conversion_source?: string | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          date: string
          estimated_bdt_cost?: boolean
          fifo_consumed_at?: string | null
          fifo_consumption_ref?: string | null
          id?: string
          impressions?: number
          meta_add_to_cart?: number
          meta_initiate_checkout?: number
          meta_leads?: number
          meta_purchase_value?: number
          meta_purchases?: number
          raw?: Json | null
          reach?: number
          spend?: number
          spend_bdt_fifo?: number | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          ad_id?: string | null
          adset_id?: string | null
          brand_id?: string
          campaign_id?: string | null
          clicks?: number
          conversion_source?: string | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          date?: string
          estimated_bdt_cost?: boolean
          fifo_consumed_at?: string | null
          fifo_consumption_ref?: string | null
          id?: string
          impressions?: number
          meta_add_to_cart?: number
          meta_initiate_checkout?: number
          meta_leads?: number
          meta_purchase_value?: number
          meta_purchases?: number
          raw?: Json | null
          reach?: number
          spend?: number
          spend_bdt_fifo?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_insights_daily_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_insights_daily_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_meta_ad_wallet_summary"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "mkt_insights_daily_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "mkt_ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_insights_daily_adset_id_fkey"
            columns: ["adset_id"]
            isOneToOne: false
            referencedRelation: "mkt_adsets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_insights_daily_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_insights_daily_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_manual_expenses: {
        Row: {
          account_id: string | null
          amount: number
          attachment_url: string | null
          brand_id: string
          campaign_id: string | null
          category: Database["public"]["Enums"]["mkt_expense_category"]
          created_at: string
          created_by: string | null
          currency: string
          date: string
          id: string
          mkt_ad_account_id: string | null
          note: string | null
          product_id: string | null
          source: string
          transaction_id: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          attachment_url?: string | null
          brand_id: string
          campaign_id?: string | null
          category?: Database["public"]["Enums"]["mkt_expense_category"]
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string
          id?: string
          mkt_ad_account_id?: string | null
          note?: string | null
          product_id?: string | null
          source?: string
          transaction_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          attachment_url?: string | null
          brand_id?: string
          campaign_id?: string | null
          category?: Database["public"]["Enums"]["mkt_expense_category"]
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string
          id?: string
          mkt_ad_account_id?: string | null
          note?: string | null
          product_id?: string | null
          source?: string
          transaction_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_manual_expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_manual_expenses_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_manual_expenses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_manual_expenses_mkt_ad_account_id_fkey"
            columns: ["mkt_ad_account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_manual_expenses_mkt_ad_account_id_fkey"
            columns: ["mkt_ad_account_id"]
            isOneToOne: false
            referencedRelation: "v_meta_ad_wallet_summary"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "mkt_manual_expenses_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_manual_expenses_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
          {
            foreignKeyName: "mkt_manual_expenses_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "erp_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_order_attributions: {
        Row: {
          ad_id: string | null
          adset_id: string | null
          brand_id: string
          campaign_id: string | null
          confidence: number
          created_at: string
          fbclid: string | null
          id: string
          note: string | null
          order_id: string
          source: Database["public"]["Enums"]["mkt_attribution_source"]
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          ad_id?: string | null
          adset_id?: string | null
          brand_id: string
          campaign_id?: string | null
          confidence?: number
          created_at?: string
          fbclid?: string | null
          id?: string
          note?: string | null
          order_id: string
          source: Database["public"]["Enums"]["mkt_attribution_source"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          ad_id?: string | null
          adset_id?: string | null
          brand_id?: string
          campaign_id?: string | null
          confidence?: number
          created_at?: string
          fbclid?: string | null
          id?: string
          note?: string | null
          order_id?: string
          source?: Database["public"]["Enums"]["mkt_attribution_source"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_order_attributions_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "mkt_ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_order_attributions_adset_id_fkey"
            columns: ["adset_id"]
            isOneToOne: false
            referencedRelation: "mkt_adsets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_order_attributions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_order_attributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_order_attributions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_sync_log: {
        Row: {
          account_id: string | null
          brand_id: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          kind: Database["public"]["Enums"]["mkt_sync_kind"]
          meta: Json | null
          rows_processed: number
          started_at: string
          status: Database["public"]["Enums"]["mkt_sync_status"]
        }
        Insert: {
          account_id?: string | null
          brand_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["mkt_sync_kind"]
          meta?: Json | null
          rows_processed?: number
          started_at?: string
          status?: Database["public"]["Enums"]["mkt_sync_status"]
        }
        Update: {
          account_id?: string | null
          brand_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["mkt_sync_kind"]
          meta?: Json | null
          rows_processed?: number
          started_at?: string
          status?: Database["public"]["Enums"]["mkt_sync_status"]
        }
        Relationships: [
          {
            foreignKeyName: "mkt_sync_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_sync_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_meta_ad_wallet_summary"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "mkt_sync_log_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_tracking_events: {
        Row: {
          brand_id: string | null
          created_at: string
          event_type: string
          fbclid: string | null
          id: string
          ip_hash: string | null
          order_id: string | null
          phone: string | null
          product_id: string | null
          raw: Json | null
          referrer: string | null
          session_id: string | null
          url: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          event_type: string
          fbclid?: string | null
          id?: string
          ip_hash?: string | null
          order_id?: string | null
          phone?: string | null
          product_id?: string | null
          raw?: Json | null
          referrer?: string | null
          session_id?: string | null
          url?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          event_type?: string
          fbclid?: string | null
          id?: string
          ip_hash?: string | null
          order_id?: string | null
          phone?: string | null
          product_id?: string | null
          raw?: Json | null
          referrer?: string | null
          session_id?: string | null
          url?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_tracking_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_tracking_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_tracking_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_tracking_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
        ]
      }
      order_items: {
        Row: {
          combo_parent_item_id: string | null
          courier_cost_allocated: number
          created_at: string
          delivery_charge_allocated: number
          discount_amount: number
          discount_type: Database["public"]["Enums"]["discount_type"] | null
          id: string
          image: string | null
          is_combo_child: boolean
          line_discount_allocated: number
          line_total: number | null
          name: string
          order_id: string
          packaging_cost_allocated: number
          price: number
          product_id: string
          quantity: number
          refund_amount_allocated: number
          source_type: string | null
          status_snapshot: string | null
          tax_amount: number
          unit_cost_snapshot: number | null
          unit_price: number | null
          user_id: string | null
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          combo_parent_item_id?: string | null
          courier_cost_allocated?: number
          created_at?: string
          delivery_charge_allocated?: number
          discount_amount?: number
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          id?: string
          image?: string | null
          is_combo_child?: boolean
          line_discount_allocated?: number
          line_total?: number | null
          name: string
          order_id: string
          packaging_cost_allocated?: number
          price: number
          product_id: string
          quantity?: number
          refund_amount_allocated?: number
          source_type?: string | null
          status_snapshot?: string | null
          tax_amount?: number
          unit_cost_snapshot?: number | null
          unit_price?: number | null
          user_id?: string | null
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          combo_parent_item_id?: string | null
          courier_cost_allocated?: number
          created_at?: string
          delivery_charge_allocated?: number
          discount_amount?: number
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          id?: string
          image?: string | null
          is_combo_child?: boolean
          line_discount_allocated?: number
          line_total?: number | null
          name?: string
          order_id?: string
          packaging_cost_allocated?: number
          price?: number
          product_id?: string
          quantity?: number
          refund_amount_allocated?: number
          source_type?: string | null
          status_snapshot?: string | null
          tax_amount?: number
          unit_cost_snapshot?: number | null
          unit_price?: number | null
          user_id?: string | null
          variant_id?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_combo_parent_item_id_fkey"
            columns: ["combo_parent_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
        ]
      }
      order_locks: {
        Row: {
          acquired_at: string
          last_heartbeat_at: string
          order_id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          acquired_at?: string
          last_heartbeat_at?: string
          order_id: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          acquired_at?: string
          last_heartbeat_at?: string
          order_id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      order_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_internal: boolean
          order_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_internal?: boolean
          order_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_internal?: boolean
          order_id?: string
        }
        Relationships: []
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          metadata: Json | null
          note: string | null
          order_id: string
          reason: string | null
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json | null
          note?: string | null
          order_id: string
          reason?: string | null
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json | null
          note?: string | null
          order_id?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: []
      }
      order_stock_backfill_runs: {
        Row: {
          created_at: string
          id: string
          movements_created: number
          note: string | null
          orders_scanned: number
          qty_deducted: number
          qty_restored: number
          run_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          movements_created?: number
          note?: string | null
          orders_scanned?: number
          qty_deducted?: number
          qty_restored?: number
          run_key: string
        }
        Update: {
          created_at?: string
          id?: string
          movements_created?: number
          note?: string | null
          orders_scanned?: number
          qty_deducted?: number
          qty_restored?: number
          run_key?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          actual_shipping_breakdown: Json | null
          actual_shipping_cost: number | null
          actual_shipping_recorded_at: string | null
          actual_shipping_source: string | null
          admin_notes: string | null
          advance_amount: number
          advance_payment_number: string | null
          advance_source: string | null
          advance_txn_id: string | null
          alternate_phone: string | null
          assigned_to: string | null
          attribution: Json | null
          attribution_landing_page: string | null
          auto_call_enabled: boolean | null
          brand_id: string | null
          call_attempt_count: number
          call_status: Database["public"]["Enums"]["call_status"]
          cancel_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmation_status: Database["public"]["Enums"]["confirmation_status"]
          confirmed_at: string | null
          confirmed_by: string | null
          coupon_code: string | null
          courier_assigned_at: string | null
          courier_fee: number
          courier_name: string | null
          created_at: string
          customer_ip: string | null
          customer_note: string | null
          delivered_at: string | null
          delivery_area_id: string | null
          delivery_city_id: string | null
          delivery_method: string | null
          delivery_zone_id: string | null
          device_info: Json | null
          discount_amount: number
          duplicate_flag: boolean
          expected_delivery_date: string | null
          external_order_id: string | null
          external_platform: string | null
          fb_ad_id: string | null
          fb_adset_id: string | null
          fb_campaign_id: string | null
          fbclid: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          hold_reason: string | null
          hold_until: string | null
          id: string
          in_transit_at: string | null
          internal_note: string | null
          invoice_no: string | null
          is_cross_sale: boolean
          is_guest_order: boolean
          is_preorder: boolean
          last_call_at: string | null
          last_called_by: string | null
          latest_note: string | null
          net_collected: number | null
          notes: string | null
          order_tags: string[]
          packaged_at: string | null
          packaged_by: string | null
          paid_at: string | null
          partial_amount: number | null
          pathao_area_id: number | null
          pathao_area_name: string | null
          pathao_city_id: number | null
          pathao_city_name: string | null
          pathao_zone_id: number | null
          pathao_zone_name: string | null
          payment_method: string | null
          payment_source: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          pipeline_log: Json
          preorder_converted_at: string | null
          preorder_expected_date: string | null
          preorder_ready_at: string | null
          printed_at: string | null
          priority: Database["public"]["Enums"]["order_priority"]
          reconciliation_status: string | null
          refund_amount: number
          rejection_reason: string | null
          return_note: string | null
          return_type: string | null
          risk_flag: boolean
          scheduled_date: string | null
          shipped_at: string | null
          shipped_by: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_district: string | null
          shipping_fee: number
          shipping_name: string | null
          shipping_note: string | null
          shipping_phone: string | null
          shipping_thana: string | null
          source: Database["public"]["Enums"]["order_source"] | null
          source_platform: string | null
          source_website: string | null
          status: Database["public"]["Enums"]["order_status"]
          status_log: Json
          subtotal: number
          tags: string[] | null
          total: number
          tracking_number: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          verified_at: string | null
          web_status: Database["public"]["Enums"]["web_order_status"] | null
        }
        Insert: {
          actual_shipping_breakdown?: Json | null
          actual_shipping_cost?: number | null
          actual_shipping_recorded_at?: string | null
          actual_shipping_source?: string | null
          admin_notes?: string | null
          advance_amount?: number
          advance_payment_number?: string | null
          advance_source?: string | null
          advance_txn_id?: string | null
          alternate_phone?: string | null
          assigned_to?: string | null
          attribution?: Json | null
          attribution_landing_page?: string | null
          auto_call_enabled?: boolean | null
          brand_id?: string | null
          call_attempt_count?: number
          call_status?: Database["public"]["Enums"]["call_status"]
          cancel_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmation_status?: Database["public"]["Enums"]["confirmation_status"]
          confirmed_at?: string | null
          confirmed_by?: string | null
          coupon_code?: string | null
          courier_assigned_at?: string | null
          courier_fee?: number
          courier_name?: string | null
          created_at?: string
          customer_ip?: string | null
          customer_note?: string | null
          delivered_at?: string | null
          delivery_area_id?: string | null
          delivery_city_id?: string | null
          delivery_method?: string | null
          delivery_zone_id?: string | null
          device_info?: Json | null
          discount_amount?: number
          duplicate_flag?: boolean
          expected_delivery_date?: string | null
          external_order_id?: string | null
          external_platform?: string | null
          fb_ad_id?: string | null
          fb_adset_id?: string | null
          fb_campaign_id?: string | null
          fbclid?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          hold_reason?: string | null
          hold_until?: string | null
          id?: string
          in_transit_at?: string | null
          internal_note?: string | null
          invoice_no?: string | null
          is_cross_sale?: boolean
          is_guest_order?: boolean
          is_preorder?: boolean
          last_call_at?: string | null
          last_called_by?: string | null
          latest_note?: string | null
          net_collected?: number | null
          notes?: string | null
          order_tags?: string[]
          packaged_at?: string | null
          packaged_by?: string | null
          paid_at?: string | null
          partial_amount?: number | null
          pathao_area_id?: number | null
          pathao_area_name?: string | null
          pathao_city_id?: number | null
          pathao_city_name?: string | null
          pathao_zone_id?: number | null
          pathao_zone_name?: string | null
          payment_method?: string | null
          payment_source?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pipeline_log?: Json
          preorder_converted_at?: string | null
          preorder_expected_date?: string | null
          preorder_ready_at?: string | null
          printed_at?: string | null
          priority?: Database["public"]["Enums"]["order_priority"]
          reconciliation_status?: string | null
          refund_amount?: number
          rejection_reason?: string | null
          return_note?: string | null
          return_type?: string | null
          risk_flag?: boolean
          scheduled_date?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_district?: string | null
          shipping_fee?: number
          shipping_name?: string | null
          shipping_note?: string | null
          shipping_phone?: string | null
          shipping_thana?: string | null
          source?: Database["public"]["Enums"]["order_source"] | null
          source_platform?: string | null
          source_website?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          status_log?: Json
          subtotal?: number
          tags?: string[] | null
          total?: number
          tracking_number?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          verified_at?: string | null
          web_status?: Database["public"]["Enums"]["web_order_status"] | null
        }
        Update: {
          actual_shipping_breakdown?: Json | null
          actual_shipping_cost?: number | null
          actual_shipping_recorded_at?: string | null
          actual_shipping_source?: string | null
          admin_notes?: string | null
          advance_amount?: number
          advance_payment_number?: string | null
          advance_source?: string | null
          advance_txn_id?: string | null
          alternate_phone?: string | null
          assigned_to?: string | null
          attribution?: Json | null
          attribution_landing_page?: string | null
          auto_call_enabled?: boolean | null
          brand_id?: string | null
          call_attempt_count?: number
          call_status?: Database["public"]["Enums"]["call_status"]
          cancel_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmation_status?: Database["public"]["Enums"]["confirmation_status"]
          confirmed_at?: string | null
          confirmed_by?: string | null
          coupon_code?: string | null
          courier_assigned_at?: string | null
          courier_fee?: number
          courier_name?: string | null
          created_at?: string
          customer_ip?: string | null
          customer_note?: string | null
          delivered_at?: string | null
          delivery_area_id?: string | null
          delivery_city_id?: string | null
          delivery_method?: string | null
          delivery_zone_id?: string | null
          device_info?: Json | null
          discount_amount?: number
          duplicate_flag?: boolean
          expected_delivery_date?: string | null
          external_order_id?: string | null
          external_platform?: string | null
          fb_ad_id?: string | null
          fb_adset_id?: string | null
          fb_campaign_id?: string | null
          fbclid?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          hold_reason?: string | null
          hold_until?: string | null
          id?: string
          in_transit_at?: string | null
          internal_note?: string | null
          invoice_no?: string | null
          is_cross_sale?: boolean
          is_guest_order?: boolean
          is_preorder?: boolean
          last_call_at?: string | null
          last_called_by?: string | null
          latest_note?: string | null
          net_collected?: number | null
          notes?: string | null
          order_tags?: string[]
          packaged_at?: string | null
          packaged_by?: string | null
          paid_at?: string | null
          partial_amount?: number | null
          pathao_area_id?: number | null
          pathao_area_name?: string | null
          pathao_city_id?: number | null
          pathao_city_name?: string | null
          pathao_zone_id?: number | null
          pathao_zone_name?: string | null
          payment_method?: string | null
          payment_source?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pipeline_log?: Json
          preorder_converted_at?: string | null
          preorder_expected_date?: string | null
          preorder_ready_at?: string | null
          printed_at?: string | null
          priority?: Database["public"]["Enums"]["order_priority"]
          reconciliation_status?: string | null
          refund_amount?: number
          rejection_reason?: string | null
          return_note?: string | null
          return_type?: string | null
          risk_flag?: boolean
          scheduled_date?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_district?: string | null
          shipping_fee?: number
          shipping_name?: string | null
          shipping_note?: string | null
          shipping_phone?: string | null
          shipping_thana?: string | null
          source?: Database["public"]["Enums"]["order_source"] | null
          source_platform?: string | null
          source_website?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          status_log?: Json
          subtotal?: number
          tags?: string[] | null
          total?: number
          tracking_number?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          verified_at?: string | null
          web_status?: Database["public"]["Enums"]["web_order_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_area_id_fkey"
            columns: ["delivery_area_id"]
            isOneToOne: false
            referencedRelation: "bd_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_city_id_fkey"
            columns: ["delivery_city_id"]
            isOneToOne: false
            referencedRelation: "bd_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "bd_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      preorder_events: {
        Row: {
          brand_id: string | null
          created_at: string
          created_by: string | null
          detail: string | null
          event: string
          id: string
          meta: Json
          order_id: string | null
          preorder_id: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          event: string
          id?: string
          meta?: Json
          order_id?: string | null
          preorder_id: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          event?: string
          id?: string
          meta?: Json
          order_id?: string | null
          preorder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preorder_events_preorder_id_fkey"
            columns: ["preorder_id"]
            isOneToOne: false
            referencedRelation: "preorders"
            referencedColumns: ["id"]
          },
        ]
      }
      preorders: {
        Row: {
          advance_amount: number
          advance_method: string | null
          advance_received_at: string | null
          advance_source: string | null
          advance_txn_id: string | null
          brand_id: string | null
          called_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          due_amount: number
          due_collect_method: string | null
          due_note: string | null
          id: string
          notes: string | null
          order_id: string
          promise_date: string | null
          promise_days: number | null
          ready_at: string | null
          refund_amount: number
          refund_method: string | null
          refund_note: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          advance_amount?: number
          advance_method?: string | null
          advance_received_at?: string | null
          advance_source?: string | null
          advance_txn_id?: string | null
          brand_id?: string | null
          called_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_amount?: number
          due_collect_method?: string | null
          due_note?: string | null
          id?: string
          notes?: string | null
          order_id: string
          promise_date?: string | null
          promise_days?: number | null
          ready_at?: string | null
          refund_amount?: number
          refund_method?: string | null
          refund_note?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          advance_amount?: number
          advance_method?: string | null
          advance_received_at?: string | null
          advance_source?: string | null
          advance_txn_id?: string | null
          brand_id?: string | null
          called_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_amount?: number
          due_collect_method?: string | null
          due_note?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          promise_date?: string | null
          promise_days?: number | null
          ready_at?: string | null
          refund_amount?: number
          refund_method?: string | null
          refund_note?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "preorders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_brand_listings: {
        Row: {
          brand_id: string
          compare_at_price: number | null
          created_at: string
          description_override: string | null
          display_order: number
          id: string
          image_override: string | null
          is_active: boolean
          price: number | null
          product_id: string
          slug: string
          title_override: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          compare_at_price?: number | null
          created_at?: string
          description_override?: string | null
          display_order?: number
          id?: string
          image_override?: string | null
          is_active?: boolean
          price?: number | null
          product_id: string
          slug: string
          title_override?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          compare_at_price?: number | null
          created_at?: string
          description_override?: string | null
          display_order?: number
          id?: string
          image_override?: string | null
          is_active?: boolean
          price?: number | null
          product_id?: string
          slug?: string
          title_override?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_brand_listings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_brand_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_brand_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
        ]
      }
      product_combo_items: {
        Row: {
          child_product_id: string
          child_variant_id: string | null
          combo_product_id: string
          created_at: string
          display_order: number
          id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          child_product_id: string
          child_variant_id?: string | null
          combo_product_id: string
          created_at?: string
          display_order?: number
          id?: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          child_product_id?: string
          child_variant_id?: string | null
          combo_product_id?: string
          created_at?: string
          display_order?: number
          id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_combo_items_child_product_id_fkey"
            columns: ["child_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_combo_items_child_product_id_fkey"
            columns: ["child_product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
          {
            foreignKeyName: "product_combo_items_child_variant_id_fkey"
            columns: ["child_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_combo_items_combo_product_id_fkey"
            columns: ["combo_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_combo_items_combo_product_id_fkey"
            columns: ["combo_product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
        ]
      }
      product_option_types: {
        Row: {
          created_at: string
          display_order: number
          id: string
          name: string
          product_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          name: string
          product_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_types_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_types_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
        ]
      }
      product_option_values: {
        Row: {
          created_at: string
          display_order: number
          id: string
          option_type_id: string
          swatch_hex: string | null
          value: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          option_type_id: string
          swatch_hex?: string | null
          value: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          option_type_id?: string
          swatch_hex?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_values_option_type_id_fkey"
            columns: ["option_type_id"]
            isOneToOne: false
            referencedRelation: "product_option_types"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_values: {
        Row: {
          option_value_id: string
          variant_id: string
        }
        Insert: {
          option_value_id: string
          variant_id: string
        }
        Update: {
          option_value_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_values_option_value_id_fkey"
            columns: ["option_value_id"]
            isOneToOne: false
            referencedRelation: "product_option_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_values_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          available_stock: number | null
          color_hex: string | null
          color_name: string | null
          created_at: string
          display_order: number
          id: string
          image: string | null
          is_active: boolean
          price_override: number | null
          product_id: string
          reorder_point: number
          reserved_stock: number
          sku: string | null
          stock: number
          updated_at: string
          weighted_avg_cost: number
        }
        Insert: {
          available_stock?: number | null
          color_hex?: string | null
          color_name?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image?: string | null
          is_active?: boolean
          price_override?: number | null
          product_id: string
          reorder_point?: number
          reserved_stock?: number
          sku?: string | null
          stock?: number
          updated_at?: string
          weighted_avg_cost?: number
        }
        Update: {
          available_stock?: number | null
          color_hex?: string | null
          color_name?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image?: string | null
          is_active?: boolean
          price_override?: number | null
          product_id?: string
          reorder_point?: number
          reserved_stock?: number
          sku?: string | null
          stock?: number
          updated_at?: string
          weighted_avg_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
        ]
      }
      products: {
        Row: {
          age_group: string | null
          available_stock: number | null
          barcode: string | null
          benefits: Json
          brand_id: string | null
          category_id: string | null
          cost_price: number
          created_at: string
          description: string | null
          display_order: number
          gallery: Json
          id: string
          image: string
          is_active: boolean
          is_combo: boolean
          is_featured: boolean
          is_new_arrival: boolean
          is_preorder: boolean
          low_stock_threshold: number
          old_price: number | null
          preorder_expected_date: string | null
          preorder_note: string | null
          price: number
          rating: number
          reorder_point: number | null
          reorder_qty: number
          reserved_stock: number
          reviews: number
          shipping_fee_inside: number | null
          shipping_fee_outside: number | null
          sku: string | null
          slug: string
          specs: Json
          stock: number
          title: string
          total_cost_value: number | null
          updated_at: string
          video_url: string | null
          weighted_avg_cost: number
        }
        Insert: {
          age_group?: string | null
          available_stock?: number | null
          barcode?: string | null
          benefits?: Json
          brand_id?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          display_order?: number
          gallery?: Json
          id?: string
          image: string
          is_active?: boolean
          is_combo?: boolean
          is_featured?: boolean
          is_new_arrival?: boolean
          is_preorder?: boolean
          low_stock_threshold?: number
          old_price?: number | null
          preorder_expected_date?: string | null
          preorder_note?: string | null
          price: number
          rating?: number
          reorder_point?: number | null
          reorder_qty?: number
          reserved_stock?: number
          reviews?: number
          shipping_fee_inside?: number | null
          shipping_fee_outside?: number | null
          sku?: string | null
          slug: string
          specs?: Json
          stock?: number
          title: string
          total_cost_value?: number | null
          updated_at?: string
          video_url?: string | null
          weighted_avg_cost?: number
        }
        Update: {
          age_group?: string | null
          available_stock?: number | null
          barcode?: string | null
          benefits?: Json
          brand_id?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          display_order?: number
          gallery?: Json
          id?: string
          image?: string
          is_active?: boolean
          is_combo?: boolean
          is_featured?: boolean
          is_new_arrival?: boolean
          is_preorder?: boolean
          low_stock_threshold?: number
          old_price?: number | null
          preorder_expected_date?: string | null
          preorder_note?: string | null
          price?: number
          rating?: number
          reorder_point?: number | null
          reorder_qty?: number
          reserved_stock?: number
          reviews?: number
          shipping_fee_inside?: number | null
          shipping_fee_outside?: number | null
          sku?: string | null
          slug?: string
          specs?: Json
          stock?: number
          title?: string
          total_cost_value?: number | null
          updated_at?: string
          video_url?: string | null
          weighted_avg_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          admin_notes: string | null
          cancellation_count: number
          created_at: string
          customer_segment: string | null
          display_name: string | null
          email: string | null
          fake_order_count: number
          flag_reason: string | null
          id: string
          is_flagged: boolean
          phone: string | null
          total_orders: number | null
          total_spent: number | null
          updated_at: string
          username: string | null
        }
        Insert: {
          address?: string | null
          admin_notes?: string | null
          cancellation_count?: number
          created_at?: string
          customer_segment?: string | null
          display_name?: string | null
          email?: string | null
          fake_order_count?: number
          flag_reason?: string | null
          id: string
          is_flagged?: boolean
          phone?: string | null
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          address?: string | null
          admin_notes?: string | null
          cancellation_count?: number
          created_at?: string
          customer_segment?: string | null
          display_name?: string | null
          email?: string | null
          fake_order_count?: number
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean
          phone?: string | null
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      reorder_suggestions: {
        Row: {
          actioned_at: string | null
          actioned_by: string | null
          brand_id: string
          created_at: string
          current_stock: number
          id: string
          product_id: string | null
          reorder_point: number
          source: string
          status: string
          suggested_qty: number
          variant_id: string | null
        }
        Insert: {
          actioned_at?: string | null
          actioned_by?: string | null
          brand_id: string
          created_at?: string
          current_stock?: number
          id?: string
          product_id?: string | null
          reorder_point?: number
          source?: string
          status?: string
          suggested_qty?: number
          variant_id?: string | null
        }
        Update: {
          actioned_at?: string | null
          actioned_by?: string | null
          brand_id?: string
          created_at?: string
          current_stock?: number
          id?: string
          product_id?: string | null
          reorder_point?: number
          source?: string
          status?: string
          suggested_qty?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reorder_suggestions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_suggestions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
          {
            foreignKeyName: "reorder_suggestions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          admin_note: string | null
          comment: string | null
          created_at: string
          guest_name: string | null
          guest_phone: string | null
          id: string
          images: string[]
          is_approved: boolean
          order_id: string | null
          product_id: string
          rating: number
          title: string | null
          updated_at: string
          user_id: string | null
          videos: string[]
        }
        Insert: {
          admin_note?: string | null
          comment?: string | null
          created_at?: string
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          images?: string[]
          is_approved?: boolean
          order_id?: string | null
          product_id: string
          rating: number
          title?: string | null
          updated_at?: string
          user_id?: string | null
          videos?: string[]
        }
        Update: {
          admin_note?: string | null
          comment?: string | null
          created_at?: string
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          images?: string[]
          is_approved?: boolean
          order_id?: string | null
          product_id?: string
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string | null
          videos?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
        ]
      }
      site_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          brand_id: string | null
          created_at: string
          created_by: string | null
          id: string
          message: string
          order_id: string | null
          phone: string
          preorder_id: string | null
          provider_response: string | null
          segments: number
          status: string
          template_key: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          order_id?: string | null
          phone: string
          preorder_id?: string | null
          provider_response?: string | null
          segments?: number
          status?: string
          template_key?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          order_id?: string | null
          phone?: string
          preorder_id?: string | null
          provider_response?: string | null
          segments?: number
          status?: string
          template_key?: string | null
        }
        Relationships: []
      }
      staff_permissions: {
        Row: {
          permissions: Json
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          permissions?: Json
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          permissions?: Json
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          brand_id: string | null
          created_at: string
          delta: number
          id: string
          idempotency_key: string | null
          movement_source: string | null
          note: string | null
          product_id: string
          reason: string
          reference_id: string | null
          reference_type: string | null
          running_stock: number | null
          stock_after: number
          stock_before: number
          total_cost_bdt: number | null
          unit_cost_bdt: number | null
          user_id: string
          variant_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          delta: number
          id?: string
          idempotency_key?: string | null
          movement_source?: string | null
          note?: string | null
          product_id: string
          reason?: string
          reference_id?: string | null
          reference_type?: string | null
          running_stock?: number | null
          stock_after: number
          stock_before: number
          total_cost_bdt?: number | null
          unit_cost_bdt?: number | null
          user_id: string
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          delta?: number
          id?: string
          idempotency_key?: string | null
          movement_source?: string | null
          note?: string | null
          product_id?: string
          reason?: string
          reference_id?: string | null
          reference_type?: string | null
          running_stock?: number | null
          stock_after?: number
          stock_before?: number
          total_cost_bdt?: number | null
          unit_cost_bdt?: number | null
          user_id?: string
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktake_items: {
        Row: {
          counted_at: string | null
          counted_by: string | null
          counted_qty: number | null
          id: string
          notes: string | null
          product_id: string | null
          session_id: string
          system_qty: number
          unit_cost: number
          variance: number | null
          variance_value: number | null
          variant_id: string | null
        }
        Insert: {
          counted_at?: string | null
          counted_by?: string | null
          counted_qty?: number | null
          id?: string
          notes?: string | null
          product_id?: string | null
          session_id: string
          system_qty?: number
          unit_cost?: number
          variance?: number | null
          variance_value?: number | null
          variant_id?: string | null
        }
        Update: {
          counted_at?: string | null
          counted_by?: string | null
          counted_qty?: number | null
          id?: string
          notes?: string | null
          product_id?: string | null
          session_id?: string
          system_qty?: number
          unit_cost?: number
          variance?: number | null
          variance_value?: number | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
          {
            foreignKeyName: "stocktake_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stocktake_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktake_sessions: {
        Row: {
          brand_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          started_at: string
          started_by: string | null
          status: string
          total_products: number | null
          total_variance_value: number | null
          warehouse_id: string | null
        }
        Insert: {
          brand_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          total_products?: number | null
          total_variance_value?: number | null
          warehouse_id?: string | null
        }
        Update: {
          brand_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          total_products?: number | null
          total_variance_value?: number | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_sessions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_brand_access: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_brand_access_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
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
      warehouses: {
        Row: {
          address: string | null
          brand_id: string
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_id: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_id?: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      crm_customers_mv: {
        Row: {
          avg_order_value: number | null
          brand_ids: string[] | null
          customer_key: string | null
          email: string | null
          first_order_at: string | null
          is_registered: boolean | null
          last_order_at: string | null
          lifetime_value: number | null
          meta_status: string | null
          name: string | null
          orders_count: number | null
          profile_segment: string | null
          user_id: string | null
          valid_orders_count: number | null
        }
        Relationships: []
      }
      crm_customers_v: {
        Row: {
          avg_order_value: number | null
          brand_ids: string[] | null
          customer_key: string | null
          email: string | null
          first_order_at: string | null
          is_registered: boolean | null
          last_order_at: string | null
          lifetime_value: number | null
          meta_status: string | null
          name: string | null
          orders_count: number | null
          profile_segment: string | null
          user_id: string | null
          valid_orders_count: number | null
        }
        Relationships: []
      }
      customer_stats_by_phone: {
        Row: {
          cancelled_orders: number | null
          delivered_orders: number | null
          fake_orders: number | null
          phone: string | null
          success_rate: number | null
          total_orders: number | null
        }
        Relationships: []
      }
      imp_cargo_balances: {
        Row: {
          adjustment_net: number | null
          brand_id: string | null
          cargo_agent_id: string | null
          current_balance: number | null
          entry_count: number | null
          last_entry_at: string | null
          total_advance: number | null
          total_deducted: number | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_cargo_agents_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews_public: {
        Row: {
          admin_note: string | null
          comment: string | null
          created_at: string | null
          guest_name: string | null
          id: string | null
          images: string[] | null
          is_approved: boolean | null
          order_id: string | null
          product_id: string | null
          rating: number | null
          title: string | null
          updated_at: string | null
          user_id: string | null
          videos: string[] | null
        }
        Insert: {
          admin_note?: string | null
          comment?: string | null
          created_at?: string | null
          guest_name?: string | null
          id?: string | null
          images?: string[] | null
          is_approved?: boolean | null
          order_id?: string | null
          product_id?: string | null
          rating?: number | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
          videos?: string[] | null
        }
        Update: {
          admin_note?: string | null
          comment?: string | null
          created_at?: string | null
          guest_name?: string | null
          id?: string | null
          images?: string[] | null
          is_approved?: boolean | null
          order_id?: string | null
          product_id?: string | null
          rating?: number | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
          videos?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
        ]
      }
      v_brand_catalog: {
        Row: {
          available_stock: number | null
          barcode: string | null
          brand_id: string | null
          category_id: string | null
          compare_at_price: number | null
          created_at: string | null
          description: string | null
          display_order: number | null
          image: string | null
          listing_active: boolean | null
          listing_id: string | null
          owner_brand_id: string | null
          price: number | null
          product_active: boolean | null
          product_id: string | null
          sku: string | null
          slug: string | null
          stock: number | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_brand_listings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_brand_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_brand_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["owner_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      v_combo_summary: {
        Row: {
          buildable_units: number | null
          combo_product_id: string | null
          component_count: number | null
          total_cost: number | null
        }
        Relationships: []
      }
      v_meta_ad_wallet_summary: {
        Row: {
          ad_account_id: string | null
          ad_account_name: string | null
          avg_effective_rate: number | null
          brand_id: string | null
          brand_name: string | null
          external_id: string | null
          latest_purchase_rate: number | null
          remaining_usd: number | null
          total_bdt_paid: number | null
          total_bdt_spent: number | null
          total_usd_purchased: number | null
          total_usd_spent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_ad_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      v_meta_spend_reconciliation: {
        Row: {
          brand_id: string | null
          date: string | null
          fallback_rows: number | null
          flat_fx_rate_used: number | null
          gap_bdt: number | null
          gap_pct: number | null
          insight_rows: number | null
          spend_bdt_fifo: number | null
          spend_bdt_flat_fx: number | null
          spend_usd: number | null
          unenriched_rows: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_insights_daily_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      v_mkt_attribution_possibly_overwritten: {
        Row: {
          age_delta: string | null
          brand_id: string | null
          campaign_id: string | null
          confidence: number | null
          created_at: string | null
          order_id: string | null
          source: Database["public"]["Enums"]["mkt_attribution_source"] | null
          updated_at: string | null
        }
        Insert: {
          age_delta?: never
          brand_id?: string | null
          campaign_id?: string | null
          confidence?: number | null
          created_at?: string | null
          order_id?: string | null
          source?: Database["public"]["Enums"]["mkt_attribution_source"] | null
          updated_at?: string | null
        }
        Update: {
          age_delta?: never
          brand_id?: string | null
          campaign_id?: string | null
          confidence?: number | null
          created_at?: string | null
          order_id?: string | null
          source?: Database["public"]["Enums"]["mkt_attribution_source"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_order_attributions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_order_attributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_order_attributions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      v_product_incoming: {
        Row: {
          brand_id: string | null
          incoming: number | null
          product_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_po_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_po_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_combo_summary"
            referencedColumns: ["combo_product_id"]
          },
          {
            foreignKeyName: "imp_purchase_orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _advance_date: {
        Args: { _d: string; _freq: string; _n: number }
        Returns: string
      }
      _imp_has_any_role: {
        Args: { _roles: string[]; _user: string }
        Returns: boolean
      }
      _imp_log: {
        Args: {
          _action: string
          _after?: Json
          _before?: Json
          _brand: string
          _entity_id: string
          _entity_type: string
          _new: string
          _notes: string
          _prev: string
          _user: string
        }
        Returns: undefined
      }
      _imp_post_journal: {
        Args: {
          _brand_id: string
          _description: string
          _entry_date: string
          _lines: Json
          _source_id: string
          _source_type: string
          _user: string
        }
        Returns: string
      }
      _imp_recompute_carton_paid: {
        Args: { _carton: string }
        Returns: undefined
      }
      _imp_record_payment: {
        Args: {
          _amount: number
          _brand: string
          _carton: string
          _cr_account: string
          _date: string
          _dr_account: string
          _idem: string
          _notes: string
          _po: string
          _ptype: Database["public"]["Enums"]["imp_payment_type"]
          _ref: string
          _user: string
          _wallet: string
        }
        Returns: string
      }
      _imp_refresh_po_status: { Args: { _po: string }; Returns: undefined }
      _imp_refresh_po_totals: { Args: { _po: string }; Returns: undefined }
      _mkt_require_staff: { Args: never; Returns: undefined }
      acquire_order_lock: {
        Args: { _force?: boolean; _order_id: string }
        Returns: {
          o_acquired: boolean
          o_acquired_at: string
          o_last_heartbeat_at: string
          o_order_id: string
          o_user_id: string
          o_user_name: string
        }[]
      }
      add_order_note: {
        Args: { _body: string; _is_internal?: boolean; _order_id: string }
        Returns: string
      }
      adjust_account_balance: {
        Args: { _account_id: string; _delta: number; _reason: string }
        Returns: string
      }
      adjust_meta_dollar_purchase: {
        Args: { _purchase_id: string; _reason?: string }
        Returns: Json
      }
      adjust_product_stock: {
        Args: {
          _delta: number
          _note?: string
          _product_id: string
          _reason: string
        }
        Returns: Json
      }
      adjust_stock_v2: {
        Args: {
          _delta: number
          _idempotency_key?: string
          _note?: string
          _product_id: string
          _reason: string
          _reference_id?: string
          _reference_type?: string
          _source?: string
          _unit_cost?: number
          _variant_id: string
        }
        Returns: string
      }
      admin_rls_audit: {
        Args: never
        Returns: {
          cmd: string
          permissive: string
          policyname: string
          qual: string
          roles: string[]
          rowsecurity: boolean
          tablename: string
          with_check: string
        }[]
      }
      append_order_status_log: {
        Args: { _entry: Json; _log_field: string; _order_id: string }
        Returns: undefined
      }
      apply_order_stock_ledger: {
        Args: {
          p_new_status: Database["public"]["Enums"]["order_status"]
          p_old_status: Database["public"]["Enums"]["order_status"]
          p_order_id: string
        }
        Returns: number
      }
      apply_settlement_variance_action: {
        Args: { _action: string; _line_id: string }
        Returns: Json
      }
      backfill_order_profit_snapshots: {
        Args: { p_brand_id: string }
        Returns: number
      }
      calculate_rfm_all_brands: { Args: never; Returns: undefined }
      cancel_meta_dollar_purchase: {
        Args: { _purchase_id: string; _reason?: string }
        Returns: Json
      }
      cargo_advance_deposit: {
        Args: {
          p_amount: number
          p_attachment_url: string
          p_brand_id: string
          p_cargo_agent_id: string
          p_note: string
          p_payment_account_id: string
          p_payment_date: string
          p_reference: string
        }
        Returns: Json
      }
      cargo_bill_create: {
        Args: {
          p_amount_from_account: number
          p_amount_from_balance: number
          p_attachment_url: string
          p_bill_date: string
          p_bill_number: string
          p_brand_id: string
          p_cargo_agent_id: string
          p_customs_charge: number
          p_local_delivery_charge: number
          p_note: string
          p_other_charge: number
          p_payment_account_id: string
          p_payment_source: string
          p_po_id: string
          p_service_charge: number
          p_shipment_ref: string
          p_shipping_charge: number
          p_weight_kg: number
        }
        Returns: Json
      }
      cargo_manual_adjustment: {
        Args: {
          p_attachment_url: string
          p_brand_id: string
          p_cargo_agent_id: string
          p_note: string
          p_signed_amount: number
        }
        Returns: Json
      }
      cargo_po_payment: {
        Args: {
          p_amount_from_account: number
          p_amount_from_balance: number
          p_brand_id: string
          p_cargo_agent_id: string
          p_note: string
          p_payment_account_id: string
          p_payment_date: string
          p_po_id: string
          p_reference: string
        }
        Returns: Json
      }
      check_reorder_triggers: { Args: { _brand_id: string }; Returns: number }
      check_reorder_triggers_all_brands: { Args: never; Returns: number }
      confirm_meta_dollar_purchase: {
        Args: { _purchase_id: string }
        Returns: Json
      }
      consume_meta_spend_fifo: {
        Args: {
          _ad_account_id: string
          _insight_id?: string
          _spend_date: string
          _spend_ref: string
          _usd_spend: number
        }
        Returns: Json
      }
      create_bill: {
        Args: {
          _amount: number
          _ap_account_id: string
          _bill_date: string
          _bill_no: string
          _brand_id: string
          _description?: string
          _due_date: string
          _expense_account_id: string
          _supplier_id: string
        }
        Returns: string
      }
      create_journal_entry: {
        Args: {
          _brand_id: string
          _description: string
          _entry_date: string
          _lines: Json
          _source_id?: string
          _source_type?: string
          _status?: string
        }
        Returns: string
      }
      crm_normalize_phone: { Args: { p: string }; Returns: string }
      erp_order_dashboard_rows: {
        Args: {
          p_brand_ids?: string[]
          p_city?: string
          p_confirmed_by?: string
          p_courier?: string
          p_dir?: string
          p_from?: string
          p_limit?: number
          p_max_amount?: number
          p_min_amount?: number
          p_offset?: number
          p_payment_status?: string
          p_search?: string
          p_sort?: string
          p_source?: string
          p_statuses?: string[]
          p_tags?: string[]
          p_to?: string
        }
        Returns: Json
      }
      erp_order_dashboard_summary: {
        Args: {
          p_brand_ids?: string[]
          p_city?: string
          p_confirmed_by?: string
          p_courier?: string
          p_from?: string
          p_max_amount?: number
          p_min_amount?: number
          p_payment_status?: string
          p_search?: string
          p_source?: string
          p_statuses?: string[]
          p_tags?: string[]
          p_to?: string
        }
        Returns: Json
      }
      erp_order_status_counts: {
        Args: {
          _brand_ids: string[]
          _courier?: string
          _date_from?: string
          _date_to?: string
          _printed?: string
          _search?: string
          _source?: string
        }
        Returns: {
          cnt: number
          status: string
        }[]
      }
      erp_profit_loss: {
        Args: { _brand_id: string; _from: string; _to: string }
        Returns: Json
      }
      finalize_order_on_confirm: {
        Args: { _order_id: string }
        Returns: undefined
      }
      generate_case_number: { Args: { _type: string }; Returns: string }
      get_actual_roas_daily: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          actual_roas: number
          attributed_orders: number
          collected: number
          day: string
          delivered_orders: number
          meta_roas: number
          net_profit: number
          poas: number
          revenue: number
          spend: number
        }[]
      }
      get_ad_report: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          actual_roas: number
          ad_id: string
          ad_name: string
          attributed_orders: number
          campaign_name: string
          clicks: number
          delivered_orders: number
          external_ad_id: string
          impressions: number
          net_profit: number
          poas: number
          revenue: number
          spend: number
          thumbnail_url: string
        }[]
      }
      get_adset_report: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          actual_roas: number
          adset_id: string
          adset_name: string
          attributed_orders: number
          campaign_name: string
          clicks: number
          delivered_orders: number
          external_adset_id: string
          impressions: number
          net_profit: number
          poas: number
          revenue: number
          spend: number
        }[]
      }
      get_balance_sheet: {
        Args: { _as_of: string; _brand_id: string }
        Returns: Json
      }
      get_brand_profitability_rollup: {
        Args: {
          p_brand_id: string
          p_date_basis?: string
          p_date_from?: string
          p_date_to?: string
        }
        Returns: {
          cogs: number
          confirmed_qty: number
          courier_cost: number
          current_stock: number
          delivered_qty: number
          exchange_loss: number
          gross_profit: number
          image: string
          marketing_content: number
          meta_ads: number
          name: string
          net_profit: number
          product_id: string
          profit_per_unit: number
          return_loss: number
          returned_qty: number
          revenue: number
          roi_percent: number
          sku: string
        }[]
      }
      get_campaign_profit: {
        Args: { _brand_id: string; _from: string; _to: string }
        Returns: {
          campaign_id: string
          cogs: number
          cost_missing_units: number
          delivered_orders: number
          delivered_revenue: number
          delivered_units: number
          gross_profit: number
          operating_cost: number
        }[]
      }
      get_campaign_report: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          actual_roas: number
          attributed_orders: number
          campaign_id: string
          campaign_name: string
          clicks: number
          collected: number
          delivered_orders: number
          delivery_rate: number
          external_campaign_id: string
          health: string
          impressions: number
          meta_purchases: number
          meta_roas: number
          meta_value: number
          net_profit: number
          poas: number
          product_cost: number
          return_rate: number
          returned_orders: number
          revenue: number
          spend: number
          status: string
        }[]
      }
      get_courier_campaign_report: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          attributed_orders: number
          campaign_id: string
          campaign_name: string
          courier_cost: number
          delivered_orders: number
          delivery_rate: number
          provider: string
          return_rate: number
          returned_orders: number
        }[]
      }
      get_customer_stats: { Args: { p_user_id: string }; Returns: Json }
      get_finance_dashboard: {
        Args: { _brand_id: string; _from: string; _to: string }
        Returns: Json
      }
      get_fx_rate: {
        Args: { p_brand: string; p_date: string; p_from: string; p_to: string }
        Returns: number
      }
      get_general_ledger: {
        Args: {
          _account_id: string
          _brand_id: string
          _from: string
          _to: string
        }
        Returns: {
          credit: number
          debit: number
          description: string
          entry_date: string
          entry_no: string
          running_balance: number
        }[]
      }
      get_marketing_overview: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_meta_spend_bdt: {
        Args: { _brand_id: string; _from: string; _to: string }
        Returns: {
          brand_id: string
          day: string
          is_estimated: boolean
          spend_bdt: number
          spend_bdt_fallback: number
          spend_bdt_fifo: number
          spend_usd: number
        }[]
      }
      get_order_courier_cost: { Args: { _order_id: string }; Returns: number }
      get_product_campaign_report: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          attributed_orders: number
          campaign_id: string
          campaign_name: string
          delivered_orders: number
          product_cost: number
          product_id: string
          product_name: string
          revenue: number
          units_sold: number
        }[]
      }
      get_product_profitability_report: {
        Args: {
          p_brand_id: string
          p_couriers?: string[]
          p_date_basis?: string
          p_date_from?: string
          p_date_to?: string
          p_product_id: string
          p_sources?: string[]
          p_variant_id?: string
        }
        Returns: Json
      }
      get_public_coupon: {
        Args: { p_code: string }
        Returns: {
          applicable_products: Json
          code: string
          is_active: boolean
          max_discount: number
          min_order_amount: number
          type: string
          usage_limit: number
          used_count: number
          valid_from: string
          valid_until: string
          value: number
        }[]
      }
      get_sku_profit: {
        Args: { _brand_id: string; _from: string; _to: string }
        Returns: {
          cogs: number
          cost_missing_units: number
          delivered_revenue: number
          delivered_units: number
          gross_profit: number
          operating_cost: number
          product_id: string
        }[]
      }
      get_trial_balance: {
        Args: { _as_of: string; _brand_id: string }
        Returns: {
          account_id: string
          account_type: string
          balance: number
          code: string
          name: string
          normal_balance: string
          total_credit: number
          total_debit: number
        }[]
      }
      get_user_brand_ids: { Args: { _user_id?: string }; Returns: string[] }
      get_vat_summary: {
        Args: { p_brand: string; p_from: string; p_to: string }
        Returns: {
          input_tax: number
          input_taxable: number
          net_payable: number
          output_tax: number
          output_taxable: number
          rate: number
          tax_code: string
          tax_name: string
        }[]
      }
      hard_delete_order: { Args: { _order_id: string }; Returns: undefined }
      has_brand_access: {
        Args: { _brand_id: string; _user_id?: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat_order_lock: { Args: { _order_id: string }; Returns: undefined }
      hr_count_working_days: {
        Args: { _from: string; _to: string; _weekly_off?: number[] }
        Returns: number
      }
      imp_create_po: { Args: { _payload: Json }; Returns: Json }
      imp_delete_po: { Args: { _po_id: string }; Returns: Json }
      imp_get_or_create_account: {
        Args: {
          _brand: string
          _code: string
          _name: string
          _normal: string
          _type: string
        }
        Returns: string
      }
      imp_mark_arrived: { Args: { _payload: Json }; Returns: Json }
      imp_next_po_number: { Args: { _brand: string }; Returns: string }
      imp_pay_carton_due: { Args: { _payload: Json }; Returns: Json }
      imp_post_to_inventory: { Args: { _payload: Json }; Returns: Json }
      imp_quick_create_product: {
        Args: { _brand: string; _image?: string; _sku?: string; _title: string }
        Returns: Json
      }
      imp_record_payment_rpc: { Args: { _payload: Json }; Returns: Json }
      imp_release_carton: { Args: { _payload: Json }; Returns: Json }
      imp_update_carton_stage: {
        Args: { _carton: string; _new_stage: string; _notes?: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_finance_staff: { Args: { _uid: string }; Returns: boolean }
      is_guest_order: { Args: { _order_id: string }; Returns: boolean }
      is_marketing_staff: { Args: { _uid: string }; Returns: boolean }
      is_recent_guest_order: { Args: { _order_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      log_order_view: { Args: { p_order_id: string }; Returns: undefined }
      lookup_order_by_id: {
        Args: { _order_id: string }
        Returns: {
          actual_shipping_breakdown: Json | null
          actual_shipping_cost: number | null
          actual_shipping_recorded_at: string | null
          actual_shipping_source: string | null
          admin_notes: string | null
          advance_amount: number
          advance_payment_number: string | null
          advance_source: string | null
          advance_txn_id: string | null
          alternate_phone: string | null
          assigned_to: string | null
          attribution: Json | null
          attribution_landing_page: string | null
          auto_call_enabled: boolean | null
          brand_id: string | null
          call_attempt_count: number
          call_status: Database["public"]["Enums"]["call_status"]
          cancel_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmation_status: Database["public"]["Enums"]["confirmation_status"]
          confirmed_at: string | null
          confirmed_by: string | null
          coupon_code: string | null
          courier_assigned_at: string | null
          courier_fee: number
          courier_name: string | null
          created_at: string
          customer_ip: string | null
          customer_note: string | null
          delivered_at: string | null
          delivery_area_id: string | null
          delivery_city_id: string | null
          delivery_method: string | null
          delivery_zone_id: string | null
          device_info: Json | null
          discount_amount: number
          duplicate_flag: boolean
          expected_delivery_date: string | null
          external_order_id: string | null
          external_platform: string | null
          fb_ad_id: string | null
          fb_adset_id: string | null
          fb_campaign_id: string | null
          fbclid: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          hold_reason: string | null
          hold_until: string | null
          id: string
          in_transit_at: string | null
          internal_note: string | null
          invoice_no: string | null
          is_cross_sale: boolean
          is_guest_order: boolean
          is_preorder: boolean
          last_call_at: string | null
          last_called_by: string | null
          latest_note: string | null
          net_collected: number | null
          notes: string | null
          order_tags: string[]
          packaged_at: string | null
          packaged_by: string | null
          paid_at: string | null
          partial_amount: number | null
          pathao_area_id: number | null
          pathao_area_name: string | null
          pathao_city_id: number | null
          pathao_city_name: string | null
          pathao_zone_id: number | null
          pathao_zone_name: string | null
          payment_method: string | null
          payment_source: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          pipeline_log: Json
          preorder_converted_at: string | null
          preorder_expected_date: string | null
          preorder_ready_at: string | null
          printed_at: string | null
          priority: Database["public"]["Enums"]["order_priority"]
          reconciliation_status: string | null
          refund_amount: number
          rejection_reason: string | null
          return_note: string | null
          return_type: string | null
          risk_flag: boolean
          scheduled_date: string | null
          shipped_at: string | null
          shipped_by: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_district: string | null
          shipping_fee: number
          shipping_name: string | null
          shipping_note: string | null
          shipping_phone: string | null
          shipping_thana: string | null
          source: Database["public"]["Enums"]["order_source"] | null
          source_platform: string | null
          source_website: string | null
          status: Database["public"]["Enums"]["order_status"]
          status_log: Json
          subtotal: number
          tags: string[] | null
          total: number
          tracking_number: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          verified_at: string | null
          web_status: Database["public"]["Enums"]["web_order_status"] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      lookup_order_by_phone: {
        Args: { _phone_tail: string }
        Returns: {
          actual_shipping_breakdown: Json | null
          actual_shipping_cost: number | null
          actual_shipping_recorded_at: string | null
          actual_shipping_source: string | null
          admin_notes: string | null
          advance_amount: number
          advance_payment_number: string | null
          advance_source: string | null
          advance_txn_id: string | null
          alternate_phone: string | null
          assigned_to: string | null
          attribution: Json | null
          attribution_landing_page: string | null
          auto_call_enabled: boolean | null
          brand_id: string | null
          call_attempt_count: number
          call_status: Database["public"]["Enums"]["call_status"]
          cancel_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmation_status: Database["public"]["Enums"]["confirmation_status"]
          confirmed_at: string | null
          confirmed_by: string | null
          coupon_code: string | null
          courier_assigned_at: string | null
          courier_fee: number
          courier_name: string | null
          created_at: string
          customer_ip: string | null
          customer_note: string | null
          delivered_at: string | null
          delivery_area_id: string | null
          delivery_city_id: string | null
          delivery_method: string | null
          delivery_zone_id: string | null
          device_info: Json | null
          discount_amount: number
          duplicate_flag: boolean
          expected_delivery_date: string | null
          external_order_id: string | null
          external_platform: string | null
          fb_ad_id: string | null
          fb_adset_id: string | null
          fb_campaign_id: string | null
          fbclid: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          hold_reason: string | null
          hold_until: string | null
          id: string
          in_transit_at: string | null
          internal_note: string | null
          invoice_no: string | null
          is_cross_sale: boolean
          is_guest_order: boolean
          is_preorder: boolean
          last_call_at: string | null
          last_called_by: string | null
          latest_note: string | null
          net_collected: number | null
          notes: string | null
          order_tags: string[]
          packaged_at: string | null
          packaged_by: string | null
          paid_at: string | null
          partial_amount: number | null
          pathao_area_id: number | null
          pathao_area_name: string | null
          pathao_city_id: number | null
          pathao_city_name: string | null
          pathao_zone_id: number | null
          pathao_zone_name: string | null
          payment_method: string | null
          payment_source: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          pipeline_log: Json
          preorder_converted_at: string | null
          preorder_expected_date: string | null
          preorder_ready_at: string | null
          printed_at: string | null
          priority: Database["public"]["Enums"]["order_priority"]
          reconciliation_status: string | null
          refund_amount: number
          rejection_reason: string | null
          return_note: string | null
          return_type: string | null
          risk_flag: boolean
          scheduled_date: string | null
          shipped_at: string | null
          shipped_by: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_district: string | null
          shipping_fee: number
          shipping_name: string | null
          shipping_note: string | null
          shipping_phone: string | null
          shipping_thana: string | null
          source: Database["public"]["Enums"]["order_source"] | null
          source_platform: string | null
          source_website: string | null
          status: Database["public"]["Enums"]["order_status"]
          status_log: Json
          subtotal: number
          tags: string[] | null
          total: number
          tracking_number: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          verified_at: string | null
          web_status: Database["public"]["Enums"]["web_order_status"] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      map_courier_status_to_order: {
        Args: { _raw: string }
        Returns: Database["public"]["Enums"]["order_status"]
      }
      mark_abandoned_cart_converted: {
        Args: { _id: string; _order_id: string }
        Returns: undefined
      }
      match_statement_line: {
        Args: { _journal_line_id: string; _line_id: string }
        Returns: undefined
      }
      mkt_attribution_explorer: {
        Args: {
          p_brand_id: string
          p_campaign_id?: string
          p_from: string
          p_limit?: number
          p_source?: string
          p_to: string
        }
        Returns: {
          ad_id: string
          ad_name: string
          adset_id: string
          adset_name: string
          allocated_ad_spend: number
          campaign_id: string
          campaign_name: string
          is_delivered: boolean
          is_returned: boolean
          medium: string
          net_profit: number
          net_sales: number
          order_created_at: string
          order_id: string
          order_status: string
          source: string
        }[]
      }
      mkt_campaign_summary: {
        Args: {
          p_brand_id: string
          p_campaign_id: string
          p_from: string
          p_to: string
        }
        Returns: Json
      }
      mkt_courier_campaign_report: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          courier_provider: string
          delivered_orders: number
          delivery_rate: number
          net_profit: number
          net_revenue: number
          return_rate: number
          returned_orders: number
          total_orders: number
        }[]
      }
      mkt_delivered_line_costs: {
        Args: { _brand_id: string; _from: string; _to: string }
        Returns: {
          campaign_id: string
          cost_missing: boolean
          cost_source: string
          courier_cost_allocated: number
          day: string
          line_cogs: number
          line_total: number
          operating_cost: number
          order_id: string
          order_item_id: string
          packaging_cost_allocated: number
          product_id: string
          quantity: number
          refund_amount_allocated: number
          unit_cost: number
          variant_id: string
        }[]
      }
      mkt_get_campaign_daily_rollup: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          ad_spend: number
          campaign_id: string
          campaign_name: string
          cancelled_orders: number
          clicks: number
          day: string
          delivered_orders: number
          delivery_rate: number
          external_campaign_id: string
          gross_revenue: number
          health: string
          impressions: number
          net_profit: number
          net_revenue: number
          orders_attributed: number
          poas: number
          real_roas: number
          return_rate: number
          returned_orders: number
        }[]
      }
      mkt_get_overview_kpis: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      mkt_health_checks: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          category: string
          detail: string
          metric: number
          ref_id: string
          ref_label: string
          severity: string
          title: string
        }[]
      }
      mkt_ingest_track: {
        Args: {
          p_event_name: string
          p_origin: string
          p_payload: Json
          p_session_id: string
          p_site_key: string
        }
        Returns: Json
      }
      mkt_list_ads: {
        Args: {
          p_adset_id: string
          p_brand_id: string
          p_from: string
          p_to: string
        }
        Returns: {
          ad_id: string
          ad_spend: number
          clicks: number
          creative_name: string
          delivered_orders: number
          effective_status: string
          external_ad_id: string
          impressions: number
          name: string
          net_profit: number
          net_revenue: number
          orders_attributed: number
          poas: number
          preview_url: string
          real_roas: number
          status: string
          thumbnail_url: string
        }[]
      }
      mkt_list_adsets: {
        Args: {
          p_brand_id: string
          p_campaign_id: string
          p_from: string
          p_to: string
        }
        Returns: {
          ad_spend: number
          adset_id: string
          clicks: number
          daily_budget: number
          delivered_orders: number
          effective_status: string
          external_adset_id: string
          impressions: number
          lifetime_budget: number
          name: string
          net_profit: number
          net_revenue: number
          orders_attributed: number
          poas: number
          real_roas: number
          status: string
        }[]
      }
      mkt_list_campaigns: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          ad_spend: number
          campaign_id: string
          clicks: number
          delivered_orders: number
          effective_status: string
          external_campaign_id: string
          impressions: number
          name: string
          net_profit: number
          net_revenue: number
          objective: string
          orders_attributed: number
          poas: number
          real_roas: number
          returned_orders: number
          status: string
        }[]
      }
      mkt_lock_order_attribution: {
        Args: { _order_id: string }
        Returns: undefined
      }
      mkt_product_campaign_report: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          delivered_units: number
          gross_revenue: number
          product_cost: number
          product_id: string
          product_name: string
          returned_units: number
          units_sold: number
        }[]
      }
      mkt_rebuild_window: {
        Args: { p_brand_id: string; p_days?: number; p_trigger?: string }
        Returns: Json
      }
      mkt_upsert_order_attribution: {
        Args: {
          _ad_id?: string
          _adset_id?: string
          _brand_id: string
          _campaign_id?: string
          _confidence?: number
          _fbclid?: string
          _note?: string
          _order_id: string
          _source?: string
          _utm_campaign?: string
          _utm_content?: string
          _utm_medium?: string
          _utm_source?: string
          _utm_term?: string
        }
        Returns: Json
      }
      next_invoice_no: { Args: { _brand_id: string }; Returns: string }
      normalize_mobile_bd: { Args: { p_phone: string }; Returns: string }
      order_stock_is_deducted_status: {
        Args: { p_status: Database["public"]["Enums"]["order_status"] }
        Returns: boolean
      }
      order_stock_is_reserved_status: {
        Args: { p_status: Database["public"]["Enums"]["order_status"] }
        Returns: boolean
      }
      order_stock_net_multiplier: {
        Args: { p_status: Database["public"]["Enums"]["order_status"] }
        Returns: number
      }
      order_stock_restore_multiplier: {
        Args: { p_status: Database["public"]["Enums"]["order_status"] }
        Returns: number
      }
      post_meta_ad_spend_all_brands: {
        Args: { _from?: string; _to?: string }
        Returns: Json
      }
      post_meta_ad_spend_daily: {
        Args: { _brand_id: string; _from: string; _to: string }
        Returns: Json
      }
      post_meta_ad_spend_daily_system: {
        Args: { _brand_id: string; _from: string; _to: string }
        Returns: Json
      }
      post_order_stock_movement: {
        Args: {
          p_delta: number
          p_idempotency_key: string
          p_note: string
          p_order_id: string
          p_product_id: string
          p_reason: string
          p_variant_id: string
        }
        Returns: string
      }
      reapply_invoice_prefix: { Args: { _brand_id: string }; Returns: number }
      rebuild_all_marketing_attributions: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: number
      }
      rebuild_marketing_profit_snapshot: {
        Args: { p_order_id: string }
        Returns: string
      }
      rebuild_marketing_profit_snapshots: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: number
      }
      rebuild_meta_product_allocations_for_campaign: {
        Args: { p_campaign_id: string; p_since?: string; p_until?: string }
        Returns: undefined
      }
      rebuild_order_attribution: {
        Args: { p_order_id: string }
        Returns: string
      }
      recalc_product_rating: {
        Args: { _product_id: string }
        Returns: undefined
      }
      recompute_reserved_stock: {
        Args: { p_product_id: string; p_variant_id: string }
        Returns: undefined
      }
      recon_received_summary: {
        Args: { _from: string; _to: string }
        Returns: {
          account_id: string
          account_name: string
          brand_id: string
          brand_name: string
          expense: number
          income: number
          net: number
          txn_count: number
          txn_date: string
          wallet_type: string
        }[]
      }
      reconcile_courier_settlement: {
        Args: { _remittance_id: string }
        Returns: Json
      }
      record_ar_payment: {
        Args: {
          _amount: number
          _ar_account_id: string
          _cash_account_id: string
          _notes?: string
          _order_id: string
          _payment_date?: string
          _reference_no?: string
        }
        Returns: string
      }
      record_bill_payment: {
        Args: {
          _amount: number
          _bill_id: string
          _cash_account_id: string
          _notes?: string
          _payment_date?: string
          _reference_no?: string
        }
        Returns: string
      }
      record_courier_expense:
        | {
            Args: { _amount: number; _shipment_id: string }
            Returns: undefined
          }
        | {
            Args: {
              _account_id?: string
              _amount: number
              _shipment_id: string
            }
            Returns: string
          }
      record_order_courier_expense: {
        Args: { _account_id?: string; _amount: number; _order_id: string }
        Returns: string
      }
      record_supplier_payment: {
        Args: {
          _account_id: string
          _amount: number
          _notes?: string
          _payment_date: string
          _reference_no?: string
          _supplier_id: string
        }
        Returns: string
      }
      refresh_crm_customers_mv: { Args: never; Returns: undefined }
      release_order_lock: { Args: { _order_id: string }; Returns: undefined }
      release_stock_reservation: {
        Args: { _order_id: string }
        Returns: undefined
      }
      reserve_stock: {
        Args: { _items?: Json; _order_id: string }
        Returns: undefined
      }
      resolve_login_email: { Args: { p_identifier: string }; Returns: string }
      run_recurring_rules: { Args: { _brand_id?: string }; Returns: Json }
      seed_default_coa: { Args: { _brand_id: string }; Returns: number }
      set_product_stock: {
        Args: {
          _new_qty: number
          _note?: string
          _product_id: string
          _reason?: string
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      snapshot_order_item_profit_fields: {
        Args: { _order_id: string }
        Returns: undefined
      }
      track_order_public: {
        Args: { _order_prefix: string; _phone: string }
        Returns: Json
      }
      transition_order_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["order_status"]
          _note?: string
          _order_id: string
          _reason?: string
        }
        Returns: undefined
      }
      unmatch_statement_line: { Args: { _line_id: string }; Returns: undefined }
      update_product_inventory_fields: {
        Args: {
          _barcode?: string
          _cost_price?: number
          _low_stock_threshold?: number
          _product_id: string
          _reorder_point?: number
          _sku?: string
        }
        Returns: undefined
      }
      update_weighted_avg_cost: {
        Args: {
          _new_qty: number
          _new_unit_cost: number
          _product_id: string
          _variant_id: string
        }
        Returns: undefined
      }
      upsert_abandoned_cart: {
        Args: {
          _cart_items: Json
          _customer_email: string
          _customer_name: string
          _customer_phone: string
          _id: string
          _last_step: string
          _session_id: string
          _shipping_address: string
          _shipping_city: string
          _shipping_district: string
          _shipping_thana: string
          _subtotal: number
        }
        Returns: string
      }
      validate_coupon: {
        Args: { _code: string }
        Returns: {
          applicable_categories: Json
          applicable_products: Json
          code: string
          id: string
          max_discount: number
          min_order_amount: number
          type: string
          valid_from: string
          valid_until: string
          value: number
        }[]
      }
      void_journal_entry: {
        Args: { _entry_id: string; _reason: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "moderator"
        | "customer"
        | "customer_service"
        | "operations"
        | "packer"
        | "accountant"
        | "marketing_manager"
        | "warehouse_staff"
        | "cargo_agent"
        | "hr_admin"
        | "hr_manager"
        | "employee"
      call_status:
        | "not_called"
        | "attempting"
        | "reached"
        | "no_response"
        | "wrong_number"
        | "customer_confirmed"
        | "customer_cancelled"
        | "needs_followup"
      confirmation_status:
        | "pending"
        | "confirmed"
        | "rejected"
        | "fake"
        | "on_hold"
        | "advance_pending"
      coupon_type: "percentage" | "fixed"
      discount_type: "flat" | "percent"
      imp_agent_ledger_dir: "credit" | "debit"
      imp_agent_ledger_kind:
        | "deposit"
        | "payment"
        | "adjustment"
        | "refund"
        | "opening_balance"
      imp_carton_status:
        | "ordered"
        | "at_china_warehouse"
        | "in_transit"
        | "arrived_bd"
        | "released"
        | "in_stock"
        | "cancelled"
      imp_payment_type:
        | "supplier_advance"
        | "supplier_payment"
        | "shipping"
        | "carton_release"
        | "supplier_balance"
        | "local_courier"
        | "adjustment"
      imp_po_status:
        | "pending_review"
        | "ordered"
        | "at_china_warehouse"
        | "in_transit"
        | "arrived_bd"
        | "partially_received"
        | "completed"
        | "cancelled"
      mkt_account_status: "active" | "paused" | "error" | "disconnected"
      mkt_attribution_source:
        | "utm"
        | "pixel"
        | "manual"
        | "product_link"
        | "phone_match"
        | "auto_ad"
        | "auto_adset"
        | "auto_campaign"
        | "auto_utm"
        | "auto_unmatched"
      mkt_expense_category:
        | "influencer"
        | "content"
        | "photoshoot"
        | "agency"
        | "boost"
        | "other"
        | "meta_ads"
        | "print_design"
        | "event"
        | "sms_email"
      mkt_sync_kind: "structure" | "insights" | "attribution" | "finance_post"
      mkt_sync_status: "running" | "success" | "error"
      order_priority: "low" | "normal" | "high" | "urgent"
      order_source:
        | "website"
        | "facebook"
        | "manual"
        | "phone"
        | "utm"
        | "pixel"
        | "incomplete"
        | "shopify"
      order_status:
        | "new"
        | "confirmed"
        | "packaging"
        | "packed"
        | "ready_to_ship"
        | "shipped"
        | "in_transit"
        | "delivered"
        | "partial_delivered"
        | "returned"
        | "exchanged"
        | "damaged"
        | "cancelled"
        | "fake"
        | "on_hold"
        | "advance_payment_pending"
        | "incomplete"
        | "ready_to_pack"
        | "courier_entry"
        | "exchange"
        | "paid_return"
        | "unpaid_return"
        | "partial_return"
        | "pending_return"
        | "paid"
        | "return_in_transit"
        | "completed"
        | "pre_order"
      payment_status: "unpaid" | "partial" | "paid" | "refunded"
      web_order_status:
        | "processing"
        | "incomplete"
        | "good_but_no_response"
        | "no_response"
        | "advance_payment"
        | "on_hold"
        | "complete"
        | "cancelled"
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
      app_role: [
        "admin",
        "moderator",
        "customer",
        "customer_service",
        "operations",
        "packer",
        "accountant",
        "marketing_manager",
        "warehouse_staff",
        "cargo_agent",
        "hr_admin",
        "hr_manager",
        "employee",
      ],
      call_status: [
        "not_called",
        "attempting",
        "reached",
        "no_response",
        "wrong_number",
        "customer_confirmed",
        "customer_cancelled",
        "needs_followup",
      ],
      confirmation_status: [
        "pending",
        "confirmed",
        "rejected",
        "fake",
        "on_hold",
        "advance_pending",
      ],
      coupon_type: ["percentage", "fixed"],
      discount_type: ["flat", "percent"],
      imp_agent_ledger_dir: ["credit", "debit"],
      imp_agent_ledger_kind: [
        "deposit",
        "payment",
        "adjustment",
        "refund",
        "opening_balance",
      ],
      imp_carton_status: [
        "ordered",
        "at_china_warehouse",
        "in_transit",
        "arrived_bd",
        "released",
        "in_stock",
        "cancelled",
      ],
      imp_payment_type: [
        "supplier_advance",
        "supplier_payment",
        "shipping",
        "carton_release",
        "supplier_balance",
        "local_courier",
        "adjustment",
      ],
      imp_po_status: [
        "pending_review",
        "ordered",
        "at_china_warehouse",
        "in_transit",
        "arrived_bd",
        "partially_received",
        "completed",
        "cancelled",
      ],
      mkt_account_status: ["active", "paused", "error", "disconnected"],
      mkt_attribution_source: [
        "utm",
        "pixel",
        "manual",
        "product_link",
        "phone_match",
        "auto_ad",
        "auto_adset",
        "auto_campaign",
        "auto_utm",
        "auto_unmatched",
      ],
      mkt_expense_category: [
        "influencer",
        "content",
        "photoshoot",
        "agency",
        "boost",
        "other",
        "meta_ads",
        "print_design",
        "event",
        "sms_email",
      ],
      mkt_sync_kind: ["structure", "insights", "attribution", "finance_post"],
      mkt_sync_status: ["running", "success", "error"],
      order_priority: ["low", "normal", "high", "urgent"],
      order_source: [
        "website",
        "facebook",
        "manual",
        "phone",
        "utm",
        "pixel",
        "incomplete",
        "shopify",
      ],
      order_status: [
        "new",
        "confirmed",
        "packaging",
        "packed",
        "ready_to_ship",
        "shipped",
        "in_transit",
        "delivered",
        "partial_delivered",
        "returned",
        "exchanged",
        "damaged",
        "cancelled",
        "fake",
        "on_hold",
        "advance_payment_pending",
        "incomplete",
        "ready_to_pack",
        "courier_entry",
        "exchange",
        "paid_return",
        "unpaid_return",
        "partial_return",
        "pending_return",
        "paid",
        "return_in_transit",
        "completed",
        "pre_order",
      ],
      payment_status: ["unpaid", "partial", "paid", "refunded"],
      web_order_status: [
        "processing",
        "incomplete",
        "good_but_no_response",
        "no_response",
        "advance_payment",
        "on_hold",
        "complete",
        "cancelled",
      ],
    },
  },
} as const
