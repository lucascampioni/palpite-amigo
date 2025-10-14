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

  const getPodiumPosition = (position: number) => {
    const podiumHeights = ['h-32', 'h-24', 'h-20'];
    const podiumColors = [
      'bg-gradient-to-t from-yellow-500/20 to-yellow-400/10 border-2 border-yellow-500',
      'bg-gradient-to-t from-gray-400/20 to-gray-300/10 border-2 border-gray-400',
      'bg-gradient-to-t from-orange-600/20 to-orange-500/10 border-2 border-orange-600'
    ];
    return { height: podiumHeights[position], color: podiumColors[position] };
  };

  const getRankIcon = (position: number) => {
    if (position === 0) return <Trophy className="w-6 h-6 text-yellow-500" />;
    if (position === 1) return <Medal className="w-6 h-6 text-gray-400" />;
    if (position === 2) return <Medal className="w-6 h-6 text-orange-600" />;
    return null;
  };

  const podiumOrder = [1, 0, 2]; // 2nd, 1st, 3rd for visual effect

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Ranking de Pontos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Podium or simple list when <3 */}
        {ranking.length >= 3 ? (
          <div className="mb-8">
            <div className="flex items-end justify-center gap-4 mb-4">
              {podiumOrder.map((index) => {
                const participant = ranking[index];
                const podium = getPodiumPosition(index);
                return (
                  <div key={participant.id} className="flex flex-col items-center flex-1 max-w-[120px]">
                    <div className="mb-2 text-center">
                      <div className="mb-1 flex justify-center">
                        {getRankIcon(index)}
                      </div>
                      <p className="font-bold text-sm truncate px-1">{participant.participant_name}</p>
                      <Badge variant={index === 0 ? "default" : "secondary"} className="mt-1">
                        {participant.total_points} pts
                      </Badge>
                    </div>
                    <div className={`w-full ${podium.height} ${podium.color} rounded-t-lg flex items-center justify-center font-bold text-2xl transition-all`}>
                      {index + 1}º
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {ranking.map((participant, index) => (
              <div
                key={participant.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background font-bold">
                    <span>{index + 1}º</span>
                  </div>
                  <span className="font-medium flex items-center gap-2">
                    {getRankIcon(index)} {participant.participant_name}
                  </span>
                </div>
                <Badge variant="secondary">
                  {participant.total_points} pts
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Rest of ranking when >=3 */}
        {ranking.length >= 3 && (
          <div className="space-y-3">
            {ranking.slice(3).map((participant, idx) => {
              const index = idx + 3;
              return (
                <div
                  key={participant.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background font-bold">
                      <span>{index + 1}º</span>
                    </div>
                    <span className="font-medium">{participant.participant_name}</span>
                  </div>
                  <Badge variant="secondary">
                    {participant.total_points} pts
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FootballRanking;