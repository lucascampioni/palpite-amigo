import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Medal } from "lucide-react";
import { z } from "zod";

interface PrizePixSubmissionProps {
  participantId: string;
  poolTitle: string;
  prizeAmount: number;
  placement: number;
  isTied?: boolean;
  tiedWithCount?: number;
  totalPrizes?: { first: number; second: number; third: number };
  onSuccess?: () => void;
}

export const PrizePixSubmission = ({ 
  participantId, 
  poolTitle, 
  prizeAmount, 
  placement, 
  isTied = false, 
  tiedWithCount = 0,
  totalPrizes,
  onSuccess 
}: PrizePixSubmissionProps) => {
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<string>("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-fill from profile
  useEffect(() => {
    const loadProfilePix = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("pix_key, pix_key_type")
        .eq("id", user.id)
        .single();
      if (profile?.pix_key && profile?.pix_key_type) {
        setPixKey(profile.pix_key);
        setPixKeyType(profile.pix_key_type);
      }
    };
    loadProfilePix();
  }, []);

  const validatePixKey = (key: string, type: string): boolean => {
    const pixSchemas = {
      cpf: z.string().regex(/^\d{11}$/, "CPF deve conter 11 dígitos"),
      email: z.string().email("Email inválido").max(255, "Email muito longo"),
      phone: z.string().regex(/^\d{10,11}$/, "Telefone deve conter 10 ou 11 dígitos"),
      random: z.string().uuid("Chave aleatória inválida (deve ser UUID)"),
    };

    try {
      const schema = pixSchemas[type as keyof typeof pixSchemas];
      if (!schema) return false;
      schema.parse(key.trim());
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pixKey || !pixKeyType) {
      toast.error("Por favor, preencha todos os campos");
      return;
    }

    if (!termsAccepted) {
      toast.error("Você precisa aceitar os termos para continuar");
      return;
    }

    // Validate PIX key format
    if (!validatePixKey(pixKey, pixKeyType)) {
      const errorMessages = {
        cpf: "CPF deve conter exatamente 11 dígitos numéricos",
        email: "Digite um email válido",
        phone: "Telefone deve conter 10 ou 11 dígitos",
        random: "Chave aleatória deve ser um UUID válido",
      };
      toast.error(errorMessages[pixKeyType as keyof typeof errorMessages] || "Chave PIX inválida");
      return;
    }

    // Sanitize and limit length
    const sanitizedPixKey = pixKey.trim().slice(0, 255);

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("participants")
        .update({
          prize_pix_key: sanitizedPixKey,
          prize_pix_key_type: pixKeyType,
          prize_status: "pix_submitted",
          prize_submitted_at: new Date().toISOString(),
        })
        .eq("id", participantId);

      if (error) throw error;

      toast.success("Chave PIX enviada com sucesso!");
      onSuccess?.();
    } catch (error) {
      console.error("Error submitting PIX key:", error);
      toast.error("Erro ao enviar chave PIX. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPlacementText = () => {
    const placementName = placement === 1 ? "1º lugar" : placement === 2 ? "2º lugar" : "3º lugar";
    
    if (isTied && tiedWithCount > 0) {
      return `${placementName} (empatado com ${tiedWithCount} ${tiedWithCount === 1 ? 'pessoa' : 'pessoas'})`;
    }
    
    return placementName;
  };

  const getDetailedExplanation = () => {
    if (!isTied || !totalPrizes) return null;

    const totalTied = tiedWithCount + 1; // +1 to include the current user
    const placementName = placement === 1 ? "1º" : placement === 2 ? "2º" : "3º";
    
    // Calculate which prizes were summed
    const prizes = [totalPrizes.first, totalPrizes.second, totalPrizes.third];
    let involvedPositions: string[] = [];
    let summedPrizes = 0;
    
    for (let i = placement - 1; i < placement - 1 + totalTied && i < 3; i++) {
      if (prizes[i] > 0) {
        involvedPositions.push(i === 0 ? "1º" : i === 1 ? "2º" : "3º");
        summedPrizes += prizes[i];
      }
    }

    if (involvedPositions.length === 0) return null;

    return (
      <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/50 rounded-md border border-blue-200 dark:border-blue-800">
        <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">
          💡 Como seu prêmio foi calculado:
        </p>
        <p className="text-xs text-blue-800 dark:text-blue-200">
          {totalTied} {totalTied === 1 ? 'pessoa empatou' : 'pessoas empataram'} em {placementName} lugar. 
          Os prêmios de {involvedPositions.join(' e ')} lugar ({involvedPositions.map((pos, idx) => 
            `${pos}: R$ ${prizes[placement - 1 + idx].toFixed(2).replace('.', ',')}`
          ).join(', ')}) foram somados (R$ {summedPrizes.toFixed(2).replace('.', ',')}) e divididos igualmente entre os {totalTied} vencedores, 
          resultando em R$ {prizeAmount.toFixed(2).replace('.', ',')} para cada um.
        </p>
      </div>
    );
  };

  return (
    <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-600" />
          🎉 Parabéns! Você Ganhou!
        </CardTitle>
        <CardDescription>
          Informe sua chave PIX para receber o prêmio do bolão "{poolTitle}"
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 p-4 bg-white dark:bg-gray-900 rounded-lg border-2 border-yellow-300 dark:border-yellow-700">
          <div className="flex items-center gap-3 mb-2">
            <Medal className="w-6 h-6 text-yellow-600" />
            <h3 className="font-bold text-lg">Seu Prêmio</h3>
          </div>
          <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-500 mb-2">
            R$ {prizeAmount.toFixed(2).replace('.', ',')}
          </p>
          <p className="text-sm text-muted-foreground">
            Conquistado por ter ficado em <span className="font-semibold">{getPlacementText()}</span>
          </p>
          {getDetailedExplanation()}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pixKeyType">Tipo de Chave PIX</Label>
            <Select value={pixKeyType} onValueChange={setPixKeyType}>
              <SelectTrigger id="pixKeyType">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="phone">Telefone</SelectItem>
                <SelectItem value="random">Chave Aleatória</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pixKey">Chave PIX</Label>
            <Input
              id="pixKey"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="Digite sua chave PIX"
              required
            />
          </div>

          <div className="space-y-3 p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-start gap-3">
              <Checkbox 
                id="terms" 
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
              />
              <div className="flex-1">
                <Label 
                  htmlFor="terms" 
                  className="text-sm cursor-pointer leading-relaxed"
                >
                  Declaro que a chave PIX informada está correta e autorizo o uso desta informação exclusivamente para receber o pagamento do prêmio. Estou ciente de que a chave será utilizada apenas para este fim e que o organizador do bolão não se responsabiliza por erros na informação fornecida.
                </Label>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={isSubmitting || !termsAccepted} className="w-full">
            {isSubmitting ? "Enviando..." : "Enviar Chave PIX"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
