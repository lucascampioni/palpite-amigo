import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, CheckCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";

interface PaymentProofUploadProps {
  participantId: string;
  userId: string;
  poolId: string;
  onSuccess: () => void;
  hasPixKey?: boolean;
}

const PaymentProofUpload = ({ participantId, userId, poolId, onSuccess, hasPixKey = false }: PaymentProofUploadProps) => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<string>("");
  const [pixConsent, setPixConsent] = useState(false);
  const [isFreePool, setIsFreePool] = useState(false);

  useEffect(() => {
    // Check if pool is free (no entry fee)
    const checkPoolFee = async () => {
      const { data } = await supabase
        .from("pools")
        .select("entry_fee")
        .eq("id", poolId)
        .single();
      
      setIsFreePool(!data?.entry_fee || data.entry_fee === 0);
    };
    checkPoolFee();
  }, [poolId]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file size (5MB)
      if (selectedFile.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "Arquivo muito grande",
          description: "O tamanho máximo é 5MB.",
        });
        return;
      }

      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];
      if (!validTypes.includes(selectedFile.type)) {
        toast({
          variant: "destructive",
          title: "Tipo de arquivo inválido",
          description: "Use apenas JPG, PNG, WEBP ou PDF.",
        });
        return;
      }

      setFile(selectedFile);
    }
  };

  const handleSubmitUpload = async () => {
    // For free pools, only PIX key is required
    if (isFreePool) {
      if (!pixKey.trim() || !pixKeyType || !pixConsent) {
        toast({
          title: "Campos obrigatórios",
          description: "Por favor, preencha sua chave PIX e aceite os termos.",
          variant: "destructive",
        });
        return;
      }
    } else {
      // For paid pools, both file and PIX key are required
      if (!file || !pixKey.trim() || !pixKeyType || !pixConsent) {
        toast({
          title: "Campos obrigatórios",
          description: "Por favor, preencha todos os campos e aceite os termos.",
          variant: "destructive",
        });
        return;
      }
    }

    setUploading(true);

    try {
      let publicUrl = null;

      // Upload file only if pool is not free and file is provided
      if (!isFreePool && file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${poolId}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("payment-proofs")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl: url } } = supabase.storage
          .from("payment-proofs")
          .getPublicUrl(fileName);
        
        publicUrl = url;
      }

      // Update participant with payment proof URL and PIX key
      const updateData: any = {
        participant_pix_key: pixKey.trim(),
        pix_key_type: pixKeyType,
        pix_consent: pixConsent,
        status: 'pending',
      };

      // Only add payment_proof if it exists (paid pools)
      if (publicUrl) {
        updateData.payment_proof = publicUrl;
      }

      const { error: updateError } = await supabase
        .from("participants")
        .update(updateData)
        .eq("id", participantId);

      if (updateError) throw updateError;

      setUploaded(true);
      toast({
        title: "Enviado com sucesso!",
        description: "Aguarde a aprovação do criador do bolão.",
      });

      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (error) {
      console.error("Error uploading payment proof:", error);
      toast({
        variant: "destructive",
        title: "Erro ao enviar",
        description: "Tente novamente mais tarde.",
      });
    } finally {
      setUploading(false);
    }
  };

  if (uploaded) {
    return (
      <Card className="border-success">
        <CardContent className="pt-6 text-center space-y-3">
          <CheckCircle className="w-12 h-12 text-success mx-auto" />
          <div>
            <p className="font-semibold text-lg">Comprovante enviado!</p>
            <p className="text-sm text-muted-foreground">
              Aguarde a aprovação do criador do bolão
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          {isFreePool ? "Informar Chave PIX" : "Enviar Comprovante de Pagamento"}
        </CardTitle>
        <CardDescription className="space-y-1">
          <p className="font-semibold text-orange-600 dark:text-orange-400">
            ⚠️ Seus palpites ainda não foram validados!
          </p>
          <p>
            {isFreePool 
              ? "Informe sua chave PIX para confirmar sua participação e validar seus palpites."
              : "Envie o comprovante de pagamento e sua chave PIX para confirmar sua participação e validar seus palpites."}
          </p>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pixKeyType">Tipo de Chave PIX *</Label>
          <Select value={pixKeyType} onValueChange={setPixKeyType} disabled={uploading}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o tipo de chave" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cpf">CPF</SelectItem>
              <SelectItem value="cnpj">CNPJ</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
              <SelectItem value="phone">Telefone</SelectItem>
              <SelectItem value="random">Chave Aleatória</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pixKey">Sua Chave PIX *</Label>
          <Input
            id="pixKey"
            type="text"
            placeholder="Digite sua chave PIX"
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            disabled={uploading}
          />
          <p className="text-sm text-muted-foreground">
          Esta chave será usada para receber o prêmio caso você ganhe
        </p>
        </div>

        {!isFreePool && (
          <div className="space-y-2">
            <Label htmlFor="file" className="cursor-pointer">
              <div className="flex items-center gap-3 p-4 border-2 border-dashed rounded-lg hover:border-primary transition-colors">
                <Upload className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {file ? file.name : "Selecionar comprovante"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG, WEBP ou PDF (máx. 5MB)
                  </p>
                </div>
              </div>
            </Label>
            <Input
              id="file"
              type="file"
              accept="image/jpeg,image/png,image/jpg,image/webp,application/pdf"
              onChange={onFileChange}
              disabled={uploading}
              className="hidden"
            />
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-start space-x-2 p-4 border rounded-lg bg-muted/50">
            <Checkbox 
              id="consent" 
              checked={pixConsent}
              onCheckedChange={(checked) => setPixConsent(checked === true)}
              disabled={uploading}
            />
            <div className="space-y-1">
              <label
                htmlFor="consent"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Autorizo o armazenamento da minha chave PIX
              </label>
              <p className="text-sm text-muted-foreground">
                Concordo que minha chave PIX seja armazenada de forma segura para fins de pagamento do bolão.{" "}
                <Link to="/privacy" className="text-primary hover:underline">
                  Ver Política de Privacidade
                </Link>
              </p>
            </div>
          </div>

          <Button
            onClick={handleSubmitUpload}
            disabled={(!isFreePool && !file) || !pixKey.trim() || !pixKeyType || !pixConsent || uploading}
            className="w-full"
          >
            {uploading ? "Enviando..." : (isFreePool ? "Enviar Chave PIX" : "Enviar Comprovante")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PaymentProofUpload;
