import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { abbreviateTeamName } from "@/lib/team-utils";

interface FootballRankingProps {
  poolId: string;
  pool?: {
    first_place_prize?: number;
    second_place_prize?: number;
    third_place_prize?: number;
    scoring_system?: string;
    max_winners?: number;
    prize_type?: string;
    entry_fee?: number;
    estabelecimento_prize_description?: string;
    tiebreaker_method?: string | null;
  };
  approvedParticipantsCount?: number;
  isOwner?: boolean;
}

interface ParticipantScore {
  id: string;
  ranking_key: string; // composite key: id_predictionSet
  participant_name: string;
  total_points: number;
  prize_amount?: number;
  prize_status?: string | null;
  prediction_set: number;
  earliest_prediction_at?: string | null;
  exact_scores?: number;
  correct_results?: number;
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
  match_date: string;
  home_team_crest: string | null;
  away_team_crest: string | null;
  status: string;
}



const FootballRanking = ({ poolId, pool, approvedParticipantsCount, isOwner }: FootballRankingProps) => {
  const [ranking, setRanking] = useState<ParticipantScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedParticipants, setExpandedParticipants] = useState<Set<string>>(new Set());
  const [expandedMyPosition, setExpandedMyPosition] = useState<Set<string>>(new Set());
  const [participantPredictions, setParticipantPredictions] = useState<Record<string, MatchPrediction[]>>({});
  const [participantSetCounts, setParticipantSetCounts] = useState<Record<string, number>>({});
  const [allMatchesFinished, setAllMatchesFinished] = useState(false);
  const [ownerPhone, setOwnerPhone] = useState<string | null>(null);
  const [hasLiveMatches, setHasLiveMatches] = useState(false);
  const [scoringSystem, setScoringSystem] = useState<string>('standard');
  const [currentUserParticipantId, setCurrentUserParticipantId] = useState<string | null>(null);
  const [myPositionExpanded, setMyPositionExpanded] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastFrontendRefresh, setLastFrontendRefresh] = useState<Date>(new Date());
  const [anyMatchStarted, setAnyMatchStarted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    loadRanking();
    loadPoolScoringSystem();
    loadCurrentUserParticipant();
    loadOwnerPhone();
  }, [poolId]);

  const loadOwnerPhone = async () => {
    const { data } = await supabase.rpc('get_pool_owner_phone', { pool_uuid: poolId });
    if (data) setOwnerPhone(data);
  };

  const loadCurrentUserParticipant = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: participant } = await supabase
      .from("participants")
      .select("id")
      .eq("pool_id", poolId)
      .eq("user_id", user.id)
      .eq("status", "approved")
      .maybeSingle();

    if (participant) {
      setCurrentUserParticipantId(participant.id);
    }
  };

  const loadPoolScoringSystem = async () => {
    if (pool?.scoring_system) {
      setScoringSystem(pool.scoring_system);
      return;
    }

    const { data } = await supabase
      .from("pools")
      .select("scoring_system")
      .eq("id", poolId)
      .single();

    if (data) {
      setScoringSystem(data.scoring_system || 'standard');
    }
  };

  // Client-side points calculation mirroring the DB function
  const calculatePointsClientSide = (
    predictedHome: number, predictedAway: number,
    actualHome: number, actualAway: number,
    system: string
  ): number => {
    // Exact score
    if (predictedHome === actualHome && predictedAway === actualAway) {
      if (system === 'exact_only') return 1;
      if (system === 'simplified') return 3;
      return 5;
    }

    if (system === 'exact_only') return 0;

    const predictedResult = predictedHome > predictedAway ? 'home' : predictedHome < predictedAway ? 'away' : 'draw';
    const actualResult = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';

    if (system === 'simplified') {
      return predictedResult === actualResult ? 1 : 0;
    }

    // Standard
    let points = 0;
    if (predictedResult === actualResult) points += 3;
    if ((predictedHome - predictedAway) === (actualHome - actualAway)) points += 1;
    return points;
  };

  const loadRanking = async () => {
    setLastFrontendRefresh(new Date());
    setLoading(true);

    // Check match statuses
    const { data: matches } = await supabase
      .from("football_matches")
      .select("id, home_score, away_score, status, last_sync_at")
      .eq("pool_id", poolId);

    // Get the most recent sync timestamp
    if (matches && matches.length > 0) {
      const syncTimes = matches
        .map((m: any) => m.last_sync_at)
        .filter(Boolean)
        .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime());
      if (syncTimes.length > 0) {
        setLastSyncAt(syncTimes[0]);
      }
    }

    const excludedStatuses = ['postponed', 'cancelled', 'abandoned'];
    const countableMatches = matches?.filter(m => !excludedStatuses.includes(m.status)) ?? [];
    const allFinished = countableMatches.length > 0 && countableMatches.every(m => m.status === 'finished');
    setAllMatchesFinished(allFinished);
    
    const liveStatuses = ['1H', '2H', 'HT', 'ET', 'P'];
    const anyLive = matches?.some(m => liveStatuses.includes(m.status)) ?? false;
    setHasLiveMatches(anyLive);

    const startedStatuses = ['1H', '2H', 'HT', 'ET', 'P', 'finished', 'suspended'];
    const hasStarted = matches?.some(m => startedStatuses.includes(m.status)) ?? false;
    setAnyMatchStarted(hasStarted);

    // Find live matches that have scores (for partial points calculation)
    const liveMatchesWithScores = (matches || []).filter(
      m => liveStatuses.includes(m.status) && m.home_score !== null && m.away_score !== null
    );

    // Get the scoring system
    const currentScoringSystem = pool?.scoring_system || scoringSystem || 'standard';

    // Prefer a secured RPC that exposes only public ranking fields (works for everyone)
    const { data: rpcData, error: rpcError } = await (supabase as any)
      .rpc('get_football_pool_ranking', { p_pool_id: poolId });

    if (!rpcError && rpcData) {
      // Fetch prize_status for all participants in this pool
      const participantIds = rpcData.map((r: any) => r.participant_id);
      let prizeStatusMap: Record<string, string | null> = {};
      if (participantIds.length > 0) {
        const { data: statusData } = await supabase
          .from("participants")
          .select("id, prize_status")
          .eq("pool_id", poolId)
          .in("id", participantIds);
        if (statusData) {
          statusData.forEach((s: any) => { prizeStatusMap[s.id] = s.prize_status; });
        }
      }

      // Track how many sets each participant has
      const setCounts: Record<string, number> = {};
      rpcData.forEach((r: any) => {
        setCounts[r.participant_id] = Math.max(setCounts[r.participant_id] || 0, r.prediction_set || 1);
      });
      setParticipantSetCounts(setCounts);

      // Fetch all predictions with details for tiebreaker stats
      const { data: allPredictions } = await supabase
        .from("football_predictions")
        .select("participant_id, created_at, prediction_set, home_score_prediction, away_score_prediction, match_id")
        .in("participant_id", participantIds);

      const earliestPredMap: Record<string, string> = {};
      const exactScoresMap: Record<string, number> = {};
      const correctResultsMap: Record<string, number> = {};
      
      // Build match results map for tiebreaker calculation
      const matchResultsMap: Record<string, { home_score: number; away_score: number }> = {};
      const finishedMatches = countableMatches.filter(m => m.status === 'finished' && m.home_score !== null && m.away_score !== null);
      for (const m of finishedMatches) {
        matchResultsMap[m.id] = { home_score: m.home_score!, away_score: m.away_score! };
      }

      allPredictions?.forEach((p: any) => {
        const key = `${p.participant_id}_${p.prediction_set || 1}`;
        if (!earliestPredMap[key] || new Date(p.created_at).getTime() < new Date(earliestPredMap[key]).getTime()) {
          earliestPredMap[key] = p.created_at;
        }
        
        // Calculate exact scores and correct results for tiebreaker
        const matchResult = matchResultsMap[p.match_id];
        if (matchResult) {
          if (!exactScoresMap[key]) exactScoresMap[key] = 0;
          if (!correctResultsMap[key]) correctResultsMap[key] = 0;
          
          if (p.home_score_prediction === matchResult.home_score && 
              p.away_score_prediction === matchResult.away_score) {
            exactScoresMap[key] = (exactScoresMap[key] || 0) + 1;
          }
          
          const predResult = p.home_score_prediction > p.away_score_prediction ? 'home' : 
                            p.home_score_prediction < p.away_score_prediction ? 'away' : 'draw';
          const actualResult = matchResult.home_score > matchResult.away_score ? 'home' : 
                              matchResult.home_score < matchResult.away_score ? 'away' : 'draw';
          if (predResult === actualResult) {
            correctResultsMap[key] = (correctResultsMap[key] || 0) + 1;
          }
        }
      });

      const isEstabelecimento = pool?.prize_type === 'estabelecimento';

      let baseRanking: ParticipantScore[] = rpcData.map((r: any) => {
        const predSet = r.prediction_set || 1;
        const rankingKey = `${r.participant_id}_${predSet}`;
        return {
          id: r.participant_id,
          ranking_key: rankingKey,
          participant_name: r.participant_name,
          total_points: r.total_points ?? 0,
          prize_status: prizeStatusMap[r.participant_id] || null,
          prediction_set: predSet,
          earliest_prediction_at: earliestPredMap[rankingKey] || null,
          exact_scores: exactScoresMap[rankingKey] || 0,
          correct_results: correctResultsMap[rankingKey] || 0,
        };
      });

      // If there are live matches, calculate partial points and add to totals
      if (liveMatchesWithScores.length > 0) {
        const participantIds = baseRanking.map(r => r.id);
        const liveMatchIds = liveMatchesWithScores.map(m => m.id);

        const { data: livePredictions } = await supabase
          .from("football_predictions")
          .select("participant_id, match_id, home_score_prediction, away_score_prediction, prediction_set")
          .in("participant_id", participantIds)
          .in("match_id", liveMatchIds);

        if (livePredictions) {
          const partialPointsMap: Record<string, number> = {};
          for (const pred of livePredictions) {
            const match = liveMatchesWithScores.find(m => m.id === pred.match_id);
            if (!match) continue;
            const pts = calculatePointsClientSide(
              pred.home_score_prediction, pred.away_score_prediction,
              match.home_score!, match.away_score!,
              currentScoringSystem
            );
            // Need to attribute to the correct ranking_key using prediction_set
            const predSet = (pred as any).prediction_set || 1;
            const key = `${pred.participant_id}_${predSet}`;
            partialPointsMap[key] = (partialPointsMap[key] || 0) + pts;
          }

          baseRanking = baseRanking.map(p => ({
            ...p,
            total_points: p.total_points + (partialPointsMap[p.ranking_key] || 0),
          }));
        }

        // Re-sort after adding partial points
        baseRanking.sort((a, b) => {
          if (b.total_points !== a.total_points) return b.total_points - a.total_points;
          if (isEstabelecimento) {
            if ((b.exact_scores || 0) !== (a.exact_scores || 0)) return (b.exact_scores || 0) - (a.exact_scores || 0);
            if ((b.correct_results || 0) !== (a.correct_results || 0)) return (b.correct_results || 0) - (a.correct_results || 0);
          }
          // Tiebreaker by earliest prediction submission
          const aTime = a.earliest_prediction_at ? new Date(a.earliest_prediction_at).getTime() : Infinity;
          const bTime = b.earliest_prediction_at ? new Date(b.earliest_prediction_at).getTime() : Infinity;
          if (aTime !== bTime) return aTime - bTime;
          return a.participant_name.localeCompare(b.participant_name);
        });
      }

      // Sort logic
      const allZero = baseRanking.every(r => r.total_points === 0);
      if (allZero) {
        baseRanking.sort((a, b) => {
          const aTime = a.earliest_prediction_at ? new Date(a.earliest_prediction_at).getTime() : Infinity;
          const bTime = b.earliest_prediction_at ? new Date(b.earliest_prediction_at).getTime() : Infinity;
          if (aTime !== bTime) return aTime - bTime;
          return a.participant_name.localeCompare(b.participant_name);
        });
      } else if (isEstabelecimento && !liveMatchesWithScores.length) {
        // Re-sort with estabelecimento tiebreaker criteria
        baseRanking.sort((a, b) => {
          if (b.total_points !== a.total_points) return b.total_points - a.total_points;
          if ((b.exact_scores || 0) !== (a.exact_scores || 0)) return (b.exact_scores || 0) - (a.exact_scores || 0);
          if ((b.correct_results || 0) !== (a.correct_results || 0)) return (b.correct_results || 0) - (a.correct_results || 0);
          const aTime = a.earliest_prediction_at ? new Date(a.earliest_prediction_at).getTime() : Infinity;
          const bTime = b.earliest_prediction_at ? new Date(b.earliest_prediction_at).getTime() : Infinity;
          if (aTime !== bTime) return aTime - bTime;
          return a.participant_name.localeCompare(b.participant_name);
        });
      }

      const rankingWithPrizes = allFinished ? calculatePrizeDistribution(baseRanking, pool) : baseRanking;
      setRanking(rankingWithPrizes);
      setLoading(false);
      return;
    }

    // Fallback: legacy secured reads (for owners/approved participants)
    const { data: participants, error: participantsError } = await supabase
      .from("participants")
      .select("id, participant_name, prize_status")
      .eq("pool_id", poolId)
      .eq("status", "approved");

    if (participantsError || !participants) {
      setLoading(false);
      return;
    }

    // Group predictions by prediction_set for each participant
    const fallbackRanking: ParticipantScore[] = [];
    for (const participant of participants) {
      const { data: predictions } = await supabase
        .from("football_predictions")
        .select("points_earned, match_id, home_score_prediction, away_score_prediction, prediction_set")
        .eq("participant_id", participant.id);

      // Group by prediction_set
      const setGroups: Record<number, typeof predictions> = {};
      (predictions || []).forEach((pred: any) => {
        const ps = pred.prediction_set || 1;
        if (!setGroups[ps]) setGroups[ps] = [];
        setGroups[ps].push(pred);
      });

      const sets = Object.keys(setGroups).map(Number);
      if (sets.length === 0) sets.push(1);

      // Track set counts
      const counts: Record<string, number> = { ...participantSetCounts };
      counts[participant.id] = Math.max(...sets);
      setParticipantSetCounts(counts);

      for (const setNum of sets) {
        const setPredictions = setGroups[setNum] || [];
        let total_points = setPredictions.reduce((sum: number, p: any) => sum + (p.points_earned || 0), 0);

        if (liveMatchesWithScores.length > 0) {
          for (const pred of setPredictions) {
            const liveMatch = liveMatchesWithScores.find(m => m.id === (pred as any).match_id);
            if (liveMatch) {
              total_points += calculatePointsClientSide(
                (pred as any).home_score_prediction, (pred as any).away_score_prediction,
                liveMatch.home_score!, liveMatch.away_score!,
                currentScoringSystem
              );
            }
          }
        }

        fallbackRanking.push({
          id: participant.id,
          ranking_key: `${participant.id}_${setNum}`,
          participant_name: participant.participant_name,
          total_points,
          prize_status: participant.prize_status,
          prediction_set: setNum,
        });
      }
    }

    fallbackRanking.sort((a, b) => {
      if (b.total_points !== a.total_points) {
        return b.total_points - a.total_points;
      }
      return a.participant_name.localeCompare(b.participant_name);
    });

    const rankingWithPrizes = calculatePrizeDistribution(fallbackRanking, pool);

    setRanking(rankingWithPrizes);
    setLoading(false);
  };

  const getPrizeStatusBadge = (status: string | null | undefined, prizeAmount?: number, isCurrentUser?: boolean, participantId?: string) => {
    if (!prizeAmount || prizeAmount === 0) return null;

    const ownerManageLink = isOwner && participantId ? (
      <a
        href={`#premio-${participantId}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('scroll-to-prize', { detail: participantId }));
        }}
        className="flex items-center gap-1 text-[0.6rem] sm:text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        <Trophy className="w-3 h-3" />
        <span>Gerenciar prêmio</span>
      </a>
    ) : null;
    
    if (!status || status === 'awaiting_pix') {
      return (
        <div className="flex flex-col items-start gap-1">
          <Badge variant="outline" className="text-[0.625rem] sm:text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700 px-1.5 sm:px-2 py-0 sm:py-0.5 whitespace-nowrap">
            Aguardando chave Pix
          </Badge>
          {ownerManageLink}
        </div>
      );
    }
    
    if (status === 'pix_submitted') {
      return (
        <div className="flex flex-col items-start gap-1">
          <Badge variant="outline" className="text-[0.625rem] sm:text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700 px-1.5 sm:px-2 py-0 sm:py-0.5 whitespace-nowrap">
            Aguardando pagamento
          </Badge>
          {ownerManageLink}
        </div>
      );
    }
    
    if (status === 'prize_sent') {
      const whatsappLink = ownerPhone 
        ? `https://wa.me/${ownerPhone.replace(/\D/g, '')}?text=${encodeURIComponent('Olá! Estou entrando em contato pois meu prêmio foi marcado como pago no bolão, mas ainda não recebi. Pode verificar?')}`
        : null;
      return (
        <div className="flex flex-col items-start gap-1">
          <Badge variant="outline" className="text-[0.625rem] sm:text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700 px-1.5 sm:px-2 py-0 sm:py-0.5 whitespace-nowrap">
            Pago
          </Badge>
          {!isOwner && isCurrentUser && whatsappLink && (
            <a 
              href={whatsappLink} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[0.6rem] sm:text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <MessageCircle className="w-3 h-3" />
              <span>Não recebeu? Fale com o criador</span>
            </a>
          )}
          {ownerManageLink}
        </div>
      );
    }
    
    return null;
  };

  const calculatePrizeDistribution = (
    ranking: ParticipantScore[],
    poolData?: { first_place_prize?: number; second_place_prize?: number; third_place_prize?: number; max_winners?: number; prize_type?: string; entry_fee?: number }
  ): ParticipantScore[] => {
    if (!poolData || !ranking.length) return ranking;

    const maxW = poolData.max_winners || 3;
    const isPercentage = poolData.prize_type === 'percentage';
    const totalPredictionSets = ranking.length;
    const totalCollected = isPercentage ? (poolData.entry_fee || 0) * totalPredictionSets : 0;

    const rawPrizes = [
      poolData.first_place_prize || 0,
      maxW >= 2 ? (poolData.second_place_prize || 0) : 0,
      maxW >= 3 ? (poolData.third_place_prize || 0) : 0,
    ].slice(0, maxW);

    const prizes = isPercentage
      ? rawPrizes.map(p => (p / 100) * totalCollected)
      : rawPrizes;

    const hasPrizes = prizes.some(p => p > 0);
    if (!hasPrizes) return ranking;

    const result = [...ranking];

    // When all participants have 0 points and tiebreaker by time was applied,
    // positions are sequential — prizes go strictly to top N by position, no splitting.
    const allZero = result.every(r => r.total_points === 0);
    if (allZero) {
      for (let i = 0; i < Math.min(maxW, result.length); i++) {
        result[i].prize_amount = prizes[i] || 0;
      }
      return result;
    }

    let currentPosition = 0;

    while (currentPosition < result.length) {
      const currentScore = result[currentPosition].total_points;
      
      let tieGroupEnd = currentPosition;
      while (tieGroupEnd < result.length && result[tieGroupEnd].total_points === currentScore) {
        tieGroupEnd++;
      }
      
      const tieGroupSize = tieGroupEnd - currentPosition;
      
      if (currentPosition >= maxW) break;
      
      let prizeSum = 0;
      const prizeEnd = Math.min(tieGroupEnd, maxW);
      for (let i = currentPosition; i < prizeEnd; i++) {
        prizeSum += prizes[i] || 0;
      }

      const prizePerParticipant = tieGroupSize > 0 ? prizeSum / tieGroupSize : 0;

      for (let i = currentPosition; i < tieGroupEnd; i++) {
        result[i].prize_amount = prizePerParticipant;
      }

      currentPosition = tieGroupEnd;
    }

    return result;
  };

  const loadParticipantPredictions = async (rankingKey: string) => {
    if (participantPredictions[rankingKey]) return; // Already loaded

    const [participantId, predSetStr] = rankingKey.split('_');
    const predSet = parseInt(predSetStr) || 1;

    const { data: predictions } = await supabase
      .from("football_predictions")
      .select(`
        match_id,
        home_score_prediction,
        away_score_prediction,
        points_earned,
        prediction_set,
        football_matches (
          home_team,
          away_team,
          home_score,
          away_score,
          match_date,
          home_team_crest,
          away_team_crest,
          status
        )
      `)
      .eq("participant_id", participantId)
      .eq("prediction_set", predSet)
      .order("football_matches(match_date)", { ascending: true });

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
        match_date: p.football_matches.match_date,
        home_team_crest: p.football_matches.home_team_crest,
        away_team_crest: p.football_matches.away_team_crest,
        status: p.football_matches.status,
      }));

      setParticipantPredictions(prev => ({
        ...prev,
        [rankingKey]: formattedPredictions
      }));
    }
  };

  // Bulk-load all predictions when ranking is populated
  useEffect(() => {
    if (ranking.length > 0) {
      loadAllPredictions();
    }
  }, [ranking.length]);

  const loadAllPredictions = async () => {
    const keysToLoad = ranking.map(r => r.ranking_key).filter(k => !participantPredictions[k]);
    if (keysToLoad.length === 0) return;

    const entries = keysToLoad.map(k => {
      const [pid, ps] = k.split('_');
      return { pid, ps: parseInt(ps) || 1, key: k };
    });

    const participantIds = [...new Set(entries.map(e => e.pid))];

    const { data: predictions } = await supabase
      .from("football_predictions")
      .select(`
        match_id,
        participant_id,
        home_score_prediction,
        away_score_prediction,
        points_earned,
        prediction_set,
        football_matches (
          home_team,
          away_team,
          home_score,
          away_score,
          match_date,
          home_team_crest,
          away_team_crest,
          status
        )
      `)
      .in("participant_id", participantIds)
      .order("football_matches(match_date)", { ascending: true });

    if (!predictions) return;

    const grouped: Record<string, MatchPrediction[]> = {};
    for (const p of predictions as any[]) {
      const key = `${p.participant_id}_${p.prediction_set || 1}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({
        match_id: p.match_id,
        home_team: p.football_matches.home_team,
        away_team: p.football_matches.away_team,
        home_score: p.football_matches.home_score,
        away_score: p.football_matches.away_score,
        home_score_prediction: p.home_score_prediction,
        away_score_prediction: p.away_score_prediction,
        points_earned: p.points_earned,
        match_date: p.football_matches.match_date,
        home_team_crest: p.football_matches.home_team_crest,
        away_team_crest: p.football_matches.away_team_crest,
        status: p.football_matches.status,
      });
    }

    setParticipantPredictions(prev => ({ ...prev, ...grouped }));
  };

  const renderCompactPredictions = (rankingKey: string) => {
    const preds = participantPredictions[rankingKey];
    if (!preds || preds.length === 0) return null;
    const validPreds = preds.filter(p => !['postponed', 'cancelled', 'abandoned'].includes(p.status));
    if (validPreds.length === 0) return null;
    return (
      <div className="mt-1.5 flex flex-wrap gap-1 pl-10 sm:pl-12">
        {validPreds.map(pred => (
          <span key={pred.match_id} className="inline-flex items-center gap-0.5 text-[0.6rem] bg-background/80 border border-border/50 rounded px-1 py-0.5">
            {pred.home_team_crest && <img src={pred.home_team_crest} alt="" className="w-3 h-3 object-contain" />}
            <span className="font-mono font-semibold">{pred.home_score_prediction}-{pred.away_score_prediction}</span>
            {pred.away_team_crest && <img src={pred.away_team_crest} alt="" className="w-3 h-3 object-contain" />}
          </span>
        ))}
      </div>
    );
  };

  const toggleParticipant = async (rankingKey: string) => {
    const newExpanded = new Set(expandedParticipants);
    if (newExpanded.has(rankingKey)) {
      newExpanded.delete(rankingKey);
    } else {
      newExpanded.add(rankingKey);
      await loadParticipantPredictions(rankingKey);
    }
    setExpandedParticipants(newExpanded);
  };

  // Get display name with prediction set label
  const getDisplayName = (participant: ParticipantScore) => {
    const setCount = participantSetCounts[participant.id] || 1;
    const name = shortenName(participant.participant_name);
    if (setCount > 1) {
      return `${name} (Palpite ${participant.prediction_set})`;
    }
    return name;
  };

  if (loading) {
    return <p className="text-muted-foreground">Carregando ranking...</p>;
  }

  if (ranking.length === 0) {
    return <p className="text-muted-foreground">Nenhum participante no ranking ainda.</p>;
  }

  // Get actual position considering ties
  // Show position for everyone (even 0pts) as long as at least one match has started
  const maxWinners = pool?.max_winners ?? 3;
  const isTop1Only = maxWinners === 1;
  const allZeroPoints = ranking.every(r => r.total_points === 0);

  const getActualPosition = (index: number, participant: ParticipantScore) => {
    // If 0 points and no match has started yet, no position
    if (participant.total_points === 0 && !anyMatchStarted) return null;

    if (index === 0) return 1;

    // When allZeroPoints and matches finished, positions are always sequential (sorted by prediction time)
    if (allZeroPoints && allMatchesFinished) {
      return index + 1;
    }

    // For TOP 1 pools: dense ranking (no skipping positions)
    if (isTop1Only) {
      if (ranking[index - 1].total_points === participant.total_points) {
        return getActualPosition(index - 1, ranking[index - 1]);
      }
      // Dense rank: previous position + 1 (not index + 1)
      const prevPosition = getActualPosition(index - 1, ranking[index - 1]);
      return (prevPosition ?? 0) + 1;
    }

    // For TOP 2/3: skip positions when there are ties (standard dense ranking)
    if (ranking[index - 1].total_points === participant.total_points) {
      return getActualPosition(index - 1, ranking[index - 1]);
    }

    // Position = index + 1 (skips positions taken by the tied group)
    return index + 1;
  };
  // Shorten name: "Maria Luiza Machado Dias" → "Maria Dias"
  const shortenName = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 2) return fullName;
    return `${parts[0]} ${parts[parts.length - 1]}`;
  };


  const getRankIcon = (position: number, hasPrize: boolean) => {
    if (!hasPrize) return null;
    if (position === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (position === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (position === 3) return <Medal className="w-5 h-5 text-orange-600" />;
    return null;
  };

  const getPointsExplanation = (
    prediction: MatchPrediction,
    system: string
  ): string => {
    const liveStatuses = ['1H', '2H', 'HT', 'ET', 'P'];
    const isLive = liveStatuses.includes(prediction.status);
    const isFinished = prediction.status === 'finished';
    
    if (!isFinished && !isLive) {
      return "Jogo ainda não começou";
    }

    if (prediction.home_score === null || prediction.away_score === null) {
      return "Aguardando resultado";
    }

    const predictedHome = prediction.home_score_prediction;
    const predictedAway = prediction.away_score_prediction;
    const actualHome = prediction.home_score;
    const actualAway = prediction.away_score;

    const suffix = isLive ? " (parcial)" : "";
    const partialNote = isLive ? " — pode mudar até o fim do jogo" : "";

    // Calculate current points
    const currentPoints = calculatePointsClientSide(predictedHome, predictedAway, actualHome, actualAway, system);

    if (currentPoints === 0) {
      if (isLive) {
        return "Sem pontos no momento — pode mudar até o fim do jogo";
      }
      return "Nenhum ponto";
    }

    // Exact score
    if (predictedHome === actualHome && predictedAway === actualAway) {
      if (system === 'exact_only') return `1pt por acertar o placar${suffix}${partialNote}`;
      if (system === 'simplified') return `3pts por acertar o placar${suffix}${partialNote}`;
      return `5pts por acertar o placar exato${suffix}${partialNote}`;
    }

    // For exact_only, only exact score gives points
    if (system === 'exact_only') return isLive ? "Sem pontos no momento — pode mudar até o fim do jogo" : "";

    // Determine results
    const predictedResult = predictedHome > predictedAway ? 'home' : predictedHome < predictedAway ? 'away' : 'draw';
    const actualResult = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';

    // For simplified system
    if (system === 'simplified') {
      if (predictedResult === actualResult) {
        return `1pt por acertar o resultado${suffix}${partialNote}`;
      }
      return isLive ? "Sem pontos no momento — pode mudar até o fim do jogo" : "";
    }

    // Standard system - can have multiple reasons
    const reasons: string[] = [];
    
    if (predictedResult === actualResult) {
      reasons.push("3pts por acertar o resultado");
    }

    const predictedDiff = predictedHome - predictedAway;
    const actualDiff = actualHome - actualAway;
    if (predictedDiff === actualDiff) {
      reasons.push("1pt por acertar a diferença");
    }

    const joined = reasons.join(" + ");
    return isLive ? `${joined} (parcial) — pode mudar até o fim do jogo` : joined;
  };

  const getMatchStatusLabel = (status: string): { label: string; className: string } | null => {
    const map: Record<string, { label: string; className: string }> = {
      '1H': { label: '🔴 1º Tempo', className: 'bg-red-500 text-white animate-pulse' },
      '2H': { label: '🔴 2º Tempo', className: 'bg-red-500 text-white animate-pulse' },
      'HT': { label: '⏸️ Intervalo', className: 'bg-yellow-500 text-black' },
      'ET': { label: '🔴 Prorrogação', className: 'bg-red-500 text-white animate-pulse' },
      'P': { label: '🔴 Pênaltis', className: 'bg-red-500 text-white animate-pulse' },
      'finished': { label: '🏁 Encerrado', className: 'bg-muted text-muted-foreground' },
      'scheduled': { label: '⏳ Agendado', className: 'bg-muted text-muted-foreground' },
      'suspended': { label: '⚠️ Suspenso', className: 'bg-orange-500 text-white' },
      'postponed': { label: '📅 Adiado — não conta', className: 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300' },
      'cancelled': { label: '❌ Cancelado — não conta', className: 'bg-muted text-muted-foreground' },
      'abandoned': { label: '❌ Abandonado — não conta', className: 'bg-muted text-muted-foreground' },
    };
    return map[status] || null;
  };

  const getPredictionBgColor = (prediction: MatchPrediction): string => {
    const liveStatuses = ['1H', '2H', 'HT', 'ET', 'P'];
    const excludedStatuses = ['postponed', 'cancelled', 'abandoned'];
    const isLive = liveStatuses.includes(prediction.status);
    const isFinished = prediction.status === 'finished';
    const isExcluded = excludedStatuses.includes(prediction.status);
    
    if (isExcluded) {
      return "bg-muted/30 border-l-4 border-muted opacity-60";
    }
    
    if (isLive) {
      return "bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-500";
    }
    
    if (!isFinished) {
      return "bg-yellow-50 dark:bg-yellow-950/20 border-l-4 border-yellow-400";
    }
    
    if (prediction.points_earned > 0) {
      return "bg-green-50 dark:bg-green-950/20 border-l-4 border-green-500";
    }
    
    return "bg-red-50 dark:bg-red-950/20 border-l-4 border-red-500";
  };


  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <Trophy className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="break-words">{allMatchesFinished ? 'Ranking Final' : 'Ranking Parcial'}</span>
            {hasLiveMatches && (
              <Badge className="bg-red-500 text-white text-[0.55rem] sm:text-[0.6rem] px-1.5 py-0 animate-pulse whitespace-nowrap flex-shrink-0">
                AO VIVO
              </Badge>
            )}
          </CardTitle>
          {!allMatchesFinished && (
            <p className="text-xs text-muted-foreground mt-1">
              Última atualização: {format(lastFrontendRefresh, "dd/MM 'às' HH:mm", { locale: ptBR })}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Champion highlight - only show when all matches are finished */}
        {allMatchesFinished && ranking.length > 0 && (() => {
          const allZeroPoints = ranking.every(r => r.total_points === 0);
          
          if (!allZeroPoints && ranking[0].total_points <= 0) return null;
          
          if (allZeroPoints) {
            // Tiebreaker by join time - first in ranking is the winner
            const maxW = pool?.max_winners || 3;
            const topN = ranking.slice(0, Math.min(maxW, ranking.length));
            const isMultiple = topN.length > 1;
            
            return (
              <div className="mb-6 pb-4 border-b space-y-3">
                <div className="rounded-xl bg-gradient-to-r from-yellow-500/15 via-yellow-400/10 to-yellow-500/15 border border-yellow-500/30 p-3 sm:p-4">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Trophy className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      {isMultiple ? `Campeões (${topN.length})` : 'Campeão'}
                    </span>
                    <span className="text-xs font-bold text-foreground">0 pts</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {topN.map((winner) => (
                      <span 
                        key={winner.ranking_key} 
                        className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 font-semibold text-sm px-3 py-1"
                      >
                        🏆 {getDisplayName(winner)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-center">
                  <strong>⏱️ Regra de desempate aplicada:</strong> Como ninguém fez pontos, {isMultiple ? 'os campeões foram definidos' : 'o campeão foi definido'} pela ordem de envio dos palpites (quem enviou primeiro).
                </div>
              </div>
            );
          }

          const winners = ranking.filter(r => r.total_points === ranking[0].total_points);
          const isMultiple = winners.length > 1;
          const isManyWinners = winners.length > 3;
          
          return (
            <div className="mb-6 pb-4 border-b">
              <div className="rounded-xl bg-gradient-to-r from-yellow-500/15 via-yellow-400/10 to-yellow-500/15 border border-yellow-500/30 p-3 sm:p-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Trophy className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    {isMultiple ? `Campeões (${winners.length})` : 'Campeão'}
                  </span>
                  <span className="text-xs font-bold text-foreground">{ranking[0].total_points} pts</span>
                  {ranking[0].prize_amount !== undefined && ranking[0].prize_amount > 0 && (
                    <span className="text-xs font-bold text-primary">
                      R$ {ranking[0].prize_amount.toFixed(2).replace('.', ',')}
                    </span>
                  )}
                </div>
                <div className={`flex flex-wrap items-center justify-center gap-1.5 ${isManyWinners ? 'gap-y-1' : 'gap-2'}`}>
                  {winners.map((winner) => (
                    <span 
                      key={winner.ranking_key} 
                      className={`inline-flex items-center gap-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 font-semibold ${
                        isManyWinners ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'
                      }`}
                    >
                      🏆 {getDisplayName(winner)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Prize distribution explanation - at the top for visibility */}
        {allMatchesFinished && pool && ranking.some(r => (r.prize_amount ?? 0) > 0) && (() => {
          const maxW = pool.max_winners || 3;
          const isPercentage = pool.prize_type === 'percentage';
          const totalPredictionSets = ranking.length;
          const totalCollected = isPercentage ? (pool.entry_fee || 0) * totalPredictionSets : 0;
          const allZero = ranking.every(r => r.total_points === 0);

          const rawPrizes = [
            pool.first_place_prize || 0,
            maxW >= 2 ? (pool.second_place_prize || 0) : 0,
            maxW >= 3 ? (pool.third_place_prize || 0) : 0,
          ].slice(0, maxW);

          const prizes = isPercentage
            ? rawPrizes.map(p => (p / 100) * totalCollected)
            : rawPrizes;

          const positionLabels = ['1º lugar', '2º lugar', '3º lugar'];

          // Build explanation items as structured objects for better rendering
          const items: { icon: string; text: string; bold?: boolean; indent?: boolean }[] = [];

          if (isPercentage) {
            items.push({
              icon: '💰',
              text: `Total arrecadado: R$ ${totalCollected.toFixed(2).replace('.', ',')} (${totalPredictionSets} palpites × R$ ${(pool.entry_fee || 0).toFixed(2).replace('.', ',')})`,
            });
          }

          items.push({
            icon: '🏆',
            text: `Premiação para os Top ${maxW}`,
            bold: true,
          });

          if (allZero) {
            items.push({
              icon: '⏱️',
              text: 'Nenhum participante pontuou. A classificação seguiu a ordem de envio dos palpites (quem enviou primeiro ficou à frente).',
            });
            const winners = ranking.filter(r => (r.prize_amount ?? 0) > 0);
            winners.forEach((w, i) => {
              items.push({
                icon: '',
                text: `${positionLabels[i]}: ${w.participant_name} → R$ ${(w.prize_amount || 0).toFixed(2).replace('.', ',')}`,
                indent: true,
              });
            });
          } else {
            // Detect tie groups within prize positions
            let pos = 0;
            while (pos < ranking.length && pos < maxW) {
              const score = ranking[pos].total_points;
              if (score === 0) break;
              let end = pos;
              while (end < ranking.length && ranking[end].total_points === score) end++;
              const groupSize = end - pos;

              if (groupSize > 1 && pos < maxW) {
                // Tie group — calculate which prize positions are covered
                const coveredCount = Math.min(end, maxW) - pos;
                const coveredLabels = [];
                for (let i = pos; i < Math.min(end, maxW); i++) {
                  coveredLabels.push(positionLabels[i]);
                }
                const sumPrize = coveredLabels.reduce((s, _, idx) => s + (prizes[pos + idx] || 0), 0);
                const perPerson = sumPrize / groupSize;
                const names = ranking.slice(pos, end).map(r => r.participant_name);

                // Describe what happened
                if (coveredCount >= maxW - pos) {
                  // This tie consumed all remaining prize positions
                  if (coveredLabels.length > 1) {
                    items.push({
                      icon: '🤝',
                      text: `${groupSize} participantes empataram com ${score} pts, ocupando do ${coveredLabels[0]} ao ${coveredLabels[coveredLabels.length - 1]}.`,
                    });
                    items.push({
                      icon: '',
                      text: `Os prêmios dessas posições foram somados (R$ ${sumPrize.toFixed(2).replace('.', ',')}) e divididos igualmente: R$ ${perPerson.toFixed(2).replace('.', ',')} para cada um.`,
                      indent: true,
                    });
                  } else {
                    items.push({
                      icon: '🤝',
                      text: `${groupSize} participantes empataram com ${score} pts na disputa pelo ${coveredLabels[0]}.`,
                    });
                    items.push({
                      icon: '',
                      text: `O prêmio de R$ ${sumPrize.toFixed(2).replace('.', ',')} foi dividido igualmente: R$ ${perPerson.toFixed(2).replace('.', ',')} para cada um.`,
                      indent: true,
                    });
                  }

                  // If this tie absorbed lower positions, explain it
                  const absorbedPositions = [];
                  for (let i = Math.min(end, maxW); i < maxW; i++) {
                    absorbedPositions.push(positionLabels[i]);
                  }
                  // Actually check: positions after the tie group that have no winner
                  if (end > pos + coveredCount) {
                    // More tied people than covered positions
                  }
                  if (coveredCount < maxW - pos && end >= maxW) {
                    // The tie pushed out remaining positions
                  }

                  items.push({
                    icon: '',
                    text: `Participantes: ${names.join(', ')}`,
                    indent: true,
                  });
                } else {
                  items.push({
                    icon: '🤝',
                    text: `${groupSize} participantes empataram com ${score} pts na disputa pelo ${coveredLabels[0]}.`,
                  });
                  items.push({
                    icon: '',
                    text: `Os prêmios do ${coveredLabels.join(' e ')} foram somados (R$ ${sumPrize.toFixed(2).replace('.', ',')}) e divididos igualmente: R$ ${perPerson.toFixed(2).replace('.', ',')} para cada um.`,
                    indent: true,
                  });
                  items.push({
                    icon: '',
                    text: `Participantes: ${names.join(', ')}`,
                    indent: true,
                  });
                  // Explain absorbed positions
                  const nextPos = end;
                  if (nextPos < maxW) {
                    // There are still positions available, no absorption to explain
                  } else {
                    // The tie consumed multiple positions, pushing out lower ones
                    const missingLabels = [];
                    for (let i = pos + 1; i < maxW; i++) {
                      if (i >= Math.min(end, maxW)) {
                        missingLabels.push(positionLabels[i]);
                      }
                    }
                    if (missingLabels.length > 0) {
                      items.push({
                        icon: '⚠️',
                        text: `Como o empate ocupou as posições acima, não houve ${missingLabels.join(' nem ')} separado.`,
                        indent: true,
                      });
                    }
                  }
                }
              } else if (groupSize === 1 && pos < maxW) {
                const prizeVal = ranking[pos].prize_amount || 0;
                if (prizeVal > 0) {
                  items.push({
                    icon: pos === 0 ? '🥇' : pos === 1 ? '🥈' : '🥉',
                    text: `${positionLabels[pos]}: ${ranking[pos].participant_name} (${score} pts) → R$ ${prizeVal.toFixed(2).replace('.', ',')}`,
                  });
                }
              }
              pos = end;
            }

            // Explain if positions were absorbed by ties above
            if (pos < maxW && pos > 0) {
              const missingLabels = [];
              for (let i = pos; i < maxW; i++) {
                missingLabels.push(positionLabels[i]);
              }
              if (missingLabels.length > 0) {
                const hasPeopleBelow = ranking.length > pos && ranking[pos].total_points > 0;
                if (hasPeopleBelow) {
                  items.push({
                    icon: 'ℹ️',
                    text: `O ${missingLabels.join(' e ')} não tiveram premiação separada, pois os empates nas posições anteriores já consumiram todos os prêmios destinados ao Top ${maxW}.`,
                  });
                }
              }
            }
          }

          return (
            <div className="mb-5 pb-4 border-b">
              <Collapsible>
                <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-1.5">
                  <span className="flex items-center gap-1.5">
                    📋 Como foi dividida a premiação?
                  </span>
                  <ChevronDown className="h-4 w-4 flex-shrink-0" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="rounded-lg bg-muted/50 border border-border/50 p-3 mt-2 space-y-2">
                    {items.map((item, i) => (
                      <div key={i} className={`flex gap-2 ${item.indent ? 'pl-5 sm:pl-6' : ''}`}>
                        {item.icon && <span className="flex-shrink-0 text-sm leading-5">{item.icon}</span>}
                        <p className={`text-xs sm:text-sm leading-5 ${item.bold ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>
                          {item.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          );
        })()}

        {/* Estabelecimento prize display */}
        {allMatchesFinished && pool?.prize_type === 'estabelecimento' && pool.estabelecimento_prize_description && (() => {
          const topScore = ranking.length > 0 ? ranking[0].total_points : 0;
          const tiedFirst = ranking.filter(r => r.total_points === topScore);
          const hasTie = tiedFirst.length > 1;
          
          return (
            <div className="mb-5 pb-4 border-b">
              <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏪</span>
                  <span className="font-semibold text-sm">Prêmio do Estabelecimento</span>
                </div>
                <p className="text-sm">{pool.estabelecimento_prize_description}</p>
                {hasTie && (
                  <div className="rounded-md bg-amber-500/10 p-2 mt-2">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      ⚠️ Empate em 1º lugar! Será criado um novo bolão (sem custo adicional) apenas entre os {tiedFirst.length} empatados para definir o campeão e ganhador do prêmio.
                    </p>
                  </div>
                )}
                {!hasTie && tiedFirst.length === 1 && (
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                    🏆 Campeão: {tiedFirst[0].participant_name} — ganhador do prêmio!
                  </p>
                )}
              </div>
            </div>
          );
        })()}

        {currentUserParticipantId && ranking.some(p => p.id === currentUserParticipantId) && (() => {
          const userEntries = ranking.filter(p => p.id === currentUserParticipantId);
          if (userEntries.length === 0) return null;

          return (
            <div className="mb-6 pb-4 border-b space-y-3">
              <h3 className="text-base sm:text-lg font-semibold">
                {allMatchesFinished ? 'Minha Colocação' : 'Minha Colocação Parcial'}
              </h3>
              {userEntries.map((currentUser) => {
                const userIndex = ranking.indexOf(currentUser);
                const actualPosition = getActualPosition(userIndex, currentUser);
                const userPredictions = participantPredictions[currentUser.ranking_key] || [];
                
                return (
                  <Collapsible
                    key={currentUser.ranking_key}
                    open={expandedMyPosition.has(currentUser.ranking_key)}
                    onOpenChange={async (open) => {
                      const newExpanded = new Set(expandedMyPosition);
                      if (open) {
                        newExpanded.add(currentUser.ranking_key);
                        await loadParticipantPredictions(currentUser.ranking_key);
                      } else {
                        newExpanded.delete(currentUser.ranking_key);
                      }
                      setExpandedMyPosition(newExpanded);
                    }}
                  >
                    <div className="rounded-lg bg-primary/10 border-2 border-primary">
                      <CollapsibleTrigger className="w-full">
                        <div className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                              <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary text-primary-foreground font-bold text-sm sm:text-lg border-2 border-primary flex-shrink-0">
                                {actualPosition !== null ? (
                                  <span>{actualPosition}º</span>
                                ) : (
                                  <span>—</span>
                                )}
                              </div>
                              {allMatchesFinished && actualPosition && actualPosition <= 3 && (
                                <div className="flex-shrink-0">
                                  {getRankIcon(actualPosition, !!(currentUser.prize_amount && currentUser.prize_amount > 0))}
                                </div>
                              )}
                              <span className="font-semibold text-sm break-words whitespace-normal sm:whitespace-nowrap sm:truncate min-w-0">
                                {getDisplayName(currentUser)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                              <div className="hidden sm:flex items-center gap-2">
                                <Badge 
                                  variant={actualPosition === 1 ? "default" : currentUser.total_points === 0 ? "outline" : "secondary"} 
                                  className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1 whitespace-nowrap font-semibold"
                                >
                                  {currentUser.total_points} pts
                                </Badge>
                                {allMatchesFinished && currentUser.prize_amount !== undefined && currentUser.prize_amount > 0 && (
                                  <Badge variant="default" className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1 bg-primary whitespace-nowrap font-semibold">
                                    R$ {currentUser.prize_amount.toFixed(2).replace('.', ',')}
                                  </Badge>
                                )}
                                {allMatchesFinished && getPrizeStatusBadge(currentUser.prize_status, currentUser.prize_amount, true, currentUser.id)}
                              </div>
                              {expandedMyPosition.has(currentUser.ranking_key) ? (
                                <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                              ) : (
                                <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                              )}
                            </div>
                          </div>
                          {/* Mobile badges */}
                          <div className="mt-1 flex items-center gap-2 flex-wrap sm:hidden pl-10">
                            <Badge 
                              variant={actualPosition === 1 ? "default" : currentUser.total_points === 0 ? "outline" : "secondary"} 
                              className="text-xs px-2 py-0.5 whitespace-nowrap"
                            >
                              {currentUser.total_points} pts
                            </Badge>
                            {allMatchesFinished && currentUser.prize_amount !== undefined && currentUser.prize_amount > 0 && (
                              <Badge variant="default" className="text-xs px-2 py-0.5 bg-primary whitespace-nowrap">
                                R$ {currentUser.prize_amount.toFixed(2).replace('.', ',')}
                              </Badge>
                            )}
                            {allMatchesFinished && getPrizeStatusBadge(currentUser.prize_status, currentUser.prize_amount, true, currentUser.id)}
                          </div>
                          
                        </div>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent>
                        <div className="px-3 pb-3 pt-0">
                          <div className="border-t border-primary/20 pt-3 space-y-2">
                            {allZeroPoints && allMatchesFinished && currentUser.earliest_prediction_at && (
                              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-xs">
                                ⏱️ Palpites enviados em: <strong>{format(new Date(currentUser.earliest_prediction_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</strong>
                              </div>
                            )}
                            <p className="text-sm font-semibold text-muted-foreground mb-2">Meus Palpites:</p>
                            {userPredictions.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Carregando palpites...</p>
                            ) : (
                              userPredictions.map((pred) => {
                                const explanation = getPointsExplanation(pred, scoringSystem);
                                const bgColor = getPredictionBgColor(pred);
                                const isExcluded = ['postponed', 'cancelled', 'abandoned'].includes(pred.status);
                                const isMatchFinished = pred.status === 'finished';
                                const liveStatuses = ['1H', '2H', 'HT', 'ET', 'P'];
                                const isLive = liveStatuses.includes(pred.status);
                                const displayPoints = isLive && pred.home_score !== null && pred.away_score !== null
                                  ? calculatePointsClientSide(pred.home_score_prediction, pred.away_score_prediction, pred.home_score, pred.away_score, scoringSystem)
                                  : pred.points_earned;

                                if (isMatchFinished) {
                                  return (
                                    <Collapsible key={pred.match_id}>
                                      <div className={`text-sm rounded overflow-hidden ${isExcluded ? 'bg-muted/30 opacity-60' : bgColor}`}>
                                        <CollapsibleTrigger className="w-full">
                                          <div className="p-2">
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                                  {pred.home_team_crest && (
                                                    <img src={pred.home_team_crest} alt={pred.home_team} className="w-4 h-4 object-contain" />
                                                  )}
                                                  <span className="text-[0.6rem] font-mono font-bold text-foreground">{pred.home_score_prediction}-{pred.away_score_prediction}</span>
                                                  {pred.away_team_crest && (
                                                    <img src={pred.away_team_crest} alt={pred.away_team} className="w-4 h-4 object-contain" />
                                                  )}
                                                </div>
                                                <Badge className={`text-[0.55rem] px-1 py-0 flex-shrink-0 ${getMatchStatusLabel(pred.status)?.className || ''}`}>
                                                  🏁 Encerrado
                                                </Badge>
                                              </div>
                                              <div className="flex items-center gap-1 flex-shrink-0">
                                                {!isExcluded && (
                                                  <Badge 
                                                    variant={displayPoints > 0 ? "default" : "secondary"}
                                                    className="text-xs"
                                                  >
                                                    {displayPoints} pt{displayPoints !== 1 ? 's' : ''}
                                                  </Badge>
                                                )}
                                                <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                                              </div>
                                            </div>
                                            <p className="font-medium text-xs text-muted-foreground mt-0.5 truncate pl-0.5 text-left">{abbreviateTeamName(pred.home_team)} vs {abbreviateTeamName(pred.away_team)}</p>
                                          </div>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                          <div className="px-2 pb-2 space-y-1">
                                            <p className="text-xs text-muted-foreground">
                                              {format(new Date(pred.match_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                            </p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="text-xs text-muted-foreground">
                                                Palpite: {pred.home_score_prediction} - {pred.away_score_prediction}
                                              </span>
                                              {pred.home_score !== null && pred.away_score !== null && (
                                                <span className="text-xs font-semibold">
                                                  | Placar: {pred.home_score} - {pred.away_score}
                                                </span>
                                              )}
                                            </div>
                                            {explanation && (
                                              <p className="text-xs font-medium text-foreground/80 italic">
                                                {explanation}
                                              </p>
                                            )}
                                          </div>
                                        </CollapsibleContent>
                                      </div>
                                    </Collapsible>
                                  );
                                }

                                return (
                                  <Collapsible key={pred.match_id}>
                                    <div className={`text-sm rounded overflow-hidden ${isExcluded ? 'bg-muted/30 opacity-60' : bgColor}`}>
                                      <CollapsibleTrigger className="w-full">
                                        <div className="p-2">
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                                {pred.home_team_crest && (
                                                  <img src={pred.home_team_crest} alt={pred.home_team} className="w-4 h-4 object-contain" />
                                                )}
                                                <span className="text-[0.6rem] font-mono font-bold text-foreground">{pred.home_score_prediction}-{pred.away_score_prediction}</span>
                                                {pred.away_team_crest && (
                                                  <img src={pred.away_team_crest} alt={pred.away_team} className="w-4 h-4 object-contain" />
                                                )}
                                              </div>
                                              {(() => {
                                                const statusInfo = getMatchStatusLabel(pred.status);
                                                return statusInfo ? (
                                                  <Badge className={`text-[0.55rem] px-1 py-0 flex-shrink-0 ${statusInfo.className}`}>
                                                    {statusInfo.label}
                                                  </Badge>
                                                ) : null;
                                              })()}
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                              {!isExcluded && (
                                                <Badge 
                                                  variant={displayPoints > 0 ? "default" : "secondary"}
                                                  className="text-xs"
                                                >
                                                  {displayPoints} pt{displayPoints !== 1 ? 's' : ''}
                                                </Badge>
                                              )}
                                              <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                                            </div>
                                          </div>
                                          <p className="font-medium text-xs text-muted-foreground mt-0.5 truncate pl-0.5 text-left">{abbreviateTeamName(pred.home_team)} vs {abbreviateTeamName(pred.away_team)}</p>
                                        </div>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        {!isExcluded && (
                                          <div className="px-2 pb-2 space-y-1">
                                            <p className="text-xs text-muted-foreground">
                                              {format(new Date(pred.match_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                            </p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="text-xs text-muted-foreground">
                                                Palpite: {pred.home_score_prediction} - {pred.away_score_prediction}
                                              </span>
                                              {pred.home_score !== null && pred.away_score !== null && (
                                                <span className="text-xs font-semibold">
                                                  | Placar: {pred.home_score} - {pred.away_score}
                                                </span>
                                              )}
                                            </div>
                                            {explanation && (
                                              <p className="text-xs font-medium text-foreground/80 italic">
                                                {explanation}
                                              </p>
                                            )}
                                          </div>
                                        )}
                                      </CollapsibleContent>
                                    </div>
                                  </Collapsible>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          );
        })()}
        
        {/* Complete ranking list */}
        <div>
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
            {allMatchesFinished ? 'Ranking Completo' : 'Ranking Parcial'}
          </h3>
          <div className="space-y-2">
            {ranking.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((participant) => {
              const index = ranking.indexOf(participant);
              const actualPosition = getActualPosition(index, participant);
              const isExpanded = expandedParticipants.has(participant.ranking_key);
              const predictions = participantPredictions[participant.ranking_key] || [];
              const isCurrentUser = participant.id === currentUserParticipantId;
              
              return (
                <Collapsible
                  key={participant.ranking_key}
                  open={isExpanded}
                  onOpenChange={() => toggleParticipant(participant.ranking_key)}
                >
                  <div className={`rounded-lg transition-colors ${
                    isCurrentUser 
                      ? 'bg-primary/10 border-2 border-primary hover:bg-primary/15' 
                      : 'bg-muted/50 hover:bg-muted'
                  }`}>
                    <CollapsibleTrigger className="w-full">
                      <div className="p-2 sm:p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                            <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full font-bold text-sm sm:text-lg border-2 flex-shrink-0 ${
                              isCurrentUser
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background border-muted'
                            }`}>
                              {actualPosition !== null ? (
                                <span>{actualPosition}º</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                             </div>
                             {allMatchesFinished && actualPosition && actualPosition <= 3 && (
                               <div className="flex-shrink-0">
                                 {getRankIcon(actualPosition, !!(participant.prize_amount && participant.prize_amount > 0))}
                               </div>
                             )}
                             <span className={`font-medium text-sm sm:text-base break-words whitespace-normal sm:whitespace-nowrap sm:truncate min-w-0 ${
                               isCurrentUser ? 'font-semibold' : ''
                             }`}>
                              {getDisplayName(participant)}
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
                              {allMatchesFinished && participant.prize_amount !== undefined && participant.prize_amount > 0 && (
                                <Badge variant="default" className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1 bg-primary whitespace-nowrap">
                                  R$ {participant.prize_amount.toFixed(2).replace('.', ',')}
                                </Badge>
                              )}
                              {allMatchesFinished && getPrizeStatusBadge(participant.prize_status, participant.prize_amount, participant.id === currentUserParticipantId, participant.id)}
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
                          {allMatchesFinished && participant.prize_amount !== undefined && participant.prize_amount > 0 && (
                            <Badge variant="default" className="text-xs px-2 py-0.5 bg-primary whitespace-nowrap">
                              R$ {participant.prize_amount.toFixed(2).replace('.', ',')}
                            </Badge>
                          )}
                          {allMatchesFinished && getPrizeStatusBadge(participant.prize_status, participant.prize_amount, participant.id === currentUserParticipantId, participant.id)}
                        </div>
                        
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="px-3 pb-3 pt-0">
                        <div className="border-t border-muted pt-3 space-y-2">
                          {allZeroPoints && allMatchesFinished && participant.earliest_prediction_at && (
                            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-xs">
                              ⏱️ Palpites enviados em: <strong>{format(new Date(participant.earliest_prediction_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</strong>
                            </div>
                          )}
                          <p className="text-sm font-semibold text-muted-foreground mb-2">Palpites:</p>
                          {predictions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Carregando palpites...</p>
                          ) : (
                            predictions.map((pred) => {
                               const explanation = getPointsExplanation(pred, scoringSystem);
                               const bgColor = getPredictionBgColor(pred);
                               const isExcluded2 = ['postponed', 'cancelled', 'abandoned'].includes(pred.status);
                               const isMatchFinished2 = pred.status === 'finished';
                               const liveStatuses2 = ['1H', '2H', 'HT', 'ET', 'P'];
                               const isLive2 = liveStatuses2.includes(pred.status);
                               const displayPoints2 = isLive2 && pred.home_score !== null && pred.away_score !== null
                                 ? calculatePointsClientSide(pred.home_score_prediction, pred.away_score_prediction, pred.home_score, pred.away_score, scoringSystem)
                                 : pred.points_earned;

                               if (isMatchFinished2) {
                                 return (
                                   <Collapsible key={pred.match_id}>
                                     <div className={`text-sm rounded overflow-hidden ${isExcluded2 ? 'bg-muted/30 opacity-60' : bgColor}`}>
                                       <CollapsibleTrigger className="w-full">
                                         <div className="p-2">
                                           <div className="flex items-center justify-between gap-2">
                                             <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                               <div className="flex items-center gap-0.5 flex-shrink-0">
                                                 {pred.home_team_crest && (
                                                   <img src={pred.home_team_crest} alt={pred.home_team} className="w-4 h-4 object-contain" />
                                                 )}
                                                  <span className="text-[0.6rem] font-mono font-bold text-foreground">{pred.home_score_prediction}-{pred.away_score_prediction}</span>
                                                 {pred.away_team_crest && (
                                                   <img src={pred.away_team_crest} alt={pred.away_team} className="w-4 h-4 object-contain" />
                                                 )}
                                               </div>
                                               <Badge className={`text-[0.55rem] px-1 py-0 flex-shrink-0 ${getMatchStatusLabel(pred.status)?.className || ''}`}>
                                                 🏁 Encerrado
                                               </Badge>
                                             </div>
                                             <div className="flex items-center gap-1 flex-shrink-0">
                                               {!isExcluded2 && (
                                                 <Badge 
                                                   variant={displayPoints2 > 0 ? "default" : "secondary"}
                                                   className="text-xs"
                                                 >
                                                   {displayPoints2} pt{displayPoints2 !== 1 ? 's' : ''}
                                                 </Badge>
                                               )}
                                               <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                                             </div>
                                           </div>
                                           <p className="font-medium text-xs text-muted-foreground mt-0.5 truncate pl-0.5 text-left">{abbreviateTeamName(pred.home_team)} vs {abbreviateTeamName(pred.away_team)}</p>
                                         </div>
                                       </CollapsibleTrigger>
                                       <CollapsibleContent>
                                         <div className="px-2 pb-2 space-y-1">
                                           <p className="text-xs text-muted-foreground">
                                             {format(new Date(pred.match_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                           </p>
                                           <div className="flex items-center gap-2 flex-wrap">
                                             <span className="text-xs text-muted-foreground">
                                               Palpite: {pred.home_score_prediction} - {pred.away_score_prediction}
                                             </span>
                                             {pred.home_score !== null && pred.away_score !== null && (
                                               <span className="text-xs font-semibold">
                                                 | Placar: {pred.home_score} - {pred.away_score}
                                               </span>
                                             )}
                                           </div>
                                           {explanation && (
                                             <p className="text-xs font-medium text-foreground/80 italic">
                                               {explanation}
                                             </p>
                                           )}
                                         </div>
                                       </CollapsibleContent>
                                     </div>
                                   </Collapsible>
                                 );
                               }

                               return (
                                 <Collapsible key={pred.match_id}>
                                   <div className={`text-sm rounded overflow-hidden ${isExcluded2 ? 'bg-muted/30 opacity-60' : bgColor}`}>
                                     <CollapsibleTrigger className="w-full">
                                       <div className="p-2">
                                         <div className="flex items-center justify-between gap-2">
                                           <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                             <div className="flex items-center gap-0.5 flex-shrink-0">
                                               {pred.home_team_crest && (
                                                 <img src={pred.home_team_crest} alt={pred.home_team} className="w-4 h-4 object-contain" />
                                               )}
                                               <span className="text-[0.6rem] font-mono font-bold text-foreground">{pred.home_score_prediction}-{pred.away_score_prediction}</span>
                                               {pred.away_team_crest && (
                                                 <img src={pred.away_team_crest} alt={pred.away_team} className="w-4 h-4 object-contain" />
                                               )}
                                             </div>
                                             {(() => {
                                               const statusInfo = getMatchStatusLabel(pred.status);
                                               return statusInfo ? (
                                                 <Badge className={`text-[0.55rem] px-1 py-0 flex-shrink-0 ${statusInfo.className}`}>
                                                   {statusInfo.label}
                                                 </Badge>
                                               ) : null;
                                             })()}
                                           </div>
                                           <div className="flex items-center gap-1 flex-shrink-0">
                                             {!isExcluded2 && (
                                               <Badge 
                                                 variant={displayPoints2 > 0 ? "default" : "secondary"}
                                                 className="text-xs"
                                               >
                                                 {displayPoints2} pt{displayPoints2 !== 1 ? 's' : ''}
                                               </Badge>
                                             )}
                                             <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                                           </div>
                                         </div>
                                         <p className="font-medium text-xs text-muted-foreground mt-0.5 truncate pl-0.5 text-left">{abbreviateTeamName(pred.home_team)} vs {abbreviateTeamName(pred.away_team)}</p>
                                       </div>
                                     </CollapsibleTrigger>
                                     <CollapsibleContent>
                                       {!isExcluded2 && (
                                         <div className="px-2 pb-2 space-y-1">
                                           <p className="text-xs text-muted-foreground">
                                             {format(new Date(pred.match_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                           </p>
                                           <div className="flex items-center gap-2 flex-wrap">
                                             <span className="text-xs text-muted-foreground">
                                               Palpite: {pred.home_score_prediction} - {pred.away_score_prediction}
                                             </span>
                                             {pred.home_score !== null && pred.away_score !== null && (
                                               <span className="text-xs font-semibold">
                                                 | Placar: {pred.home_score} - {pred.away_score}
                                               </span>
                                             )}
                                           </div>
                                           {explanation && (
                                             <p className="text-xs font-medium text-foreground/80 italic">
                                               {explanation}
                                             </p>
                                           )}
                                         </div>
                                       )}
                                     </CollapsibleContent>
                                   </div>
                                 </Collapsible>
                               );
                             })
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
          {/* Prize explanation moved to top - see after champion highlight */}

          {/* Pagination */}
          {ranking.length > ITEMS_PER_PAGE && (() => {
            const totalPages = Math.ceil(ranking.length / ITEMS_PER_PAGE);
            return (
              <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm rounded-md border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="text-sm text-muted-foreground">
                  {currentPage} de {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm rounded-md border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Próximo
                </button>
              </div>
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
};

export default FootballRanking;