import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { abbreviateTeamName } from "@/lib/team-utils";
import { ptBR } from "date-fns/locale";

interface GEMatch {
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  championship: string;
  externalId: string;
  round: string;
  homeTeamCrest?: string;
  awayTeamCrest?: string;
}

interface DayGroup {
  date: string;
  displayDate: string;
  matches: GEMatch[];
}

interface Championship {
  id: string;
  name: string;
  days: DayGroup[];
}

interface GEMatchSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMatchesSelected: (matches: GEMatch[]) => void;
}

export const GEMatchSelector = ({ open, onOpenChange, onMatchesSelected }: GEMatchSelectorProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());

  const fetchMatches = async () => {
    setLoading(true);
    try {
      console.log('🎯 Calling fetch-ge-matches edge function...');
      const { data, error } = await supabase.functions.invoke('fetch-ge-matches');

      console.log('📡 Response received:', { data, error });

      if (error) {
        console.error('❌ Supabase function error:', error);
        throw error;
      }

      if (data?.error) {
        console.error('❌ Function returned error:', data.error);
        toast({
          title: "Erro na API",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      if (data?.championships && data.championships.length > 0) {
        console.log(`✅ Found ${data.championships.length} championships`);
        
        // Reorganize by day instead of round
        const now = new Date();
        const todayKey = format(now, 'yyyy-MM-dd');

        const reorganizedChampionships = data.championships
          .map((champ: any) => {
            const dayMap = new Map<string, GEMatch[]>();
            
            // Flatten all matches from all rounds, only keep future matches
            champ.rounds?.forEach((round: any) => {
              round.matches?.forEach((match: any) => {
                const matchDate = new Date(match.matchDate);
                // Skip past matches (before today)
                if (format(matchDate, 'yyyy-MM-dd') < todayKey) return;
                
                const dateKey = format(matchDate, 'yyyy-MM-dd');
                if (!dayMap.has(dateKey)) {
                  dayMap.set(dateKey, []);
                }
                dayMap.get(dateKey)!.push(match);
              });
            });
            
            // Convert to array and sort by date
            const days: DayGroup[] = Array.from(dayMap.entries())
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([date, matches]) => ({
                date,
                displayDate: format(new Date(date + "T12:00:00"), "EEEE, dd/MM/yyyy", { locale: ptBR }),
                matches: matches.sort((a, b) => 
                  new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime()
                ),
              }));
            
            return {
              id: champ.id,
              name: champ.name,
              days,
            };
          })
          // Remove championships with no future matches
          .filter((champ: Championship) => champ.days.length > 0);
        
        console.log(`✅ Reorganized into days, ${reorganizedChampionships.length} championships with future matches`);
        setChampionships(reorganizedChampionships);
      } else {
        console.log('⚠️ No championships in response');
        toast({
          title: "Nenhum campeonato encontrado",
          description: data?.message || "Não há jogos disponíveis no momento.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Error fetching matches:', error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar jogos",
        description: error instanceof Error ? error.message : "Não foi possível carregar os jogos. Verifique sua API key da API-FOOTBALL.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && championships.length === 0) {
      fetchMatches();
    }
    onOpenChange(newOpen);
  };

  // Ensure we fetch when parent opens the dialog programmatically
  useEffect(() => {
    if (open && championships.length === 0 && !loading) {
      fetchMatches();
    }
  }, [open]);

  const toggleMatch = (externalId: string, matchDate: string) => {
    // Check if match starts in less than 30 minutes
    const matchTime = new Date(matchDate);
    const now = new Date();
    const minutesUntilMatch = (matchTime.getTime() - now.getTime()) / (1000 * 60);
    
    if (minutesUntilMatch < 300) {
      toast({
        variant: "destructive",
        title: "Jogo não disponível",
        description: "Não é possível adicionar jogos que começam em menos de 5 horas ou já iniciaram.",
      });
      return;
    }
    
    const newSelected = new Set(selectedMatches);
    if (newSelected.has(externalId)) {
      newSelected.delete(externalId);
    } else {
      newSelected.add(externalId);
    }
    setSelectedMatches(newSelected);
    
    // Automatically update parent with current selection
    const selected: GEMatch[] = [];
    championships.forEach(champ => {
      champ.days.forEach(day => {
        day.matches.forEach(match => {
          if (newSelected.has(match.externalId)) {
            selected.push(match);
          }
        });
      });
    });
    onMatchesSelected(selected);
  };

  const handleClearAll = () => {
    setSelectedMatches(new Set());
    onMatchesSelected([]);
    toast({
      title: "Seleção limpa",
      description: "Todos os jogos foram removidos.",
    });
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[85vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle>⚽ Selecione os Jogos</DialogTitle>
          <DialogDescription>
            Escolha o campeonato, rodada e os jogos que você quer incluir no seu bolão.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : championships.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Nenhum campeonato disponível no momento
          </div>
        ) : (
          <Tabs defaultValue={championships[0]?.id} className="w-full">
            <TabsList className="w-full flex flex-wrap gap-1 h-auto p-1">
              {championships.map((champ) => {
                const champLabels: Record<string, string> = {
                  'bsa': '🇧🇷 Série A',
                  'pau': '🏟️ Paulistão',
                  'pa2': '🏟️ Paulista A2',
                  'min': '🏟️ Mineiro',
                  'car': '🏟️ Carioca',
                  'pl': '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier',
                  'cl': '🏆 Champions',
                  'wc': '🌍 Copa',
                };
                const label = champLabels[champ.id] || champ.name;
                return (
                  <TabsTrigger key={champ.id} value={champ.id} className="min-w-0 text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 whitespace-nowrap">
                    {label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {championships.map((champ) => (
              <TabsContent key={champ.id} value={champ.id} className="mt-4">
                <Accordion type="single" collapsible className="w-full">
                  {champ.days.map((day, index) => (
                    <AccordionItem key={`${champ.id}-${day.date}`} value={`day-${index}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-4">
                          <span className="font-semibold capitalize">{day.displayDate}</span>
                          <span className="text-sm text-muted-foreground">
                            {day.matches.length} jogos
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-2">
                          {day.matches.map((match) => {
                            const matchTime = new Date(match.matchDate);
                            const now = new Date();
                            const minutesUntilMatch = (matchTime.getTime() - now.getTime()) / (1000 * 60);
                            const isUnavailable = minutesUntilMatch < 300;
                            
                            return (
                              <Card 
                                key={match.externalId}
                                className={`transition-colors ${
                                  isUnavailable 
                                    ? 'opacity-50 cursor-not-allowed' 
                                    : selectedMatches.has(match.externalId) 
                                      ? 'border-primary bg-primary/5 cursor-pointer' 
                                      : 'cursor-pointer'
                                }`}
                                onClick={() => !isUnavailable && toggleMatch(match.externalId, match.matchDate)}
                              >
                                <CardContent className="py-3 px-4">
                                  <div className="flex items-center gap-3">
                                    <Checkbox
                                      checked={selectedMatches.has(match.externalId)}
                                      disabled={isUnavailable}
                                      onCheckedChange={() => !isUnavailable && toggleMatch(match.externalId, match.matchDate)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1 gap-1">
                                      <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0 flex-wrap">
                                        {match.homeTeamCrest && (
                                          <img 
                                            src={match.homeTeamCrest} 
                                            alt={match.homeTeam}
                                            className="w-5 h-5 sm:w-6 sm:h-6 object-contain flex-shrink-0"
                                            onError={(e) => {
                                              e.currentTarget.style.display = 'none';
                                            }}
                                          />
                                        )}
                                        <span className="font-medium text-xs sm:text-sm truncate">{abbreviateTeamName(match.homeTeam)}</span>
                                        <span className="text-muted-foreground text-xs">x</span>
                                        <span className="font-medium text-xs sm:text-sm truncate">{abbreviateTeamName(match.awayTeam)}</span>
                                        {match.awayTeamCrest && (
                                          <img 
                                            src={match.awayTeamCrest} 
                                            alt={match.awayTeam}
                                            className="w-5 h-5 sm:w-6 sm:h-6 object-contain flex-shrink-0"
                                            onError={(e) => {
                                              e.currentTarget.style.display = 'none';
                                            }}
                                          />
                                        )}
                                      </div>
                                      <span className="text-xs sm:text-sm text-muted-foreground ml-1 flex-shrink-0">
                                        {format(new Date(match.matchDate), "HH:mm", { locale: ptBR })}
                                      </span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      📍 {match.round}
                                      {isUnavailable && <span className="ml-2 text-destructive">⏰ Indisponível</span>}
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>
            ))}
          </Tabs>
        )}

        <DialogFooter className="flex items-center gap-2">
          <div className="flex-1 text-sm text-muted-foreground">
            {selectedMatches.size > 0 && `${selectedMatches.size} jogo(s) selecionado(s)`}
          </div>
          {selectedMatches.size > 0 && (
            <Button variant="outline" onClick={handleClearAll}>
              Limpar Tudo
            </Button>
          )}
          <Button onClick={handleClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};