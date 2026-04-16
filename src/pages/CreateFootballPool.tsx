import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Trash2, Plus, Info, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { GEMatchSelector } from "@/components/GEMatchSelector";
import { PixKeyInput } from "@/components/PixKeyInput";
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
  const { data: userRole, isLoading: isLoadingRole } = useUserRole();
  const [loading, setLoading] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [pixKey, setPixKey] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<'pix_manual' | 'in_app'>('pix_manual');
  const [profilePixKey, setProfilePixKey] = useState<string | null>(null);
  const [profilePixKeyType, setProfilePixKeyType] = useState<string | null>(null);
  const [pixSource, setPixSource] = useState<'profile' | 'custom' | null>(null);
  const [replaceProfilePix, setReplaceProfilePix] = useState(false);
  const [savePixToProfile, setSavePixToProfile] = useState(false);
  const [isOfficial, setIsOfficial] = useState(false);
  const [hasWhatsappGroup, setHasWhatsappGroup] = useState(false);
  const [scoringSystem, setScoringSystem] = useState<'standard' | 'exact_only'>('exact_only');
  const [maxWinners, setMaxWinners] = useState<number>(1);
  const [prizeType, setPrizeType] = useState<'fixed' | 'percentage' | 'estabelecimento'>('fixed');
  const [estabelecimentoPrizeDescription, setEstabelecimentoPrizeDescription] = useState("");
  const [addressName, setAddressName] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [addressNeighborhood, setAddressNeighborhood] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [saveAddress, setSaveAddress] = useState(false);

  const buildFullAddress = () => {
    const addressParts = [
      addressStreet.trim(),
      addressNumber.trim(),
      addressComplement.trim() ? `(${addressComplement.trim()})` : '',
      addressNeighborhood.trim() ? `${addressNeighborhood.trim()}` : '',
      `${addressCity.trim()}/${addressState.trim()}`
    ].filter(Boolean);
    const address = addressParts.join(', ');
    return addressName.trim() ? `${addressName.trim()}\n${address}` : address;
  };

  // Load saved address from localStorage when user is Estabelecimento
  useEffect(() => {
    if (!isLoadingRole && userRole?.isEstabelecimento) {
      const saved = localStorage.getItem('estabelecimento_saved_address');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setAddressName(parsed.name || '');
          setAddressStreet(parsed.street || '');
          setAddressNumber(parsed.number || '');
          setAddressComplement(parsed.complement || '');
          setAddressNeighborhood(parsed.neighborhood || '');
          setAddressCity(parsed.city || '');
          setAddressState(parsed.state || '');
          setSaveAddress(true);
        } catch { /* ignore invalid data */ }
      }
    }
  }, [isLoadingRole, userRole?.isEstabelecimento]);
  const [firstPlacePrize, setFirstPlacePrize] = useState("");
  const [secondPlacePrize, setSecondPlacePrize] = useState("");
  const [thirdPlacePrize, setThirdPlacePrize] = useState("");

  const totalPercentage = prizeType === 'percentage'
    ? (parseFloat(firstPlacePrize) || 0) + (maxWinners >= 2 ? (parseFloat(secondPlacePrize) || 0) : 0) + (maxWinners >= 3 ? (parseFloat(thirdPlacePrize) || 0) : 0)
    : 0;
  const remainingPercentage = 100 - totalPercentage;

  useEffect(() => {
    if (!isLoadingRole && !userRole?.canCreatePools) {
      toast({
        variant: "destructive",
        title: "Acesso negado",
        description: "Você não tem permissão para criar bolões",
      });
      navigate("/");
    }
  }, [isLoadingRole, userRole, navigate, toast]);

  // Load profile PIX key
  useEffect(() => {
    const loadProfilePix = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("pix_key, pix_key_type")
        .eq("id", user.id)
        .single();
      if (profile?.pix_key) {
        setProfilePixKey(profile.pix_key);
        setProfilePixKeyType(profile.pix_key_type);
      }
    };
    loadProfilePix();
  }, []);

  // Non-admin pool creators default to percentage prize type
  useEffect(() => {
    if (!isLoadingRole && userRole?.canCreatePools && !userRole?.isAdmin) {
      if (userRole?.isEstabelecimento) {
        setPrizeType('estabelecimento');
        setScoringSystem('standard');
      } else {
        setPrizeType('percentage');
      }
    }
  }, [isLoadingRole, userRole]);
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
    
    // Calculate deadline: 3 hours before first match (prediction cutoff)
    if (matchesWithSource.length > 0) {
      const sortedMatches = [...matchesWithSource].sort((a, b) => 
        new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime()
      );
      const firstMatch = sortedMatches[0];
      const firstMatchDate = new Date(firstMatch.matchDate);
      const deadlineDate = new Date(firstMatchDate.getTime() - 3 * 60 * 60 * 1000); // 3 hours before
      
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

  if (isLoadingRole || !userRole?.canCreatePools) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const title = (formData.get("title") as string) || "";
    const description = (formData.get("description") as string) || "";
    const pixKeyValue = pixKey;
    const entryFee = (formData.get("entry_fee") as string) || "";
    const maxParticipants = (formData.get("max_participants") as string) || "";

    // Validate input
    try {
      footballPoolSchema.parse({ title, description, pixKey: pixKeyValue, entryFee, maxParticipants });
      
      // Additional validation for non-admin users
      const usingInApp = userRole?.canReceiveInApp && paymentMethod === 'in_app' && entryFee && parseFloat(entryFee) > 0;
      if (!userRole?.isAdmin && !userRole?.isEstabelecimento) {
        if (!entryFee || parseFloat(entryFee) <= 0) {
          throw new Error("Valor de entrada é obrigatório");
        }
        if (!usingInApp && !pixKeyValue.trim()) {
          throw new Error("Chave PIX é obrigatória");
        }
      } else if (userRole?.isEstabelecimento) {
        // Estabelecimento: no entry fee or PIX required, but prize description and address are required
        if (prizeType === 'estabelecimento' && !estabelecimentoPrizeDescription.trim()) {
          throw new Error("Descrição do prêmio é obrigatória");
        }
        if (prizeType === 'estabelecimento') {
          if (!addressStreet.trim()) throw new Error("Rua é obrigatória");
          if (!addressNumber.trim()) throw new Error("Número é obrigatório");
          if (!addressNeighborhood.trim()) throw new Error("Bairro é obrigatório");
          if (!addressCity.trim()) throw new Error("Cidade é obrigatória");
          if (!addressState.trim()) throw new Error("Estado é obrigatório");
        }
      } else {
        // Admin: PIX required only if entry fee is set and not using in-app
        const hasEntryFee = entryFee && parseFloat(entryFee) > 0;
        if (hasEntryFee && !usingInApp && !pixKeyValue.trim()) {
          throw new Error("Chave PIX é obrigatória quando há valor de entrada");
        }
      }

      // Validate percentage total
      if (prizeType === 'percentage') {
        if (totalPercentage > 100) {
          throw new Error("A soma das porcentagens não pode ultrapassar 100%");
        }
        if (!firstPlacePrize || parseFloat(firstPlacePrize) <= 0) {
          throw new Error("O prêmio do 1º lugar não pode ser 0% no modelo percentual");
        }
        if (maxWinners >= 2 && (!secondPlacePrize || parseFloat(secondPlacePrize) <= 0)) {
          throw new Error("O prêmio do 2º lugar não pode ser 0% no modelo percentual");
        }
        if (maxWinners >= 3 && (!thirdPlacePrize || parseFloat(thirdPlacePrize) <= 0)) {
          throw new Error("O prêmio do 3º lugar não pode ser 0% no modelo percentual");
        }
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
        scoring_system: scoringSystem,
        entry_fee: entryFee ? parseFloat(entryFee) : null,
        max_participants: maxParticipants && maxParticipants !== "unlimited" ? parseInt(maxParticipants) : null,
        is_official: isOfficial,
        has_whatsapp_group: hasWhatsappGroup,
        max_winners: prizeType === 'estabelecimento' ? 1 : maxWinners,
        prize_type: prizeType,
        first_place_prize: prizeType !== 'estabelecimento' && firstPlacePrize ? parseFloat(firstPlacePrize) : null,
        second_place_prize: prizeType !== 'estabelecimento' && maxWinners >= 2 && secondPlacePrize ? parseFloat(secondPlacePrize) : null,
        third_place_prize: prizeType !== 'estabelecimento' && maxWinners >= 3 && thirdPlacePrize ? parseFloat(thirdPlacePrize) : null,
        estabelecimento_prize_description: prizeType === 'estabelecimento' ? estabelecimentoPrizeDescription.trim() : null,
        estabelecimento_prize_address: prizeType === 'estabelecimento' ? buildFullAddress() : null,
        payment_method: (userRole?.canReceiveInApp && entryFee && parseFloat(entryFee) > 0) ? paymentMethod : 'pix_manual',
      } as any])
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
    if (pixKeyValue) {
      const { error: paymentError } = await supabase
        .from("pool_payment_info")
        .insert({
          pool_id: pool.id,
          pix_key: pixKeyValue,
        });

      if (paymentError) {
        console.error("Error saving PIX key:", paymentError);
      }

      // Update profile PIX key if user chose to replace or save
      if ((replaceProfilePix && pixSource === 'custom') || (savePixToProfile && !profilePixKey)) {
        await supabase
          .from("profiles")
          .update({ pix_key: pixKeyValue })
          .eq("id", user.id);
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
      navigate(`/bolao/${pool.slug || pool.id}`);
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
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full bg-muted/50 p-3 rounded-lg text-sm font-semibold hover:bg-muted/70 transition-colors mt-2">
                  <span>⚡ Como funciona</span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="bg-muted/50 px-4 pb-3 pt-2 rounded-b-lg text-sm -mt-1">
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    {userRole?.isEstabelecimento ? (
                      <>
                        <li>Gere <strong>vouchers</strong> para seus clientes — cada voucher libera a entrada de um participante</li>
                        
                        <li>Prazo para palpites: <strong>3 horas</strong> antes do primeiro jogo</li>
                        <li>Jogos são atualizados em tempo real</li>
                        <li>Resultados sincronizados direto da fonte oficial</li>
                        <li>Sistema de pontuação: <strong>Placar exato (10 pts)</strong>, Resultado + saldo de gols (7 pts), Resultado + um placar correto (5 pts), Resultado correto (3 pts)</li>
                        <li><strong>Desempate automático:</strong> 1º Placares exatos → 2º Acertos totais → 3º Horário de envio → 4º Sorteio</li>
                        <li>Prêmio definido pelo estabelecimento (produto, serviço, etc.)</li>
                        <li>Apenas <strong>1 vencedor</strong> por bolão</li>
                      </>
                    ) : (
                      <>
                        <li>Prazo para palpites: <strong>3 horas</strong> antes do primeiro jogo</li>
                        <li>Prazo para comprovante de pagamento: <strong>2h30</strong> antes do primeiro jogo</li>
                        <li>Participantes sem comprovante até o prazo serão <strong>rejeitados automaticamente</strong></li>
                        <li>Comprovantes pendentes de aprovação serão <strong>aprovados automaticamente</strong> no início do jogo</li>
                        <li>Jogos são atualizados em tempo real</li>
                        <li>Resultados sincronizados direto da fonte oficial</li>
                        <li>Pontuação calculada conforme os resultados dos jogos</li>
                        <li>Vencedor definido ao final de todos os jogos</li>
                        <li>Em caso de <strong>0 pontos para todos</strong>, o desempate será pela <strong>ordem de envio dos palpites</strong> (quem enviou primeiro)</li>
                      </>
                    )}
                  </ul>
                </div>
              </CollapsibleContent>
            </Collapsible>
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

              {userRole?.isEstabelecimento ? (
                <div className="space-y-2">
                  <Label htmlFor="entry_fee">Valor de Entrada *</Label>
                  <Input
                    id="entry_fee"
                    name="entry_fee"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Ex: 10.00"
                    required
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="entry_fee">Valor de Entrada {userRole?.isAdmin ? '(opcional)' : '*'}</Label>
                    <Input
                      id="entry_fee"
                      name="entry_fee"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Ex: 10.00"
                      required={!userRole?.isAdmin}
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
              )}

              <div className="space-y-4">
                <Label className="text-lg">🏆 Premiação {userRole?.isEstabelecimento ? '*' : '(opcional)'}</Label>

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
                    {!userRole?.isEstabelecimento && (
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
                    )}
                    {userRole?.isEstabelecimento && (
                      <button
                        type="button"
                        onClick={() => setPrizeType('estabelecimento')}
                        className={`flex-1 py-2 px-4 rounded-lg border-2 font-semibold transition-colors text-sm ${
                          prizeType === 'estabelecimento'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-muted hover:border-primary/50'
                        }`}
                      >
                        🏪 Prêmios do Estabelecimento
                      </button>
                    )}
                  </div>
                  {prizeType === 'percentage' && (
                    <p className="text-xs text-muted-foreground">
                      O valor do prêmio será calculado automaticamente com base no total arrecadado (nº de participantes × valor de entrada).
                    </p>
                  )}
                  {prizeType === 'estabelecimento' && (
                    <p className="text-xs text-muted-foreground">
                      Descreva o prêmio que o estabelecimento oferecerá ao vencedor (ex: corte de cabelo, balde de cerveja, etc).
                    </p>
                  )}
                </div>
                
                {prizeType !== 'estabelecimento' && (
                  <>
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
                          name="first_place_prize"
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
                            name="second_place_prize"
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
                            name="third_place_prize"
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
                  </>
                )}

                {prizeType === 'estabelecimento' && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="estabelecimento_prize">🏆 Descrição do Prêmio *</Label>
                      <Textarea
                        id="estabelecimento_prize"
                        value={estabelecimentoPrizeDescription}
                        onChange={(e) => setEstabelecimentoPrizeDescription(e.target.value)}
                        placeholder="Ex: 1 corte de cabelo grátis, 1 balde de cerveja, 1 pizza grande..."
                        rows={3}
                        required
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">📍 Local para Resgate do Prêmio *</Label>
                      <div className="space-y-1">
                        <Label htmlFor="address_name" className="text-xs text-muted-foreground">Nome do Estabelecimento</Label>
                        <Input id="address_name" value={addressName} onChange={(e) => setAddressName(e.target.value)} placeholder="Ex: Barbearia do João" required />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2 space-y-1">
                          <Label htmlFor="address_street" className="text-xs text-muted-foreground">Rua / Avenida</Label>
                          <Input id="address_street" value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} placeholder="Ex: Rua das Flores" required />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="address_number" className="text-xs text-muted-foreground">Número</Label>
                          <Input id="address_number" value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} placeholder="123" required />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="address_complement" className="text-xs text-muted-foreground">Complemento</Label>
                          <Input id="address_complement" value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} placeholder="Sala 2, Bloco B..." />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="address_neighborhood" className="text-xs text-muted-foreground">Bairro</Label>
                          <Input id="address_neighborhood" value={addressNeighborhood} onChange={(e) => setAddressNeighborhood(e.target.value)} placeholder="Centro" required />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2 space-y-1">
                          <Label htmlFor="address_city" className="text-xs text-muted-foreground">Cidade</Label>
                          <Input id="address_city" value={addressCity} onChange={(e) => setAddressCity(e.target.value)} placeholder="São Paulo" required />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="address_state" className="text-xs text-muted-foreground">Estado</Label>
                          <select
                            id="address_state"
                            value={addressState}
                            onChange={(e) => setAddressState(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            required
                          >
                            <option value="">UF</option>
                            {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                              <option key={uf} value={uf}>{uf}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="save_address"
                          checked={saveAddress}
                          onCheckedChange={(checked) => {
                            setSaveAddress(!!checked);
                            if (checked) {
                              const addrData = JSON.stringify({ name: addressName, street: addressStreet, number: addressNumber, complement: addressComplement, neighborhood: addressNeighborhood, city: addressCity, state: addressState });
                              localStorage.setItem('estabelecimento_saved_address', addrData);
                            } else {
                              localStorage.removeItem('estabelecimento_saved_address');
                            }
                          }}
                        />
                        <Label htmlFor="save_address" className="text-xs text-muted-foreground cursor-pointer">
                          Salvar este endereço para próximos bolões
                        </Label>
                      </div>
                    </div>
                  </div>
                )}
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
                  <p className="text-sm text-muted-foreground">
                    Escolha como os pontos serão calculados nos palpites
                  </p>
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
                        name="scoring_system"
                        value="exact_only"
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
                        name="scoring_system"
                        value="standard"
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

              {!userRole?.isEstabelecimento && userRole?.canReceiveInApp && (
                <div className="space-y-3">
                  <Label className="text-base">💳 Como receber os pagamentos</Label>
                  <div className="grid gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('in_app')}
                      className={`text-left p-4 rounded-lg border-2 transition-colors ${paymentMethod === 'in_app' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'}`}
                    >
                      <div className="font-semibold text-sm mb-1">⚡ Receber dentro do app (PIX automático)</div>
                      <div className="text-xs text-muted-foreground">
                        Os participantes pagam direto no app via PIX, são aprovados automaticamente e o valor é repassado a você (e ao vencedor) ao fim do bolão, descontada a taxa Delfos.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('pix_manual')}
                      className={`text-left p-4 rounded-lg border-2 transition-colors ${paymentMethod === 'pix_manual' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'}`}
                    >
                      <div className="font-semibold text-sm mb-1">📎 PIX manual + comprovante</div>
                      <div className="text-xs text-muted-foreground">
                        Participantes enviam PIX direto pra sua chave e anexam comprovante. Você aprova manualmente.
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {!userRole?.isEstabelecimento && paymentMethod === 'pix_manual' && (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Label className="text-base">🔑 Chave PIX para receber pagamentos {userRole?.isAdmin ? '(opcional)' : '*'}</Label>
                </div>
                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Esta chave PIX será usada pelos participantes para realizar o pagamento da inscrição no bolão. Ela ficará visível apenas no momento do pagamento.
                    </p>
                  </div>
                </div>

                {profilePixKey ? (
                  <div className="space-y-3">
                    {/* Profile key - highlighted */}
                    <button
                      type="button"
                      onClick={() => {
                        setPixSource('profile');
                        setPixKey(profilePixKey);
                        setReplaceProfilePix(false);
                      }}
                      className={`w-full py-3 px-4 rounded-lg border-2 text-left transition-colors ${
                        pixSource === 'profile'
                          ? 'border-primary bg-primary/10'
                          : 'border-muted hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm">✅ Usar chave do perfil</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {profilePixKeyType && (
                              <span className="inline-block bg-primary/15 text-primary rounded px-1.5 py-0.5 text-[11px] font-medium uppercase mr-1.5">
                                {profilePixKeyType}
                              </span>
                            )}
                            <span className="break-all">{profilePixKey}</span>
                          </div>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                          pixSource === 'profile' ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                        }`} />
                      </div>
                    </button>

                    {/* Custom key - subtle */}
                    <button
                      type="button"
                      onClick={() => {
                        setPixSource('custom');
                        setPixKey("");
                        setReplaceProfilePix(false);
                      }}
                      className={`w-full py-2.5 px-4 rounded-lg border text-left transition-colors ${
                        pixSource === 'custom'
                          ? 'border-primary bg-primary/10'
                          : 'border-dashed border-muted-foreground/30 hover:border-muted-foreground/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">Usar outra chave</div>
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                          pixSource === 'custom' ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                        }`} />
                      </div>
                    </button>

                    {pixSource === 'custom' && (
                      <div className="space-y-3">
                        <PixKeyInput
                          value={pixKey}
                          onChange={setPixKey}
                          required={!userRole?.isAdmin}
                          label=""
                        />
                        {pixKey.trim() && (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="replace-profile-pix"
                              checked={replaceProfilePix}
                              onCheckedChange={(checked) => setReplaceProfilePix(checked === true)}
                            />
                            <label htmlFor="replace-profile-pix" className="text-sm text-muted-foreground cursor-pointer">
                              Substituir minha chave PIX do perfil por esta nova
                            </label>
                          </div>
                        )}
                      </div>
                    )}

                    {pixSource === null && !userRole?.isAdmin && (
                      <p className="text-xs text-destructive">Selecione uma opção de chave PIX</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <PixKeyInput
                      value={pixKey}
                      onChange={setPixKey}
                      required={!userRole?.isAdmin}
                      label=""
                    />
                    {pixKey.trim() && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="save-pix-to-profile"
                          checked={savePixToProfile}
                          onCheckedChange={(checked) => setSavePixToProfile(checked === true)}
                        />
                        <label htmlFor="save-pix-to-profile" className="text-sm text-muted-foreground cursor-pointer">
                          Salvar esta chave PIX no meu perfil para próximos bolões
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/30">
                <div className="space-y-0.5">
                  <Label htmlFor="is-private" className="text-base font-semibold">Privacidade do Bolão</Label>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    {isPrivate ? (
                      <>🔒 Bolão está PRIVADO - Apenas pessoas com o link poderão acessar</>
                    ) : (
                      <>🌐 Bolão está PÚBLICO - Visível na lista de bolões públicos</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{isPrivate ? 'Privado' : 'Público'}</span>
                  <Switch
                    id="is-private"
                    checked={!isPrivate}
                    onCheckedChange={(checked) => setIsPrivate(!checked)}
                  />
                </div>
              </div>

              {userRole?.isAdmin && (
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
