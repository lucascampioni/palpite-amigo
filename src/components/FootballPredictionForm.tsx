import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Copy, Upload } from "lucide-react";

interface FootballPredictionFormProps {
  poolId: string;
  userId: string;
  onSuccess: () => void;
  entryFee?: number | null;
  pool?: any;
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

const FootballPredictionForm = ({ poolId, userId, onSuccess, entryFee, pool }: FootballPredictionFormProps) => {
  const { toast } = useToast();
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
      setPredictions(data.map(m => ({ matchId: m.id, homeScore: '', awayScore: '' })));

      // Tentar obter e salvar escudos quando faltarem
      const needsCrests = data.filter((m: any) => (!m.home_team_crest || !m.away_team_crest) && m.external_source === 'apifb' && (m.external_id || '').startsWith('fd_'));
      if (needsCrests.length > 0) {
        try {
          const results = await Promise.all(needsCrests.map(async (m: any) => {
            const apiMatchId = String((m.external_id || '').replace(/^fd_/, ''));
            const { data: crestData, error } = await supabase.functions.invoke('get-match-crests', {
              body: { matchId: apiMatchId }
            });
            if (error || !crestData) return null;

            // Persistir no banco para próximas visualizações
            await supabase
              .from('football_matches')
              .update({
                home_team_crest: crestData.homeTeamCrest || null,
                away_team_crest: crestData.awayTeamCrest || null,
              })
              .eq('id', m.id);

            return { id: m.id, ...crestData } as any;
          }));

          const crestMap = new Map(results.filter(Boolean).map((r: any) => [r.id, r]));
          setMatches(prev => prev.map((m: any) => crestMap.has(m.id)
            ? { ...m, home_team_crest: crestMap.get(m.id).homeTeamCrest, away_team_crest: crestMap.get(m.id).awayTeamCrest }
            : m
          ));
        } catch (e) {
          console.warn('Falha ao enriquecer escudos:', e);
        }
      }
    }

    setLoading(false);
  };

  const handlePredictionChange = (matchId: string, field: 'homeScore' | 'awayScore', value: string) => {
    // Allow empty string or valid number between 0-99
    if (value === '' || (/^\d+$/.test(value) && parseInt(value) <= 99)) {
      setPredictions(prev =>
        prev.map(p => p.matchId === matchId ? { ...p, [field]: value } : p)
      );
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

    // First, create participant with approved status
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
        status: "approved", // Already approved, no payment needed
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
        title: "🎉 Você está inscrito no bolão!",
        description: "Boa sorte! Seus palpites foram salvos. Agora é só esperar a conclusão dos jogos. 🍀",
        duration: 5000,
      });
      setSubmitted(true);
      onSuccess();
    }

    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="space-y-4">
        <div className="p-6 rounded-lg bg-green-50 dark:bg-green-950 border-2 border-green-200 dark:border-green-800 text-center">
          <p className="text-lg font-semibold text-green-700 dark:text-green-300 mb-2">
            🎉 Você está inscrito no bolão!
          </p>
          <p className="text-sm text-muted-foreground">
            Boa sorte! Seus palpites foram salvos. Agora é só esperar a conclusão dos jogos. 🍀
          </p>
        </div>
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

      <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-2">
        <p className="font-medium">📊 Sistema de Pontuação:</p>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs">
          <li><strong>5 pontos</strong>: Placar exato</li>
          <li><strong>3 pontos</strong>: Resultado correto (vitória, empate ou derrota)</li>
          <li><strong>1 ponto</strong>: Diferença de gols correta</li>
        </ul>
        {(pool?.first_place_prize || pool?.second_place_prize || pool?.third_place_prize) && (
          <>
            <p className="font-medium mt-3">⚖️ Critério de Empate:</p>
            <p className="text-muted-foreground text-xs">
              Em caso de empate na pontuação, os prêmios das posições empatadas são somados e divididos igualmente entre os participantes.
            </p>
          </>
        )}
      </div>

      <Button onClick={handleSubmit} disabled={submitting} className="w-full" size="lg">
        {submitting ? "Enviando..." : "Enviar Palpites e Participar"}
      </Button>
    </div>
  );
};

export default FootballPredictionForm;