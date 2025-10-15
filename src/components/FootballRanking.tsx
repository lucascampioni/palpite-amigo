import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface FootballRankingProps {
  poolId: string;
  pool?: {
    first_place_prize?: number;
    second_place_prize?: number;
    third_place_prize?: number;
  };
}

interface ParticipantScore {
  id: string;
  participant_name: string;
  total_points: number;
  prize_amount?: number;
  prize_status?: string | null;
}

interface MatchPrediction {
  match_id: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  home_score_prediction: number;
  away_score_prediction: number;
  points_earned: number;
}

const FootballRanking = ({ poolId, pool }: FootballRankingProps) => {
  const [ranking, setRanking] = useState<ParticipantScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedParticipants, setExpandedParticipants] = useState<Set<string>>(new Set());
  const [participantPredictions, setParticipantPredictions] = useState<Record<string, MatchPrediction[]>>({});

  useEffect(() => {
    loadRanking();

    // Subscribe to real-time updates on football_predictions and football_matches
    const channel = supabase
      .channel('football_ranking_changes')
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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'football_matches'
        },
        () => {
          // Reload ranking when match results are updated (real-time during games)
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
      .select("id, participant_name, prize_status")
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
          prize_status: participant.prize_status,
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

    // Calculate prize distribution considering ties
    const rankingWithPrizes = calculatePrizeDistribution(rankingData, pool);
    
    // Auto-mark winners as awaiting_pix if they haven't submitted yet
    if (pool?.first_place_prize || pool?.second_place_prize || pool?.third_place_prize) {
      const winnersToUpdate = rankingWithPrizes.filter(
        p => p.prize_amount && p.prize_amount > 0 && !p.prize_status
      );
      
      if (winnersToUpdate.length > 0) {
        await Promise.all(
          winnersToUpdate.map(winner =>
            supabase
              .from("participants")
              .update({ prize_status: "awaiting_pix" })
              .eq("id", winner.id)
          )
        );
        
        // Reload to get updated statuses
        const { data: updatedParticipants } = await supabase
          .from("participants")
          .select("id, prize_status")
          .eq("pool_id", poolId)
          .in("id", winnersToUpdate.map(w => w.id));
        
        // Update prize_status in ranking
        updatedParticipants?.forEach(up => {
          const participant = rankingWithPrizes.find(p => p.id === up.id);
          if (participant) {
            participant.prize_status = up.prize_status;
          }
        });
      }
    }
    
    setRanking(rankingWithPrizes);
    setLoading(false);
  };

  const getPrizeStatusBadge = (status: string | null | undefined, prizeAmount?: number) => {
    if (!prizeAmount || prizeAmount === 0) return null;
    
    if (!status || status === 'awaiting_pix') {
      return (
        <Badge variant="outline" className="text-[0.625rem] sm:text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700 px-1.5 sm:px-2 py-0 sm:py-0.5 whitespace-nowrap">
          Aguardando chave Pix
        </Badge>
      );
    }
    
    if (status === 'pix_submitted') {
      return (
        <Badge variant="outline" className="text-[0.625rem] sm:text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700 px-1.5 sm:px-2 py-0 sm:py-0.5 whitespace-nowrap">
          Aguardando pagamento
        </Badge>
      );
    }
    
    if (status === 'prize_sent') {
      return (
        <Badge variant="outline" className="text-[0.625rem] sm:text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700 px-1.5 sm:px-2 py-0 sm:py-0.5 whitespace-nowrap">
          Pago
        </Badge>
      );
    }
    
    return null;
  };

  const calculatePrizeDistribution = (
    ranking: ParticipantScore[],
    poolData?: { first_place_prize?: number; second_place_prize?: number; third_place_prize?: number }
  ): ParticipantScore[] => {
    if (!poolData || !ranking.length) return ranking;

    const prizes = [
      poolData.first_place_prize || 0,
      poolData.second_place_prize || 0,
      poolData.third_place_prize || 0,
    ];

    const hasPrizes = prizes.some(p => p > 0);
    if (!hasPrizes) return ranking;

    const result = [...ranking];
    let currentPosition = 0;

    while (currentPosition < result.length && currentPosition < 3) {
      const currentScore = result[currentPosition].total_points;
      
      // Find all participants with the same score (tied)
      const tiedParticipants = result.filter(p => p.total_points === currentScore);
      const tiedCount = tiedParticipants.length;

      // Calculate sum of prizes for tied positions
      let prizeSum = 0;
      for (let i = currentPosition; i < Math.min(currentPosition + tiedCount, 3); i++) {
        prizeSum += prizes[i];
      }

      // Distribute prize equally among tied participants
      const prizePerParticipant = tiedCount > 0 ? prizeSum / tiedCount : 0;

      // Assign prize to all tied participants
      tiedParticipants.forEach(participant => {
        const index = result.findIndex(p => p.id === participant.id);
        if (index !== -1) {
          result[index].prize_amount = prizePerParticipant;
        }
      });

      // Move to next position after the tied group
      currentPosition += tiedCount;
    }

    return result;
  };

  const loadParticipantPredictions = async (participantId: string) => {
    if (participantPredictions[participantId]) return; // Already loaded

    const { data: predictions } = await supabase
      .from("football_predictions")
      .select(`
        match_id,
        home_score_prediction,
        away_score_prediction,
        points_earned,
        football_matches (
          home_team,
          away_team,
          home_score,
          away_score
        )
      `)
      .eq("participant_id", participantId);

    if (predictions) {
      const formattedPredictions: MatchPrediction[] = predictions.map((p: any) => ({
        match_id: p.match_id,
        home_team: p.football_matches.home_team,
        away_team: p.football_matches.away_team,
        home_score: p.football_matches.home_score,
        away_score: p.football_matches.away_score,
        home_score_prediction: p.home_score_prediction,
        away_score_prediction: p.away_score_prediction,
        points_earned: p.points_earned,
      }));

      setParticipantPredictions(prev => ({
        ...prev,
        [participantId]: formattedPredictions
      }));
    }
  };

  const toggleParticipant = async (participantId: string) => {
    const newExpanded = new Set(expandedParticipants);
    if (newExpanded.has(participantId)) {
      newExpanded.delete(participantId);
    } else {
      newExpanded.add(participantId);
      await loadParticipantPredictions(participantId);
    }
    setExpandedParticipants(newExpanded);
  };

  if (loading) {
    return <p className="text-muted-foreground">Carregando ranking...</p>;
  }

  if (ranking.length === 0) {
    return <p className="text-muted-foreground">Nenhum participante no ranking ainda.</p>;
  }

  // Get actual position considering ties and zero points
  const getActualPosition = (index: number, participant: ParticipantScore) => {
    // Participants with 0 points have no position
    if (participant.total_points === 0) return null;
    
    if (index === 0) return 1;
    
    let position = 1;
    for (let i = 0; i < index; i++) {
      // Skip participants with 0 points when counting positions
      if (ranking[i].total_points > 0 && ranking[i].total_points !== ranking[i + 1]?.total_points) {
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

  // Group participants by points to handle ties (excluding 0 points)
  const getTopThreeGroups = () => {
    const groups: { position: number; participants: ParticipantScore[]; podiumIndex: number }[] = [];
    let currentPosition = 1;
    let podiumIndex = 0;
    let positionsCount = 0;
    
    for (let i = 0; i < ranking.length; i++) {
      // Skip participants with 0 points
      if (ranking[i].total_points === 0) continue;
      
      // Check if we're starting a new position
      if (i > 0 && ranking[i].total_points !== ranking[i - 1].total_points && ranking[i - 1].total_points > 0) {
        currentPosition = groups.reduce((acc, g) => acc + g.participants.length, 0) + 1;
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
          <div className="mb-6 pb-4 border-b">
            <h3 className="text-base sm:text-lg font-semibold mb-3 text-center">Pódio</h3>
            <div className="flex items-end justify-center gap-2 sm:gap-4 px-2">
              {[1, 0, 2].map((visualIndex) => {
                const topGroups = getTopThreeGroups();
                const group = topGroups.find(g => g.podiumIndex === visualIndex);
                
                if (!group) return null;
                
                const podium = getPodiumPosition(visualIndex);
                
                return (
                  <div key={`podium-${visualIndex}`} className="flex flex-col items-center flex-1 max-w-[90px] sm:max-w-[120px]">
                    <div className="mb-1 sm:mb-2 text-center w-full">
                      <div className="mb-0.5 sm:mb-1 flex justify-center">
                        {getRankIcon(group.position)}
                      </div>
                      <div className="space-y-0.5 sm:space-y-1 min-h-[2rem] sm:min-h-[2.5rem] flex flex-col justify-center">
                        {group.participants.map((participant) => (
                          <div key={participant.id}>
                            <p className="font-bold text-[0.625rem] sm:text-xs truncate px-0.5">{participant.participant_name}</p>
                          </div>
                        ))}
                      </div>
                      <Badge variant={group.position === 1 ? "default" : "secondary"} className="mt-1 text-[0.625rem] sm:text-xs px-1 sm:px-2 py-0">
                        {group.participants[0].total_points} pts
                      </Badge>
                      {group.participants[0].prize_amount !== undefined && group.participants[0].prize_amount > 0 && (
                        <Badge variant="default" className="mt-0.5 sm:mt-1 bg-primary text-[0.625rem] sm:text-xs px-1 sm:px-2 py-0">
                          R$ {group.participants[0].prize_amount.toFixed(2).replace('.', ',')}
                        </Badge>
                      )}
                    </div>
                    <div className={`w-full ${podium.height} ${podium.color} rounded-t-lg flex items-center justify-center font-bold text-lg sm:text-2xl transition-all`}>
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
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Ranking Completo</h3>
          <div className="space-y-2">
            {ranking.map((participant, index) => {
              const actualPosition = getActualPosition(index, participant);
              const isExpanded = expandedParticipants.has(participant.id);
              const predictions = participantPredictions[participant.id] || [];
              
              return (
                <Collapsible
                  key={participant.id}
                  open={isExpanded}
                  onOpenChange={() => toggleParticipant(participant.id)}
                >
                  <div className="rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <CollapsibleTrigger className="w-full">
                      <div className="p-2 sm:p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                            <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-background font-bold text-sm sm:text-lg border-2 border-muted flex-shrink-0">
                              {actualPosition !== null ? (
                                <span>{actualPosition}º</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                            {actualPosition && actualPosition <= 3 && (
                              <div className="flex-shrink-0">
                                {getRankIcon(actualPosition)}
                              </div>
                            )}
                            <span className="font-medium text-sm sm:text-base break-words whitespace-normal sm:whitespace-nowrap sm:truncate min-w-0">
                              {participant.participant_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                            {/* Desktop/tablet badges */}
                            <div className="hidden sm:flex items-center gap-2">
                              <Badge 
                                variant={actualPosition === 1 ? "default" : participant.total_points === 0 ? "outline" : "secondary"} 
                                className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1 whitespace-nowrap"
                              >
                                {participant.total_points} pts
                              </Badge>
                              {participant.prize_amount !== undefined && participant.prize_amount > 0 && (
                                <Badge variant="default" className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1 bg-primary whitespace-nowrap">
                                  R$ {participant.prize_amount.toFixed(2).replace('.', ',')}
                                </Badge>
                              )}
                              {getPrizeStatusBadge(participant.prize_status, participant.prize_amount)}
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                            )}
                          </div>
                        </div>
                        {/* Mobile badges below name */}
                        <div className="mt-1 flex items-center gap-2 flex-wrap sm:hidden pl-10">
                          <Badge 
                            variant={actualPosition === 1 ? "default" : participant.total_points === 0 ? "outline" : "secondary"} 
                            className="text-xs px-2 py-0.5 whitespace-nowrap"
                          >
                            {participant.total_points} pts
                          </Badge>
                          {participant.prize_amount !== undefined && participant.prize_amount > 0 && (
                            <Badge variant="default" className="text-xs px-2 py-0.5 bg-primary whitespace-nowrap">
                              R$ {participant.prize_amount.toFixed(2).replace('.', ',')}
                            </Badge>
                          )}
                          {getPrizeStatusBadge(participant.prize_status, participant.prize_amount)}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="px-3 pb-3 pt-0">
                        <div className="border-t border-muted pt-3 space-y-2">
                          <p className="text-sm font-semibold text-muted-foreground mb-2">Palpites:</p>
                          {predictions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Carregando palpites...</p>
                          ) : (
                            predictions.map((pred) => (
                              <div key={pred.match_id} className="flex items-center justify-between text-sm bg-background/50 rounded p-2">
                                <div className="flex-1">
                                  <p className="font-medium text-xs">{pred.home_team} vs {pred.away_team}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-muted-foreground">
                                      Palpite: {pred.home_score_prediction} - {pred.away_score_prediction}
                                    </span>
                                    {pred.home_score !== null && pred.away_score !== null && (
                                      <span className="text-xs text-muted-foreground">
                                        | Real: {pred.home_score} - {pred.away_score}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Badge 
                                  variant={pred.points_earned > 0 ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {pred.points_earned} pt{pred.points_earned !== 1 ? 's' : ''}
                                </Badge>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FootballRanking;