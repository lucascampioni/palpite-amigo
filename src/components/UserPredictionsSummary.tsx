import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { TEAM_FLAG_CODES, extractGroup, getFlagUrl, hasAllWorldCupGroupMatches } from "@/lib/world-cup-2026";

interface PredictionItem {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homePred: number;
  awayPred: number;
  homeTeamCrest?: string | null;
  awayTeamCrest?: string | null;
  matchDate: string;
  championship?: string | null;
}

interface UserPredictionsSummaryProps {
  poolId: string;
  participantId: string;
}

interface FootballMatchRecord {
  id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  home_team_crest: string | null;
  away_team_crest: string | null;
  status: string | null;
  championship: string | null;
  external_source: string | null;
  external_id: string | null;
}

interface FootballPredictionRecord {
  match_id: string;
  home_score_prediction: number;
  away_score_prediction: number;
  prediction_set: number | null;
  football_matches: FootballMatchRecord | null;
}

interface CrestResult {
  id: string;
  homeTeamCrest?: string | null;
  awayTeamCrest?: string | null;
}

const teamCodeSet = new Set(Object.values(TEAM_FLAG_CODES));

const cleanTeamName = (team: string) => {
  const parts = team
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3F4}\u{E0061}-\u{E007A}\u{E007F}]/gu, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  while (parts.length && teamCodeSet.has(parts[0].toLowerCase())) parts.shift();
  while (parts.length && teamCodeSet.has(parts[parts.length - 1].toLowerCase())) parts.pop();

  return parts.join(" ").trim() || team.trim();
};

const getTeamImage = (team: string, crest?: string | null) => crest || getFlagUrl(cleanTeamName(team));

const PredictionRow = ({ pred }: { pred: PredictionItem }) => {
  const homeName = cleanTeamName(pred.homeTeam);
  const awayName = cleanTeamName(pred.awayTeam);
  const homeImage = getTeamImage(pred.homeTeam, pred.homeTeamCrest);
  const awayImage = getTeamImage(pred.awayTeam, pred.awayTeamCrest);

  return (
    <div className="flex items-center gap-2 text-xs p-2 rounded bg-background border">
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {homeImage && (
          <img src={homeImage} alt="" className="w-4 h-4 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        )}
        <span className="truncate">{homeName}</span>
      </div>
      <Badge variant="secondary" className="font-mono text-xs px-2 shrink-0">
        {pred.homePred} x {pred.awayPred}
      </Badge>
      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
        <span className="truncate text-right">{awayName}</span>
        {awayImage && (
          <img src={awayImage} alt="" className="w-4 h-4 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        )}
      </div>
    </div>
  );
};

const UserPredictionsSummary = ({ poolId, participantId }: UserPredictionsSummaryProps) => {
  const [sets, setSets] = useState<Record<number, PredictionItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'group' | 'chrono'>('chrono');

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
            id,
            home_team,
            away_team,
            match_date,
            home_team_crest,
            away_team_crest,
            status,
            championship,
            external_source,
            external_id
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
            championship: p.football_matches.championship,
          });
        }
        setSets(grouped);

        // Backfill missing crests via Football-Data API
        const needsCrests = (predictions as any[])
          .map(p => p.football_matches)
          .filter((m: any) => m && (!m.home_team_crest || !m.away_team_crest) && m.external_source === 'apifb' && (m.external_id || '').startsWith('fd_'));
        const seen = new Set<string>();
        const uniqueNeeds = needsCrests.filter((m: any) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        if (uniqueNeeds.length > 0) {
          try {
            const results = await Promise.all(uniqueNeeds.map(async (m: any) => {
              const apiMatchId = String((m.external_id || '').replace(/^fd_/, ''));
              const { data: crestData, error } = await supabase.functions.invoke('get-match-crests', {
                body: { matchId: apiMatchId }
              });
              if (error || !crestData) return null;
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
            if (crestMap.size > 0) {
              setSets(prev => {
                const next: Record<number, PredictionItem[]> = {};
                for (const [k, list] of Object.entries(prev)) {
                  next[Number(k)] = list.map(item => crestMap.has(item.matchId)
                    ? { ...item, homeTeamCrest: crestMap.get(item.matchId).homeTeamCrest, awayTeamCrest: crestMap.get(item.matchId).awayTeamCrest }
                    : item
                  );
                }
                return next;
              });
            }
          } catch (e) {
            console.warn('Falha ao enriquecer escudos:', e);
          }
        }
      }
      setLoading(false);
    };
    load();
  }, [participantId, poolId]);

  const isWC = useMemo(() => {
    const all = Object.values(sets).flat();
    if (all.length === 0) return false;
    return hasAllWorldCupGroupMatches(all.map(p => ({ championship: p.championship })));
  }, [sets]);

  // Default to "group" view if it's a World Cup pool
  useEffect(() => {
    if (isWC) setViewMode('group');
  }, [isWC]);

  if (loading) return <p className="text-xs text-muted-foreground">Carregando seus palpites...</p>;

  const setNumbers = Object.keys(sets).map(Number).sort();
  if (setNumbers.length === 0) return null;

  const renderByGroup = (preds: PredictionItem[]) => {
    const map = new Map<string, PredictionItem[]>();
    preds.forEach(p => {
      const g = extractGroup(p.championship) || '?';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(p);
    });
    const groups = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    return (
      <div className="space-y-1.5 pt-2 pl-1">
        {groups.map(([g, list]) => (
          <Collapsible key={g}>
            <CollapsibleTrigger className="w-full flex items-center justify-between p-2 rounded bg-primary/10 border border-primary/20 text-xs hover:bg-primary/15 transition-colors group">
              <span className="font-semibold">🏆 Grupo {g}</span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span>{list.length} jogos</span>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]:rotate-180" />
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-1.5 pt-1.5">
                {list.map(pred => <PredictionRow key={pred.matchId} pred={pred} />)}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-sm">📋 Seus Palpites</h4>
        {isWC && (
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'group' ? 'default' : 'ghost'}
              className="h-6 px-2 text-[10px]"
              onClick={() => setViewMode('group')}
            >
              Por grupo
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'chrono' ? 'default' : 'ghost'}
              className="h-6 px-2 text-[10px]"
              onClick={() => setViewMode('chrono')}
            >
              Cronológico
            </Button>
          </div>
        )}
      </div>
      {setNumbers.map(setNum => (
        <Collapsible key={setNum}>
          <CollapsibleTrigger className="w-full flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border text-sm hover:bg-muted/80 transition-colors group">
            <span className="font-medium">
              {setNumbers.length > 1 ? `Palpite ${setNum}` : 'Meus palpites'}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {viewMode === 'group' && isWC ? (
              renderByGroup(sets[setNum])
            ) : (
              <div className="space-y-1.5 pt-2 pl-1">
                {sets[setNum].map(pred => <PredictionRow key={pred.matchId} pred={pred} />)}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
};

export default UserPredictionsSummary;
