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
  entryFee?: number | null;
}

interface Match {
  id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  championship: string;
  home_team_crest?: string;
  away_team_crest?: string;
  external_id?: string;
  external_source?: string;
}

interface Prediction {
  matchId: string;
  homeScore: string;
  awayScore: string;
}

const FootballPredictionForm = ({ poolId, userId, onSuccess, entryFee }: FootballPredictionFormProps) => {
  const { toast } = useToast();
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pixKey, setPixKey] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    loadMatches();
    loadPixKey(); // Load PIX key immediately when component mounts
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
      setPredictions(data.map(m => ({ matchId: m.id, homeScore: '', awayScore: '' })));

      // Enrich with crests if missing using edge function
      const needsCrests = data.filter(m => (!m.home_team_crest || !m.away_team_crest) && m.external_source === 'apifb' && (m.external_id || '').startsWith('fd_'));
      if (needsCrests.length > 0) {
        try {
          const results = await Promise.all(needsCrests.map(async (m) => {
            const matchId = (m.external_id || '').replace(/^fd_/, '');
            const { data: crestData } = await supabase.functions.invoke('get-match-crests', {
              body: { matchId }
            });
            return { id: m.id, ...crestData } as any;
          }));
          const crestMap = new Map(results.map((r: any) => [r.id, r]));
          setMatches(prev => prev.map(m => crestMap.has(m.id)
            ? { ...m, home_team_crest: crestMap.get(m.id).homeTeamCrest, away_team_crest: crestMap.get(m.id).awayTeamCrest }
            : m
          ));
        } catch {}
      }
    }

    setLoading(false);
  };

  const loadPixKey = async () => {
    // Load PIX key from payment info table
    const { data: paymentData } = await supabase
      .from("pool_payment_info")
      .select("pix_key")
      .eq("pool_id", poolId)
      .maybeSingle();
    setPixKey(paymentData?.pix_key ?? null);
  };

  const handlePredictionChange = (matchId: string, field: 'homeScore' | 'awayScore', value: string) => {
    // Allow empty string or valid number between 0-99
    if (value === '' || (/^\d+$/.test(value) && parseInt(value) <= 99)) {
      setPredictions(prev =>
        prev.map(p => p.matchId === matchId ? { ...p, [field]: value } : p)
      );
    }
  };

  const handleCopyPixKey = () => {
    if (pixKey) {
      navigator.clipboard.writeText(pixKey);
      toast({ title: "Chave PIX copiada!" });
    }
  };

  const handleSubmit = async () => {
    // Validate all predictions are filled
    const hasEmptyPredictions = predictions.some(p => p.homeScore === '' || p.awayScore === '');
    if (hasEmptyPredictions) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Por favor, preencha todos os placares.",
      });
      return;
    }

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
      home_score_prediction: parseInt(p.homeScore),
      away_score_prediction: parseInt(p.awayScore),
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
      setSubmitted(true);
      await loadPixKey(); // Load PIX key after successful submission
      onSuccess();
    }

    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
          <p className="text-sm font-medium text-primary mb-2">
            ✓ Palpites enviados com sucesso!
          </p>
          <p className="text-xs text-muted-foreground">
            {pixKey ? "Use a chave PIX abaixo para fazer o pagamento e aguarde a aprovação." : "Aguarde a aprovação do criador do bolão."}
          </p>
        </div>

        {pixKey && (
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium mb-1">💰 Chave PIX para pagamento</p>
                <p className="text-sm font-mono text-muted-foreground">{pixKey}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleCopyPixKey}>
                <Copy className="w-4 h-4 mr-2" />
                Copiar
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return <p className="text-muted-foreground">Carregando jogos...</p>;
  }

  if (matches.length === 0) {
    return <p className="text-muted-foreground">Nenhum jogo encontrado.</p>;
  }

  return (
    <div className="space-y-4">
      {entryFee && (
        <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
          <p className="text-sm font-medium">💵 Valor de Entrada</p>
          <p className="text-lg font-bold">R$ {entryFee.toFixed(2)}</p>
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
                  <div className="flex items-center gap-2">
                    {match.home_team_crest && (
                      <img 
                        src={match.home_team_crest} 
                        alt={match.home_team}
                        className="w-6 h-6 object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    <Label>{match.home_team}</Label>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max="99"
                    placeholder=""
                    value={prediction?.homeScore || ''}
                    onChange={(e) => handlePredictionChange(match.id, 'homeScore', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {match.away_team_crest && (
                      <img 
                        src={match.away_team_crest} 
                        alt={match.away_team}
                        className="w-6 h-6 object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    <Label>{match.away_team}</Label>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max="99"
                    placeholder=""
                    value={prediction?.awayScore || ''}
                    onChange={(e) => handlePredictionChange(match.id, 'awayScore', e.target.value)}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <p className="text-sm text-muted-foreground text-center">
        Envie todos os palpites para ter acesso as informações de pagamento.
      </p>

      <Button onClick={handleSubmit} disabled={submitting} className="w-full" size="lg">
        {submitting ? "Enviando..." : "Enviar Todos os Palpites"}
      </Button>
    </div>
  );
};

export default FootballPredictionForm;