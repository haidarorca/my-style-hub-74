import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { registerSavAttachment } from "@/lib/sav-workflow.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function SavEvidenceUploader({ caseId, onUploaded }: { caseId: string; onUploaded?: () => void }) {
  const register = useServerFn(registerSavAttachment);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const path = `${caseId}/${Date.now()}-${f.name}`;
        const { error } = await supabase.storage.from("sav-evidence").upload(path, f, { upsert: false });
        if (error) throw error;
        await register({ data: { case_id: caseId, storage_path: path, mime_type: f.type, size_bytes: f.size } });
      }
      toast.success("Preuves ajoutées");
      onUploaded?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur upload");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="inline-flex">
        <Input type="file" multiple accept="image/*,video/*,.pdf" className="hidden"
          onChange={(e) => handleFiles(e.target.files)} disabled={busy} />
        <Button asChild variant="outline" size="sm" disabled={busy}>
          <span className="cursor-pointer">
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            Ajouter une preuve
          </span>
        </Button>
      </label>
    </div>
  );
}
