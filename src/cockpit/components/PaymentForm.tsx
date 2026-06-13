import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    const finalAmt = amt > balance ? balance : amt;
    onPayment(orderId, finalAmt, method, reference, adminName);
    setAmount("");
    setReference("");
  };

  return (
    <div className="bg-white border rounded-lg p-3 space-y-2" onClick={e => e.stopPropagation()}>
      <h3 className="text-sm font-semibold flex items-center gap-1.5"><CreditCard className="h-4 w-4 text-emerald-600" />Encaisser</h3>
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" placeholder={`Max ${fmtF(balance)}`} value={amount} onChange={e => setAmount(e.target.value)} className="h-9 text-sm" />
        <select value={method} onChange={e => setMethod(e.target.value)} className="h-9 text-sm rounded-md border border-input bg-transparent px-2">
          <option value="wave">Wave</option><option value="orange_money">Orange Money</option><option value="cash">Cash</option><option value="bank_transfer">Virement</option>
        </select>
      </div>
      <Input placeholder="Référence (optionnel)" value={reference} onChange={e => setReference(e.target.value)} className="h-9 text-sm" />
      <Button size="sm" className="w-full h-10 bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit} disabled={!amount || parseFloat(amount) <= 0}>
        Enregistrer le paiement
      </Button>
    </div>
  );
}
