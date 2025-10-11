import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Trash2, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { GEMatchSelector } from "@/components/GEMatchSelector";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { z } from "zod";

const footballPoolSchema = z.object({
  title: z.string().trim().min(1, "Título é obrigatório").max(200, "Título muito longo"),
  description: z.string().trim().max(2000, "Descrição muito longa").optional(),
  pixKey: z.string().trim().max(100, "Chave PIX muito longa").optional(),
  entryFee: z.string().optional(),
  maxParticipants: z.string().optional(),
});

const createValidationSchema = (entryFee: string, pixKey: string) => {
  const hasEntryFee = entryFee && parseFloat(entryFee) > 0;
  
  if (hasEntryFee && !pixKey.trim()) {
    throw new Error("Chave PIX é obrigatória quando há valor de entrada");
  }
  
  return footballPoolSchema.parse({ title: "", description: "", pixKey, entryFee, maxParticipants: "" });
};

interface Match {
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  championship: string;
  externalId?: string;
  externalSource?: string;
  round?: string;
  homeTeamCrest?: string;
  awayTeamCrest?: string;
}

const CreateFootballPool = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isOfficial, setIsOfficial] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Check if user is admin
    const checkAdmin = async () => {
      const { data, error } = await supabase.rpc('is_app_admin');
      if (!error && data) {
        setIsAdmin(true);
      }
    };
    checkAdmin();
  }, []);
  const [showGESelector, setShowGESelector] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
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
    const entryFee = formData.get("entry_fee") as string;
    const maxParticipants = formData.get("max_participants") as string;

    // Validate input
    try {
      footballPoolSchema.parse({ title, description, pixKey, entryFee, maxParticipants });
      
      // Additional validation for PIX key when entry fee is present
      const hasEntryFee = entryFee && parseFloat(entryFee) > 0;
      if (hasEntryFee && !pixKey.trim()) {
        throw new Error("Chave PIX é obrigatória quando há valor de entrada");
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Erro de validação",
          description: error.errors[0].message,
        });
        setLoading(false);
        return;
      } else if (error instanceof Error) {
        toast({
          variant: "destructive",
          title: "Erro de validação",
          description: error.message,
        });
        setLoading(false);
        return;
      }
    }

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
        scoring_system: 'exact_only',
        entry_fee: entryFee ? parseFloat(entryFee) : null,
        max_participants: maxParticipants && maxParticipants !== "unlimited" ? parseInt(maxParticipants) : null,
        is_official: isOfficial,
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
      home_team_crest: match.homeTeamCrest || null,
      away_team_crest: match.awayTeamCrest || null,
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
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Descreva o bolão e suas regras..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Prazo para Apostas</Label>
                <div className="p-3 rounded-lg border bg-muted/50">
                  {deadline ? (
                    <>
                      <p className="text-sm font-medium">
                        📅 {format(new Date(deadline), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        30 minutos antes do primeiro jogo
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      O horário limite das apostas será 30min antes do início do jogo mais cedo dos escolhidos
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entry_fee">Valor de Entrada (opcional)</Label>
                  <Input
                    id="entry_fee"
                    name="entry_fee"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 10.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_participants">Máx. de Participantes</Label>
                  <select
                    id="max_participants"
                    name="max_participants"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="unlimited">Ilimitado</option>
                    <option value="5">5 participantes</option>
                    <option value="10">10 participantes</option>
                    <option value="20">20 participantes</option>
                    <option value="50">50 participantes</option>
                    <option value="100">100 participantes</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pix_key">
                  Chave PIX {(document.getElementById('entry_fee') as HTMLInputElement)?.value && parseFloat((document.getElementById('entry_fee') as HTMLInputElement).value) > 0 ? '*' : '(opcional)'}
                </Label>
                <Input
                  id="pix_key"
                  name="pix_key"
                  placeholder="Digite sua chave PIX para receber pagamentos"
                />
                <p className="text-xs text-muted-foreground">
                  * Obrigatório se houver valor de entrada
                </p>
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

              {isAdmin && (
                <div className="flex items-center justify-between rounded-lg border p-4 bg-primary/5">
                  <div className="space-y-0.5">
                    <Label htmlFor="is-official-football">⭐ Bolão Oficial</Label>
                    <p className="text-sm text-muted-foreground">
                      Marcar como bolão oficial do app (visível apenas para admin)
                    </p>
                  </div>
                  <Switch
                    id="is-official-football"
                    checked={isOfficial}
                    onCheckedChange={setIsOfficial}
                  />
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-lg">Jogos do Bolão</Label>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => setShowGESelector(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Jogos
                  </Button>
                </div>

                {matches.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-12 text-center">
                      <p className="text-muted-foreground">
                        Nenhum jogo selecionado ainda
                      </p>
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
                              <div className="flex items-center gap-2">
                                {match.homeTeamCrest && (
                                  <img 
                                    src={match.homeTeamCrest} 
                                    alt={match.homeTeam}
                                    className="w-6 h-6 object-contain"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                )}
                                <span className="font-semibold text-lg">{match.homeTeam}</span>
                                <span className="text-muted-foreground">x</span>
                                <span className="font-semibold text-lg">{match.awayTeam}</span>
                                {match.awayTeamCrest && (
                                  <img 
                                    src={match.awayTeamCrest} 
                                    alt={match.awayTeam}
                                    className="w-6 h-6 object-contain"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                )}
                              </div>
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
