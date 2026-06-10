// @ts-nocheck
import { useState } from "react";
import { CreditCard, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { KawzoneOrder } from "@/admin1/types/admin1";
import { fmtF, PAYMENT_METHOD_LABELS } from "@/admin1/lib/admin1.config";

interface Props {
  order: KawzoneOrder;
  recordPayment: (orderId: string, amount: number, method: string, reference?: string) => void;
  isPending: boolean;
}

export function PaymentForm({ order, recordPayment, isPending }: Props) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("wave");
  const [reference, setReference] = useState("");

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    recordPayment(order.id, amt, method, reference || undefined);
    setAmount("");
    setReference("");
  };

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <CreditCard className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-semibold">Enregistrer un paiement</span>
        <span className="text-xs text-muted-foreground">(Reste: {fmtF(order.balance)})</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Montant (FCFA)</Label>
          <Input
            type="number"
            className="h-8 text-sm"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Max: ${order.balance}`}
          />
        </div>
        <div>
          <Label className="text-xs">Methode</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-2">
        <Label className="text-xs">Reference (optionnel)</Label>
        <Input className="h-8 text-sm" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="ex: WV-123456" />
      </div>
      <Button
        size="sm"
        className="w-full mt-2 h-8"
        disabled={!amount || parseFloat(amount) <= 0 || isPending}
        onClick={handleSubmit}
      >
        <Check className="h-3.5 w-3.5 mr-1" />
        {isPending ? "Enregistrement..." : "Enregistrer le paiement"}
      </Button>
    </div>
  );
}
