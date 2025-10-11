import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
}

interface GEMatchSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMatchesSelected: (matches: GEMatch[]) => void;
}

export const GEMatchSelector = ({ open, onOpenChange, onMatchesSelected }: GEMatchSelectorProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<GEMatch[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());

  const fetchMatches = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-ge-matches', {
        body: { championship: 'Brasileirão Série A' }
      });

      if (error) throw error;

      if (data?.matches && data.matches.length > 0) {
        setMatches(data.matches);
      } else {
        toast({
          title: "Nenhum jogo encontrado",
          description: "Não há jogos disponíveis no momento.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error fetching GE matches:', error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar jogos",
        description: "Não foi possível carregar os jogos do Globo Esporte.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && matches.length === 0) {
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
    const selected = matches.filter(m => selectedMatches.has(m.externalId));
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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>⚽ Jogos do Globo Esporte</DialogTitle>
          <DialogDescription>
            Selecione os jogos que você quer incluir no seu bolão. Os resultados serão atualizados automaticamente.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum jogo disponível no momento
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((match) => (
              <Card 
                key={match.externalId}
                className={`cursor-pointer transition-colors ${
                  selectedMatches.has(match.externalId) ? 'border-primary bg-primary/5' : ''
                }`}
                onClick={() => toggleMatch(match.externalId)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedMatches.has(match.externalId)}
                      onCheckedChange={() => toggleMatch(match.externalId)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-lg">
                          {match.homeTeam} x {match.awayTeam}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>🏆 {match.championship}</span>
                        <span>📅 {format(new Date(match.matchDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={selectedMatches.size === 0}
          >
            Adicionar {selectedMatches.size > 0 && `(${selectedMatches.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};