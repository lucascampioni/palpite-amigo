import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, CheckCircle, Copy, Check } from "lucide-react";

interface AdminPrizeManagementProps {
  participant: {
    id: string;
    participant_name: string;
    prize_pix_key: string;
    prize_pix_key_type: string;
    prize_status: string;
    prize_proof_url?: string | null;
  };
  poolId: string;
  onSuccess?: () => void;
}

export const AdminPrizeManagement = ({ participant, poolId, onSuccess }: AdminPrizeManagementProps) => {
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showFullKey, setShowFullKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProofFile(e.target.files[0]);
    }
  };

  const maskPixKey = (key: string, type: string) => {
    if (!key) return '';
    
    switch (type) {
      case 'cpf':
        return `${key.substring(0, 3)}.***.***-${key.substring(key.length - 2)}`;
      case 'email':
        const [username, domain] = key.split('@');
        return `${username.substring(0, 2)}***@${domain}`;
      case 'phone':
        return `(${key.substring(0, 2)}) *****-${key.substring(key.length - 4)}`;
      default:
        return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
    }
  };

  const handleCopyPixKey = async () => {
    try {
      await navigator.clipboard.writeText(participant.prize_pix_key);
      setCopied(true);
      toast.success("Chave PIX copiada!");
      
      // Log access
      await supabase.from("pix_key_access_logs").insert({
        participant_id: participant.id,
        pool_id: poolId,
        accessed_by: (await supabase.auth.getUser()).data.user?.id,
      });
      
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Erro ao copiar chave PIX");
    }
  };

  const handleMarkAsPaid = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!proofFile) {
      toast.error("Por favor, anexe o comprovante de pagamento");
      return;
    }

    setIsUploading(true);

    try {
      // Upload proof file
      const fileExt = proofFile.name.split(".").pop();
      const fileName = `${participant.id}-prize-${Date.now()}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("payment-proofs")
        .upload(fileName, proofFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("payment-proofs")
        .getPublicUrl(fileName);

      // Update participant status
      const { error: updateError } = await supabase
        .from("participants")
        .update({
          prize_status: "prize_sent",
          prize_proof_url: publicUrl,
          prize_sent_at: new Date().toISOString(),
        })
        .eq("id", participant.id);

      if (updateError) throw updateError;

      toast.success("Prêmio marcado como enviado!");
      onSuccess?.();
    } catch (error) {
      console.error("Error marking prize as sent:", error);
      toast.error("Erro ao processar. Tente novamente.");
    } finally {
      setIsUploading(false);
    }
  };

  if (participant.prize_status === "prize_sent") {
    return (
      <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Prêmio Enviado
          </CardTitle>
          <CardDescription>
            O prêmio para {participant.participant_name} já foi enviado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {participant.prize_proof_url && (
            <a
              href={participant.prize_proof_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              Ver comprovante de pagamento
            </a>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Enviar Prêmio - {participant.participant_name}
        </CardTitle>
        <CardDescription>
          Chave PIX do ganhador para envio do prêmio
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-lg bg-muted space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Tipo: {participant.prize_pix_key_type}</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowFullKey(!showFullKey)}
            >
              {showFullKey ? "Ocultar" : "Revelar"}
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2 bg-background rounded text-sm font-mono">
              {showFullKey ? participant.prize_pix_key : maskPixKey(participant.prize_pix_key, participant.prize_pix_key_type)}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyPixKey}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <form onSubmit={handleMarkAsPaid} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proofFile">Comprovante de Pagamento</Label>
            <Input
              id="proofFile"
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileChange}
              required
            />
          </div>

          <Button type="submit" disabled={isUploading} className="w-full">
            {isUploading ? "Enviando..." : "Marcar como Prêmio Enviado"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
