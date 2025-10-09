import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FootballParticipantsPredictionsProps {
  poolId: string;
  participants: any[];
}

interface Match {
  id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  home_score: number | null;
  away_score: number | null;
}

interface Prediction {
  participant_id: string;
  match_id: string;
  home_score_prediction: number;
  away_score_prediction: number;
  points_earned: number;
}

const FootballParticipantsPredictions = ({ poolId, participants }: FootballParticipantsPredictionsProps) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [poolId]);

  const loadData = async () => {
    // Load matches
    const { data: matchesData } = await supabase
      .from("football_matches")
      .select("*")
      .eq("pool_id", poolId)
      .order("match_date", { ascending: true });

    setMatches(matchesData || []);

    // Load all predictions
    const participantIds = participants.map(p => p.id);
    if (participantIds.length > 0) {
      const { data: predictionsData } = await supabase
        .from("football_predictions")
        .select("*")
        .in("participant_id", participantIds);

      setPredictions(predictionsData || []);
    }

    setLoading(false);
  };

  const getPrediction = (participantId: string, matchId: string) => {
    return predictions.find(p => p.participant_id === participantId && p.match_id === matchId);
  };

  if (loading) {
    return <p className="text-muted-foreground">Carregando palpites...</p>;
  }

  if (participants.length === 0) {
    return <p className="text-muted-foreground">Nenhum participante aprovado.</p>;
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Palpites dos Participantes</h3>
      
      {participants.map((participant) => (
        <Card key={participant.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{participant.participant_name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {matches.map((match) => {
              const prediction = getPrediction(participant.id, match.id);
              return (
                <div key={match.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {match.home_team} vs {match.away_team}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(match.match_date), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="font-mono">
                      {prediction ? `${prediction.home_score_prediction} x ${prediction.away_score_prediction}` : "—"}
                    </Badge>
                    {match.home_score !== null && match.away_score !== null && prediction && (
                      <Badge 
                        variant={prediction.points_earned > 0 ? "default" : "outline"}
                        className="font-semibold"
                      >
                        {prediction.points_earned} pts
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default FootballParticipantsPredictions;
