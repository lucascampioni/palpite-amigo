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

    // Sort by points descending, then by name for consistent ordering
    rankingData.sort((a, b) => {
      if (b.total_points !== a.total_points) {
        return b.total_points - a.total_points;
      }
      return a.participant_name.localeCompare(b.participant_name);
    });
    setRanking(rankingData);
    setLoading(false);
  };

  if (loading) {
    return <p className="text-muted-foreground">Carregando ranking...</p>;
  }

  if (ranking.length === 0) {
    return <p className="text-muted-foreground">Nenhum participante no ranking ainda.</p>;
  }

  // Get actual position considering ties
  const getActualPosition = (index: number) => {
    if (index === 0) return 1;
    
    let position = 1;
    for (let i = 0; i < index; i++) {
      if (ranking[i].total_points !== ranking[i + 1]?.total_points) {
        position = i + 2;
      }
    }
    return position;
  };

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
    if (position === 1) return <Trophy className="w-6 h-6 text-yellow-500" />;
    if (position === 2) return <Medal className="w-6 h-6 text-gray-400" />;
    if (position === 3) return <Medal className="w-6 h-6 text-orange-600" />;
    return null;
  };

  // Group participants by points to handle ties
  const getTopThreeGroups = () => {
    const groups: { position: number; participants: ParticipantScore[]; podiumIndex: number }[] = [];
    let currentPosition = 1;
    let podiumIndex = 0;
    let positionsCount = 0;
    
    for (let i = 0; i < ranking.length; i++) {
      // Check if we're starting a new position
      if (i > 0 && ranking[i].total_points !== ranking[i - 1].total_points) {
        currentPosition = i + 1;
        podiumIndex++;
        positionsCount++;
      }
      
      // Stop if we've filled 3 different positions
      if (positionsCount >= 3) break;
      
      const existingGroup = groups.find(g => g.position === currentPosition);
      if (existingGroup) {
        existingGroup.participants.push(ranking[i]);
      } else {
        groups.push({
          position: currentPosition,
          participants: [ranking[i]],
          podiumIndex
        });
      }
    }
    
    return groups;
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
        {/* Podium for top 3 positions */}
        {ranking.length >= 3 && (
          <div className="mb-8 pb-6 border-b">
            <h3 className="text-lg font-semibold mb-4 text-center">Pódio</h3>
            <div className="flex items-end justify-center gap-4">
              {[1, 0, 2].map((visualIndex) => {
                const topGroups = getTopThreeGroups();
                const group = topGroups.find(g => g.podiumIndex === visualIndex);
                
                if (!group) return null;
                
                const podium = getPodiumPosition(visualIndex);
                
                return (
                  <div key={`podium-${visualIndex}`} className="flex flex-col items-center flex-1 max-w-[140px]">
                    <div className="mb-2 text-center w-full">
                      <div className="mb-1 flex justify-center">
                        {getRankIcon(group.position)}
                      </div>
                      <div className="space-y-1">
                        {group.participants.map((participant) => (
                          <div key={participant.id}>
                            <p className="font-bold text-xs truncate px-1">{participant.participant_name}</p>
                          </div>
                        ))}
                      </div>
                      <Badge variant={group.position === 1 ? "default" : "secondary"} className="mt-1">
                        {group.participants[0].total_points} pts
                      </Badge>
                    </div>
                    <div className={`w-full ${podium.height} ${podium.color} rounded-t-lg flex items-center justify-center font-bold text-2xl transition-all`}>
                      {group.position}º
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Complete ranking list */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Ranking Completo</h3>
          <div className="space-y-3">
            {ranking.map((participant, index) => {
              const actualPosition = getActualPosition(index);
              return (
                <div
                  key={participant.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-background font-bold text-lg border-2 border-muted">
                      <span>{actualPosition}º</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {actualPosition <= 3 && getRankIcon(actualPosition)}
                      <span className="font-medium">{participant.participant_name}</span>
                    </div>
                  </div>
                  <Badge variant={actualPosition === 1 ? "default" : "secondary"} className="text-sm px-3 py-1">
                    {participant.total_points} pts
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FootballRanking;