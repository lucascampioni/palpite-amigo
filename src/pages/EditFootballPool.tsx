import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Trash2, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { GEMatchSelector } from "@/components/GEMatchSelector";
import { PixKeyInput } from "@/components/PixKeyInput";
import { format } from "date-fns";

interface Match {
  id?: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  championship: string;
  externalId?: string;
  externalSource?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string;
  homeTeamCrest?: string;
  awayTeamCrest?: string;
}

const EditFootballPool = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: userRole, isLoading: isLoadingRole } = useUserRole();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [pool, setPool] = useState<any>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isOfficial, setIsOfficial] = useState(false);
  const [hasWhatsappGroup, setHasWhatsappGroup] = useState(false);
  const [scoringSystem, setScoringSystem] = useState<'standard' | 'exact_only'>('exact_only');
  const [showGESelector, setShowGESelector] = useState(false);
  const [deadline, setDeadline] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("unlimited");
  const [firstPlacePrize, setFirstPlacePrize] = useState("");
  const [secondPlacePrize, setSecondPlacePrize] = useState("");
  const [thirdPlacePrize, setThirdPlacePrize] = useState("");
  const [maxWinners, setMaxWinners] = useState<number>(3);
  const [prizeType, setPrizeType] = useState<'fixed' | 'percentage'>('fixed');

  const totalPercentage = prizeType === 'percentage'
    ? (parseFloat(firstPlacePrize) || 0) + (maxWinners >= 2 ? (parseFloat(secondPlacePrize) || 0) : 0) + (maxWinners >= 3 ? (parseFloat(thirdPlacePrize) || 0) : 0)
    : 0;
  const remainingPercentage = 100 - totalPercentage;

  useEffect(() => {
    if (!isLoadingRole && !userRole?.canCreatePools) {
      toast({
        variant: "destructive",
        title: "Acesso negado",
        description: "Apenas administradores podem editar bolões",
      });
      navigate("/");
    }
  }, [isLoadingRole, userRole, navigate, toast]);

  useEffect(() => {
    if (userRole?.canCreatePools) {
      loadPoolData();
    }
  }, [id, userRole]);

  const loadPoolData = async () => {
    setLoadingData(true);

    const { data: poolData, error: poolError } = await supabase
      .from("pools")
      .select("*")
      .eq("id", id)
      .single();

    if (poolError || !poolData) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Bolão não encontrado.",
      });
      navigate("/");
      return;
    }

    setPool(poolData);
    setTitle(poolData.title);
    setDescription(poolData.description || "");
    setIsPrivate(poolData.is_private);
    setIsOfficial(poolData.is_official || false);
    setHasWhatsappGroup(poolData.has_whatsapp_group || false);
    setScoringSystem((poolData.scoring_system || 'exact_only') as 'standard' | 'exact_only');
    setEntryFee(poolData.entry_fee ? poolData.entry_fee.toString() : "");
    setMaxParticipants(poolData.max_participants ? poolData.max_participants.toString() : "unlimited");
    setFirstPlacePrize(poolData.first_place_prize ? poolData.first_place_prize.toString() : "");
    setSecondPlacePrize(poolData.second_place_prize ? poolData.second_place_prize.toString() : "");
    setThirdPlacePrize(poolData.third_place_prize ? poolData.third_place_prize.toString() : "");
    setMaxWinners(poolData.max_winners || 3);
    setPrizeType((poolData.prize_type || 'fixed') as 'fixed' | 'percentage');
    
    // Format deadline for datetime-local input
    const deadlineDate = new Date(poolData.deadline);
    const year = deadlineDate.getFullYear();
    const month = String(deadlineDate.getMonth() + 1).padStart(2, '0');
    const day = String(deadlineDate.getDate()).padStart(2, '0');
    const hours = String(deadlineDate.getHours()).padStart(2, '0');
    const minutes = String(deadlineDate.getMinutes()).padStart(2, '0');
    setDeadline(`${year}-${month}-${day}T${hours}:${minutes}`);

    // Load PIX key
    const { data: paymentData } = await supabase
      .from("pool_payment_info")
      .select("pix_key")
      .eq("pool_id", id)
      .single();
    
    if (paymentData) {
      setPixKey(paymentData.pix_key || "");
    }

    // Load matches
    const { data: matchesData } = await supabase
      .from("football_matches")
      .select("*")
      .eq("pool_id", id)
      .order("match_date", { ascending: true });

    if (matchesData) {
      const formattedMatches = matchesData.map(m => ({
        id: m.id,
        homeTeam: m.home_team,
        awayTeam: m.away_team,
        matchDate: m.match_date,
        championship: m.championship,
        externalId: m.external_id,
        externalSource: m.external_source,
        homeScore: m.home_score,
        awayScore: m.away_score,
        status: m.status,
        homeTeamCrest: m.home_team_crest,
        awayTeamCrest: m.away_team_crest,
      }));
      setMatches(formattedMatches);
    }

    setLoadingData(false);
  };

  const handleRemoveMatch = async (index: number) => {
    const match = matches[index];
    
    if (match.id) {
      // Delete from database
      const { error } = await supabase
        .from("football_matches")
        .delete()
        .eq("id", match.id);

      if (error) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Não foi possível remover o jogo.",
        });
        return;
      }
    }

    setMatches(matches.filter((_, i) => i !== index));
    toast({
      title: "Jogo removido",
      description: "O jogo foi removido do bolão.",
    });
  };

  const handleGEMatchesSelected = (geMatches: Match[]) => {
    // Filter out matches that already exist in the pool (by externalId)
    const existingExternalIds = new Set(
      matches.filter(m => m.externalId).map(m => m.externalId)
    );
    
    const newUniqueMatches = geMatches
      .filter(m => !existingExternalIds.has(m.externalId))
      .map(m => ({
        ...m,
        externalSource: 'apifb' as const
      }));
    
    if (newUniqueMatches.length === 0 && geMatches.length > 0) {
      toast({
        title: "Jogos já adicionados",
        description: "Todos os jogos selecionados já estão no bolão.",
      });
      return;
    }
    
    setMatches([...matches, ...newUniqueMatches]);
    
    const skipped = geMatches.length - newUniqueMatches.length;
    toast({
      title: "Jogos adicionados!",
      description: `${newUniqueMatches.length} jogo(s) adicionado(s)${skipped > 0 ? ` (${skipped} duplicado(s) ignorado(s))` : ''}.`,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate percentage total
    if (prizeType === 'percentage') {
      if (totalPercentage > 100) {
        toast({ variant: "destructive", title: "Erro de validação", description: "A soma das porcentagens não pode ultrapassar 100%" });
        setLoading(false);
        return;
      }
      const errors: string[] = [];
      if (!firstPlacePrize || parseFloat(firstPlacePrize) <= 0) errors.push("1º lugar");
      if (maxWinners >= 2 && (!secondPlacePrize || parseFloat(secondPlacePrize) <= 0)) errors.push("2º lugar");
      if (maxWinners >= 3 && (!thirdPlacePrize || parseFloat(thirdPlacePrize) <= 0)) errors.push("3º lugar");
      if (errors.length > 0) {
        toast({ variant: "destructive", title: "Erro de validação", description: `O prêmio do ${errors.join(", ")} não pode ser 0% no modelo percentual` });
        setLoading(false);
        return;
      }
    }

    try {
      // Update pool
      const { error: poolError } = await supabase
        .from("pools")
        .update({
          title,
          description,
          deadline: new Date(deadline).toISOString(),
          is_private: isPrivate,
          is_official: isOfficial,
          has_whatsapp_group: hasWhatsappGroup,
          scoring_system: scoringSystem,
          entry_fee: entryFee ? parseFloat(entryFee) : null,
          max_participants: maxParticipants !== "unlimited" ? parseInt(maxParticipants) : null,
          max_winners: maxWinners,
          prize_type: prizeType,
          first_place_prize: firstPlacePrize ? parseFloat(firstPlacePrize) : null,
          second_place_prize: maxWinners >= 2 && secondPlacePrize ? parseFloat(secondPlacePrize) : null,
          third_place_prize: maxWinners >= 3 && thirdPlacePrize ? parseFloat(thirdPlacePrize) : null,
        })
        .eq("id", id);

      if (poolError) throw poolError;

      // Update or insert PIX key
      if (pixKey) {
        const { error: pixError } = await supabase
          .from("pool_payment_info")
          .upsert({
            pool_id: id,
            pix_key: pixKey,
          }, { onConflict: 'pool_id' });

        if (pixError) throw pixError;
      }

      // Handle matches - insert new ones
      const newMatches = matches.filter(m => !m.id);
      if (newMatches.length > 0) {
        const matchesData = newMatches.map(match => ({
          pool_id: id,
          home_team: match.homeTeam,
          away_team: match.awayTeam,
          match_date: new Date(match.matchDate).toISOString(),
          championship: match.championship,
          status: "scheduled",
          external_id: match.externalId,
          external_source: match.externalSource || 'apifb',
          home_team_crest: match.homeTeamCrest || null,
          away_team_crest: match.awayTeamCrest || null,
        }));

        const { error: matchesError } = await supabase
          .from("football_matches")
          .insert(matchesData);

        if (matchesError) throw matchesError;
      }

      toast({
        title: "Bolão atualizado!",
        description: "As alterações foram salvas com sucesso.",
      });

      navigate(`/bolao/${id}`);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  if (isLoadingRole || !userRole?.canCreatePools || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background p-4">
      <div className="max-w-2xl mx-auto pt-8 pb-16">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => navigate(`/bolao/${id}`)}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl flex items-center gap-2">
              ⚽ Editar Bolão
            </CardTitle>
            <CardDescription>
              Edite as informações do bolão
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Título do Bolão *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Brasileirão 2025 - Rodada 10"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o bolão e suas regras..."
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entry_fee">Valor de Entrada (opcional)</Label>
                  <Input
                    id="entry_fee"
                    type="number"
                    step="0.01"
                    min="0"
                    value={entryFee}
                    onChange={(e) => setEntryFee(e.target.value)}
                    placeholder="Ex: 10.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_participants">Máx. de Participantes</Label>
                  <select
                    id="max_participants"
                    value={maxParticipants}
                    onChange={(e) => setMaxParticipants(e.target.value)}
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

              <div className="space-y-4">
                <Label className="text-lg">🏆 Premiação (opcional)</Label>

                <div className="space-y-2">
                  <Label>Tipo de premiação</Label>
                  <div className="flex gap-2">
                    {userRole?.isAdmin && (
                      <button
                        type="button"
                        onClick={() => setPrizeType('fixed')}
                        className={`flex-1 py-2 px-4 rounded-lg border-2 font-semibold transition-colors text-sm ${
                          prizeType === 'fixed'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-muted hover:border-primary/50'
                        }`}
                      >
                        💰 Valor Fixo (R$)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPrizeType('percentage')}
                      className={`flex-1 py-2 px-4 rounded-lg border-2 font-semibold transition-colors text-sm ${
                        prizeType === 'percentage'
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-muted hover:border-primary/50'
                      }`}
                    >
                      📊 % do Arrecadado
                    </button>
                  </div>
                  {prizeType === 'percentage' && (
                    <p className="text-xs text-muted-foreground">
                      O valor do prêmio será calculado automaticamente com base no total arrecadado (nº de participantes × valor de entrada).
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label>Quantos lugares serão premiados?</Label>
                  <div className="flex gap-2">
                    {[1, 2, 3].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setMaxWinners(n)}
                        className={`flex-1 py-2 px-4 rounded-lg border-2 font-semibold transition-colors ${
                          maxWinners === n
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-muted hover:border-primary/50'
                        }`}
                      >
                        Top {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`grid grid-cols-1 ${maxWinners >= 2 ? (maxWinners >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2') : ''} gap-4`}>
                  <div className="space-y-2">
                    <Label htmlFor="first_place_prize">1º Lugar {prizeType === 'percentage' ? '(%)' : '(R$)'}</Label>
                    <Input
                      id="first_place_prize"
                      type="number"
                      step={prizeType === 'percentage' ? '1' : '0.01'}
                      min={prizeType === 'percentage' ? '1' : '0'}
                      max={prizeType === 'percentage' ? '100' : undefined}
                      value={firstPlacePrize}
                      onChange={(e) => setFirstPlacePrize(e.target.value)}
                      placeholder={prizeType === 'percentage' ? 'Ex: 60' : 'Ex: 100.00'}
                    />
                  </div>
                  {maxWinners >= 2 && (
                    <div className="space-y-2">
                      <Label htmlFor="second_place_prize">2º Lugar {prizeType === 'percentage' ? '(%)' : '(R$)'}</Label>
                      <Input
                        id="second_place_prize"
                        type="number"
                        step={prizeType === 'percentage' ? '1' : '0.01'}
                        min={prizeType === 'percentage' ? '1' : '0'}
                        max={prizeType === 'percentage' ? '100' : undefined}
                        value={secondPlacePrize}
                        onChange={(e) => setSecondPlacePrize(e.target.value)}
                        placeholder={prizeType === 'percentage' ? 'Ex: 30' : 'Ex: 50.00'}
                      />
                    </div>
                  )}
                  {maxWinners >= 3 && (
                    <div className="space-y-2">
                      <Label htmlFor="third_place_prize">3º Lugar {prizeType === 'percentage' ? '(%)' : '(R$)'}</Label>
                      <Input
                        id="third_place_prize"
                        type="number"
                        step={prizeType === 'percentage' ? '1' : '0.01'}
                        min={prizeType === 'percentage' ? '1' : '0'}
                        max={prizeType === 'percentage' ? '100' : undefined}
                        value={thirdPlacePrize}
                        onChange={(e) => setThirdPlacePrize(e.target.value)}
                        placeholder={prizeType === 'percentage' ? 'Ex: 10' : 'Ex: 25.00'}
                      />
                    </div>
                  )}
                </div>

                {prizeType === 'percentage' && totalPercentage > 0 && (
                  <div className={`p-3 rounded-lg text-sm font-medium ${
                    totalPercentage > 100 
                      ? 'bg-destructive/10 text-destructive border border-destructive/30' 
                      : 'bg-muted/50 text-muted-foreground'
                  }`}>
                    {totalPercentage > 100 ? (
                      <p>⚠️ A soma das porcentagens ({totalPercentage}%) ultrapassa 100%!</p>
                    ) : remainingPercentage > 0 ? (
                      <p>💰 {remainingPercentage}% do valor arrecadado ficará com você (organizador)</p>
                    ) : (
                      <p>✅ 100% do valor arrecadado será distribuído como premiação</p>
                    )}
                  </div>
                )}
              </div>

              <PixKeyInput
                value={pixKey}
                onChange={setPixKey}
                label="Chave PIX (opcional)"
                adminNote
              />

              <div className="space-y-2">
                <Label htmlFor="deadline">Prazo para Palpites *</Label>
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  required
                />
              </div>

              {userRole?.isEstabelecimento ? (
                <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                  <Label className="text-lg">⚡ Sistema de Pontuação</Label>
                  <div className="flex items-start gap-3 p-3 rounded-lg border-2 border-primary bg-primary/5">
                    <div className="flex-1">
                      <div className="font-semibold mb-1">Sistema Completo</div>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Placar exato: <strong>5 pontos</strong></li>
                        <li>• Acertar o vencedor ou empate: <strong>3 pontos</strong></li>
                        <li>• Acertar a diferença de gols (caso acerte o vencedor ou empate): <strong>+1 ponto</strong></li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                  <Label className="text-lg">⚡ Sistema de Pontuação</Label>
                  <div className="space-y-3">
                    <div 
                      className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                        scoringSystem === 'exact_only' 
                          ? 'border-primary bg-primary/5' 
                          : 'border-muted hover:border-primary/50'
                      }`}
                      onClick={() => setScoringSystem('exact_only')}
                    >
                      <input
                        type="radio"
                        checked={scoringSystem === 'exact_only'}
                        onChange={() => setScoringSystem('exact_only')}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-semibold mb-1">Sistema Simplificado</div>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>• Placar exato: <strong>1 ponto</strong></li>
                          <li>• Qualquer outro resultado: <strong>0 pontos</strong></li>
                        </ul>
                      </div>
                    </div>
                    
                    <div 
                      className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                        scoringSystem === 'standard' 
                          ? 'border-primary bg-primary/5' 
                          : 'border-muted hover:border-primary/50'
                      }`}
                      onClick={() => setScoringSystem('standard')}
                    >
                      <input
                        type="radio"
                        checked={scoringSystem === 'standard'}
                        onChange={() => setScoringSystem('standard')}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-semibold mb-1">Sistema Completo</div>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>• Placar exato: <strong>5 pontos</strong></li>
                          <li>• Acertar o vencedor ou empate: <strong>3 pontos</strong></li>
                          <li>• Acertar a diferença de gols (caso acerte o vencedor ou empate): <strong>+1 ponto</strong></li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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

              <div className="flex items-center justify-between rounded-lg border p-4 bg-primary/5">
                <div className="space-y-0.5">
                  <Label htmlFor="is-official">⭐ Bolão Oficial</Label>
                  <p className="text-sm text-muted-foreground">
                    Marcar como bolão oficial do app
                  </p>
                </div>
                <Switch
                  id="is-official"
                  checked={isOfficial}
                  onCheckedChange={setIsOfficial}
                />
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
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Jogos
                  </Button>
                </div>

                {matches.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhum jogo adicionado ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {matches.map((match, index) => (
                      <div key={index} className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                        <div className="flex-1 text-sm">
                          <div className="font-semibold">
                            {match.homeTeam} vs {match.awayTeam}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {format(new Date(match.matchDate), "dd/MM/yyyy 'às' HH:mm")}
                            {match.status === 'finished' && match.homeScore !== null && match.awayScore !== null && (
                              <span className="ml-2 font-semibold">
                                ({match.homeScore} x {match.awayScore})
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMatch(index)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                <Save className="w-4 h-4 mr-2" />
                {loading ? "Salvando..." : "Salvar Alterações"}
              </Button>
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

export default EditFootballPool;
