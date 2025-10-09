import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trophy } from "lucide-react";

interface DeclareResultDialogProps {
  pool: any;
  participants: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const DeclareResultDialog = ({
  pool,
  participants,
  open,
  onOpenChange,
  onSuccess,
}: DeclareResultDialogProps) => {
  const { toast } = useToast();
  const [resultValue, setResultValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const calculateWinner = (result: string) => {
    const approvedParticipants = participants.filter(p => p.status === "approved");
    
    if (approvedParticipants.length === 0) return null;

    // Para unidades numéricas, encontra quem chegou mais perto
    if (["kg", "cm", "reais", "units"].includes(pool.measurement_unit)) {
      const resultNum = parseFloat(result);
      if (isNaN(resultNum)) return null;

      let closest = approvedParticipants[0];
      let minDiff = Math.abs(parseFloat(closest.guess_value) - resultNum);

      approvedParticipants.forEach((p) => {
        const guessNum = parseFloat(p.guess_value);
        if (isNaN(guessNum)) return;
        
        const diff = Math.abs(guessNum - resultNum);
        if (diff < minDiff) {
          minDiff = diff;
          closest = p;
        }
      });

      return closest.user_id;
    }

    // Para score/placar, encontra quem acertou exato
    if (pool.measurement_unit === "score") {
      const winner = approvedParticipants.find(
        p => p.guess_value.toLowerCase() === result.toLowerCase()
      );
      return winner?.user_id || null;
    }

    return null;
  };

  const handleSubmit = async () => {
    if (!resultValue.trim()) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Por favor, insira o resultado.",
      });
      return;
    }

    setSubmitting(true);

    const winnerId = calculateWinner(resultValue);

    const { error } = await supabase
      .from("pools")
      .update({
        result_value: resultValue,
        winner_id: winnerId,
        status: "finished",
      })
      .eq("id", pool.id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } else {
      toast({
        title: "Resultado declarado! 🎉",
        description: winnerId 
          ? "O vencedor foi calculado automaticamente!" 
          : "Nenhum vencedor foi encontrado.",
      });
      onOpenChange(false);
      onSuccess();
    }

    setSubmitting(false);
  };

  const getUnitLabel = () => {
    switch (pool.measurement_unit) {
      case "kg":
        return "kg";
      case "cm":
        return "cm";
      case "reais":
        return "R$";
      case "score":
        return "(ex: 2x1)";
      default:
        return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-secondary" />
            Declarar Resultado
          </DialogTitle>
          <DialogDescription>
            Insira o resultado final. O vencedor será calculado automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="result">Resultado Final {getUnitLabel()}</Label>
            <Input
              id="result"
              value={resultValue}
              onChange={(e) => setResultValue(e.target.value)}
              placeholder={`Digite o resultado ${getUnitLabel()}`}
            />
          </div>

          <div className="p-3 rounded-lg bg-muted/50 text-sm">
            <p className="font-medium mb-1">ℹ️ Como funciona:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              {["kg", "cm", "reais", "units"].includes(pool.measurement_unit) && (
                <li>O vencedor será quem chegou mais perto do resultado</li>
              )}
              {pool.measurement_unit === "score" && (
                <li>O vencedor será quem acertou o placar exato</li>
              )}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Declarando..." : "Declarar Resultado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeclareResultDialog;
