import { ArrowLeft, X, Phone, Mail, MapPin, MessageCircle, Clock, ShieldCheck, Users, Store, BadgeCheck } from "lucide-react";
import type { VendorFullInfo } from "@/lib/cockpit-payments.functions";

interface Props {
  vendor: VendorFullInfo;
  onClose: () => void;
}

export function VendorDetailPanel({ vendor, onClose }: Props) {
  const isAdmin = vendor.is_admin_shop;
  const label = isAdmin
    ? { title: "Boutique Officielle", subtitle: "Kawzone — Garantie & Qualité", color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: ShieldCheck }
    : { title: "Boutique Vendeur", subtitle: "Vendeur partenaire — Commission", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: Users };
  const VIcon = label.icon;

  const handleCall = () => { if (vendor.phone) window.open(`tel:${vendor.phone}`); };
  const handleWhatsApp = () => { if (vendor.whatsapp) window.open(`https://wa.me/${vendor.whatsapp.replace(/\D/g, "")}`, "_blank"); };
  const handleEmail = () => { if (vendor.email) window.open(`mailto:${vendor.email}`); };

  return (
    <div className="absolute inset-0 z-[70] bg-white flex flex-col animate-slide-in">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-2 px-3 py-3 border-b shrink-0">
        <button onClick={onClose} className="flex items-center gap-0.5 text-sm text-orange-600 font-medium hover:bg-orange-50 rounded-lg px-2 py-1.5 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Retour</span>
        </button>
        <h3 className="flex-1 text-sm font-bold truncate text-center pr-16">
          {vendor.shop_name ?? vendor.owner_name ?? "Vendeur"}
        </h3>
      </div>

      {/* ─── Content ─── */}
      <div className="overflow-y-auto flex-1 pb-6">
        {/* ─── Bannière / Logo ─── */}
        <div className="relative h-32 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          {vendor.shop_logo_url ? (
            <img src={vendor.shop_logo_url} alt="" className="h-20 w-20 rounded-full object-cover border-4 border-white shadow-lg" />
          ) : (
            <div className="h-20 w-20 rounded-full bg-white border-4 border-white shadow-lg flex items-center justify-center">
              <Store className="h-8 w-8 text-gray-400" />
            </div>
          )}
          {vendor.is_verified && (
            <div className="absolute bottom-2 right-1/2 translate-x-6 translate-y-2 bg-blue-500 text-white rounded-full p-0.5">
              <BadgeCheck className="h-4 w-4" />
            </div>
          )}
        </div>

        <div className="px-4 space-y-4 mt-6">
          {/* ─── Nom + Type ─── */}
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900">{vendor.shop_name ?? vendor.owner_name ?? "—"}</h2>
            {vendor.owner_name && vendor.shop_name && vendor.owner_name !== vendor.shop_name && (
              <p className="text-sm text-gray-500 mt-0.5">Gérant: {vendor.owner_name}</p>
            )}
            <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-semibold ${isAdmin ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
              <VIcon className="h-3.5 w-3.5" />
              {vendor.shop_type_label}
              {vendor.is_verified && <BadgeCheck className="h-3.5 w-3.5 ml-0.5" />}
            </div>
            {vendor.vendor_mode && (
              <p className="text-xs text-gray-400 mt-1 capitalize">Mode: {vendor.vendor_mode}</p>
            )}
          </div>

          {/* ─── Description ─── */}
          {vendor.shop_description && (
            <div className="bg-gray-50 rounded-xl p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Description</h4>
              <p className="text-sm text-gray-700 leading-relaxed">{vendor.shop_description}</p>
            </div>
          )}

          {/* ─── Coordonnées ─── */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Coordonnées</h4>

            {vendor.phone && (
              <button onClick={handleCall} className="w-full flex items-center gap-3 bg-white border rounded-xl p-3 text-left hover:border-orange-300 hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <Phone className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500">Téléphone</div>
                  <div className="text-sm font-semibold text-gray-900">{vendor.phone}</div>
                </div>
                <span className="text-xs text-orange-600 font-medium">Appeler</span>
              </button>
            )}

            {vendor.whatsapp && (
              <button onClick={handleWhatsApp} className="w-full flex items-center gap-3 bg-white border rounded-xl p-3 text-left hover:border-orange-300 hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <MessageCircle className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500">WhatsApp</div>
                  <div className="text-sm font-semibold text-gray-900">{vendor.whatsapp}</div>
                </div>
                <span className="text-xs text-orange-600 font-medium">Ouvrir</span>
              </button>
            )}

            {vendor.email && (
              <button onClick={handleEmail} className="w-full flex items-center gap-3 bg-white border rounded-xl p-3 text-left hover:border-orange-300 hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <Mail className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500">Email</div>
                  <div className="text-sm font-semibold text-gray-900 truncate">{vendor.email}</div>
                </div>
              </button>
            )}

            {vendor.address && (
              <div className="w-full flex items-center gap-3 bg-white border rounded-xl p-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                  <MapPin className="h-5 w-5 text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500">Adresse</div>
                  <div className="text-sm font-semibold text-gray-900">{vendor.address}</div>
                </div>
              </div>
            )}
          </div>

          {/* ─── Heures d'ouverture ─── */}
          {vendor.shop_hours && (
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Heures d&apos;ouverture</h4>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-line">{vendor.shop_hours}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
