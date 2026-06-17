/**
 * Fonctions de notification
 * -------------------------
 * Ce fichier centralise toutes les creations de notifications pour garantir
 * que les bons utilisateurs recoivent les bonnes alertes.
 *
 * Notifications existantes :
 * - Modération produit → vendeur (deja dans admin-moderation.functions.ts)
 *
 * Notifications a ajouter :
 * - Nouvelle inscription vendeur → super admins
 * - Nouvelle commande → vendeur concerné
 * - Changement statut commande → client
 * - Message support → destinataire (admin ou vendeur)
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface NotificationInput {
  user_id: string;
  title: string;
  message: string;
  link?: string | null;
}

async function insertNotification(input: NotificationInput): Promise<void> {
  await supabaseAdmin.from("notifications").insert({
    user_id: input.user_id,
    title: input.title,
    message: input.message,
    link: input.link ?? null,
  });
}

/**
 * Notifier les super admins qu'un nouveau vendeur s'est inscrit.
 */
export async function notifyNewVendorSignup(vendorUserId: string, vendorName: string): Promise<void> {
  // Recuperer tous les super admins
  const { data: admins } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "super_admin")
    .eq("is_suspended", false);

  if (!admins || admins.length === 0) return;

  const title = "🆕 Nouveau vendeur inscrit";
  const message = `Le vendeur "${vendorName}" vient de finaliser son inscription. Verifiez sa boutique dans l'espace admin.`;
  const link = `/admin/vendors/${vendorUserId}`;

  await Promise.all(
    admins.map((admin) =>
      insertNotification({
        user_id: admin.user_id,
        title,
        message,
        link,
      })
    )
  );
}

/**
 * Notifier un vendeur qu'une nouvelle commande a été passée.
 */
export async function notifyVendorNewOrder(orderId: string, vendorUserId: string, customerName: string): Promise<void> {
  await insertNotification({
    user_id: vendorUserId,
    title: "🛒 Nouvelle commande",
    message: `Une nouvelle commande a ete passee par ${customerName}. Preparez les articles pour l'expedition.`,
    link: `/vendor/orders/${orderId}`,
  });
}

/**
 * Notifier un client que le statut de sa commande a changé.
 */
export async function notifyCustomerOrderStatus(
  orderId: string,
  customerUserId: string,
  status: string,
  shopName: string
): Promise<void> {
  const statusLabels: Record<string, string> = {
    pending: "en attente de confirmation",
    confirmed: "confirmee",
    preparing: "en preparation",
    ready: "prete pour expedition",
    shipped: "expediee",
    delivered: "livree",
    cancelled: "annulee",
  };

  const label = statusLabels[status] ?? status;

  await insertNotification({
    user_id: customerUserId,
    title: `📦 Commande ${label}`,
    message: `Votre commande chez "${shopName}" est maintenant ${label}.`,
    link: `/account/orders/${orderId}`,
  });
}

/**
 * Notifier un vendeur que son statut a changé (approuvé, suspendu, etc.)
 */
export async function notifyVendorStatusChange(
  vendorUserId: string,
  status: "approved" | "suspended" | "rejected"
): Promise<void> {
  const configs = {
    approved: {
      title: "✅ Compte approuve",
      message: "Votre compte vendeur a ete approuve. Vous pouvez maintenant ajouter des produits et recevoir des commandes.",
      link: "/vendor/products",
    },
    suspended: {
      title: "⏸️ Compte suspendu",
      message: "Votre compte vendeur a ete suspendu temporairement. Contactez le support pour plus d'informations.",
      link: "/vendor/support",
    },
    rejected: {
      title: "❌ Compte refuse",
      message: "Votre inscription vendeur a ete refusee. Contactez le support pour connaitre les raisons.",
      link: "/vendor/support",
    },
  };

  const config = configs[status];
  await insertNotification({
    user_id: vendorUserId,
    ...config,
  });
}

/**
 * Notifier qu'un message de support a été reçu.
 */
export async function notifySupportMessage(
  recipientUserId: string,
  senderName: string,
  preview: string,
  supportTicketId: string
): Promise<void> {
  await insertNotification({
    user_id: recipientUserId,
    title: `💬 Nouveau message de ${senderName}`,
    message: preview.length > 120 ? preview.substring(0, 120) + "..." : preview,
    link: `/admin/support/${supportTicketId}`,
  });
}
