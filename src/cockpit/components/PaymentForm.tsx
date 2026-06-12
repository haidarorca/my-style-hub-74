// @ts-nocheck
import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtF } from "@/cockpit/lib/workflow";

interface Props {
  balance: number;
  orderId: string;
  adminName: string;
  onPayment: (orderId: string, amount: number, method: string, reference: string, adminName: string) => void;
}

export function PaymentForm({ balance, orderId, adminName, onPayment }: Props) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("wave");
  const [reference, setReference] = useState("");

  const handleSubmit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    if (amt > balance) {
      alert(`Le montant ne peut pas depasser le solde (${fmtF(balance)})`);
      return;
    }
    onPayment(orderId, amt, method, reference || "", adminName);
    setAmount("");
    setReference("");
  };

  if (balance <= 0) return null;

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <CreditCard className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-semibold">Ajouter un paiement</span>
        <span className="text-xs text-gray-500">(Reste: {fmtF(balance)})</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          placeholder="Montant"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="h-9 text-sm"
        />
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="wave">Wave</SelectItem>
            <SelectItem value="orange_money">Orange Money</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="bank_transfer">Virement</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Input
        placeholder="Reference (optionnel)"
        value={reference}
        onChange={e => setReference(e.target.value)}
        className="h-9 text-sm mt-2"
      />

      <Button size="sm" className="w-full mt-2 h-9" onClick={handleSubmit} disabled={!amount || parseFloat(amount) <= 0}>
        Enregistrer le paiement
      </Button>
    </div>
  );
}
