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
import { extractGroup, isWorldCupMatch } from "@/lib/world-cup-2026";
import { Badge } from "@/components/ui/badge";
import { PixKeyInput } from "@/components/PixKeyInput";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { z } from "zod";
import { proxyCrest } from "@/lib/team-crest";

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
  const [delfosFeePercent, setDelfosFeePercent] = useState<number>(0);
  const [delfosFeeFixed, setDelfosFeeFixed] = useState<number>(0);
  const [delfosFeeType, setDelfosFeeType] = useState<'percent' | 'fixed'>('percent');
  const [replaceProfilePix, setReplaceProfilePix] = useState(false);
  const [savePixToProfile, setSavePixToProfile] = useState(false);
  const [isOfficial, setIsOfficial] = useState(false);
  const [hasWhatsappGroup, setHasWhatsappGroup] = useState(false);
  const [scoringSystem, setScoringSystem] = useState<'standard' | 'exact_only'>('exact_only');
  const [maxWinners, setMaxWinners] = useState<number>(1);
  const [prizeType, setPrizeType] = useState<'fixed' | 'percentage' | 'estabelecimento'>('percentage');
  const [estabelecimentoPrizeDescription, setEstabelecimentoPrizeDescription] = useState("");
  const [addressName, setAddressName] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [addressNeighborhood, setAddressNeighborhood] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [saveAddress, setSaveAddress] = useState(false);
  const [prizeDeliveryType, setPrizeDeliveryType] = useState<'physical' | 'digital'>('physical');
  const [digitalDeliveryInstructions, setDigitalDeliveryInstructions] = useState("");
  const [inlinePixKey, setInlinePixKey] = useState("");
  const [inlinePixKeyType, setInlinePixKeyType] = useState<string>("");
  const [savingInlinePix, setSavingInlinePix] = useState(false);
  const [guaranteedPrize, setGuaranteedPrize] = useState(false);
  const [waivePlatformFee, setWaivePlatformFee] = useState(false);
  const [isFreePool, setIsFreePool] = useState(false);

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
  const [entryFeeValue, setEntryFeeValue] = useState("");

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

  // Force in-app payment as default for users with canReceiveInApp
  useEffect(() => {
    if (userRole?.canReceiveInApp && !userRole?.isEstabelecimento) {
      setPaymentMethod('in_app');
    }
  }, [userRole?.canReceiveInApp, userRole?.isEstabelecimento]);

  const saveInlinePixKey = async () => {
    if (!inlinePixKey.trim() || !inlinePixKeyType) {
      toast({ title: "Selecione o tipo e digite a chave PIX", variant: "destructive" });
      return;
    }
    setSavingInlinePix(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("profiles")
        .update({ pix_key: inlinePixKey.trim(), pix_key_type: inlinePixKeyType })
        .eq("id", user.id);
      if (error) throw error;
      setProfilePixKey(inlinePixKey.trim());
      setProfilePixKeyType(inlinePixKeyType);
      setInlinePixKey("");
      setInlinePixKeyType("");
      toast({ title: "Chave PIX salva no seu perfil!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSavingInlinePix(false);
    }
  };

  // Load Delfos fee config from platform settings
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["delfos_fee_percent", "delfos_fee_fixed", "delfos_fee_type"]);
      for (const row of data || []) {
        if (row.key === "delfos_fee_percent" && row.value != null) setDelfosFeePercent(Number(row.value));
        if (row.key === "delfos_fee_fixed" && row.value != null) setDelfosFeeFixed(Number(row.value));
        if (row.key === "delfos_fee_type" && row.value != null) setDelfosFeeType(row.value === "fixed" ? "fixed" : "percent");
      }
    })();
  }, []);

  // Estabelecimento creators are forced to estabelecimento prize type
  useEffect(() => {
    if (!isLoadingRole && userRole?.canCreatePools && userRole?.isEstabelecimento) {
      setPrizeType('estabelecimento');
      setScoringSystem('standard');
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
    
    // Calculate deadline: in_app pools = 10min before first match; others = 3h before
    if (matchesWithSource.length > 0) {
      const sortedMatches = [...matchesWithSource].sort((a, b) => 
        new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime()
      );
      const firstMatch = sortedMatches[0];
      const firstMatchDate = new Date(firstMatch.matchDate);
      const offsetMs = userRole?.canReceiveInApp ? 10 * 60 * 1000 : 3 * 60 * 60 * 1000;
      const deadlineDate = new Date(firstMatchDate.getTime() - offsetMs);
      
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

    const privacyWarning = isPrivate
      ? "🔒 Você escolheu criar um bolão PRIVADO.\n\nApenas pessoas com o link poderão acessar e participar.\n\nDeseja continuar?"
      : "🌐 Você escolheu criar um bolão PÚBLICO.\n\nEle ficará disponível para toda a comunidade Delfos acessar e participar.\n\nDeseja continuar?";
    if (!window.confirm(privacyWarning)) {
      return;
    }

    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const title = (formData.get("title") as string) || "";
    const description = (formData.get("description") as string) || "";
    const pixKeyValue = pixKey;
    const entryFee = isFreePool ? "0" : ((formData.get("entry_fee") as string) || "");
    const maxParticipants = (formData.get("max_participants") as string) || "";

    // Validate input
    try {
      footballPoolSchema.parse({ title, description, pixKey: pixKeyValue, entryFee, maxParticipants });
      
      // Additional validation for non-admin users
      const usingInApp = userRole?.canReceiveInApp && paymentMethod === 'in_app' && entryFee && parseFloat(entryFee) > 0;

      // For in-app payment: organizer MUST have a PIX key in profile (used to receive their commission)
      if (usingInApp && !profilePixKey) {
        throw new Error("Para receber dentro do app, cadastre sua chave PIX no perfil. É para essa chave que sua comissão será enviada.");
      }

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
          if (prizeDeliveryType === 'physical') {
            if (!addressStreet.trim()) throw new Error("Rua é obrigatória");
            if (!addressNumber.trim()) throw new Error("Número é obrigatório");
            if (!addressNeighborhood.trim()) throw new Error("Bairro é obrigatório");
            if (!addressCity.trim()) throw new Error("Cidade é obrigatória");
            if (!addressState.trim()) throw new Error("Estado é obrigatório");
          } else {
            if (!digitalDeliveryInstructions.trim()) {
              throw new Error("Informe como o prêmio será entregue (e-mail, WhatsApp, etc.)");
            }
          }
        }
        // Admin: PIX required only if entry fee is set and not using in-app
        const hasEntryFee = entryFee && parseFloat(entryFee) > 0;
        if (hasEntryFee && !usingInApp && !pixKeyValue.trim()) {
          throw new Error("Chave PIX é obrigatória quando há valor de entrada");
        }
      }

      // Premiação é obrigatória (exceto estabelecimento que usa descrição do prêmio)
      if (prizeType === 'fixed') {
        if (!firstPlacePrize || parseFloat(firstPlacePrize) <= 0) {
          throw new Error("O prêmio do 1º lugar é obrigatório");
        }
        if (maxWinners >= 2 && (!secondPlacePrize || parseFloat(secondPlacePrize) <= 0)) {
          throw new Error("O prêmio do 2º lugar é obrigatório");
        }
        if (maxWinners >= 3 && (!thirdPlacePrize || parseFloat(thirdPlacePrize) <= 0)) {
          throw new Error("O prêmio do 3º lugar é obrigatório");
        }
        // 1º > 2º > 3º
        const p1 = parseFloat(firstPlacePrize) || 0;
        const p2 = parseFloat(secondPlacePrize) || 0;
        const p3 = parseFloat(thirdPlacePrize) || 0;
        if (maxWinners >= 2 && p2 >= p1) {
          throw new Error("O prêmio do 2º lugar deve ser menor que o do 1º lugar");
        }
        if (maxWinners >= 3 && p3 >= p2) {
          throw new Error("O prêmio do 3º lugar deve ser menor que o do 2º lugar");
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
        const p1 = parseFloat(firstPlacePrize) || 0;
        const p2 = parseFloat(secondPlacePrize) || 0;
        const p3 = parseFloat(thirdPlacePrize) || 0;
        if (maxWinners >= 2 && p2 >= p1) {
          throw new Error("O percentual do 2º lugar deve ser menor que o do 1º lugar");
        }
        if (maxWinners >= 3 && p3 >= p2) {
          throw new Error("O percentual do 3º lugar deve ser menor que o do 2º lugar");
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
        guaranteed_prize: userRole?.isAdmin && prizeType === 'fixed' ? guaranteedPrize : false,
        waive_platform_fee: userRole?.isAdmin ? waivePlatformFee : false,
        is_free_pool: userRole?.isAdmin ? isFreePool : false,
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
                    ) : paymentMethod === 'in_app' ? (
                      <>
                        <li>Prazo para palpites e pagamento: até <strong>10 minutos</strong> antes do primeiro jogo</li>
                        <li>Pagamento <strong>100% automático via PIX</strong> dentro do app — sem comprovante e sem aprovação manual</li>
                        <li>Participação confirmada <strong>automaticamente</strong> assim que o PIX for pago</li>
                        <li>Quem não pagar até o início do primeiro jogo fica <strong>fora do bolão automaticamente</strong></li>
                        <li>Prêmio enviado <strong>automaticamente via PIX</strong> para a chave cadastrada do(s) vencedor(es)</li>
                        <li>Jogos são atualizados em tempo real</li>
                        <li>Resultados sincronizados direto da fonte oficial</li>
                        <li>Pontuação calculada conforme os resultados dos jogos</li>
                        <li>Vencedor definido ao final de todos os jogos</li>
                        <li>Em caso de <strong>0 pontos para todos</strong>, o desempate será pela <strong>ordem de envio dos palpites</strong> (quem enviou primeiro)</li>
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
                  placeholder="Ex: Copa do Mundo dos Amigos"
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

              {userRole?.isAdmin && (
                <div className="p-4 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label htmlFor="free-pool" className="text-base font-semibold flex items-center gap-2">
                        🎁 Bolão gratuito
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Cada usuário começa com 1 entrada grátis. Para ganhar entradas extras, precisa indicar
                        outras pessoas — cada amigo que usar o código dele ao entrar dá +1 entrada.
                        Sem taxa, sem PIX.
                      </p>
                    </div>
                    <Switch id="free-pool" checked={isFreePool} onCheckedChange={setIsFreePool} />
                  </div>
                </div>
              )}

              {isFreePool ? (
                <input type="hidden" name="entry_fee" value="0" />
              ) : userRole?.isEstabelecimento ? (
                <div className="space-y-2">
                  <Label htmlFor="entry_fee">Valor de Entrada (opcional)</Label>
                  <Input
                    id="entry_fee"
                    name="entry_fee"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 10.00 (deixe vazio para gratuito)"
                    value={entryFeeValue}
                    onChange={(e) => setEntryFeeValue(e.target.value)}
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
                      value={entryFeeValue}
                      onChange={(e) => setEntryFeeValue(e.target.value)}
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
                <Label className="text-lg">🏆 Premiação *</Label>

                <div className="space-y-2">
                  <Label>Tipo de premiação</Label>
                  <div className="flex gap-2">
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
                    {!userRole?.isEstabelecimento && (
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
                  {prizeType === 'fixed' && (() => {
                    const entry = parseFloat(entryFeeValue) || 0;
                    const totalPrizes =
                      (parseFloat(firstPlacePrize) || 0) +
                      (maxWinners >= 2 ? (parseFloat(secondPlacePrize) || 0) : 0) +
                      (maxWinners >= 3 ? (parseFloat(thirdPlacePrize) || 0) : 0);
                    const breakeven = entry > 0 && totalPrizes > 0 ? Math.ceil(totalPrizes / entry) : 0;
                    const minToGuarantee = entry > 0 && totalPrizes > 0 ? Math.ceil((totalPrizes * 1.25) / entry) : 0;
                    return (
                      <>
                        {userRole?.isAdmin && (
                          <div className="text-xs space-y-2 bg-primary/10 border border-primary/30 p-3 rounded-md mt-1">
                            <label className="flex items-start gap-2 cursor-pointer">
                              <Checkbox
                                checked={guaranteedPrize}
                                onCheckedChange={(c) => setGuaranteedPrize(!!c)}
                                className="mt-0.5"
                              />
                              <div>
                                <p className="font-semibold text-primary">🛡️ Premiação garantida pelo app (admin)</p>
                                <p className="text-muted-foreground">Os prêmios fixos são pagos integralmente pelo Delfos, independente do valor arrecadado. A regra dos 80% e o mínimo de palpites não se aplicam.</p>
                              </div>
                            </label>
                          </div>
                        )}
                        {entry > 0 && totalPrizes > 0 && !guaranteedPrize && (
                          <div className="text-xs space-y-1.5 bg-amber-500/10 border border-amber-500/30 p-3 rounded-md mt-1">
                            <p className="font-semibold text-amber-700 dark:text-amber-400">⚠️ Regra de proteção do Valor Fixo</p>
                            <p>Para garantir a premiação cheia de <strong>R$ {totalPrizes.toFixed(2).replace('.', ',')}</strong>, o bolão precisa de pelo menos <strong>{minToGuarantee} palpites pagos</strong> (premiação + 25% de margem).</p>
                            <p>Se entrarem <strong>menos de {minToGuarantee} palpites</strong>, a premiação passa automaticamente a ser <strong>80% do valor arrecadado</strong>, dividido entre os vencedores na mesma proporção definida.</p>
                          </div>
                        )}
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <button type="button" className="flex items-center justify-between w-full text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded-md border border-border hover:bg-muted/60 transition-colors">
                              <span>💡 Como funciona o Valor Fixo</span>
                              <ChevronDown className="w-4 h-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="text-xs text-muted-foreground space-y-1.5 bg-muted/40 p-3 rounded-md border border-border mt-1">
                              <p>Você define um valor fixo em reais para cada vencedor, independente de quantas pessoas entrarem — <strong>desde que o bolão atinja o mínimo de palpites necessários</strong>.</p>
                              <p>🛡️ <strong>Proteção automática:</strong> se o arrecadado não cobrir a premiação + 25% de margem, a premiação vira <strong>80% do arrecadado</strong> (proporcional aos lugares). Assim ninguém sai no prejuízo.</p>
                              {entry > 0 && totalPrizes > 0 ? (
                                <>
                                  <p>📈 Com entrada de R$ {entry.toFixed(2).replace('.', ',')} e premiação total de R$ {totalPrizes.toFixed(2).replace('.', ',')}:</p>
                                  <p>• <strong>{minToGuarantee}+ palpites pagos</strong> → premiação fixa garantida (R$ {totalPrizes.toFixed(2).replace('.', ',')}).</p>
                                  <p>• <strong>Menos de {minToGuarantee} palpites</strong> → premiação vira 80% do arrecadado.</p>
                                  <p>• <strong>{breakeven}+ palpites</strong> → você empata os custos. Acima disso, vira lucro seu.</p>
                                </>
                              ) : (
                                <p>🧮 <strong>Exemplo:</strong> entrada R$ 10, prêmio R$ 100. Mínimo para garantir prêmio cheio = 13 palpites (100 + 25% ÷ 10). Com menos que isso, premiação = 80% do arrecadado.</p>
                              )}
                              {paymentMethod === 'in_app' && ((delfosFeeType === 'percent' && delfosFeePercent > 0) || (delfosFeeType === 'fixed' && delfosFeeFixed > 0)) && (
                                <p className="opacity-80">ℹ️ A taxa do app (10%, mínimo R$ 2,00 por palpite) é cobrada do participante por cima da entrada — não afeta a premiação nem o valor que vai para você.</p>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </>
                    );
                  })()}
                  {prizeType === 'percentage' && (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <button type="button" className="flex items-center justify-between w-full text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded-md border border-border hover:bg-muted/60 transition-colors">
                          <span>💡 Como funciona o % do Arrecadado</span>
                          <ChevronDown className="w-4 h-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="text-xs text-muted-foreground space-y-1.5 bg-muted/40 p-3 rounded-md border border-border mt-1">
                          <p>Você define qual porcentagem do total arrecadado vai para cada vencedor. O valor cresce conforme mais gente entra.</p>
                          <p>📊 <strong>Total arrecadado</strong> = nº de palpites pagos × valor de entrada.</p>
                          <p>🧮 <strong>Exemplo:</strong> entrada R$ 10, 20 palpites pagos = R$ 200 arrecadados. Se o 1º lugar leva 80%, o vencedor recebe R$ 160. O restante (20%) fica com você como organizador.</p>
                          <p>✅ A soma dos percentuais (vencedores + organizador) é sempre 100% do arrecadado.</p>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
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
                      <div className={`p-3 rounded-lg text-sm font-medium space-y-1 ${
                        totalPercentage > 100 
                          ? 'bg-destructive/10 text-destructive border border-destructive/30' 
                          : 'bg-muted/50 text-muted-foreground'
                      }`}>
                        {totalPercentage > 100 ? (
                          <p>⚠️ A soma das porcentagens ({totalPercentage}%) ultrapassa 100%!</p>
                        ) : (
                          <>
                            {remainingPercentage > 0 && (
                              <p>💰 {remainingPercentage}% do valor arrecadado fica com você (organizador)</p>
                            )}
                            {remainingPercentage === 0 && (
                              <p>✅ 100% do valor arrecadado vai para a premiação</p>
                            )}
                            {paymentMethod === 'in_app' && ((delfosFeeType === 'percent' && delfosFeePercent > 0) || (delfosFeeType === 'fixed' && delfosFeeFixed > 0)) && (
                              <p className="text-xs mt-1 opacity-80">
                                ℹ️ A taxa do app (10%, mínimo R$ 2,00 por palpite) é cobrada do participante por cima da entrada — não afeta a premiação nem o valor que vai para você.
                              </p>
                            )}
                          </>
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
                        <li>• Placar exato: <strong>3 pontos</strong></li>
                        <li>• Acertar o vencedor ou empate: <strong>1 ponto</strong></li>
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
                          <li>• Placar exato: <strong>3 pontos</strong></li>
                          <li>• Acertar o vencedor ou empate: <strong>1 ponto</strong></li>
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
                        Os participantes pagam direto no app via PIX (entrada + taxa do app cobrada deles por cima) e são aprovados automaticamente. Ao fim do bolão, o valor da entrada é repassado integralmente a você e ao vencedor.
                      </div>
                    </button>
                  </div>
                  {paymentMethod === 'in_app' && !profilePixKey && (
                    <div className="p-4 rounded-lg bg-destructive/5 border-2 border-destructive/30 space-y-3">
                      <div className="text-xs text-destructive font-medium">
                        ⚠️ Para receber dentro do app você precisa cadastrar sua chave PIX. É para essa chave que sua comissão será enviada ao final do bolão.
                      </div>
                      <PixKeyInput
                        value={inlinePixKey}
                        onChange={setInlinePixKey}
                        onTypeChange={(t) => setInlinePixKeyType(t)}
                        label="Sua chave PIX para receber a comissão"
                        required
                      />
                      <Button
                        type="button"
                        onClick={saveInlinePixKey}
                        disabled={savingInlinePix || !inlinePixKey.trim() || !inlinePixKeyType}
                        size="sm"
                        className="w-full"
                      >
                        {savingInlinePix ? "Salvando..." : "Salvar chave PIX"}
                      </Button>
                    </div>
                  )}
                  {userRole?.isAdmin && paymentMethod === 'in_app' && (
                    <div className="text-xs space-y-2 bg-primary/10 border border-primary/30 p-3 rounded-md">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          checked={waivePlatformFee}
                          onCheckedChange={(c) => setWaivePlatformFee(!!c)}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="font-semibold text-primary">🎁 Sem taxa do app (admin)</p>
                          <p className="text-muted-foreground">Os participantes pagam apenas o valor da entrada — a taxa do Delfos não é cobrada por cima.</p>
                        </div>
                      </label>
                    </div>
                  )}
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
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label className="text-lg">Jogos do Bolão {matches.length > 0 && <span className="text-sm text-muted-foreground font-normal">({matches.length})</span>}</Label>
                  <div className="flex items-center gap-2">
                    {matches.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(`Excluir todos os ${matches.length} jogos selecionados?`)) {
                            setMatches([]);
                            setDeadline("");
                            toast({ title: "Jogos removidos", description: "Todos os jogos foram excluídos." });
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Limpar todos
                      </Button>
                    )}
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
                </div>

                {matches.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-12 text-center">
                      <p className="text-muted-foreground">
                        Nenhum jogo selecionado ainda
                      </p>
                    </CardContent>
                  </Card>
                ) : (() => {
                  const wcMatches = matches.filter(m => isWorldCupMatch(m.championship));
                  const isWorldCup = wcMatches.length >= matches.length / 2 && wcMatches.length > 0;

                  const renderMatchCard = (match: Match, index: number) => (
                    <Card key={index} className="relative border-primary/50 bg-primary/5">
                      <CardContent className="py-3 px-3 sm:py-4 sm:px-6">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute top-1 right-1 h-7 w-7 p-0"
                          onClick={() => handleRemoveMatch(index)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <div className="space-y-1.5 pr-8">
                          {!isWorldCup && (
                            <span className="text-xs text-muted-foreground">{match.championship}</span>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {match.homeTeamCrest && (
                              <img src={proxyCrest(match.homeTeamCrest)} alt={match.homeTeam} className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )}
                            <span className="font-semibold text-sm sm:text-base">{match.homeTeam}</span>
                            <span className="text-muted-foreground text-xs">x</span>
                            <span className="font-semibold text-sm sm:text-base">{match.awayTeam}</span>
                            {match.awayTeamCrest && (
                              <img src={proxyCrest(match.awayTeamCrest)} alt={match.awayTeam} className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            {match.round && !isWorldCup && <span>📍 {match.round}</span>}
                            <span>📅 {format(new Date(match.matchDate), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );

                  if (isWorldCup) {
                    // Agrupa por grupo (A, B, C…) e renderiza em accordions
                    const groups = new Map<string, { match: Match; index: number }[]>();
                    matches.forEach((m, i) => {
                      const g = extractGroup(m.championship) || '?';
                      if (!groups.has(g)) groups.set(g, []);
                      groups.get(g)!.push({ match: m, index: i });
                    });
                    const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));

                    return (
                      <div className="space-y-2">
                        <div className="rounded-lg bg-primary/10 border border-primary/30 px-3 py-2 flex items-center justify-between">
                          <span className="text-sm font-semibold">🏆 Copa do Mundo 2026</span>
                          <Badge variant="secondary">{matches.length} jogos</Badge>
                        </div>
                        {sortedGroups.map(([group, items]) => (
                          <Collapsible key={group}>
                            <CollapsibleTrigger className="w-full flex items-center justify-between rounded-md border bg-card hover:bg-muted/40 px-3 py-2 transition-colors">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm">Grupo {group}</span>
                                <Badge variant="outline" className="text-[10px]">{items.length} jogos</Badge>
                              </div>
                              <ChevronDown className="w-4 h-4 transition-transform [&[data-state=open]]:rotate-180" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pt-2 space-y-2">
                              {items.map(({ match, index }) => renderMatchCard(match, index))}
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                      </div>
                    );
                  }

                  return <>{matches.map((match, index) => renderMatchCard(match, index))}</>;
                })()}
              </div>


              {paymentMethod === 'in_app' && profilePixKey && (
                <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    ✅ Confirme onde você vai receber sua comissão
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ao final do bolão, sua parte será enviada automaticamente via PIX para a chave abaixo (cadastrada no seu perfil):
                  </p>
                  <div className="rounded-md bg-background border p-3 flex items-center gap-2 flex-wrap">
                    {profilePixKeyType && (
                      <span className="inline-block bg-primary/15 text-primary rounded px-2 py-0.5 text-[11px] font-medium uppercase">
                        {profilePixKeyType}
                      </span>
                    )}
                    <span className="font-mono text-sm break-all">{profilePixKey}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Não é essa? <a href="/perfil" className="underline font-medium text-primary">Atualize no perfil</a> antes de criar o bolão.
                  </p>
                </div>
              )}

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
          minMinutesBeforeMatch={paymentMethod === 'in_app' ? 30 : 300}
        />
      </div>
    </div>
  );
};

export default CreateFootballPool;
