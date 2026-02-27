import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, CheckCircle, Copy, Check, Clock, MessageCircle, AlertCircle, ExternalLink } from "lucide-react";

interface AdminPrizeManagementProps {
  participant: {
    id: string;
    participant_name: string;
    prize_pix_key: string;
    prize_pix_key_type: string;
    prize_status: string;
    prize_proof_url?: string | null;
    user_id?: string;
  };
  poolId: string;
  poolTitle?: string;
  participantPhone?: string;
  onSuccess?: () => void;
}

export const AdminPrizeManagement = ({ participant, poolId, poolTitle, participantPhone, onSuccess }: AdminPrizeManagementProps) => {
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showFullKey, setShowFullKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  

  useEffect(() => {
    const buildUrl = async () => {
      const raw = participant.prize_proof_url;
      if (!raw) { setViewUrl(null); return; }
      if (raw.includes('/object/sign/')) { setViewUrl(raw); return; }
      let filePath = raw;
      if (raw.includes('/payment-proofs/')) {
        filePath = raw.split('/payment-proofs/')[1];
      }
      const { data } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(filePath, 31536000);
      setViewUrl(data?.signedUrl || raw);
    };
    buildUrl();
  }, [participant.prize_proof_url]);

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

      // Update participant status (store only file name)
      const { error: updateError } = await supabase
        .from("participants")
        .update({
          prize_status: "prize_sent",
          prize_proof_url: fileName,
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
              href={viewUrl || participant.prize_proof_url}
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

  const handleSendPixRequest = () => {
    if (!participantPhone) {
      toast.error("Este ganhador não tem telefone cadastrado");
      return;
    }
    const digits = participantPhone.replace(/\D/g, '');
    const phoneWithCountry = digits.startsWith('55') ? digits : `55${digits}`;
    const poolLink = `https://app-delfos.lovable.app/pool/${poolId}`;
    const message = `Olá, ${participant.participant_name}! 🎉\n\nParabéns! Você foi um dos ganhadores do bolão *${poolTitle || ''}*! 🏆\n\nPara que eu possa enviar o seu prêmio, preciso da sua chave PIX. Por favor, acesse o bolão pelo link abaixo e informe sua chave:\n\n${poolLink}\n\nQualquer dúvida, é só responder aqui!`;
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${phoneWithCountry}?text=${encoded}`, '_blank');
  };

  if (!participant.prize_pix_key) {
    return (
      <Card className="border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200 text-base">
            <Clock className="w-5 h-5" />
            Aguardando chave PIX - {participant.participant_name}
          </CardTitle>
          <CardDescription className="text-yellow-700 dark:text-yellow-300">
            Este ganhador ainda não informou sua chave PIX para recebimento do prêmio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-100/50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700">
            <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              Uma mensagem automática já foi enviada informando que o bolão finalizou. Use o botão abaixo apenas se necessário para evitar múltiplas mensagens.
            </p>
          </div>
          {participantPhone ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={handleSendPixRequest}
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              Solicitar chave PIX via WhatsApp
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Ganhador sem telefone cadastrado — não é possível enviar mensagem.
            </p>
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
