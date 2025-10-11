import { useState } from "react";
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
import { ptBR } from "date-fns/locale";

interface GEMatch {
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  championship: string;
  externalId: string;
  round: string;
}

interface Round {
  number: number;
  name: string;
  matches: GEMatch[];
}

interface Championship {
  id: string;
  name: string;
  rounds: Round[];
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
        data.championships.forEach((champ: Championship) => {
          console.log(`  - ${champ.name}: ${champ.rounds.length} rounds`);
        });
        setChampionships(data.championships);
      } else {
        console.log('⚠️ No championships in response');
        toast({
          title: "Nenhum campeonato encontrado",
          description: data?.message || "Não há jogos disponíveis no momento. Verifique sua API key da API-FOOTBALL.",
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

  const toggleMatch = (externalId: string) => {
    const newSelected = new Set(selectedMatches);
    if (newSelected.has(externalId)) {
      newSelected.delete(externalId);
    } else {
      newSelected.add(externalId);
    }
    setSelectedMatches(newSelected);
  };

  const handleConfirm = () => {
    const selected: GEMatch[] = [];
    championships.forEach(champ => {
      champ.rounds.forEach(round => {
        round.matches.forEach(match => {
          if (selectedMatches.has(match.externalId)) {
            selected.push(match);
          }
        });
      });
    });

    if (selected.length === 0) {
      toast({
        title: "Selecione pelo menos um jogo",
        variant: "destructive",
      });
      return;
    }
    
    onMatchesSelected(selected);
    onOpenChange(false);
    setSelectedMatches(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
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
            <TabsList className="w-full grid grid-cols-2">
              {championships.map((champ) => (
                <TabsTrigger key={champ.id} value={champ.id}>
                  {champ.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {championships.map((champ) => (
              <TabsContent key={champ.id} value={champ.id} className="mt-4">
                <Accordion type="single" collapsible className="w-full">
                  {champ.rounds.map((round) => (
                    <AccordionItem key={`${champ.id}-${round.number}`} value={`round-${round.number}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-4">
                          <span className="font-semibold">{round.name}</span>
                          <span className="text-sm text-muted-foreground">
                            {round.matches.length} jogos
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-2">
                          {round.matches.map((match) => (
                            <Card 
                              key={match.externalId}
                              className={`cursor-pointer transition-colors ${
                                selectedMatches.has(match.externalId) ? 'border-primary bg-primary/5' : ''
                              }`}
                              onClick={() => toggleMatch(match.externalId)}
                            >
                              <CardContent className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <Checkbox
                                    checked={selectedMatches.has(match.externalId)}
                                    onCheckedChange={() => toggleMatch(match.externalId)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium">
                                        {match.homeTeam} <span className="text-muted-foreground">x</span> {match.awayTeam}
                                      </span>
                                      <span className="text-sm text-muted-foreground">
                                        {format(new Date(match.matchDate), "dd/MM 'às' HH:mm", { locale: ptBR })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={selectedMatches.size === 0}
          >
            Adicionar ao Bolão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};