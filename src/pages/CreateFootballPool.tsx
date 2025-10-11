import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { GEMatchSelector } from "@/components/GEMatchSelector";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Match {
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  championship: string;
  externalId?: string;
  externalSource?: string;
  round?: string;
}

const CreateFootballPool = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [showGESelector, setShowGESelector] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [scoringSystem, setScoringSystem] = useState<'standard' | 'exact_only'>('standard');
  const [deadline, setDeadline] = useState<string>("");

  const handleAddMatch = () => {
    // Removed - now only API matches are allowed
  };

  const handleRemoveMatch = (index: number) => {
    setMatches(matches.filter((_, i) => i !== index));
  };

  const handleMatchChange = (index: number, field: keyof Match, value: string) => {
    // Removed - API matches can't be edited
  };

  const handleGEMatchesSelected = (geMatches: Match[]) => {
    const matchesWithSource = geMatches.map(m => ({
      ...m,
      externalSource: 'apifb' as const
    }));
    
    setMatches(matchesWithSource);
    
    // Calculate deadline: 30 minutes before first match
    if (matchesWithSource.length > 0) {
      const sortedMatches = [...matchesWithSource].sort((a, b) => 
        new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime()
      );
      const firstMatch = sortedMatches[0];
      const firstMatchDate = new Date(firstMatch.matchDate);
      const deadlineDate = new Date(firstMatchDate.getTime() - 30 * 60 * 1000); // 30 minutes before
      
      // Format for datetime-local input
      const year = deadlineDate.getFullYear();
      const month = String(deadlineDate.getMonth() + 1).padStart(2, '0');
      const day = String(deadlineDate.getDate()).padStart(2, '0');
      const hours = String(deadlineDate.getHours()).padStart(2, '0');
      const minutes = String(deadlineDate.getMinutes()).padStart(2, '0');
      const formattedDeadline = `${year}-${month}-${day}T${hours}:${minutes}`;
      
      setDeadline(formattedDeadline);
    }
    
    toast({
      title: "Jogos adicionados!",
      description: `${geMatches.length} jogos foram adicionados ao bolão.`,
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const pixKey = formData.get("pix_key") as string;

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Você precisa estar logado para criar um bolão.",
      });
      setLoading(false);
      return;
    }

    // Validate matches
    const validMatches = matches.filter(m => m.homeTeam && m.awayTeam && m.matchDate && m.externalSource === 'apifb');
    if (validMatches.length === 0) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Selecione pelo menos um jogo.",
      });
      setLoading(false);
      return;
    }

    // Create pool
    const { data: pool, error: poolError } = await supabase
      .from("pools")
      .insert([{
        owner_id: user.id,
        title,
        description,
        guess_label: "Palpite dos placares",
        measurement_unit: "score" as any,
        deadline: new Date(deadline).toISOString(),
        status: "active" as any,
        pool_type: "football" as any,
        is_private: isPrivate,
        scoring_system: scoringSystem,
      }])
      .select()
      .single();

    if (poolError || !pool) {
      toast({
        variant: "destructive",
        title: "Erro ao criar bolão",
        description: poolError?.message,
      });
      setLoading(false);
      return;
    }

    // Save PIX key to separate payment info table if provided
    if (pixKey) {
      const { error: paymentError } = await supabase
        .from("pool_payment_info")
        .insert({
          pool_id: pool.id,
          pix_key: pixKey,
        });

      if (paymentError) {
        console.error("Error saving PIX key:", paymentError);
        // Don't block pool creation if PIX key save fails
      }
    }

    // Create matches
    const matchesData = validMatches.map(match => ({
      pool_id: pool.id,
      home_team: match.homeTeam,
      away_team: match.awayTeam,
      match_date: new Date(match.matchDate).toISOString(),
      championship: match.championship,
      status: "scheduled",
      external_id: match.externalId,
      external_source: 'apifb',
    }));

    const { error: matchesError } = await supabase
      .from("football_matches")
      .insert(matchesData);

    if (matchesError) {
      toast({
        variant: "destructive",
        title: "Erro ao criar jogos",
        description: matchesError.message,
      });
      // Delete the pool if matches creation failed
      await supabase.from("pools").delete().eq("id", pool.id);
    } else {
      toast({
        title: "Bolão de futebol criado!",
        description: "Seu bolão foi criado com sucesso.",
      });
      navigate(`/pool/${pool.id}`);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background p-4">
      <div className="max-w-2xl mx-auto pt-8 pb-16">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl flex items-center gap-2">
              ⚽ Criar Bolão de Futebol
            </CardTitle>
            <CardDescription>
              Configure seu bolão de jogos de futebol
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Título do Bolão *</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Ex: Brasileirão 2025 - Rodada 10"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição *</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Descreva o bolão, regras de pontuação, etc."
                  rows={4}
                  required
                />
              </div>

              {deadline && (
                <div className="space-y-2">
                  <Label>Prazo Final para Palpites</Label>
                  <div className="p-3 rounded-lg border bg-muted/50">
                    <p className="text-sm font-medium">
                      📅 {format(new Date(deadline), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      30 minutos antes do primeiro jogo
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="pix_key">Chave PIX (opcional)</Label>
                <Input
                  id="pix_key"
                  name="pix_key"
                  placeholder="Digite sua chave PIX para receber pagamentos"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="is-private">Bolão Privado</Label>
                  <p className="text-sm text-muted-foreground">
                    Se ativado, apenas pessoas com o link poderão acessar
                  </p>
                </div>
                <Switch
                  id="is-private"
                  checked={isPrivate}
                  onCheckedChange={setIsPrivate}
                />
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <Label>Sistema de Pontuação</Label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    scoringSystem === 'standard' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                  }`}>
                    <input
                      type="radio"
                      name="scoring"
                      value="standard"
                      checked={scoringSystem === 'standard'}
                      onChange={(e) => setScoringSystem(e.target.value as 'standard')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium mb-1">Sistema Completo (Padrão)</div>
                      <ul className="text-sm text-muted-foreground space-y-0.5">
                        <li>• 5 pontos: Placar exato</li>
                        <li>• 3 pontos: Resultado correto</li>
                        <li>• 1 ponto: Diferença de gols correta</li>
                      </ul>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    scoringSystem === 'exact_only' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                  }`}>
                    <input
                      type="radio"
                      name="scoring"
                      value="exact_only"
                      checked={scoringSystem === 'exact_only'}
                      onChange={(e) => setScoringSystem(e.target.value as 'exact_only')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium mb-1">Placar Exato Apenas</div>
                      <ul className="text-sm text-muted-foreground space-y-0.5">
                        <li>• 1 ponto: Apenas para placar exato</li>
                        <li>• 0 pontos: Qualquer outro resultado</li>
                      </ul>
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-lg">Jogos do Bolão</Label>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => setShowGESelector(true)}
                  >
                    ⚽ Selecionar Jogos
                  </Button>
                </div>

                {matches.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-12 text-center">
                      <p className="text-muted-foreground mb-4">
                        Nenhum jogo selecionado ainda
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowGESelector(true)}
                      >
                        ⚽ Selecionar Jogos
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {matches.map((match, index) => (
                      <Card key={index} className="relative border-primary/50 bg-primary/5">
                        <CardContent className="py-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute top-2 right-2"
                            onClick={() => handleRemoveMatch(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>

                          <div className="space-y-2 pr-10">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {match.championship}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-lg">
                                {match.homeTeam} <span className="text-muted-foreground">x</span> {match.awayTeam}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {match.round && <span>📍 {match.round}</span>}
                              <span>📅 {format(new Date(match.matchDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </>
                )}
              </div>

              <div className="bg-muted/50 p-4 rounded-lg text-sm space-y-2">
                <p className="font-semibold">⚡ Funcionalidades Automáticas:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Jogos são atualizados automaticamente</li>
                  <li>Resultados são sincronizados automaticamente</li>
                  <li>Pontuação dos participantes é calculada automaticamente</li>
                  <li>Vencedor é determinado ao final de todos os jogos</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/")}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? "Criando..." : "Criar Bolão"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <GEMatchSelector 
          open={showGESelector}
          onOpenChange={setShowGESelector}
          onMatchesSelected={handleGEMatchesSelected}
        />
      </div>
    </div>
  );
};

export default CreateFootballPool;
