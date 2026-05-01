import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TEAM_FLAGS, isWorldCupMatch, extractGroup } from "@/lib/world-cup-2026";

interface Match {
  id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  championship: string;
  home_team_crest?: string;
  away_team_crest?: string;
  status?: string;
}

interface Prediction {
  matchId: string;
  homeScore: string;
  awayScore: string;
}

interface WorldCupPredictionGridProps {
  matches: Match[];
  currentPredictions: Prediction[];
  activeSetIndex: number;
  onChange: (setIndex: number, matchId: string, field: 'homeScore' | 'awayScore', value: string) => void;
}

// Remove emoji prefixos e devolve nome limpo do time
const cleanTeamName = (name: string): { name: string; flag: string } => {
  // Tenta extrair o emoji do início ou fim
  const trimmed = name.trim();
  // Match emoji at start
  const startMatch = trimmed.match(/^(\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})*(?:\uFE0F)?)\s+(.+)$/u);
  if (startMatch) return { flag: startMatch[1], name: startMatch[2].trim() };
  // Match emoji at end
  const endMatch = trimmed.match(/^(.+?)\s+(\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})*(?:\uFE0F)?)$/u);
  if (endMatch) return { flag: endMatch[2], name: endMatch[1].trim() };
  // Fallback: usa map por nome
  return { flag: TEAM_FLAGS[trimmed] || '', name: trimmed };
};

export const WorldCupPredictionGrid = ({
  matches,
  currentPredictions,
  activeSetIndex,
  onChange,
}: WorldCupPredictionGridProps) => {
  const grouped = useMemo(() => {
    const map = new Map<string, Match[]>();
    matches.forEach((m) => {
      const g = extractGroup(m.championship) || '?';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(m);
    });
    // Ordena cada grupo por data
    map.forEach((arr) =>
      arr.sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime()),
    );
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [matches]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleGroup = (g: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  const allCollapsed = grouped.length > 0 && collapsed.size === grouped.length;
  const toggleAll = () => {
    if (allCollapsed) setCollapsed(new Set());
    else setCollapsed(new Set(grouped.map(([g]) => g)));
  };

  return (
    <div className="space-y-3">
      {grouped.length > 1 && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleAll}
            className="h-7 text-xs"
          >
            {allCollapsed ? (
              <>
                <ChevronDown className="h-3.5 w-3.5 mr-1" /> Expandir todos
              </>
            ) : (
              <>
                <ChevronUp className="h-3.5 w-3.5 mr-1" /> Minimizar todos
              </>
            )}
          </Button>
        </div>
      )}
      {grouped.map(([group, groupMatches]) => {
        const isCollapsed = collapsed.has(group);
        const filledCount = groupMatches.filter((mm) => {
          const p = currentPredictions.find((pp) => pp.matchId === mm.id);
          return p && p.homeScore !== '' && p.awayScore !== '';
        }).length;
        const totalCount = groupMatches.length;
        const allFilled = filledCount === totalCount;

        return (
        <Card key={group} className="overflow-hidden">
          <CardHeader
            className="pb-2 pt-3 px-3 sm:px-4 bg-primary/10 border-b border-primary/20 cursor-pointer hover:bg-primary/15 transition-colors"
            onClick={() => toggleGroup(group)}
          >
            <CardTitle className="text-sm sm:text-base flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                {isCollapsed ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                )}
                <span>🏆 Grupo {group}</span>
              </span>
              <Badge
                variant={allFilled ? 'default' : 'outline'}
                className="text-[10px] whitespace-nowrap"
              >
                {filledCount} de {totalCount} preenchidos
              </Badge>
            </CardTitle>
          </CardHeader>
          {!isCollapsed && (
          <CardContent className="p-2 sm:p-3 space-y-2">
            {groupMatches.map((match, idx) => {
              const prediction = currentPredictions.find((p) => p.matchId === match.id);
              const isPostponed =
                match.status === 'postponed' ||
                match.status === 'cancelled' ||
                match.status === 'abandoned';
              const home = cleanTeamName(match.home_team);
              const away = cleanTeamName(match.away_team);
              const matchDate = new Date(match.match_date);

              return (
                <div
                  key={match.id}
                  className={`rounded-md border ${
                    isPostponed ? 'opacity-50 bg-muted/30' : 'bg-background hover:bg-muted/20'
                  } ${idx > 0 ? '' : ''} px-2 py-2 transition-colors`}
                >
                  {/* Date row */}
                  <div className="text-[10px] text-muted-foreground mb-1.5 flex items-center justify-between">
                    <span className="truncate">
                      {format(matchDate, "EEE, dd/MM 'às' HH:mm", { locale: ptBR })}
                    </span>
                    {isPostponed && (
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
                        Anulado
                      </Badge>
                    )}
                  </div>

                  {/* Match row: nome | bandeira + input + x + input + bandeira | nome */}
                  <div className="flex items-center gap-1 sm:gap-2">
                    {/* Home name */}
                    <div className="flex-1 min-w-0 text-right">
                      <span className="text-xs sm:text-sm font-medium break-words leading-tight block">
                        {home.name}
                      </span>
                    </div>

                    {/* Center: flag + input + x + input + flag */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-base sm:text-lg flex-shrink-0">{home.flag}</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="99"
                        placeholder={isPostponed ? '—' : '0'}
                        value={prediction?.homeScore || ''}
                        onChange={(e) =>
                          onChange(activeSetIndex, match.id, 'homeScore', e.target.value)
                        }
                        disabled={isPostponed}
                        className="w-10 sm:w-12 h-9 text-center text-base font-semibold p-0 px-1"
                      />
                      <span className="text-muted-foreground text-xs font-bold">×</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="99"
                        placeholder={isPostponed ? '—' : '0'}
                        value={prediction?.awayScore || ''}
                        onChange={(e) =>
                          onChange(activeSetIndex, match.id, 'awayScore', e.target.value)
                        }
                        disabled={isPostponed}
                        className="w-10 sm:w-12 h-9 text-center text-base font-semibold p-0 px-1"
                      />
                      <span className="text-base sm:text-lg flex-shrink-0">{away.flag}</span>
                    </div>

                    {/* Away name */}
                    <div className="flex-1 min-w-0 text-left">
                      <span className="text-xs sm:text-sm font-medium break-words leading-tight block">
                        {away.name}
                      </span>
                    </div>
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

export const isWorldCupPool = (matches: { championship: string }[]): boolean => {
  if (matches.length === 0) return false;
  // Pool é "Copa" se a maioria dos jogos é de Copa do Mundo 2026
  const wcCount = matches.filter((m) => isWorldCupMatch(m.championship)).length;
  return wcCount >= matches.length / 2;
};
