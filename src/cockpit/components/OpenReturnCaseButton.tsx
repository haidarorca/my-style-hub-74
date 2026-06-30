// ═══════════════════════════════════════════════════════════════
// OpenReturnCaseButton — Bouton "Envoyer au Centre Retours"
//
// Affiché dans le drawer Cockpit. Crée un dossier Retour ou
// Annulation pour la commande courante et redirige immédiatement
// vers le Centre Retours & Annulations. Le Cockpit ne porte
// aucune logique métier supplémentaire.
// ═══════════════════════════════════════════════════════════════

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { openReturnCase, type ReturnKind } from "@/lib/returns.functions";
import { AlertTriangle, Undo2, XCircle } from "lucide-react";

interface OrderItemLike {
  id: string;
  product_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
}

export function OpenReturnCaseButton({
  orderId,
  articles,
}: {
  orderId: string;
  articles: OrderItemLike[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ReturnKind>("return");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const createFn = useServerFn(openReturnCase);

  const submit = async () => {
    const items = articles
      .filter((a) => selected[a.id])
      .map((a) => ({
        order_item_id: a.id,
        quantity: a.quantity ?? 1,
        unit_price_xof: Number(a.unit_price ?? 0),
      }));
    if (items.length === 0) {
      alert("Sélectionnez au moins un article.");
      return;
    }
    setBusy(true);
    try {
      const res = await createFn({
        data: {
          order_id: orderId,
          kind,
          reason_note: reason || null,
          items,
        },
      });
      navigate({ to: "/admin/returns/$caseId", params: { caseId: res.id } });
    } catch (e: any) {
      alert(e?.message ?? "Erreur");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-amber-100"
      >
        <AlertTriangle className="h-4 w-4" />
        Ouvrir un dossier Retour / Annulation
      </button>
    );
  }

  return (
    <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Nouveau dossier</div>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          Annuler
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setKind("return")}
          className={`px-2 py-2 rounded border text-sm inline-flex items-center justify-center gap-1 ${
            kind === "return"
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white border-slate-200"
          }`}
        >
          <Undo2 className="h-3.5 w-3.5" /> Retour
        </button>
        <button
          onClick={() => setKind("cancellation")}
          className={`px-2 py-2 rounded border text-sm inline-flex items-center justify-center gap-1 ${
            kind === "cancellation"
              ? "bg-rose-600 text-white border-rose-600"
              : "bg-white border-slate-200"
          }`}
        >
          <XCircle className="h-3.5 w-3.5" /> Annulation
        </button>
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-600 mb-1">
          Articles concernés
        </div>
        <div className="space-y-1 max-h-44 overflow-y-auto">
          {articles.map((a) => (
            <label
              key={a.id}
              className="flex items-center gap-2 text-sm bg-white border rounded px-2 py-1.5 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={!!selected[a.id]}
                onChange={(e) =>
                  setSelected((s) => ({ ...s, [a.id]: e.target.checked }))
                }
              />
              <span className="flex-1 truncate">{a.product_name ?? "Article"}</span>
              <span className="text-xs text-slate-500">×{a.quantity ?? 1}</span>
            </label>
          ))}
        </div>
      </div>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Motif (optionnel)"
        className="w-full px-2 py-1.5 border rounded text-sm"
      />

      <button
        onClick={submit}
        disabled={busy}
        className="w-full px-3 py-2 rounded bg-amber-600 text-white text-sm font-semibold disabled:opacity-60"
      >
        {busy ? "Création…" : "Créer et ouvrir le dossier"}
      </button>
    </div>
  );
}
