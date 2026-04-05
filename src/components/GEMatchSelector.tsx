import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar, Trophy, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { abbreviateTeamName } from "@/lib/team-utils";
import { ptBR } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GEMatch {
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  championship: string;
  externalId: string;
  round: string;
  homeTeamCrest?: string;
  awayTeamCrest?: string;
  champCode?: string;
}

interface GEMatchSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMatchesSelected: (matches: GEMatch[]) => void;
}

type FilterMode = 'championship' | 'day';

const CHAMP_LABELS: Record<string, { label: string; emoji: string }> = {
  'bsa': { label: 'Brasileirão', emoji: '🇧🇷' },
  'pau': { label: 'Paulistão', emoji: '🏟️' },
  'pa2': { label: 'Paulista A2', emoji: '🏟️' },
  'min': { label: 'Mineiro', emoji: '🏟️' },
  'car': { label: 'Carioca', emoji: '🏟️' },
  'gau': { label: 'Gaúcho', emoji: '🏟️' },
  'cea': { label: 'Cearense', emoji: '🏟️' },
  'par': { label: 'Paraense', emoji: '🏟️' },
  'per': { label: 'Pernambucano', emoji: '🏟️' },
  'ita': { label: 'Serie A 🇮🇹', emoji: '🇮🇹' },
  'fra': { label: 'Ligue 1 🇫🇷', emoji: '🇫🇷' },
  'pl': { label: 'Premier', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  'cl': { label: 'Champions', emoji: '🏆' },
  'wc': { label: 'Copa', emoji: '🌍' },
  'cdb': { label: 'Copa do Brasil', emoji: '🏆' },
  'lib': { label: 'Libertadores', emoji: '🏆' },
  'sul': { label: 'Sul-Americana', emoji: '🏆' },
};

export const GEMatchSelector = ({ open, onOpenChange, onMatchesSelected }: GEMatchSelectorProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [allMatches, setAllMatches] = useState<GEMatch[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<FilterMode>('day');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const fetchMatches = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-ge-matches');
      if (error) throw error;
      if (data?.error) {
        toast({ title: "Erro na API", description: data.error, variant: "destructive" });
        return;
      }

      if (data?.championships && data.championships.length > 0) {
        const now = new Date();
        const todayKey = format(now, 'yyyy-MM-dd');
        const flatMatches: GEMatch[] = [];

        data.championships.forEach((champ: any) => {
          champ.rounds?.forEach((round: any) => {
            round.matches?.forEach((match: any) => {
              const matchDate = new Date(match.matchDate);
              if (format(matchDate, 'yyyy-MM-dd') < todayKey) return;
              flatMatches.push({ ...match, champCode: champ.id });
            });
          });
        });

        flatMatches.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
        setAllMatches(flatMatches);
      } else {
        toast({
          title: "Nenhum campeonato encontrado",
          description: data?.message || "Não há jogos disponíveis no momento.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao buscar jogos",
        description: error instanceof Error ? error.message : "Não foi possível carregar os jogos.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && allMatches.length === 0) fetchMatches();
    onOpenChange(newOpen);
  };

  useEffect(() => {
    if (open && allMatches.length === 0 && !loading) fetchMatches();
  }, [open]);

  // Derive available championships
  const availableChamps = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number }>();
    allMatches.forEach(m => {
      const code = m.champCode || '';
      if (!map.has(code)) {
        map.set(code, { code, name: m.championship, count: 0 });
      }
      map.get(code)!.count++;
    });
    return Array.from(map.values());
  }, [allMatches]);

  // Derive available days
  const availableDays = useMemo(() => {
    const map = new Map<string, { key: string; display: string; count: number }>();
    allMatches.forEach(m => {
      const key = format(new Date(m.matchDate), 'yyyy-MM-dd');
      if (!map.has(key)) {
        const display = format(new Date(m.matchDate + 'Z'.replace('Z', '')), "EEE, dd/MM", { locale: ptBR });
        map.set(key, { key, display, count: 0 });
      }
      map.get(key)!.count++;
    });
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [allMatches]);

  // Group all matches by the selected mode
  const groupedMatches = useMemo(() => {
    if (filterMode === 'day') {
      // Group by day, sub-group by championship
      const dayMap = new Map<string, { display: string; matches: GEMatch[] }>();
      allMatches.forEach(m => {
        const key = format(new Date(m.matchDate), 'yyyy-MM-dd');
        if (!dayMap.has(key)) {
          dayMap.set(key, {
            display: format(new Date(m.matchDate), "EEE, dd/MM", { locale: ptBR }),
            matches: [],
          });
        }
        dayMap.get(key)!.matches.push(m);
      });
      return Array.from(dayMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, val]) => ({ key, label: val.display, count: val.matches.length, matches: val.matches }));
    } else {
      // Group by championship
      const champMap = new Map<string, { code: string; name: string; matches: GEMatch[] }>();
      allMatches.forEach(m => {
        const code = m.champCode || '';
        if (!champMap.has(code)) {
          champMap.set(code, { code, name: m.championship, matches: [] });
        }
        champMap.get(code)!.matches.push(m);
      });
      return Array.from(champMap.values()).map(val => {
        const info = CHAMP_LABELS[val.code];
        return {
          key: val.code,
          label: info ? `${info.emoji} ${info.label}` : val.name,
          count: val.matches.length,
          matches: val.matches,
        };
      });
    }
  }, [allMatches, filterMode]);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Auto-expand first section
  useEffect(() => {
    if (groupedMatches.length > 0 && expandedSections.size === 0) {
      setExpandedSections(new Set([groupedMatches[0].key]));
    }
  }, [groupedMatches]);
  const toggleMatch = (externalId: string, matchDate: string) => {
    const matchTime = new Date(matchDate);
    const now = new Date();
    const minutesUntilMatch = (matchTime.getTime() - now.getTime()) / (1000 * 60);
    if (minutesUntilMatch < 300) {
      toast({ variant: "destructive", title: "Jogo não disponível", description: "Jogos que começam em menos de 5 horas não podem ser adicionados." });
      return;
    }
    const newSelected = new Set(selectedMatches);
    if (newSelected.has(externalId)) newSelected.delete(externalId);
    else newSelected.add(externalId);
    setSelectedMatches(newSelected);
    onMatchesSelected(allMatches.filter(m => newSelected.has(m.externalId)));
  };

  const handleClearAll = () => {
    setSelectedMatches(new Set());
    onMatchesSelected([]);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl h-[90vh] sm:h-auto sm:max-h-[85vh] flex flex-col p-3 sm:p-6 overflow-hidden">
        <DialogHeader>
          <DialogTitle>⚽ Selecione os Jogos</DialogTitle>
          <DialogDescription>
            Filtre por dia ou campeonato e selecione os jogos do bolão.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : allMatches.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Nenhum jogo disponível no momento
          </div>
        ) : (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            {/* Mode toggle */}
            <div className="flex items-center gap-2">
              <Button
                variant={filterMode === 'day' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setFilterMode('day'); setExpandedSections(new Set()); }}
                className="gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5" />
                Por Dia
              </Button>
              <Button
                variant={filterMode === 'championship' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setFilterMode('championship'); setExpandedSections(new Set()); }}
                className="gap-1.5"
              >
                <Trophy className="w-3.5 h-3.5" />
                Por Campeonato
              </Button>
            </div>

            {/* Expandable list */}
            <ScrollArea className="flex-1 min-h-0" style={{ maxHeight: 'calc(90vh - 200px)' }}>
              <div className="space-y-1 pr-2">
                {groupedMatches.map(group => {
                  const isExpanded = expandedSections.has(group.key);
                  const selectedInGroup = group.matches.filter(m => selectedMatches.has(m.externalId)).length;

                  return (
                    <div key={group.key} className="border rounded-lg overflow-hidden">
                      {/* Section header */}
                      <button
                        onClick={() => toggleSection(group.key)}
                        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${isExpanded ? '' : '-rotate-90'}`} />
                          <span className="text-sm font-medium capitalize truncate">{group.label}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">({group.count})</span>
                        </div>
                        {selectedInGroup > 0 && (
                          <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 flex-shrink-0 ml-1">
                            {selectedInGroup}
                          </span>
                        )}
                      </button>

                      {/* Matches inside */}
                      {isExpanded && (
                        <div className="divide-y divide-border">
                          {group.matches.map(match => {
                            const matchTime = new Date(match.matchDate);
                            const now = new Date();
                            const minutesUntilMatch = (matchTime.getTime() - now.getTime()) / (1000 * 60);
                            const isUnavailable = minutesUntilMatch < 300;
                            const champInfo = CHAMP_LABELS[match.champCode || ''];

                            return (
                              <div
                                key={match.externalId}
                                className={`flex items-center gap-2.5 px-3 py-2 transition-colors ${
                                  isUnavailable
                                    ? 'opacity-50 cursor-not-allowed'
                                    : selectedMatches.has(match.externalId)
                                      ? 'bg-primary/5 cursor-pointer'
                                      : 'cursor-pointer hover:bg-muted/30'
                                }`}
                                onClick={() => !isUnavailable && toggleMatch(match.externalId, match.matchDate)}
                              >
                                <Checkbox
                                  checked={selectedMatches.has(match.externalId)}
                                  disabled={isUnavailable}
                                  onCheckedChange={() => !isUnavailable && toggleMatch(match.externalId, match.matchDate)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0 flex-wrap">
                                      {match.homeTeamCrest && (
                                        <img src={match.homeTeamCrest} alt="" className="w-5 h-5 object-contain flex-shrink-0" onError={e => { e.currentTarget.style.display = 'none'; }} />
                                      )}
                                      <span className="font-medium text-xs sm:text-sm truncate">{abbreviateTeamName(match.homeTeam)}</span>
                                      <span className="text-muted-foreground text-xs">x</span>
                                      <span className="font-medium text-xs sm:text-sm truncate">{abbreviateTeamName(match.awayTeam)}</span>
                                      {match.awayTeamCrest && (
                                        <img src={match.awayTeamCrest} alt="" className="w-5 h-5 object-contain flex-shrink-0" onError={e => { e.currentTarget.style.display = 'none'; }} />
                                      )}
                                    </div>
                                    <span className="text-xs text-muted-foreground ml-1 flex-shrink-0">
                                      {format(new Date(match.matchDate), "HH:mm")}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                                    {filterMode === 'day' && champInfo && (
                                      <span>{champInfo.emoji} {champInfo.label}</span>
                                    )}
                                    {filterMode === 'championship' && (
                                      <span>{format(new Date(match.matchDate), "dd/MM")}</span>
                                    )}
                                    <span>· {match.round}</span>
                                    {isUnavailable && <span className="text-destructive">⏰ Indisponível</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {groupedMatches.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum jogo encontrado
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="flex items-center gap-2 pt-2">
          <div className="flex-1 text-sm text-muted-foreground">
            {selectedMatches.size > 0 && `${selectedMatches.size} jogo(s) selecionado(s)`}
          </div>
          {selectedMatches.size > 0 && (
            <Button variant="outline" size="sm" onClick={handleClearAll}>
              Limpar
            </Button>
          )}
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
