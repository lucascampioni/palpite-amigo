import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, AlertCircle, DollarSign, Copy, Check, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PaymentProofSubmissionProps {
  participantId: string;
  poolId: string;
  poolTitle: string;
  entryFee: number;
  pixKey?: string;
  firstMatchDate?: Date | null;
  onSuccess?: () => void;
}

export const PaymentProofSubmission = ({
  participantId,
  poolId,
  poolTitle,
  entryFee,
  pixKey,
  firstMatchDate,
  onSuccess
}: PaymentProofSubmissionProps) => {
  const { toast } = useToast();
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyPix = async () => {
    if (!pixKey) return;
    try {
      await navigator.clipboard.writeText(pixKey);
      setCopied(true);
      toast({ title: "Chave PIX copiada!", description: "Cole no seu app de pagamento." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível copiar." });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "Arquivo muito grande",
          description: "O comprovante deve ter no máximo 5MB.",
        });
        return;
      }
      
      // Validate file type
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        toast({
          variant: "destructive",
          title: "Tipo de arquivo inválido",
          description: "Envie uma imagem (JPG, PNG) ou PDF.",
        });
        return;
      }
      
      setProofFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!proofFile) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Por favor, selecione um arquivo.",
      });
      return;
    }

    setUploading(true);

    try {
      // Upload file to storage
      const fileExt = proofFile.name.split('.').pop();
      const fileName = `${participantId}-${Date.now()}.${fileExt}`;
      const filePath = `${poolId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(filePath, proofFile, {
          cacheControl: '3600',
          upsert: true,
          contentType: proofFile.type,
        });

      if (uploadError) throw uploadError;

      // Update participant with proof URL
      const { error: updateError } = await supabase
        .from('participants')
        .update({
          payment_proof: filePath,
        })
        .eq('id', participantId);

      if (updateError) throw updateError;

      toast({
        title: "Comprovante enviado!",
        description: "Aguarde a aprovação do organizador.",
      });

      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Error uploading proof:', error);
      toast({
        variant: "destructive",
        title: "Erro ao enviar",
        description: error.message,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="border-2 border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-orange-500/10">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-orange-500" />
          Pagamento Pendente
        </CardTitle>
        <CardDescription>
          Envie o comprovante de pagamento para participar do bolão
          {firstMatchDate && (
            <span className="block mt-1 text-orange-600 dark:text-orange-400 font-medium">
              ⏰ Prazo: {format(new Date(firstMatchDate.getTime() - 2.5 * 60 * 60 * 1000), "dd/MM 'às' HH:mm", { locale: ptBR })} (2h30 antes do primeiro jogo)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-semibold">
                Valor da entrada: R$ {entryFee.toFixed(2).replace('.', ',')}
              </p>
              {pixKey && (
                <div className="space-y-2">
                  <p className="text-sm">Chave PIX para pagamento:</p>
                  <div 
                    className="bg-background rounded-lg border cursor-pointer active:bg-muted/50 transition-colors"
                    onClick={handleCopyPix}
                  >
                    <p className="font-mono text-sm p-3 break-all select-all text-center">
                      {pixKey}
                    </p>
                    <div className="border-t px-3 py-2 flex justify-center">
                      <Button
                        type="button"
                        variant={copied ? "default" : "ghost"}
                        size="sm"
                        className="h-7 px-4 text-xs w-full"
                        onClick={(e) => { e.stopPropagation(); handleCopyPix(); }}
                      >
                        {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                        {copied ? "Copiado!" : "Toque para copiar"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              <p className="text-sm">
                Faça o pagamento e envie o comprovante abaixo para ser aprovado pelo organizador.
              </p>
            </div>
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proof">Comprovante de Pagamento</Label>
            <Input
              id="proof"
              type="file"
              accept="image/jpeg,image/jpg,image/png,application/pdf"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <p className="text-xs text-muted-foreground">
              Formatos aceitos: JPG, PNG ou PDF (máximo 5MB)
            </p>
          </div>

          {proofFile && (
            <p className="text-sm text-muted-foreground">
              Arquivo selecionado: {proofFile.name}
            </p>
          )}

          <Button
            type="submit"
            disabled={!proofFile || uploading}
            className="w-full"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? "Enviando..." : "Enviar Comprovante"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
