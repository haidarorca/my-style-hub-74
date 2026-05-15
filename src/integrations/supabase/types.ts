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
      admin_action_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      admin_permissions: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          permission: Database["public"]["Enums"]["admin_permission"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          permission: Database["public"]["Enums"]["admin_permission"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          permission?: Database["public"]["Enums"]["admin_permission"]
          user_id?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          created_at: string
          customization: Json | null
          id: string
          product_id: string
          quantity: number
          user_id: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          customization?: Json | null
          id?: string
          product_id: string
          quantity?: number
          user_id: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          customization?: Json | null
          id?: string
          product_id?: string
          quantity?: number
          user_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          level: number
          logo_url: string | null
          name: string
          name_i18n: Json | null
          parent_id: string | null
          position: number | null
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          level: number
          logo_url?: string | null
          name: string
          name_i18n?: Json | null
          parent_id?: string | null
          position?: number | null
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: number
          logo_url?: string | null
          name?: string
          name_i18n?: Json | null
          parent_id?: string | null
          position?: number | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          level: number
          name: string
          parent_id: string | null
          parent_request_id: string | null
          resolved_category_id: string | null
          status: Database["public"]["Enums"]["category_request_status"]
          updated_at: string
          vendor_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          level: number
          name: string
          parent_id?: string | null
          parent_request_id?: string | null
          resolved_category_id?: string | null
          status?: Database["public"]["Enums"]["category_request_status"]
          updated_at?: string
          vendor_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          level?: number
          name?: string
          parent_id?: string | null
          parent_request_id?: string | null
          resolved_category_id?: string | null
          status?: Database["public"]["Enums"]["category_request_status"]
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_requests_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_requests_parent_request_id_fkey"
            columns: ["parent_request_id"]
            isOneToOne: false
            referencedRelation: "category_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_requests_resolved_category_id_fkey"
            columns: ["resolved_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rule_history: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          rule_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          rule_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          rule_id?: string | null
        }
        Relationships: []
      }
      commission_rules: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          destination_country_id: string | null
          id: string
          is_enabled: boolean
          note: string | null
          product_id: string | null
          rate_percent: number
          scope: string
          source_country_id: string | null
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          destination_country_id?: string | null
          id?: string
          is_enabled?: boolean
          note?: string | null
          product_id?: string | null
          rate_percent?: number
          scope: string
          source_country_id?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          destination_country_id?: string | null
          id?: string
          is_enabled?: boolean
          note?: string | null
          product_id?: string | null
          rate_percent?: number
          scope?: string
          source_country_id?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_destination_country_id_fkey"
            columns: ["destination_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_source_country_id_fkey"
            columns: ["source_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          created_at: string
          flag_emoji: string | null
          id: string
          is_enabled: boolean
          name: string
          name_i18n: Json
          position: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          flag_emoji?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          name_i18n?: Json
          position?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          flag_emoji?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          name_i18n?: Json
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          address: string
          city: string
          created_at: string
          destination_country_id: string | null
          full_name: string
          id: string
          is_default: boolean
          label: string
          latitude: number | null
          longitude: number | null
          note: string | null
          phone: string
          phone_alt: string | null
          phone_secondary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          city: string
          created_at?: string
          destination_country_id?: string | null
          full_name: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          phone: string
          phone_alt?: string | null
          phone_secondary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          city?: string
          created_at?: string
          destination_country_id?: string | null
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          phone?: string
          phone_alt?: string | null
          phone_secondary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_destination_country_id_fkey"
            columns: ["destination_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      home_banners: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          image_url: string
          link_url: string | null
          position: number
          title: string | null
          title_i18n: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          image_url: string
          link_url?: string | null
          position?: number
          title?: string | null
          title_i18n?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          image_url?: string
          link_url?: string | null
          position?: number
          title?: string | null
          title_i18n?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          buyer_id: string | null
          color: string | null
          commission_amount: number | null
          commission_rate: number | null
          commission_rule_id: string | null
          created_at: string
          customization: Json | null
          id: string
          order_id: string
          product_code: string
          product_id: string
          product_image_url: string | null
          product_name: string
          quantity: number
          size: string | null
          unit_price: number
          variant_id: string | null
          vendor_id: string
        }
        Insert: {
          buyer_id?: string | null
          color?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          commission_rule_id?: string | null
          created_at?: string
          customization?: Json | null
          id?: string
          order_id: string
          product_code: string
          product_id: string
          product_image_url?: string | null
          product_name: string
          quantity?: number
          size?: string | null
          unit_price?: number
          variant_id?: string | null
          vendor_id: string
        }
        Update: {
          buyer_id?: string | null
          color?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          commission_rule_id?: string | null
          created_at?: string
          customization?: Json | null
          id?: string
          order_id?: string
          product_code?: string
          product_id?: string
          product_image_url?: string | null
          product_name?: string
          quantity?: number
          size?: string | null
          unit_price?: number
          variant_id?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: string | null
          buyer_id: string | null
          city: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          destination_country_id: string | null
          id: string
          note: string | null
          status: string
          total: number
        }
        Insert: {
          address?: string | null
          buyer_id?: string | null
          city?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          destination_country_id?: string | null
          id?: string
          note?: string | null
          status?: string
          total?: number
        }
        Update: {
          address?: string | null
          buyer_id?: string | null
          city?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          destination_country_id?: string | null
          id?: string
          note?: string | null
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_destination_country_id_fkey"
            columns: ["destination_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      product_customizations: {
        Row: {
          allow_all_colors: boolean | null
          allow_all_fonts: boolean | null
          allowed_colors: string[] | null
          allowed_fonts: string[] | null
          created_at: string
          id: string
          image_size_message: string | null
          product_id: string
          type: Database["public"]["Enums"]["customization_type"]
        }
        Insert: {
          allow_all_colors?: boolean | null
          allow_all_fonts?: boolean | null
          allowed_colors?: string[] | null
          allowed_fonts?: string[] | null
          created_at?: string
          id?: string
          image_size_message?: string | null
          product_id: string
          type: Database["public"]["Enums"]["customization_type"]
        }
        Update: {
          allow_all_colors?: boolean | null
          allow_all_fonts?: boolean | null
          allowed_colors?: string[] | null
          allowed_fonts?: string[] | null
          created_at?: string
          id?: string
          image_size_message?: string | null
          product_id?: string
          type?: Database["public"]["Enums"]["customization_type"]
        }
        Relationships: [
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          id: string
          position: number | null
          product_id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number | null
          product_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number | null
          product_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reports: {
        Row: {
          created_at: string
          id: string
          product_id: string
          reason: string
          reporter_id: string
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          reason: string
          reporter_id: string
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          reason?: string
          reporter_id?: string
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "product_reports_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reports_reporter_id_profiles_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          product_id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          color: string | null
          color_hex: string | null
          created_at: string
          id: string
          image_url: string | null
          price_override: number | null
          product_id: string
          size: string | null
          stock: number
        }
        Insert: {
          color?: string | null
          color_hex?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          price_override?: number | null
          product_id: string
          size?: string | null
          stock?: number
        }
        Update: {
          color?: string | null
          color_hex?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          price_override?: number | null
          product_id?: string
          size?: string | null
          stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          code: string
          created_at: string
          description: string | null
          description_i18n: Json | null
          designation: string | null
          designation_i18n: Json | null
          id: string
          is_edit: boolean
          name: string
          name_i18n: Json | null
          pending_category_request_id: string | null
          price: number
          rejection_reason: string | null
          status: Database["public"]["Enums"]["product_status"]
          updated_at: string
          vendor_id: string
        }
        Insert: {
          category_id?: string | null
          code: string
          created_at?: string
          description?: string | null
          description_i18n?: Json | null
          designation?: string | null
          designation_i18n?: Json | null
          id?: string
          is_edit?: boolean
          name: string
          name_i18n?: Json | null
          pending_category_request_id?: string | null
          price?: number
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
          vendor_id: string
        }
        Update: {
          category_id?: string | null
          code?: string
          created_at?: string
          description?: string | null
          description_i18n?: Json | null
          designation?: string | null
          designation_i18n?: Json | null
          id?: string
          is_edit?: boolean
          name?: string
          name_i18n?: Json | null
          pending_category_request_id?: string | null
          price?: number
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_categories_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_pending_category_request_id_fkey"
            columns: ["pending_category_request_id"]
            isOneToOne: false
            referencedRelation: "category_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_vendor_id_profiles_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          full_name: string | null
          hide_contact_publicly: boolean
          id: string
          is_verified: boolean
          latitude: number | null
          longitude: number | null
          phone: string | null
          sex: Database["public"]["Enums"]["user_sex"] | null
          shop_banner_url: string | null
          shop_description: string | null
          shop_description_i18n: Json | null
          shop_hours: string | null
          shop_hours_i18n: Json | null
          shop_hours_schedule: Json | null
          shop_logo_url: string | null
          shop_name: string | null
          shop_whatsapp: string | null
          source_country_id: string | null
          updated_at: string
          vendor_mode: Database["public"]["Enums"]["vendor_mode"]
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          hide_contact_publicly?: boolean
          id: string
          is_verified?: boolean
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          sex?: Database["public"]["Enums"]["user_sex"] | null
          shop_banner_url?: string | null
          shop_description?: string | null
          shop_description_i18n?: Json | null
          shop_hours?: string | null
          shop_hours_i18n?: Json | null
          shop_hours_schedule?: Json | null
          shop_logo_url?: string | null
          shop_name?: string | null
          shop_whatsapp?: string | null
          source_country_id?: string | null
          updated_at?: string
          vendor_mode?: Database["public"]["Enums"]["vendor_mode"]
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          hide_contact_publicly?: boolean
          id?: string
          is_verified?: boolean
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          sex?: Database["public"]["Enums"]["user_sex"] | null
          shop_banner_url?: string | null
          shop_description?: string | null
          shop_description_i18n?: Json | null
          shop_hours?: string | null
          shop_hours_i18n?: Json | null
          shop_hours_schedule?: Json | null
          shop_logo_url?: string | null
          shop_name?: string | null
          shop_whatsapp?: string | null
          source_country_id?: string | null
          updated_at?: string
          vendor_mode?: Database["public"]["Enums"]["vendor_mode"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_source_country_id_fkey"
            columns: ["source_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          accent_color: string
          created_at: string
          footer_text: string | null
          footer_text_i18n: Json | null
          hero_subtitle: string | null
          hero_subtitle_i18n: Json | null
          hero_title: string | null
          hero_title_i18n: Json | null
          id: string
          logo_url: string | null
          primary_color: string
          promo_bar_bg_color: string
          promo_bar_enabled: boolean
          promo_bar_text: string | null
          promo_bar_text_color: string
          promo_bar_text_i18n: Json | null
          site_name: string
          updated_at: string
          whatsapp_default_message: string | null
          whatsapp_number: string | null
        }
        Insert: {
          accent_color?: string
          created_at?: string
          footer_text?: string | null
          footer_text_i18n?: Json | null
          hero_subtitle?: string | null
          hero_subtitle_i18n?: Json | null
          hero_title?: string | null
          hero_title_i18n?: Json | null
          id?: string
          logo_url?: string | null
          primary_color?: string
          promo_bar_bg_color?: string
          promo_bar_enabled?: boolean
          promo_bar_text?: string | null
          promo_bar_text_color?: string
          promo_bar_text_i18n?: Json | null
          site_name?: string
          updated_at?: string
          whatsapp_default_message?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          accent_color?: string
          created_at?: string
          footer_text?: string | null
          footer_text_i18n?: Json | null
          hero_subtitle?: string | null
          hero_subtitle_i18n?: Json | null
          hero_title?: string | null
          hero_title_i18n?: Json | null
          id?: string
          logo_url?: string | null
          primary_color?: string
          promo_bar_bg_color?: string
          promo_bar_enabled?: boolean
          promo_bar_text?: string | null
          promo_bar_text_color?: string
          promo_bar_text_i18n?: Json | null
          site_name?: string
          updated_at?: string
          whatsapp_default_message?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      ui_overrides: {
        Row: {
          key: string
          label: string | null
          size: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          key: string
          label?: string | null
          size?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          key?: string
          label?: string | null
          size?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          is_suspended: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_suspended?: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_suspended?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_insert_order_item: {
        Args: { _buyer_id: string; _order_id: string }
        Returns: boolean
      }
      current_user_has_permission: {
        Args: { _perm: Database["public"]["Enums"]["admin_permission"] }
        Returns: boolean
      }
      current_user_has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      get_display_prices: {
        Args: { _destination_country_id?: string; _product_ids: string[] }
        Returns: {
          base_price: number
          commission_amount: number
          commission_rate: number
          commission_rule_id: string
          final_price: number
          product_id: string
        }[]
      }
      get_product_display_price: {
        Args: {
          _destination_country_id?: string
          _product_id: string
          _variant_id?: string
        }
        Returns: {
          base_price: number
          commission_amount: number
          commission_rate: number
          commission_rule_id: string
          final_price: number
          product_id: string
          variant_id: string
        }[]
      }
      has_admin_permission: {
        Args: {
          _perm: Database["public"]["Enums"]["admin_permission"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      log_admin_action: {
        Args: {
          _action: string
          _details?: Json
          _target_id?: string
          _target_type?: string
        }
        Returns: string
      }
      resolve_commission:
        | {
            Args: { _product_id: string }
            Returns: {
              rate: number
              rule_id: string
            }[]
          }
        | {
            Args: { _destination_country_id?: string; _product_id: string }
            Returns: {
              rate: number
              rule_id: string
            }[]
          }
      upsert_commission_rule: {
        Args: {
          _category_id?: string
          _destination_country_id?: string
          _is_enabled?: boolean
          _note?: string
          _product_id?: string
          _rate_percent: number
          _scope: string
          _source_country_id?: string
          _vendor_id?: string
        }
        Returns: {
          category_id: string | null
          created_at: string
          created_by: string | null
          destination_country_id: string | null
          id: string
          is_enabled: boolean
          note: string | null
          product_id: string | null
          rate_percent: number
          scope: string
          source_country_id: string | null
          updated_at: string
          vendor_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "commission_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      admin_permission:
        | "orders"
        | "products"
        | "product_validation"
        | "categories"
        | "vendors"
        | "customers"
        | "support"
        | "settings"
        | "commissions"
      app_role: "admin" | "vendeur" | "acheteur" | "super_admin"
      category_request_status: "pending" | "approved" | "rejected" | "merged"
      customization_type: "name" | "image"
      product_status: "pending" | "approved" | "rejected"
      report_status: "open" | "reviewed" | "dismissed"
      user_sex: "homme" | "femme"
      vendor_mode: "no_commission" | "commission"
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
      admin_permission: [
        "orders",
        "products",
        "product_validation",
        "categories",
        "vendors",
        "customers",
        "support",
        "settings",
        "commissions",
      ],
      app_role: ["admin", "vendeur", "acheteur", "super_admin"],
      category_request_status: ["pending", "approved", "rejected", "merged"],
      customization_type: ["name", "image"],
      product_status: ["pending", "approved", "rejected"],
      report_status: ["open", "reviewed", "dismissed"],
      user_sex: ["homme", "femme"],
      vendor_mode: ["no_commission", "commission"],
    },
  },
} as const
