import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy } from "lucide-react";

interface PrizePixSubmissionProps {
  participantId: string;
  poolTitle: string;
  onSuccess?: () => void;
}

export const PrizePixSubmission = ({ participantId, poolTitle, onSuccess }: PrizePixSubmissionProps) => {
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pixKey || !pixKeyType) {
      toast.error("Por favor, preencha todos os campos");
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

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Enviando..." : "Enviar Chave PIX"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
