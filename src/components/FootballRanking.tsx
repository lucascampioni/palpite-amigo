import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal } from "lucide-react";

interface FootballRankingProps {
  poolId: string;
}

interface ParticipantScore {
  id: string;
  participant_name: string;
  total_points: number;
}

const FootballRanking = ({ poolId }: FootballRankingProps) => {
  const [ranking, setRanking] = useState<ParticipantScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRanking();

    // Subscribe to real-time updates on football_predictions
    const channel = supabase
      .channel('football_predictions_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'football_predictions'
        },
        () => {
          // Reload ranking when predictions are updated
          loadRanking();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [poolId]);

  const loadRanking = async () => {
    // Get all participants with their predictions
    const { data: participants, error: participantsError } = await supabase
      .from("participants")
      .select("id, participant_name")
      .eq("pool_id", poolId)
      .eq("status", "approved");

    if (participantsError || !participants) {
      setLoading(false);
      return;
    }

    // For each participant, get their total points
    const rankingData = await Promise.all(
      participants.map(async (participant) => {
        const { data: predictions } = await supabase
          .from("football_predictions")
          .select("points_earned")
          .eq("participant_id", participant.id);

        const total_points = predictions?.reduce((sum, p) => sum + (p.points_earned || 0), 0) || 0;

        return {
          id: participant.id,
          participant_name: participant.participant_name,
          total_points,
        };
      })
    );

    // Sort by points descending
    rankingData.sort((a, b) => b.total_points - a.total_points);
    setRanking(rankingData);
    setLoading(false);
  };

  if (loading) {
    return <p className="text-muted-foreground">Carregando ranking...</p>;
  }

  if (ranking.length === 0) {
    return <p className="text-muted-foreground">Nenhum participante no ranking ainda.</p>;
  }

  const getRankIcon = (position: number) => {
    if (position === 0) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (position === 1) return <Medal className="w-5 h-5 text-gray-400" />;
    if (position === 2) return <Medal className="w-5 h-5 text-orange-600" />;
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Ranking de Pontos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {ranking.map((participant, index) => (
            <div
              key={participant.id}
              className={`flex items-center justify-between p-3 rounded-lg ${
                index === 0 ? 'bg-primary/10 border-2 border-primary' : 'bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background font-bold">
                  {index === 0 || index === 1 || index === 2 ? (
                    getRankIcon(index)
                  ) : (
                    <span>{index + 1}º</span>
                  )}
                </div>
                <span className="font-medium">{participant.participant_name}</span>
              </div>
              <Badge variant={index === 0 ? "default" : "secondary"}>
                {participant.total_points} pts
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default FootballRanking;