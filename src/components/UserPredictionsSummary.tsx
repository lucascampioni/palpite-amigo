import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface PredictionItem {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homePred: number;
  awayPred: number;
  homeTeamCrest?: string | null;
  awayTeamCrest?: string | null;
  matchDate: string;
}

interface UserPredictionsSummaryProps {
  poolId: string;
  participantId: string;
}

const UserPredictionsSummary = ({ poolId, participantId }: UserPredictionsSummaryProps) => {
  const [sets, setSets] = useState<Record<number, PredictionItem[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: predictions } = await supabase
        .from("football_predictions")
        .select(`
          match_id,
          home_score_prediction,
          away_score_prediction,
          prediction_set,
          football_matches (
            home_team,
            away_team,
            match_date,
            home_team_crest,
            away_team_crest,
            status
          )
        `)
        .eq("participant_id", participantId)
        .order("football_matches(match_date)", { ascending: true });

      if (predictions) {
        const grouped: Record<number, PredictionItem[]> = {};
        for (const p of predictions as any[]) {
          const setNum = p.prediction_set || 1;
          if (!grouped[setNum]) grouped[setNum] = [];
          if (['postponed', 'cancelled', 'abandoned'].includes(p.football_matches.status)) continue;
          grouped[setNum].push({
            matchId: p.match_id,
            homeTeam: p.football_matches.home_team,
            awayTeam: p.football_matches.away_team,
            homePred: p.home_score_prediction,
            awayPred: p.away_score_prediction,
            homeTeamCrest: p.football_matches.home_team_crest,
            awayTeamCrest: p.football_matches.away_team_crest,
            matchDate: p.football_matches.match_date,
          });
        }
        setSets(grouped);
      }
      setLoading(false);
    };
    load();
  }, [participantId, poolId]);

  if (loading) return <p className="text-xs text-muted-foreground">Carregando seus palpites...</p>;

  const setNumbers = Object.keys(sets).map(Number).sort();
  if (setNumbers.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="font-semibold text-sm">📋 Seus Palpites</h4>
      {setNumbers.map(setNum => (
        <Collapsible key={setNum}>
          <CollapsibleTrigger className="w-full flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border text-sm hover:bg-muted/80 transition-colors group">
            <span className="font-medium">
              {setNumbers.length > 1 ? `Palpite ${setNum}` : 'Meus palpites'}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-1.5 pt-2 pl-1">
              {sets[setNum].map(pred => (
                <div key={pred.matchId} className="flex items-center gap-2 text-xs p-2 rounded bg-background border">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {pred.homeTeamCrest && (
                      <img src={pred.homeTeamCrest} alt="" className="w-4 h-4 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    )}
                    <span className="truncate">{pred.homeTeam}</span>
                  </div>
                  <Badge variant="secondary" className="font-mono text-xs px-2 shrink-0">
                    {pred.homePred} x {pred.awayPred}
                  </Badge>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                    <span className="truncate text-right">{pred.awayTeam}</span>
                    {pred.awayTeamCrest && (
                      <img src={pred.awayTeamCrest} alt="" className="w-4 h-4 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
};

export default UserPredictionsSummary;
