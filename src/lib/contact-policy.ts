export type ShopContactMode = "direct" | "internal_only" | "admin_only" | "blocked" | "after_order_only";
export type ProductContactOverride = "inherit" | "allowed" | "blocked" | "support_only";
export type SupportConvType = "client_support" | "client_vendor" | "vendor_admin";
export type SupportConvStatus = "new" | "open" | "answered" | "closed" | "urgent";
export type SupportPriority = "low" | "normal" | "high" | "urgent";
export type SupportSenderRole = "client" | "vendor" | "admin" | "system";

export interface ContactPolicy {
  can_contact_vendor: boolean;
  can_use_internal_messaging: boolean;
  can_use_support: boolean;
  show_whatsapp: boolean;
  show_email: boolean;
  show_phone: boolean;
  show_address: boolean;
  contact_mode: ShopContactMode;
  is_commission: boolean;
}

export interface PublicVendorContacts {
  vendor_id: string;
  shop_name: string | null;
  shop_logo_url: string | null;
  shop_whatsapp: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contact_mode: ShopContactMode;
}

export interface ContactSettings {
  id: "main";
  support_enabled: boolean;
  whatsapp_enabled: boolean;
  internal_messaging_enabled: boolean;
  vendor_contact_enabled: boolean;
  commission_hides_vendor_contact: boolean;
  whatsapp_support_numbers: Array<{ label: string; number: string; country_id?: string | null; enabled: boolean }>;
  support_emails: Array<{ label: string; email: string }>;
  telegram_url: string | null;
  messenger_url: string | null;
  support_hours_i18n: Record<string, string>;
  auto_reply_message_i18n: Record<string, string>;
  default_assigned_admin_ids: string[];
}
