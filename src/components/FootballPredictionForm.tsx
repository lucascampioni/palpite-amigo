import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Copy } from "lucide-react";

interface FootballPredictionFormProps {
  poolId: string;
  userId: string;
  onSuccess: () => void;
}

interface Match {
  id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  championship: string;
}

interface Prediction {
  matchId: string;
  homeScore: number;
  awayScore: number;
}

const FootballPredictionForm = ({ poolId, userId, onSuccess }: FootballPredictionFormProps) => {
  const { toast } = useToast();
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pixKey, setPixKey] = useState<string | null>(null);

  useEffect(() => {
    loadMatches();
  }, [poolId]);

  const loadMatches = async () => {
    const { data, error } = await supabase
      .from("football_matches")
      .select("*")
      .eq("pool_id", poolId)
      .order("match_date", { ascending: true });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao carregar jogos.",
      });
    } else if (data) {
      setMatches(data);
      setPredictions(data.map(m => ({ matchId: m.id, homeScore: 0, awayScore: 0 })));
    }

    // Load PIX key for this pool
    const { data: poolData } = await supabase
      .from("pools")
      .select("pix_key")
      .eq("id", poolId)
      .single();
    setPixKey(poolData?.pix_key ?? null);

    setLoading(false);
  };

  const handlePredictionChange = (matchId: string, field: 'homeScore' | 'awayScore', value: string) => {
    const numValue = parseInt(value) || 0;
    setPredictions(prev =>
      prev.map(p => p.matchId === matchId ? { ...p, [field]: numValue } : p)
    );
  };

  const handleCopyPixKey = () => {
    if (pixKey) {
      navigator.clipboard.writeText(pixKey);
      toast({ title: "Chave PIX copiada!" });
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);

    // First, create participant
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();

    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .insert({
        pool_id: poolId,
        user_id: userId,
        participant_name: profile?.full_name || "Usuário",
        guess_value: "Palpites de futebol",
        status: "pending",
      })
      .select()
      .single();

    if (participantError || !participant) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: participantError?.message || "Erro ao criar participante.",
      });
      setSubmitting(false);
      return;
    }

    // Then, create predictions
    const predictionsData = predictions.map(p => ({
      participant_id: participant.id,
      match_id: p.matchId,
      home_score_prediction: p.homeScore,
      away_score_prediction: p.awayScore,
    }));

    const { error: predictionsError } = await supabase
      .from("football_predictions")
      .insert(predictionsData);

    if (predictionsError) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: predictionsError.message,
      });
      // Remove participant if predictions failed
      await supabase.from("participants").delete().eq("id", participant.id);
    } else {
      toast({
        title: "Palpites enviados!",
        description: "Aguarde a aprovação do criador do bolão.",
      });
      onSuccess();
    }

    setSubmitting(false);
  };

  if (loading) {
    return <p className="text-muted-foreground">Carregando jogos...</p>;
  }

  if (matches.length === 0) {
    return <p className="text-muted-foreground">Nenhum jogo encontrado.</p>;
  }

  return (
    <div className="space-y-4">
      {pixKey && (
        <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium mb-1">💰 Chave PIX para pagamento</p>
            <p className="text-sm font-mono text-muted-foreground">{pixKey}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleCopyPixKey}>
            <Copy className="w-4 h-4 mr-2" />
            Copiar
          </Button>
        </div>
      )}

      <h3 className="font-semibold text-lg">Faça seus palpites</h3>
      
      {matches.map((match, index) => {
        const prediction = predictions.find(p => p.matchId === match.id);
        return (
          <Card key={match.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {match.home_team} vs {match.away_team}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {format(new Date(match.match_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{match.home_team}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={prediction?.homeScore || 0}
                    onChange={(e) => handlePredictionChange(match.id, 'homeScore', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{match.away_team}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={prediction?.awayScore || 0}
                    onChange={(e) => handlePredictionChange(match.id, 'awayScore', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Button onClick={handleSubmit} disabled={submitting} className="w-full" size="lg">
        {submitting ? "Enviando..." : "Enviar Todos os Palpites"}
      </Button>
    </div>
  );
};

export default FootballPredictionForm;