import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Medal } from "lucide-react";

interface PrizePixSubmissionProps {
  participantId: string;
  poolTitle: string;
  prizeAmount: number;
  placement: number;
  isTied?: boolean;
  tiedWithCount?: number;
  onSuccess?: () => void;
}

export const PrizePixSubmission = ({ 
  participantId, 
  poolTitle, 
  prizeAmount, 
  placement, 
  isTied = false, 
  tiedWithCount = 0,
  onSuccess 
}: PrizePixSubmissionProps) => {
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<string>("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("participants")
        .update({
          prize_pix_key: pixKey,
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
            R$ {prizeAmount.toFixed(2)}
          </p>
          <p className="text-sm text-muted-foreground">
            Conquistado por ter ficado em <span className="font-semibold">{getPlacementText()}</span>
          </p>
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
