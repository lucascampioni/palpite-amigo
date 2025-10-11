import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, Check, File as FileIcon } from "lucide-react";

interface PaymentProofUploadProps {
  participantId: string;
  userId: string;
  poolId: string;
  onSuccess: () => void;
}

const PaymentProofUpload = ({ participantId, userId, poolId, onSuccess }: PaymentProofUploadProps) => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
  };

  const handleSubmitUpload = async () => {
    if (!file) {
      toast({ variant: "destructive", title: "Selecione um arquivo" });
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Arquivo muito grande. O limite é 5MB.",
      });
      return;
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Tipo de arquivo inválido. Use JPG, PNG, WEBP ou PDF.",
      });
      return;
    }

    setUploading(true);

    try {
      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Update participant with payment proof path and change status to pending
      const { error: updateError } = await supabase
        .from('participants')
        .update({ 
          payment_proof: fileName,
          status: 'pending'
        })
        .eq('id', participantId);

      if (updateError) throw updateError;

      setUploaded(true);
      toast({
        title: "Comprovante enviado!",
        description: "Sua solicitação foi enviada para aprovação do criador.",
      });
      
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (error) {
      console.error('Error uploading payment proof:', error);
      toast({
        variant: "destructive",
        title: "Erro ao enviar comprovante",
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setUploading(false);
    }
  };

  if (uploaded) {
    return (
      <Card className="border-2 border-primary">
        <CardContent className="p-6 text-center">
          <Check className="w-12 h-12 text-primary mx-auto mb-3" />
          <p className="text-lg font-semibold text-primary">
            Comprovante enviado com sucesso!
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Aguarde a aprovação do criador do bolão.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Enviar Comprovante de Pagamento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Faça o upload do comprovante de pagamento PIX para que sua participação seja aprovada.
        </p>
        <div className="space-y-2">
          <Label htmlFor="payment-proof-upload" className="cursor-pointer">
            <div className="flex items-center gap-3 p-4 border-2 border-dashed rounded-lg hover:border-primary transition-colors hover:bg-accent/50">
              <Upload className="w-6 h-6" />
              <div className="flex-1">
                <p className="font-medium">
                  {file ? 'Arquivo selecionado' : 'Clique para selecionar arquivo'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Formatos: JPG, PNG, WEBP, PDF (máx. 5MB)
                </p>
              </div>
              {file && (
                <div className="flex items-center gap-2 text-sm">
                  <FileIcon className="w-4 h-4" />
                  <span className="truncate max-w-[240px]">{file.name}</span>
                </div>
              )}
            </div>
          </Label>
          <Input
            id="payment-proof-upload"
            type="file"
            accept="image/jpeg,image/png,image/jpg,image/webp,application/pdf"
            onChange={onFileChange}
            disabled={uploading}
            className="hidden"
          />
        </div>
        <Button onClick={handleSubmitUpload} disabled={uploading || !file} className="w-full">
          {uploading ? 'Enviando...' : 'Enviar Comprovante'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default PaymentProofUpload;
