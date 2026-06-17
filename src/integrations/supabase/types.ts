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
      admin_stats_cache: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
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
            foreignKeyName: "cart_items_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_vendor_contacts"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "cart_items_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_vendor_profiles"
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
          content_hash: string | null
          created_at: string
          id: string
          level: number
          logo_url: string | null
          name: string
          name_i18n: Json | null
          parent_id: string | null
          position: number | null
          slug: string
          translated_hash: string | null
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          id?: string
          level: number
          logo_url?: string | null
          name: string
          name_i18n?: Json | null
          parent_id?: string | null
          position?: number | null
          slug: string
          translated_hash?: string | null
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          id?: string
          level?: number
          logo_url?: string | null
          name?: string
          name_i18n?: Json | null
          parent_id?: string | null
          position?: number | null
          slug?: string
          translated_hash?: string | null
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
      contact_settings: {
        Row: {
          auto_reply_message_i18n: Json
          commission_hides_vendor_contact: boolean
          created_at: string
          default_assigned_admin_ids: string[]
          id: string
          internal_messaging_enabled: boolean
          messenger_url: string | null
          support_emails: Json
          support_enabled: boolean
          support_hours_i18n: Json
          telegram_url: string | null
          updated_at: string
          vendor_contact_enabled: boolean
          whatsapp_enabled: boolean
          whatsapp_support_numbers: Json
        }
        Insert: {
          auto_reply_message_i18n?: Json
          commission_hides_vendor_contact?: boolean
          created_at?: string
          default_assigned_admin_ids?: string[]
          id?: string
          internal_messaging_enabled?: boolean
          messenger_url?: string | null
          support_emails?: Json
          support_enabled?: boolean
          support_hours_i18n?: Json
          telegram_url?: string | null
          updated_at?: string
          vendor_contact_enabled?: boolean
          whatsapp_enabled?: boolean
          whatsapp_support_numbers?: Json
        }
        Update: {
          auto_reply_message_i18n?: Json
          commission_hides_vendor_contact?: boolean
          created_at?: string
          default_assigned_admin_ids?: string[]
          id?: string
          internal_messaging_enabled?: boolean
          messenger_url?: string | null
          support_emails?: Json
          support_enabled?: boolean
          support_hours_i18n?: Json
          telegram_url?: string | null
          updated_at?: string
          vendor_contact_enabled?: boolean
          whatsapp_enabled?: boolean
          whatsapp_support_numbers?: Json
        }
        Relationships: []
      }
      countries: {
        Row: {
          code: string
          content_hash: string | null
          created_at: string
          flag_emoji: string | null
          id: string
          is_enabled: boolean
          name: string
          name_i18n: Json
          position: number
          translated_hash: string | null
          updated_at: string
        }
        Insert: {
          code: string
          content_hash?: string | null
          created_at?: string
          flag_emoji?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          name_i18n?: Json
          position?: number
          translated_hash?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          content_hash?: string | null
          created_at?: string
          flag_emoji?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          name_i18n?: Json
          position?: number
          translated_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city_id: string | null
          city_text: string | null
          country_id: string | null
          created_at: string
          full_name: string | null
          id: string
          is_default: boolean
          label: string | null
          landmark: string | null
          latitude: number | null
          longitude: number | null
          neighborhood_text: string | null
          note: string | null
          owner_id: string
          owner_type: string
          phone: string | null
          phone_alt: string | null
          postal_code: string | null
          region_id: string | null
          region_text: string | null
          type: string
          updated_at: string
        }
        Insert: {
          address_line1?: string
          address_line2?: string | null
          city_id?: string | null
          city_text?: string | null
          country_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          neighborhood_text?: string | null
          note?: string | null
          owner_id: string
          owner_type: string
          phone?: string | null
          phone_alt?: string | null
          postal_code?: string | null
          region_id?: string | null
          region_text?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city_id?: string | null
          city_text?: string | null
          country_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          neighborhood_text?: string | null
          note?: string | null
          owner_id?: string
          owner_type?: string
          phone?: string | null
          phone_alt?: string | null
          postal_code?: string | null
          region_id?: string | null
          region_text?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_city_id_fkey"
            columns: ["city_id"]
            referencedRelation: "geo_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addresses_country_id_fkey"
            columns: ["country_id"]
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addresses_region_id_fkey"
            columns: ["region_id"]
            referencedRelation: "geo_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_cities: {
        Row: {
          country_id: string
          created_at: string
          id: string
          name: string
          region_id: string | null
        }
        Insert: {
          country_id: string
          created_at?: string
          id?: string
          name: string
          region_id?: string | null
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          name?: string
          region_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_cities_country_id_fkey"
            columns: ["country_id"]
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geo_cities_region_id_fkey"
            columns: ["region_id"]
            referencedRelation: "geo_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_regions: {
        Row: {
          country_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          country_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "geo_regions_country_id_fkey"
            columns: ["country_id"]
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_warehouses: {
        Row: {
          address_id: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          address_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          address_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
          vendor_id?: string
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
      email_verification_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          id: string
          used: boolean
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          used?: boolean
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          used?: boolean
        }
        Relationships: []
      }
      home_banners: {
        Row: {
          created_at: string
          cta_label: string | null
          cta_label_i18n: Json | null
          enabled: boolean
          focal_x: number
          focal_y: number
          height_desktop: number
          height_mobile: number
          height_tablet: number
          id: string
          image_url: string
          image_url_mobile: string | null
          image_url_tablet: string | null
          link_url: string | null
          object_fit: string
          overlay_opacity: number
          position: number
          rotation: number
          subtitle: string | null
          subtitle_i18n: Json | null
          text_align: string
          text_color: string
          title: string | null
          title_i18n: Json | null
          updated_at: string
          zoom: number
        }
        Insert: {
          created_at?: string
          cta_label?: string | null
          cta_label_i18n?: Json | null
          enabled?: boolean
          focal_x?: number
          focal_y?: number
          height_desktop?: number
          height_mobile?: number
          height_tablet?: number
          id?: string
          image_url: string
          image_url_mobile?: string | null
          image_url_tablet?: string | null
          link_url?: string | null
          object_fit?: string
          overlay_opacity?: number
          position?: number
          rotation?: number
          subtitle?: string | null
          subtitle_i18n?: Json | null
          text_align?: string
          text_color?: string
          title?: string | null
          title_i18n?: Json | null
          updated_at?: string
          zoom?: number
        }
        Update: {
          created_at?: string
          cta_label?: string | null
          cta_label_i18n?: Json | null
          enabled?: boolean
          focal_x?: number
          focal_y?: number
          height_desktop?: number
          height_mobile?: number
          height_tablet?: number
          id?: string
          image_url?: string
          image_url_mobile?: string | null
          image_url_tablet?: string | null
          link_url?: string | null
          object_fit?: string
          overlay_opacity?: number
          position?: number
          rotation?: number
          subtitle?: string | null
          subtitle_i18n?: Json | null
          text_align?: string
          text_color?: string
          title?: string | null
          title_i18n?: Json | null
          updated_at?: string
          zoom?: number
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          last_offset: number
          status: string
          store_name: string | null
          store_url: string
          total_imported: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_offset?: number
          status?: string
          store_name?: string | null
          store_url: string
          total_imported?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_offset?: number
          status?: string
          store_name?: string | null
          store_url?: string
          total_imported?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendor_contacts"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "import_batches_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          confidence: number
          created_at: string
          draft: Json | null
          error_message: string | null
          extraction_source: string | null
          final_url: string | null
          id: string
          kind: string
          logs: Json
          platform: string | null
          progress: number
          shop_id: string
          source_product_id: string | null
          source_url: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
          validation_issues: string[]
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          confidence?: number
          created_at?: string
          draft?: Json | null
          error_message?: string | null
          extraction_source?: string | null
          final_url?: string | null
          id?: string
          kind?: string
          logs?: Json
          platform?: string | null
          progress?: number
          shop_id: string
          source_product_id?: string | null
          source_url: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          validation_issues?: string[]
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          confidence?: number
          created_at?: string
          draft?: Json | null
          error_message?: string | null
          extraction_source?: string | null
          final_url?: string | null
          id?: string
          kind?: string
          logs?: Json
          platform?: string | null
          progress?: number
          shop_id?: string
          source_product_id?: string | null
          source_url?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          validation_issues?: string[]
        }
        Relationships: []
      }
      import_products: {
        Row: {
          ai_metadata: Json | null
          batch_id: string
          created_at: string
          description: string
          designation: string
          duplicate_of: string | null
          id: string
          images: Json
          name: string
          price: number
          source_currency: string
          source_price: number
          source_product_id: string | null
          source_store_url: string | null
          source_url: string
          status: string
          suggested_category_id: string | null
          suggested_category_name: string | null
          updated_at: string
          variants: Json
          vendor_id: string
        }
        Insert: {
          ai_metadata?: Json | null
          batch_id: string
          created_at?: string
          description?: string
          designation?: string
          duplicate_of?: string | null
          id?: string
          images?: Json
          name?: string
          price?: number
          source_currency?: string
          source_price?: number
          source_product_id?: string | null
          source_store_url?: string | null
          source_url: string
          status?: string
          suggested_category_id?: string | null
          suggested_category_name?: string | null
          updated_at?: string
          variants?: Json
          vendor_id: string
        }
        Update: {
          ai_metadata?: Json | null
          batch_id?: string
          created_at?: string
          description?: string
          designation?: string
          duplicate_of?: string | null
          id?: string
          images?: Json
          name?: string
          price?: number
          source_currency?: string
          source_price?: number
          source_product_id?: string | null
          source_store_url?: string | null
          source_url?: string
          status?: string
          suggested_category_id?: string | null
          suggested_category_name?: string | null
          updated_at?: string
          variants?: Json
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_products_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_products_suggested_category_id_fkey"
            columns: ["suggested_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendor_contacts"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "import_products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_reason_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          is_enabled: boolean
          label: string
          position: number
          step: Database["public"]["Enums"]["moderation_step"]
          updated_at: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          label: string
          position?: number
          step: Database["public"]["Enums"]["moderation_step"]
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          label?: string
          position?: number
          step?: Database["public"]["Enums"]["moderation_step"]
          updated_at?: string
          video_url?: string | null
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
      order_article_states: {
        Row: {
          created_at: string
          delivered_qty: number
          id: string
          order_id: string
          product_id: string
          settlement: Json | null
          status: string
          stock_break: Json | null
          updated_at: string
          updated_by: string | null
          variant_id: string | null
          version: number
        }
        Insert: {
          created_at?: string
          delivered_qty?: number
          id?: string
          order_id: string
          product_id: string
          settlement?: Json | null
          status?: string
          stock_break?: Json | null
          updated_at?: string
          updated_by?: string | null
          variant_id?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          delivered_qty?: number
          id?: string
          order_id?: string
          product_id?: string
          settlement?: Json | null
          status?: string
          stock_break?: Json | null
          updated_at?: string
          updated_by?: string | null
          variant_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_article_states_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
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
      order_payment_summary: {
        Row: {
          order_id: string
          total_paid: number
          updated_at: string
        }
        Insert: {
          order_id: string
          total_paid?: number
          updated_at?: string
        }
        Update: {
          order_id?: string
          total_paid?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payment_summary_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          admin_id: string | null
          admin_name: string
          amount: number
          created_at: string
          id: string
          method: string
          order_id: string
          reference: string | null
        }
        Insert: {
          admin_id?: string | null
          admin_name?: string
          amount: number
          created_at?: string
          id?: string
          method: string
          order_id: string
          reference?: string | null
        }
        Update: {
          admin_id?: string | null
          admin_name?: string
          amount?: number
          created_at?: string
          id?: string
          method?: string
          order_id?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_shipment_assessments: {
        Row: {
          admin_comment: string | null
          air_freight_fee: number | null
          client_rejected_at: string | null
          client_response_note: string | null
          client_validated_at: string | null
          created_at: string
          created_by: string | null
          extra_fees: number | null
          height_cm: number | null
          id: string
          length_cm: number | null
          order_id: string
          parcel_photo_url: string | null
          price_per_kg_snapshot: number | null
          real_weight_kg: number | null
          service_fee: number | null
          shipping_service_id: string | null
          status: Database["public"]["Enums"]["shipment_assessment_status"]
          total_fees: number | null
          updated_at: string
          volumetric_weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          admin_comment?: string | null
          air_freight_fee?: number | null
          client_rejected_at?: string | null
          client_response_note?: string | null
          client_validated_at?: string | null
          created_at?: string
          created_by?: string | null
          extra_fees?: number | null
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          order_id: string
          parcel_photo_url?: string | null
          price_per_kg_snapshot?: number | null
          real_weight_kg?: number | null
          service_fee?: number | null
          shipping_service_id?: string | null
          status?: Database["public"]["Enums"]["shipment_assessment_status"]
          total_fees?: number | null
          updated_at?: string
          volumetric_weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          admin_comment?: string | null
          air_freight_fee?: number | null
          client_rejected_at?: string | null
          client_response_note?: string | null
          client_validated_at?: string | null
          created_at?: string
          created_by?: string | null
          extra_fees?: number | null
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          order_id?: string
          parcel_photo_url?: string | null
          price_per_kg_snapshot?: number | null
          real_weight_kg?: number | null
          service_fee?: number | null
          shipping_service_id?: string | null
          status?: Database["public"]["Enums"]["shipment_assessment_status"]
          total_fees?: number | null
          updated_at?: string
          volumetric_weight_kg?: number | null
          width_cm?: number | null
        }
        Relationships: []
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          order_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          order_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          order_id?: string
          to_status?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          address: string | null
          archived_at: string | null
          buyer_id: string | null
          city: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          destination_country_id: string | null
          forwarded_to_vendor_at: string | null
          id: string
          is_commission: boolean
          note: string | null
          shipping_estimate_note: string | null
          shipping_service_id: string | null
          status: string
          total: number
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          buyer_id?: string | null
          city?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          destination_country_id?: string | null
          forwarded_to_vendor_at?: string | null
          id?: string
          is_commission?: boolean
          note?: string | null
          shipping_estimate_note?: string | null
          shipping_service_id?: string | null
          status?: string
          total?: number
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          buyer_id?: string | null
          city?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          destination_country_id?: string | null
          forwarded_to_vendor_at?: string | null
          id?: string
          is_commission?: boolean
          note?: string | null
          shipping_estimate_note?: string | null
          shipping_service_id?: string | null
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
      password_reset_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          id: string
          used: boolean
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          used?: boolean
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          used?: boolean
        }
        Relationships: []
      }
      payment_audit: {
        Row: {
          action: string
          admin_id: string | null
          admin_name: string
          created_at: string
          details: string | null
          id: string
          order_id: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          admin_name?: string
          created_at?: string
          details?: string | null
          id?: string
          order_id: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          admin_name?: string
          created_at?: string
          details?: string | null
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_audit_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_admin_metadata: {
        Row: {
          created_at: string
          product_id: string
          source_platform: string | null
          source_product_id: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          product_id: string
          source_platform?: string | null
          source_product_id?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          product_id?: string
          source_platform?: string | null
          source_product_id?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_admin_metadata_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
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
      product_imports: {
        Row: {
          committed_at: string | null
          created_at: string
          errors: Json
          file_name: string
          id: string
          image_map: Json
          rows: Json
          scope: string
          shop_id: string | null
          status: string
          summary: Json
          user_id: string
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          errors?: Json
          file_name: string
          id?: string
          image_map?: Json
          rows?: Json
          scope: string
          shop_id?: string | null
          status?: string
          summary?: Json
          user_id: string
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          errors?: Json
          file_name?: string
          id?: string
          image_map?: Json
          rows?: Json
          scope?: string
          shop_id?: string | null
          status?: string
          summary?: Json
          user_id?: string
        }
        Relationships: []
      }
      product_moderation_feedback: {
        Row: {
          admin_id: string
          created_at: string
          decision: Database["public"]["Enums"]["moderation_decision"]
          global_message: string | null
          id: string
          product_id: string
          vendor_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          decision: Database["public"]["Enums"]["moderation_decision"]
          global_message?: string | null
          id?: string
          product_id: string
          vendor_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          decision?: Database["public"]["Enums"]["moderation_decision"]
          global_message?: string | null
          id?: string
          product_id?: string
          vendor_id?: string
        }
        Relationships: []
      }
      product_moderation_feedback_items: {
        Row: {
          feedback_id: string
          id: string
          position: number
          reason_text: string
          step: Database["public"]["Enums"]["moderation_step"]
          video_url: string | null
        }
        Insert: {
          feedback_id: string
          id?: string
          position?: number
          reason_text: string
          step: Database["public"]["Enums"]["moderation_step"]
          video_url?: string | null
        }
        Update: {
          feedback_id?: string
          id?: string
          position?: number
          reason_text?: string
          step?: Database["public"]["Enums"]["moderation_step"]
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_moderation_feedback_items_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "product_moderation_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reports: {
        Row: {
          created_at: string
          id: string
          order_id: string | null
          product_id: string | null
          reason: string
          reason_category: string | null
          report_type: string
          reporter_id: string
          status: Database["public"]["Enums"]["report_status"]
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id?: string | null
          product_id?: string | null
          reason: string
          reason_category?: string | null
          report_type?: string
          reporter_id: string
          status?: Database["public"]["Enums"]["report_status"]
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string | null
          product_id?: string | null
          reason?: string
          reason_category?: string | null
          report_type?: string
          reporter_id?: string
          status?: Database["public"]["Enums"]["report_status"]
          vendor_id?: string | null
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
          {
            foreignKeyName: "product_reports_reporter_id_profiles_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_vendor_contacts"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "product_reports_reporter_id_profiles_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          order_id: string | null
          photos: string[]
          product_id: string
          rating: number
          updated_at: string
          user_id: string
          vendor_response: string | null
          vendor_response_at: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          photos?: string[]
          product_id: string
          rating: number
          updated_at?: string
          user_id: string
          vendor_response?: string | null
          vendor_response_at?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          photos?: string[]
          product_id?: string
          rating?: number
          updated_at?: string
          user_id?: string
          vendor_response?: string | null
          vendor_response_at?: string | null
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
          {
            foreignKeyName: "product_reviews_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_vendor_contacts"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "product_reviews_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_vendor_profiles"
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
          archived_at: string | null
          category_id: string | null
          code: string
          contact_override: Database["public"]["Enums"]["product_contact_override"]
          content_hash: string | null
          created_at: string
          description: string | null
          description_i18n: Json | null
          designation: string | null
          designation_i18n: Json | null
          id: string
          is_active: boolean
          is_edit: boolean
          name: string
          name_i18n: Json | null
          pending_category_request_id: string | null
          price: number
          rejection_reason: string | null
          requires_international_shipping: boolean
          status: Database["public"]["Enums"]["product_status"]
          translated_hash: string | null
          updated_at: string
          vendor_id: string
          views_count: number
        }
        Insert: {
          archived_at?: string | null
          category_id?: string | null
          code: string
          contact_override?: Database["public"]["Enums"]["product_contact_override"]
          content_hash?: string | null
          created_at?: string
          description?: string | null
          description_i18n?: Json | null
          designation?: string | null
          designation_i18n?: Json | null
          id?: string
          is_active?: boolean
          is_edit?: boolean
          name: string
          name_i18n?: Json | null
          pending_category_request_id?: string | null
          price?: number
          rejection_reason?: string | null
          requires_international_shipping?: boolean
          status?: Database["public"]["Enums"]["product_status"]
          translated_hash?: string | null
          updated_at?: string
          vendor_id: string
          views_count?: number
        }
        Update: {
          archived_at?: string | null
          category_id?: string | null
          code?: string
          contact_override?: Database["public"]["Enums"]["product_contact_override"]
          content_hash?: string | null
          created_at?: string
          description?: string | null
          description_i18n?: Json | null
          designation?: string | null
          designation_i18n?: Json | null
          id?: string
          is_active?: boolean
          is_edit?: boolean
          name?: string
          name_i18n?: Json | null
          pending_category_request_id?: string | null
          price?: number
          rejection_reason?: string | null
          requires_international_shipping?: boolean
          status?: Database["public"]["Enums"]["product_status"]
          translated_hash?: string | null
          updated_at?: string
          vendor_id?: string
          views_count?: number
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
          {
            foreignKeyName: "products_vendor_id_profiles_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendor_contacts"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "products_vendor_id_profiles_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          access_ends_at: string | null
          access_starts_at: string | null
          address: string | null
          allowed_destination_country_ids: string[]
          assigned_support_admin_ids: string[]
          blocked_at: string | null
          blocked_reason: string | null
          contact_mode: Database["public"]["Enums"]["shop_contact_mode"]
          created_at: string
          email: string | null
          full_name: string | null
          hide_contact_publicly: boolean
          id: string
          is_admin_shop: boolean
          is_verified: boolean
          latitude: number | null
          longitude: number | null
          managed_by_admin_id: string | null
          phone: string | null
          sex: Database["public"]["Enums"]["user_sex"] | null
          ships_internationally: boolean
          shop_banner_url: string | null
          shop_description: string | null
          shop_description_i18n: Json | null
          shop_hours: string | null
          shop_hours_i18n: Json | null
          shop_hours_schedule: Json | null
          shop_logo_url: string | null
          shop_name: string | null
          shop_whatsapp: string | null
          show_address: boolean
          show_email: boolean
          show_phone: boolean
          show_whatsapp: boolean
          source_country_id: string | null
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
          vendor_contact_force_visible: boolean
          vendor_mode: Database["public"]["Enums"]["vendor_mode"]
          vendor_status: Database["public"]["Enums"]["vendor_account_status"]
        }
        Insert: {
          access_ends_at?: string | null
          access_starts_at?: string | null
          address?: string | null
          allowed_destination_country_ids?: string[]
          assigned_support_admin_ids?: string[]
          blocked_at?: string | null
          blocked_reason?: string | null
          contact_mode?: Database["public"]["Enums"]["shop_contact_mode"]
          created_at?: string
          email?: string | null
          full_name?: string | null
          hide_contact_publicly?: boolean
          id: string
          is_admin_shop?: boolean
          is_verified?: boolean
          latitude?: number | null
          longitude?: number | null
          managed_by_admin_id?: string | null
          phone?: string | null
          sex?: Database["public"]["Enums"]["user_sex"] | null
          ships_internationally?: boolean
          shop_banner_url?: string | null
          shop_description?: string | null
          shop_description_i18n?: Json | null
          shop_hours?: string | null
          shop_hours_i18n?: Json | null
          shop_hours_schedule?: Json | null
          shop_logo_url?: string | null
          shop_name?: string | null
          shop_whatsapp?: string | null
          show_address?: boolean
          show_email?: boolean
          show_phone?: boolean
          show_whatsapp?: boolean
          source_country_id?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
          vendor_contact_force_visible?: boolean
          vendor_mode?: Database["public"]["Enums"]["vendor_mode"]
          vendor_status?: Database["public"]["Enums"]["vendor_account_status"]
        }
        Update: {
          access_ends_at?: string | null
          access_starts_at?: string | null
          address?: string | null
          allowed_destination_country_ids?: string[]
          assigned_support_admin_ids?: string[]
          blocked_at?: string | null
          blocked_reason?: string | null
          contact_mode?: Database["public"]["Enums"]["shop_contact_mode"]
          created_at?: string
          email?: string | null
          full_name?: string | null
          hide_contact_publicly?: boolean
          id?: string
          is_admin_shop?: boolean
          is_verified?: boolean
          latitude?: number | null
          longitude?: number | null
          managed_by_admin_id?: string | null
          phone?: string | null
          sex?: Database["public"]["Enums"]["user_sex"] | null
          ships_internationally?: boolean
          shop_banner_url?: string | null
          shop_description?: string | null
          shop_description_i18n?: Json | null
          shop_hours?: string | null
          shop_hours_i18n?: Json | null
          shop_hours_schedule?: Json | null
          shop_logo_url?: string | null
          shop_name?: string | null
          shop_whatsapp?: string | null
          show_address?: boolean
          show_email?: boolean
          show_phone?: boolean
          show_whatsapp?: boolean
          source_country_id?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
          vendor_contact_force_visible?: boolean
          vendor_mode?: Database["public"]["Enums"]["vendor_mode"]
          vendor_status?: Database["public"]["Enums"]["vendor_account_status"]
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
      shipping_services: {
        Row: {
          created_at: string
          delay_max_days: number | null
          delay_min_days: number | null
          description: string | null
          destination_country_id: string | null
          id: string
          is_enabled: boolean
          name: string
          position: number
          price_per_kg: number
          pricing_unit: string
          source_country_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delay_max_days?: number | null
          delay_min_days?: number | null
          description?: string | null
          destination_country_id?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          position?: number
          price_per_kg?: number
          pricing_unit?: string
          source_country_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delay_max_days?: number | null
          delay_min_days?: number | null
          description?: string | null
          destination_country_id?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          position?: number
          price_per_kg?: number
          pricing_unit?: string
          source_country_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          accent_color: string
          auth_sender_email: string | null
          auth_sender_name: string | null
          banner_autoplay: boolean
          banner_interval_ms: number
          banner_show_arrows: boolean
          banner_show_dots: boolean
          banner_transition: string
          cny_to_xof_rate: number
          commission_whatsapp_number: string | null
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
          auth_sender_email?: string | null
          auth_sender_name?: string | null
          banner_autoplay?: boolean
          banner_interval_ms?: number
          banner_show_arrows?: boolean
          banner_show_dots?: boolean
          banner_transition?: string
          cny_to_xof_rate?: number
          commission_whatsapp_number?: string | null
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
          auth_sender_email?: string | null
          auth_sender_name?: string | null
          banner_autoplay?: boolean
          banner_interval_ms?: number
          banner_show_arrows?: boolean
          banner_show_dots?: boolean
          banner_transition?: string
          cny_to_xof_rate?: number
          commission_whatsapp_number?: string | null
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
      support_conversations: {
        Row: {
          assigned_admin_id: string | null
          client_email: string | null
          client_id: string | null
          client_name: string | null
          closed_at: string | null
          created_at: string
          id: string
          is_commission_protected: boolean
          last_message_at: string
          last_message_preview: string | null
          order_id: string | null
          priority: Database["public"]["Enums"]["support_priority"]
          product_id: string | null
          status: Database["public"]["Enums"]["support_conv_status"]
          subject: string
          type: Database["public"]["Enums"]["support_conv_type"]
          unread_count_admin: number
          unread_count_client: number
          unread_count_vendor: number
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          assigned_admin_id?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          is_commission_protected?: boolean
          last_message_at?: string
          last_message_preview?: string | null
          order_id?: string | null
          priority?: Database["public"]["Enums"]["support_priority"]
          product_id?: string | null
          status?: Database["public"]["Enums"]["support_conv_status"]
          subject?: string
          type: Database["public"]["Enums"]["support_conv_type"]
          unread_count_admin?: number
          unread_count_client?: number
          unread_count_vendor?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          assigned_admin_id?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          is_commission_protected?: boolean
          last_message_at?: string
          last_message_preview?: string | null
          order_id?: string | null
          priority?: Database["public"]["Enums"]["support_priority"]
          product_id?: string | null
          status?: Database["public"]["Enums"]["support_conv_status"]
          subject?: string
          type?: Database["public"]["Enums"]["support_conv_type"]
          unread_count_admin?: number
          unread_count_client?: number
          unread_count_vendor?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          is_internal_note: boolean
          sender_id: string | null
          sender_role: Database["public"]["Enums"]["support_sender_role"]
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          sender_id?: string | null
          sender_role: Database["public"]["Enums"]["support_sender_role"]
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          sender_id?: string | null
          sender_role?: Database["public"]["Enums"]["support_sender_role"]
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      taobao_sessions: {
        Row: {
          connected_at: string | null
          cookies_encrypted: string | null
          expires_at: string | null
          id: string
          last_check_at: string | null
          nickname: string | null
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          connected_at?: string | null
          cookies_encrypted?: string | null
          expires_at?: string | null
          id?: string
          last_check_at?: string | null
          nickname?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          connected_at?: string | null
          cookies_encrypted?: string | null
          expires_at?: string | null
          id?: string
          last_check_at?: string | null
          nickname?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
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
          {
            foreignKeyName: "user_roles_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_vendor_contacts"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "user_roles_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_product_reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string | null
          is_verified: boolean | null
          photos: string[] | null
          product_id: string | null
          rating: number | null
          updated_at: string | null
          vendor_response: string | null
          vendor_response_at: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string | null
          is_verified?: never
          photos?: string[] | null
          product_id?: string | null
          rating?: number | null
          updated_at?: string | null
          vendor_response?: string | null
          vendor_response_at?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string | null
          is_verified?: never
          photos?: string[] | null
          product_id?: string | null
          rating?: number | null
          updated_at?: string | null
          vendor_response?: string | null
          vendor_response_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      public_vendor_contacts: {
        Row: {
          address: string | null
          contact_mode: Database["public"]["Enums"]["shop_contact_mode"] | null
          email: string | null
          latitude: number | null
          longitude: number | null
          phone: string | null
          shop_banner_url: string | null
          shop_description: string | null
          shop_description_i18n: Json | null
          shop_hours: string | null
          shop_hours_i18n: Json | null
          shop_hours_schedule: Json | null
          shop_logo_url: string | null
          shop_name: string | null
          shop_whatsapp: string | null
          vendor_id: string | null
          vendor_mode: Database["public"]["Enums"]["vendor_mode"] | null
        }
        Insert: {
          address?: never
          contact_mode?: Database["public"]["Enums"]["shop_contact_mode"] | null
          email?: never
          latitude?: never
          longitude?: never
          phone?: never
          shop_banner_url?: string | null
          shop_description?: string | null
          shop_description_i18n?: Json | null
          shop_hours?: string | null
          shop_hours_i18n?: Json | null
          shop_hours_schedule?: Json | null
          shop_logo_url?: string | null
          shop_name?: string | null
          shop_whatsapp?: never
          vendor_id?: string | null
          vendor_mode?: Database["public"]["Enums"]["vendor_mode"] | null
        }
        Update: {
          address?: never
          contact_mode?: Database["public"]["Enums"]["shop_contact_mode"] | null
          email?: never
          latitude?: never
          longitude?: never
          phone?: never
          shop_banner_url?: string | null
          shop_description?: string | null
          shop_description_i18n?: Json | null
          shop_hours?: string | null
          shop_hours_i18n?: Json | null
          shop_hours_schedule?: Json | null
          shop_logo_url?: string | null
          shop_name?: string | null
          shop_whatsapp?: never
          vendor_id?: string | null
          vendor_mode?: Database["public"]["Enums"]["vendor_mode"] | null
        }
        Relationships: []
      }
      public_vendor_profiles: {
        Row: {
          access_ends_at: string | null
          address: string | null
          allowed_destination_country_ids: string[] | null
          created_at: string | null
          full_name: string | null
          hide_contact_publicly: boolean | null
          id: string | null
          is_verified: boolean | null
          latitude: number | null
          longitude: number | null
          phone: string | null
          ships_internationally: boolean | null
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
          updated_at: string | null
          vendor_mode: Database["public"]["Enums"]["vendor_mode"] | null
          vendor_status:
            | Database["public"]["Enums"]["vendor_account_status"]
            | null
        }
        Insert: {
          access_ends_at?: string | null
          address?: string | null
          allowed_destination_country_ids?: string[] | null
          created_at?: string | null
          full_name?: string | null
          hide_contact_publicly?: boolean | null
          id?: string | null
          is_verified?: boolean | null
          latitude?: number | null
          longitude?: number | null
          phone?: never
          ships_internationally?: boolean | null
          shop_banner_url?: string | null
          shop_description?: string | null
          shop_description_i18n?: Json | null
          shop_hours?: string | null
          shop_hours_i18n?: Json | null
          shop_hours_schedule?: Json | null
          shop_logo_url?: string | null
          shop_name?: string | null
          shop_whatsapp?: never
          source_country_id?: string | null
          updated_at?: string | null
          vendor_mode?: Database["public"]["Enums"]["vendor_mode"] | null
          vendor_status?:
            | Database["public"]["Enums"]["vendor_account_status"]
            | null
        }
        Update: {
          access_ends_at?: string | null
          address?: string | null
          allowed_destination_country_ids?: string[] | null
          created_at?: string | null
          full_name?: string | null
          hide_contact_publicly?: boolean | null
          id?: string | null
          is_verified?: boolean | null
          latitude?: number | null
          longitude?: number | null
          phone?: never
          ships_internationally?: boolean | null
          shop_banner_url?: string | null
          shop_description?: string | null
          shop_description_i18n?: Json | null
          shop_hours?: string | null
          shop_hours_i18n?: Json | null
          shop_hours_schedule?: Json | null
          shop_logo_url?: string | null
          shop_name?: string | null
          shop_whatsapp?: never
          source_country_id?: string | null
          updated_at?: string | null
          vendor_mode?: Database["public"]["Enums"]["vendor_mode"] | null
          vendor_status?:
            | Database["public"]["Enums"]["vendor_account_status"]
            | null
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
    }
    Functions: {
      can_insert_order_item: {
        Args: { _buyer_id: string; _order_id: string }
        Returns: boolean
      }
      compute_product_content_hash: {
        Args: { _description: string; _designation: string; _name: string }
        Returns: string
      }
      compute_text_hash: { Args: { _t: string }; Returns: string }
      create_imported_product_atomic: {
        Args: {
          _category_id: string
          _description: string
          _designation: string
          _images: Json
          _name: string
          _price: number
          _shop_id: string
          _source_platform: string
          _source_product_id: string
          _source_url: string
          _variants: Json
        }
        Returns: Json
      }
      current_user_has_permission: {
        Args: { _perm: Database["public"]["Enums"]["admin_permission"] }
        Returns: boolean
      }
      current_user_has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      get_admin_vendor_product_stats: {
        Args: never
        Returns: {
          approved: number
          email: string
          full_name: string
          pending: number
          shop_name: string
          total: number
          user_id: string
        }[]
      }
      get_category_product_counts: {
        Args: never
        Returns: {
          category_id: string
          product_count: number
        }[]
      }
      get_deliverable_vendor_ids: {
        Args: { _country_id: string }
        Returns: {
          id: string
        }[]
      }
      get_display_price_lines_batch: {
        Args: { _destination_country_id?: string; _lines: Json }
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
      get_shop_product_stats: {
        Args: { _vendor_id: string }
        Returns: {
          product_id: string
          revenue: number
          sales_count: number
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
      increment_product_view: {
        Args: { _product_id: string }
        Returns: undefined
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
      product_code_exists_in_shop: {
        Args: { _code: string; _exclude_product_id?: string; _shop_id: string }
        Returns: boolean
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
      resolve_contact_policy: {
        Args: { _product_id?: string; _vendor_id: string }
        Returns: {
          can_contact_vendor: boolean
          can_use_internal_messaging: boolean
          can_use_support: boolean
          contact_mode: Database["public"]["Enums"]["shop_contact_mode"]
          is_commission: boolean
          show_address: boolean
          show_email: boolean
          show_phone: boolean
          show_whatsapp: boolean
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      taobao_session_clear: { Args: never; Returns: undefined }
      taobao_session_load: { Args: { _key: string }; Returns: Json }
      taobao_session_mark_expired: { Args: never; Returns: undefined }
      taobao_session_save: {
        Args: { _cookies: Json; _key: string; _nickname: string; _ua: string }
        Returns: undefined
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
      vendor_contacts_visible: {
        Args: { _vendor_id: string }
        Returns: boolean
      }
      vendor_is_active: { Args: { _user_id: string }; Returns: boolean }
      vendor_publicly_visible: { Args: { _user_id: string }; Returns: boolean }
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
      moderation_decision: "approved" | "rejected" | "changes_requested"
      moderation_step:
        | "name"
        | "code"
        | "designation"
        | "description"
        | "category"
        | "subcategory"
        | "images"
        | "price"
        | "stock"
        | "variants"
        | "countries"
        | "global"
      product_contact_override:
        | "inherit"
        | "allowed"
        | "blocked"
        | "support_only"
      product_status: "pending" | "approved" | "rejected"
      report_status: "open" | "reviewed" | "dismissed"
      shipment_assessment_status:
        | "pending_arrival"
        | "awaiting_weighing"
        | "fees_calculated"
        | "awaiting_client_validation"
        | "validated"
        | "rejected"
        | "ready_to_ship"
        | "shipped"
      shop_contact_mode:
        | "direct"
        | "internal_only"
        | "admin_only"
        | "blocked"
        | "after_order_only"
      support_conv_status: "new" | "open" | "answered" | "closed" | "urgent"
      support_conv_type: "client_support" | "client_vendor" | "vendor_admin"
      support_priority: "low" | "normal" | "high" | "urgent"
      support_sender_role: "client" | "vendor" | "admin" | "system"
      user_sex: "homme" | "femme"
      vendor_account_status:
        | "active"
        | "pending"
        | "suspended"
        | "expired"
        | "blocked"
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
      moderation_decision: ["approved", "rejected", "changes_requested"],
      moderation_step: [
        "name",
        "code",
        "designation",
        "description",
        "category",
        "subcategory",
        "images",
        "price",
        "stock",
        "variants",
        "countries",
        "global",
      ],
      product_contact_override: [
        "inherit",
        "allowed",
        "blocked",
        "support_only",
      ],
      product_status: ["pending", "approved", "rejected"],
      report_status: ["open", "reviewed", "dismissed"],
      shipment_assessment_status: [
        "pending_arrival",
        "awaiting_weighing",
        "fees_calculated",
        "awaiting_client_validation",
        "validated",
        "rejected",
        "ready_to_ship",
        "shipped",
      ],
      shop_contact_mode: [
        "direct",
        "internal_only",
        "admin_only",
        "blocked",
        "after_order_only",
      ],
      support_conv_status: ["new", "open", "answered", "closed", "urgent"],
      support_conv_type: ["client_support", "client_vendor", "vendor_admin"],
      support_priority: ["low", "normal", "high", "urgent"],
      support_sender_role: ["client", "vendor", "admin", "system"],
      user_sex: ["homme", "femme"],
      vendor_account_status: [
        "active",
        "pending",
        "suspended",
        "expired",
        "blocked",
      ],
      vendor_mode: ["no_commission", "commission"],
    },
  },
} as const
