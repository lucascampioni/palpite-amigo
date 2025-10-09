import { useState, useEffect } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DeclareResultDialogProps {
  pool: any;
  participants: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface MatchResult {
  matchId: string;
  homeScore: number;
  awayScore: number;
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
  const [matches, setMatches] = useState<any[]>([]);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);

  useEffect(() => {
    if (open) {
      loadMatches();
    }
  }, [open, pool]);

  const loadMatches = async () => {
    const { data, error } = await supabase
      .from("football_matches")
      .select("*")
      .eq("pool_id", pool.id)
      .order("match_date", { ascending: true });

    if (!error && data) {
      setMatches(data);
      setMatchResults(data.map(m => ({ matchId: m.id, homeScore: 0, awayScore: 0 })));
    }
  };

  const handleMatchResultChange = (matchId: string, field: 'homeScore' | 'awayScore', value: string) => {
    const numValue = parseInt(value) || 0;
    setMatchResults(prev =>
      prev.map(r => r.matchId === matchId ? { ...r, [field]: numValue } : r)
    );
  };

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
    if (matches.length > 0) {
      return handleFootballSubmit();
    }

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

  const handleFootballSubmit = async () => {
    setSubmitting(true);

    // Update match results and calculate points
    for (const result of matchResults) {
      const match = matches.find(m => m.id === result.matchId);
      if (!match) continue;

      // Update match with results
      const { error: matchError } = await supabase
        .from("football_matches")
        .update({
          home_score: result.homeScore,
          away_score: result.awayScore,
          status: "finished",
        })
        .eq("id", result.matchId);

      if (matchError) {
        console.error("Error updating match:", matchError);
        continue;
      }

      // Get all predictions for this match
      const { data: predictions, error: predictionsError } = await supabase
        .from("football_predictions")
        .select("id, home_score_prediction, away_score_prediction")
        .eq("match_id", result.matchId);

      if (predictionsError || !predictions) continue;

      // Calculate points for each prediction
      for (const prediction of predictions) {
        const { data: pointsData, error: pointsError } = await supabase
          .rpc("calculate_football_points", {
            predicted_home: prediction.home_score_prediction,
            predicted_away: prediction.away_score_prediction,
            actual_home: result.homeScore,
            actual_away: result.awayScore,
          });

        if (!pointsError && pointsData !== null) {
          await supabase
            .from("football_predictions")
            .update({ points_earned: pointsData })
            .eq("id", prediction.id);
        }
      }
    }

    // Mark pool as finished
    const { error: poolError } = await supabase
      .from("pools")
      .update({
        status: "finished",
        result_value: "Resultados declarados",
      })
      .eq("id", pool.id);

    if (poolError) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: poolError.message,
      });
    } else {
      toast({
        title: "Resultados declarados! 🎉",
        description: "Os pontos foram calculados automaticamente.",
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

  if (matches.length > 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-secondary" />
              Declarar Resultados dos Jogos
            </DialogTitle>
            <DialogDescription>
              Insira o resultado de cada jogo. Os pontos serão calculados automaticamente.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[50vh] pr-4">
            <div className="space-y-4 py-4">
              {matches.map((match) => {
                const result = matchResults.find(r => r.matchId === match.id);
                return (
                  <Card key={match.id}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        {match.home_team} vs {match.away_team}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{match.home_team}</Label>
                          <Input
                            type="number"
                            min="0"
                            value={result?.homeScore || 0}
                            onChange={(e) => handleMatchResultChange(match.id, 'homeScore', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{match.away_team}</Label>
                          <Input
                            type="number"
                            min="0"
                            value={result?.awayScore || 0}
                            onChange={(e) => handleMatchResultChange(match.id, 'awayScore', e.target.value)}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium mb-1">📊 Sistema de Pontuação:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li><strong>5 pontos</strong>: Placar exato</li>
                  <li><strong>3 pontos</strong>: Resultado correto (vitória, empate ou derrota)</li>
                  <li><strong>1 ponto</strong>: Diferença de gols correta</li>
                </ul>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Declarando..." : "Declarar Resultados"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

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
