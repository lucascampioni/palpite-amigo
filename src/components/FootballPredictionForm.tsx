import { useState, useEffect, useRef } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Copy, Upload, AlertTriangle, Plus, Trash2, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PaymentProofSubmission } from "@/components/PaymentProofSubmission";
import { InAppPaymentSubmission } from "@/components/InAppPaymentSubmission";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { WorldCupPredictionGrid, isWorldCupPool } from "@/components/WorldCupPredictionGrid";


interface FootballPredictionFormProps {
  poolId: string;
  userId: string;
  onSuccess: () => void;
  entryFee?: number | null;
  pool?: any;
  pixKey?: string;
  firstMatchDate?: Date | null;
  ownerName?: string;
}

interface Match {
  id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  championship: string;
  home_team_crest?: string;
  away_team_crest?: string;
  external_id?: string;
  external_source?: string;
  status?: string;
}

interface Prediction {
  matchId: string;
  homeScore: string;
  awayScore: string;
}

type PredictionSet = Prediction[];

const FootballPredictionForm = ({ poolId, userId, onSuccess, entryFee, pool, pixKey, firstMatchDate, ownerName }: FootballPredictionFormProps) => {
  const { toast } = useToast();
  const formTopRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictionSets, setPredictionSets] = useState<PredictionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showDisclaimerDialog, setShowDisclaimerDialog] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [createdParticipantId, setCreatedParticipantId] = useState<string | null>(null);
  const [activeSetIndex, setActiveSetIndex] = useState(0);
  const [voucherPredictionSets, setVoucherPredictionSets] = useState<number | null>(null);
  const [estabelecimentoReady, setEstabelecimentoReady] = useState(false);
  const [showHighScoreWarning, setShowHighScoreWarning] = useState(false);
  const [highScoreMatches, setHighScoreMatches] = useState<{ match: Match; homeScore: string; awayScore: string; setIndex: number }[]>([]);
  const [appFee, setAppFee] = useState<{ type: 'percent' | 'fixed'; percent: number; fixed: number; percentMin: number } | null>(null);
  const [referralEligible, setReferralEligible] = useState(false);
  const [canEnterReferral, setCanEnterReferral] = useState(false);
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [availableCredits, setAvailableCredits] = useState(0);

  const isEstabelecimento = pool?.prize_type === 'estabelecimento';
  const hasEntryFee = !isEstabelecimento && pool?.entry_fee && parseFloat(pool.entry_fee) > 0;
  const feePerSet = hasEntryFee ? parseFloat(pool.entry_fee) : 0;
  // Quantos palpites são cobertos pelos créditos vs pagos
  const freeSetsApplied = hasEntryFee ? Math.min(predictionSets.length, availableCredits) : 0;
  const paidSets = hasEntryFee ? Math.max(0, predictionSets.length - availableCredits) : predictionSets.length;
  const totalFee = feePerSet * paidSets;
  const isInAppPayment = hasEntryFee && pool?.payment_method === 'in_app';

  // Calcula taxa do app por palpite (para exibição)
  const appFeePerSet = (() => {
    if (!appFee || !isInAppPayment) return 0;
    if (appFee.type === 'fixed') return appFee.fixed;
    const percentValue = +(feePerSet * appFee.percent / 100).toFixed(2);
    return Math.max(percentValue, appFee.percentMin || 0);
  })();
  const appFeeTotal = +(appFeePerSet * paidSets).toFixed(2);

  useEffect(() => {
    loadMatches();
  }, [poolId]);

  useEffect(() => {
    if (!isInAppPayment) return;
    (async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['delfos_fee_type', 'delfos_fee_percent', 'delfos_fee_fixed', 'delfos_fee_percent_min']);
      if (!data) return;
      const map: Record<string, any> = {};
      for (const r of data) map[r.key] = r.value;
      setAppFee({
        type: map.delfos_fee_type === 'fixed' ? 'fixed' : 'percent',
        percent: Number(map.delfos_fee_percent ?? 0),
        fixed: Number(map.delfos_fee_fixed ?? 0),
        percentMin: Number(map.delfos_fee_percent_min ?? 0),
      });
    })();
  }, [isInAppPayment]);

  // Verifica elegibilidade de indicação e carrega créditos disponíveis
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: eligData } = await supabase.rpc("is_pool_referral_eligible", { p_pool_id: poolId });
      if (cancelled) return;
      const isElig = !!eligData;
      setReferralEligible(isElig);

      if (isElig) {
        const { data: existing } = await supabase
          .from("pool_referrals")
          .select("id")
          .eq("pool_id", poolId)
          .eq("referred_user_id", userId)
          .limit(1);
        if (cancelled) return;
        setCanEnterReferral(!existing || existing.length === 0);
      }

      // Carrega créditos disponíveis (palpites grátis ganhos por indicações)
      const { count } = await supabase
        .from("referral_credits")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("pool_id", poolId)
        .is("consumed_at", null);
      if (cancelled) return;
      setAvailableCredits(count || 0);
    })();
    return () => { cancelled = true; };
  }, [poolId, userId]);

  const loadMatches = async () => {
    const { data, error } = await supabase
      .from("football_matches")
      .select("*")
      .eq("pool_id", poolId)
      .order("match_date", { ascending: true });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao carregar jogos.",
      });
    } else if (data) {
      setMatches(data);
      // Initialize with one prediction set
      setPredictionSets([data.map(m => ({ matchId: m.id, homeScore: '', awayScore: '' }))]);

      // Tentar obter e salvar escudos quando faltarem
      const needsCrests = data.filter((m: any) => (!m.home_team_crest || !m.away_team_crest) && m.external_source === 'apifb' && (m.external_id || '').startsWith('fd_'));
      if (needsCrests.length > 0) {
        try {
          const results = await Promise.all(needsCrests.map(async (m: any) => {
            const apiMatchId = String((m.external_id || '').replace(/^fd_/, ''));
            const { data: crestData, error } = await supabase.functions.invoke('get-match-crests', {
              body: { matchId: apiMatchId }
            });
            if (error || !crestData) return null;

            await supabase
              .from('football_matches')
              .update({
                home_team_crest: crestData.homeTeamCrest || null,
                away_team_crest: crestData.awayTeamCrest || null,
              })
              .eq('id', m.id);

            return { id: m.id, ...crestData } as any;
          }));

          const crestMap = new Map(results.filter(Boolean).map((r: any) => [r.id, r]));
          setMatches(prev => prev.map((m: any) => crestMap.has(m.id)
            ? { ...m, home_team_crest: crestMap.get(m.id).homeTeamCrest, away_team_crest: crestMap.get(m.id).awayTeamCrest }
            : m
          ));
        } catch (e) {
          console.warn('Falha ao enriquecer escudos:', e);
        }
      }
    }

    setLoading(false);
  };

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const focusNextScoreInput = (matchId: string, field: 'homeScore' | 'awayScore') => {
    const validMatches = matches.filter((m: any) => {
      const s = m.status;
      return s !== 'postponed' && s !== 'cancelled' && s !== 'abandoned';
    });
    const seq: string[] = [];
    validMatches.forEach((m) => {
      seq.push(`${m.id}:home`);
      seq.push(`${m.id}:away`);
    });
    const currentKey = `${matchId}:${field === 'homeScore' ? 'home' : 'away'}`;
    const idx = seq.indexOf(currentKey);
    if (idx < 0 || idx >= seq.length - 1) return;
    const nextEl = inputRefs.current[seq[idx + 1]];
    if (nextEl) {
      nextEl.focus();
      nextEl.select?.();
    }
  };

  const handlePredictionChange = (setIndex: number, matchId: string, field: 'homeScore' | 'awayScore', value: string) => {
    if (value === '' || (/^\d+$/.test(value) && parseInt(value) <= 99)) {
      setPredictionSets(prev =>
        prev.map((set, i) =>
          i === setIndex
            ? set.map(p => p.matchId === matchId ? { ...p, [field]: value } : p)
            : set
        )
      );
      // Auto-pula para o próximo input ao digitar pelo menos 1 dígito
      if (value.length >= 1) {
        requestAnimationFrame(() => focusNextScoreInput(matchId, field));
      }
    }
  };


  const addPredictionSet = () => {
    setPredictionSets(prev => [
      ...prev,
      matches.map(m => ({ matchId: m.id, homeScore: '', awayScore: '' }))
    ]);
    setActiveSetIndex(predictionSets.length);
    // Scroll to top and tabs after adding
    setTimeout(() => {
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const removePredictionSet = (setIndex: number) => {
    if (predictionSets.length <= 1) return;
    setPredictionSets(prev => prev.filter((_, i) => i !== setIndex));
    if (activeSetIndex >= predictionSets.length - 1) {
      setActiveSetIndex(Math.max(0, predictionSets.length - 2));
    } else if (activeSetIndex > setIndex) {
      setActiveSetIndex(activeSetIndex - 1);
    }
  };

  // For estabelecimento pools, auto-detect user's voucher entry
  useEffect(() => {
    if (!isEstabelecimento || !matches.length) return;
    const checkEstabelecimentoEntry = async () => {
      const { data } = await supabase
        .from("pool_vouchers")
        .select("prediction_sets")
        .eq("pool_id", poolId)
        .eq("used_by", userId)
        .maybeSingle();

      if (data) {
        const sets = (data as any).prediction_sets || 1;
        setVoucherPredictionSets(sets);
        const newSets: PredictionSet[] = [];
        for (let i = 0; i < sets; i++) {
          newSets.push(matches.map(m => ({ matchId: m.id, homeScore: '', awayScore: '' })));
        }
        setPredictionSets(newSets);
        setActiveSetIndex(0);
        setEstabelecimentoReady(true);
      }
    };
    checkEstabelecimentoEntry();
  }, [isEstabelecimento, matches, poolId, userId]);

  const proceedToDisclaimer = () => {
    // When payment is handled in-app, no disclaimer is needed.
    // Also skip if no actual fee is owed (e.g. all sets covered by referral credits).
    if (isInAppPayment || !hasEntryFee || paidSets === 0) {
      handleConfirmSubmit();
      return;
    }
    setDisclaimerAccepted(false);
    setShowDisclaimerDialog(true);
  };

  const handleSubmitClick = () => {
    // For estabelecimento pools, check that user was registered
    if (isEstabelecimento && !estabelecimentoReady) {
      toast({
        variant: "destructive",
        title: "Acesso não liberado",
        description: "O dono do estabelecimento precisa cadastrar seu número para liberar a entrada.",
      });
      return;
    }

    // Validate all predictions in all sets are filled (skip postponed matches)
    for (let i = 0; i < predictionSets.length; i++) {
      const hasEmpty = predictionSets[i].some(p => {
        const match = matches.find(m => m.id === p.matchId);
        const isPostponed = (match as any)?.status === 'postponed' || (match as any)?.status === 'cancelled' || (match as any)?.status === 'abandoned';
        if (isPostponed) return false;
        return p.homeScore === '' || p.awayScore === '';
      });
      if (hasEmpty) {
        setActiveSetIndex(i);
        toast({
          variant: "destructive",
          title: "Erro",
          description: `Preencha todos os placares do Palpite ${i + 1}.`,
        });
        return;
      }
    }

    // Check for unusually high scores (2+ digits, i.e. >= 10)
    const unusualPredictions: { match: Match; homeScore: string; awayScore: string; setIndex: number }[] = [];
    for (let i = 0; i < predictionSets.length; i++) {
      for (const p of predictionSets[i]) {
        const home = parseInt(p.homeScore);
        const away = parseInt(p.awayScore);
        if (home >= 10 || away >= 10) {
          const match = matches.find(m => m.id === p.matchId);
          if (match) {
            unusualPredictions.push({ match, homeScore: p.homeScore, awayScore: p.awayScore, setIndex: i });
          }
        }
      }
    }

    if (unusualPredictions.length > 0) {
      setHighScoreMatches(unusualPredictions);
      setShowHighScoreWarning(true);
      return;
    }

    proceedToDisclaimer();
  };

  const handleConfirmSubmit = async () => {
    setShowDisclaimerDialog(false);
    setSubmitting(true);

    // Determina status inicial: estabelecimento sempre aprovado; com taxa, aprovado se todos os palpites forem cobertos por créditos
    const allCoveredByCredits = hasEntryFee && paidSets === 0;
    const initialStatus = isEstabelecimento || !hasEntryFee || allCoveredByCredits ? "approved" : "pending";

    // Find the max prediction_set already used by this user in this pool
    let maxExistingSet = 0;
    const { data: existingSets } = await supabase
      .from("football_predictions")
      .select("prediction_set, participants!inner(pool_id, user_id)")
      .eq("participants.pool_id", poolId)
      .eq("participants.user_id", userId);
    if (existingSets) {
      for (const row of existingSets as any[]) {
        if (row.prediction_set > maxExistingSet) maxExistingSet = row.prediction_set;
      }
    }


    // Reuse "approved without predictions" entry (estabelecimento OR referral reward)
    {
      const { data: approvedRowsRaw } = await supabase
        .from("participants")
        .select("id, participant_financials(payment_proof)")
        .eq("pool_id", poolId)
        .eq("user_id", userId)
        .eq("status", "approved");
      const approvedRows = (approvedRowsRaw || []).map((r: any) => {
        const f = Array.isArray(r.participant_financials) ? r.participant_financials[0] : r.participant_financials;
        return { id: r.id, payment_proof: f?.payment_proof ?? null };
      });

      if (approvedRows && approvedRows.length > 0) {
        let reusableId: string | null = null;
        for (const row of approvedRows) {
          if (!isEstabelecimento && !((row.payment_proof || "").startsWith("referral_reward"))) continue;
          const { count } = await supabase
            .from("football_predictions")
            .select("id", { count: "exact", head: true })
            .eq("participant_id", row.id);
          if ((count || 0) === 0) { reusableId = row.id; break; }
        }

        if (reusableId) {
          await supabase
            .from("participants")
            .update({ guess_value: `${predictionSets.length} palpite${predictionSets.length > 1 ? 's' : ''}` })
            .eq("id", reusableId);

          const allPredictions = predictionSets.flatMap((set, setIndex) =>
            set.filter(p => {
              const match = matches.find(m => m.id === p.matchId);
              return !['postponed', 'cancelled', 'abandoned'].includes(match?.status || '');
            }).map(p => ({
              participant_id: reusableId!,
              match_id: p.matchId,
              home_score_prediction: parseInt(p.homeScore),
              away_score_prediction: parseInt(p.awayScore),
              prediction_set: maxExistingSet + setIndex + 1,
            }))
          );

          const { error: predictionsError } = await supabase
            .from("football_predictions")
            .insert(allPredictions);

          if (predictionsError) {
            toast({ variant: "destructive", title: "Erro", description: predictionsError.message });
          } else {
            toast({
              title: "🎉 Palpites enviados!",
              description: `${predictionSets.length} palpite${predictionSets.length > 1 ? 's' : ''} salvo${predictionSets.length > 1 ? 's' : ''}. Boa sorte! 🍀`,
              duration: 5000,
            });
            setSubmitted(true);
            onSuccess();
          }
          setSubmitting(false);
          return;
        }
      }
    }


    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();

    if (!profile?.full_name || profile.full_name === "Usuário") {
      toast({
        variant: "destructive",
        title: "Nome não encontrado",
        description: "Atualize seu nome completo no perfil antes de participar.",
      });
      setSubmitting(false);
      return;
    }

    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .insert({
        pool_id: poolId,
        user_id: userId,
        participant_name: profile.full_name,
        guess_value: `${predictionSets.length} palpite${predictionSets.length > 1 ? 's' : ''}`,
        status: initialStatus,
      })
      .select()
      .single();

    if (participantError || !participant) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: participantError?.message || "Erro ao criar participante.",
      });
      setSubmitting(false);
      return;
    }

    // Create predictions for all sets
    const allPredictions = predictionSets.flatMap((set, setIndex) =>
      set.map(p => ({
        participant_id: participant.id,
        match_id: p.matchId,
        home_score_prediction: parseInt(p.homeScore),
        away_score_prediction: parseInt(p.awayScore),
        prediction_set: maxExistingSet + setIndex + 1,
      }))
    );

    const { error: predictionsError } = await supabase
      .from("football_predictions")
      .insert(allPredictions);

    if (predictionsError) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: predictionsError.message,
      });
      await supabase.from("participants").delete().eq("id", participant.id);
    } else {
      // Consumir créditos de indicação aplicáveis
      if (freeSetsApplied > 0) {
        const { data: creditsToConsume } = await supabase
          .from("referral_credits")
          .select("id")
          .eq("user_id", userId)
          .eq("pool_id", poolId)
          .is("consumed_at", null)
          .limit(freeSetsApplied);
        const ids = (creditsToConsume || []).map((c: any) => c.id);
        if (ids.length > 0) {
          await supabase
            .from("referral_credits")
            .update({ consumed_at: new Date().toISOString(), consumed_participant_id: participant.id })
            .in("id", ids);
        }
      }

      // Registra indicação se o usuário digitou um código válido e o bolão é elegível
      const codeTrimmed = referralCodeInput.trim().toUpperCase();
      if (referralEligible && canEnterReferral && codeTrimmed.length > 0) {
        const { data: refUserId } = await supabase.rpc("get_user_id_by_referral_code", { _code: codeTrimmed });
        if (refUserId && refUserId !== userId) {
          const { error: refErr } = await supabase
            .from("pool_referrals")
            .insert({
              pool_id: poolId,
              referrer_user_id: refUserId,
              referred_user_id: userId,
              referred_participant_id: participant.id,
              status: "pending",
            });
          if (!refErr && initialStatus === "approved") {
            supabase.functions
              .invoke("process-referral-rewards", {
                body: { pool_id: poolId, referred_user_id: userId },
              })
              .catch(() => {});
          }
        }
      }

      if (hasEntryFee && paidSets > 0) {
        setCreatedParticipantId(participant.id);
        setShowPaymentDialog(true);
      } else {
        toast({
          title: "🎉 Você está inscrito no bolão!",
          description: `${predictionSets.length} palpite${predictionSets.length > 1 ? 's' : ''} salvo${predictionSets.length > 1 ? 's' : ''}${freeSetsApplied > 0 ? ` (${freeSetsApplied} grátis por indicação)` : ''}. Boa sorte! 🍀`,
          duration: 5000,
        });
      }
      setSubmitted(true);
      onSuccess();
    }

    setSubmitting(false);
  };

  const handlePaymentDialogClose = () => {
    setShowPaymentDialog(false);
  };

  if (submitted) {
    return (
      <div className="space-y-4">
        {hasEntryFee ? (
          <>
            <div className="p-6 rounded-lg bg-orange-50 dark:bg-orange-950 border-2 border-orange-200 dark:border-orange-800 text-center">
              <p className="text-lg font-semibold text-orange-700 dark:text-orange-300 mb-2">
                ⚠️ Palpites registrados!
              </p>
              <p className="text-sm text-muted-foreground">
                {predictionSets.length > 1
                  ? `Você fez ${predictionSets.length} palpites. Valor total: R$ ${totalFee.toFixed(2).replace('.', ',')}. Envie o comprovante abaixo.`
                  : 'Para confirmar sua participação, envie o comprovante de pagamento abaixo.'}
              </p>
            </div>

            <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    💳 Pagamento necessário
                  </DialogTitle>
                  <DialogDescription>
                    {predictionSets.length > 1
                      ? `Seus ${predictionSets.length} palpites foram salvos! Valor total: R$ ${totalFee.toFixed(2).replace('.', ',')}. Envie o comprovante.`
                      : 'Seus palpites foram salvos! Agora envie o comprovante para ser aprovado no bolão.'}
                  </DialogDescription>
                </DialogHeader>
                {createdParticipantId && pool?.payment_method === 'in_app' ? (
                  <InAppPaymentSubmission
                    participantId={createdParticipantId}
                    poolId={poolId}
                    poolTitle={pool?.title || ''}
                    entryFee={totalFee}
                    onSuccess={() => {
                      setShowPaymentDialog(false);
                      onSuccess();
                    }}
                  />
                ) : createdParticipantId && (
                  <PaymentProofSubmission
                    participantId={createdParticipantId}
                    poolId={poolId}
                    poolTitle={pool?.title || ''}
                    entryFee={totalFee}
                    pixKey={pixKey}
                    onSuccess={() => {
                      setShowPaymentDialog(false);
                      onSuccess();
                    }}
                  />
                )}
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <div className="p-6 rounded-lg bg-green-50 dark:bg-green-950 border-2 border-green-200 dark:border-green-800 text-center">
            <p className="text-lg font-semibold text-green-700 dark:text-green-300 mb-2">
              🎉 Você está inscrito no bolão!
            </p>
            <p className="text-sm text-muted-foreground">
              Boa sorte! {predictionSets.length > 1 ? `Seus ${predictionSets.length} palpites foram salvos.` : 'Seus palpites foram salvos.'} Agora é só esperar a conclusão dos jogos. 🍀
            </p>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return <p className="text-muted-foreground">Carregando jogos...</p>;
  }

  if (matches.length === 0) {
    return <p className="text-muted-foreground">Nenhum jogo encontrado.</p>;
  }

  const currentPredictions = predictionSets[activeSetIndex] || [];

  const predictionCutoffDate = firstMatchDate 
    ? new Date(firstMatchDate.getTime() - 3 * 60 * 60 * 1000) 
    : pool?.deadline ? new Date(pool.deadline) : null;
  const proofCutoffDate = firstMatchDate 
    ? new Date(firstMatchDate.getTime() - 2.5 * 60 * 60 * 1000) 
    : null;

  return (
    <div className="space-y-4" ref={formTopRef}>
      <h3 className="font-semibold text-lg">Faça seus palpites</h3>

      {/* Informações importantes - before predictions */}
      <Collapsible>
        <CollapsibleTrigger className="w-full p-3 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-between text-sm font-medium hover:bg-secondary/20 transition-colors">
          <span>💡 Informações importantes</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-2 rounded-b-lg bg-secondary/10 border border-t-0 border-secondary/20 space-y-1">
            <p className="text-xs text-muted-foreground">
              • O vencedor do bolão será definido de acordo com o resultado dos jogos.
            </p>
            {predictionCutoffDate && (
              <p className="text-xs text-muted-foreground">
                • Prazo para apostas: <strong>{format(predictionCutoffDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</strong> (3h antes do primeiro jogo).
              </p>
            )}
            {hasEntryFee && proofCutoffDate && pool?.payment_method !== 'in_app' && (
              <>
                <p className="text-xs text-muted-foreground">
                  • Prazo para comprovante de pagamento: <strong>{format(proofCutoffDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</strong> (2h30 antes do primeiro jogo).
                </p>
                <p className="text-xs text-destructive font-medium">
                  • Quem não enviar o comprovante até o prazo será <strong>rejeitado automaticamente</strong>.
                </p>
              </>
            )}
            {hasEntryFee && pool?.payment_method === 'in_app' && (
              <p className="text-xs text-muted-foreground">
                • Pagamento via PIX automático no app — sua participação é confirmada na hora após o pagamento.
              </p>
            )}
            <div className="mt-2 pt-2 border-t border-secondary/20">
              <p className="text-xs text-muted-foreground font-medium">📊 Sistema de Pontuação:</p>
              {(pool?.scoring_system === 'exact_only' || pool?.scoring_system === 'simplified') ? (
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground text-xs mt-1">
                  <li><strong>1 ponto</strong>: Placar exato</li>
                  <li><strong>0 pontos</strong>: Qualquer outro resultado</li>
                </ul>
              ) : (
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground text-xs mt-1">
                  <li><strong>3 pontos</strong>: Placar exato</li>
                  <li><strong>1 ponto</strong>: Acertar o vencedor ou empate</li>
                </ul>
              )}
            </div>
            <div className="mt-2 pt-2 border-t border-secondary/20">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                ✅ <strong>Critério de empate:</strong>
              </p>
              {pool?.max_winners === 1 ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Se houver empate na maior pontuação, o prêmio do 1º lugar será dividido igualmente entre todos os empatados.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  Se houver empate, os valores das posições empatadas serão somados e divididos igualmente entre os vencedores.
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                ⏱️ Se ninguém fizer pontos, o desempate será pela ordem de envio dos palpites — quem enviou primeiro leva a premiação.
              </p>
            </div>
            <div className="mt-2 pt-2 border-t border-secondary/20">
              <p className="text-xs text-muted-foreground">
                📅 <strong>Jogos adiados:</strong> Se um jogo for adiado, cancelado ou abandonado, ele será automaticamente anulado e não contará na pontuação do bolão.
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Info message for estabelecimento pools */}
      {isEstabelecimento && estabelecimentoReady && voucherPredictionSets && (
        <div className="p-3 rounded-lg border-2 border-green-500/30 bg-green-50/50 dark:bg-green-950/20">
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            ✅ Você está inscrito! {voucherPredictionSets > 1 ? `${voucherPredictionSets} palpites liberados.` : '1 palpite liberado.'} Preencha abaixo.
          </p>
        </div>
      )}

      {isEstabelecimento && !estabelecimentoReady && !loading && (
        <div className="p-4 rounded-lg border-2 border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 text-center">
          <Info className="w-6 h-6 text-amber-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Aguardando liberação
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            O dono do estabelecimento precisa cadastrar seu número de telefone para liberar sua entrada no bolão.
          </p>
        </div>
      )}

      {/* Hide predictions until ready for estabelecimento */}
      {(!isEstabelecimento || estabelecimentoReady) && (
      <>
      {/* Prediction set tabs */}
      <div ref={tabsRef} className="flex items-center gap-2 flex-wrap p-3 rounded-lg bg-muted/60 border border-border">
        {predictionSets.map((_, i) => (
          <Button
            key={i}
            variant={activeSetIndex === i ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveSetIndex(i)}
            className={`relative ${activeSetIndex === i ? 'ring-2 ring-primary/50 shadow-md' : ''}`}
          >
            🎯 Palpite {i + 1}
            {predictionSets.length > 1 && !isEstabelecimento && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removePredictionSet(i);
                }}
                className="ml-1.5 -mr-1 text-xs opacity-60 hover:opacity-100"
                title="Remover palpite"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </Button>
        ))}
      </div>

      {/* Current set matches — Visual especial Copa do Mundo, ou padrão */}
      {isWorldCupPool(matches) ? (
        <WorldCupPredictionGrid
          matches={matches}
          currentPredictions={currentPredictions}
          activeSetIndex={activeSetIndex}
          onChange={handlePredictionChange}
        />
      ) : (
        matches.map((match) => {
        const prediction = currentPredictions.find(p => p.matchId === match.id);
        const isPostponed = (match as any).status === 'postponed' || (match as any).status === 'cancelled' || (match as any).status === 'abandoned';
        return (
          <Card key={match.id} className={isPostponed ? 'opacity-50 relative' : ''}>
            {isPostponed && (
              <div className="absolute top-2 right-2 z-10">
                <Badge variant="destructive" className="text-[0.65rem] px-2 py-0.5">
                  ⚠️ Não conta — Jogo adiado
                </Badge>
              </div>
            )}
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {match.home_team} vs {match.away_team}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {format(new Date(match.match_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
              {isPostponed && (
                <p className="text-xs text-destructive font-medium mt-1">
                  Esta partida foi adiada e não será contabilizada no bolão.
                </p>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {match.home_team_crest && (
                      <img 
                        src={match.home_team_crest} 
                        alt={match.home_team}
                        className="w-6 h-6 object-contain"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    <Label>{match.home_team}</Label>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max="99"
                    placeholder={isPostponed ? "—" : ""}
                    value={prediction?.homeScore || ''}
                    onChange={(e) => handlePredictionChange(activeSetIndex, match.id, 'homeScore', e.target.value)}
                    required={!isPostponed}
                    disabled={isPostponed}
                    ref={(el) => { inputRefs.current[`${match.id}:home`] = el; }}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {match.away_team_crest && (
                      <img 
                        src={match.away_team_crest} 
                        alt={match.away_team}
                        className="w-6 h-6 object-contain"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    <Label>{match.away_team}</Label>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max="99"
                    placeholder={isPostponed ? "—" : ""}
                    value={prediction?.awayScore || ''}
                    onChange={(e) => handlePredictionChange(activeSetIndex, match.id, 'awayScore', e.target.value)}
                    required={!isPostponed}
                    disabled={isPostponed}
                    ref={(el) => { inputRefs.current[`${match.id}:away`] = el; }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })
      )}

      {/* Add prediction set button + fee warning (hide for estabelecimento) */}
      {!isEstabelecimento && (
        <div className="space-y-2">
          <Button
            variant="outline"
            onClick={addPredictionSet}
            className="w-full border-dashed"
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar mais um palpite
          </Button>
          {hasEntryFee && predictionSets.length < availableCredits && (
            <p className="text-xs text-center text-emerald-600 dark:text-emerald-400 font-medium">
              🎁 Próximo palpite ainda é grátis (você tem {availableCredits - predictionSets.length} crédito{availableCredits - predictionSets.length > 1 ? 's' : ''} restante{availableCredits - predictionSets.length > 1 ? 's' : ''})
            </p>
          )}
          {hasEntryFee && predictionSets.length >= availableCredits && (
            <p className="text-xs text-center text-orange-600 dark:text-orange-400 font-medium">
              ⚠️ Cada palpite adicional acrescenta <strong>R$ {feePerSet.toFixed(2).replace('.', ',')}</strong> ao valor da inscrição
            </p>
          )}
        </div>
      )}


      </>
      )}

      {/* Código de indicação (apenas em bolões elegíveis) */}
      {referralEligible && canEnterReferral && (!isEstabelecimento || estabelecimentoReady) && (
        <div className="p-3 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 space-y-2">
          <Label htmlFor="referral-code" className="text-sm font-semibold flex items-center gap-2">
            🎁 Tem um código de indicação?
          </Label>
          <p className="text-xs text-muted-foreground">
            Se um amigo te indicou, digite o código dele abaixo. Quando sua inscrição for aprovada, ele vai ganhar a <strong>mesma quantidade de palpites grátis</strong> que você enviar aqui (enviou 3 palpites, ele ganha 3 palpites grátis).
          </p>
          <Input
            id="referral-code"
            placeholder="Ex.: ABC123"
            value={referralCodeInput}
            onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase().slice(0, 12))}
            className="uppercase tracking-widest font-mono"
            maxLength={12}
          />
        </div>
      )}

      {/* Submit area with summary */}
      <div className="space-y-2">
        {hasEntryFee && availableCredits > 0 && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm space-y-1">
            <p className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              🎁 Você tem {availableCredits} palpite{availableCredits > 1 ? 's' : ''} grátis por indicação
            </p>
            {predictionSets.length <= availableCredits ? (
              <p className="text-xs text-muted-foreground">
                Todos os seus {predictionSets.length} palpite{predictionSets.length > 1 ? 's' : ''} serão cobertos pelos créditos. <strong>Nada a pagar!</strong>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {freeSetsApplied} palpite{freeSetsApplied > 1 ? 's' : ''} grátis aplicado{freeSetsApplied > 1 ? 's' : ''} · {paidSets} palpite{paidSets > 1 ? 's' : ''} a pagar (R$ {totalFee.toFixed(2).replace('.', ',')})
              </p>
            )}
          </div>
        )}
        {(predictionSets.length > 1 || hasEntryFee) && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm text-center space-y-1">
            <p className="font-semibold">
              🎯 {predictionSets.length} palpite{predictionSets.length > 1 ? 's' : ''}
              {hasEntryFee && (
                <> · 💰 R$ {totalFee.toFixed(2).replace('.', ',')}</>
              )}
            </p>
            {hasEntryFee && paidSets > 1 && (
              <p className="text-xs text-muted-foreground">
                {paidSets} × R$ {feePerSet.toFixed(2).replace('.', ',')} cada
                {freeSetsApplied > 0 && <> · {freeSetsApplied} grátis</>}
              </p>
            )}
            {hasEntryFee && paidSets === 0 && availableCredits > 0 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                ✨ Tudo coberto pelos seus créditos de indicação
              </p>
            )}
          </div>
        )}
        {isInAppPayment && !pool?.waive_platform_fee && appFee && (appFee.percent > 0 || appFee.fixed > 0) && appFeePerSet > 0 && (
          <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30 text-xs text-orange-700 dark:text-orange-300 flex gap-2 items-start">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-left">
              <p className="font-medium">
                Além do valor do bolão, será cobrada uma taxa de manutenção do app de{' '}
                <strong>R$ {appFeePerSet.toFixed(2).replace('.', ',')}</strong> por palpite.
              </p>
              {appFeePerSet > 0 && (
                <p className="text-[11px] opacity-90">
                  Taxa total: <strong>R$ {appFeeTotal.toFixed(2).replace('.', ',')}</strong>
                  {' · '}Total a pagar:{' '}
                  <strong>R$ {(totalFee + appFeeTotal).toFixed(2).replace('.', ',')}</strong>
                </p>
              )}
            </div>
          </div>
        )}
        <Button
          onClick={handleSubmitClick}
          disabled={submitting || (isEstabelecimento && !estabelecimentoReady)}
          className="w-full"
          size="lg"
        >
        {submitting ? "Enviando..." : (hasEntryFee && paidSets > 0
              ? (paidSets > 1
                  ? `Continuar para o pagamento (R$ ${totalFee.toFixed(2).replace('.', ',')})`
                  : "Continuar para o pagamento")
              : (predictionSets.length > 1
                  ? `Enviar ${predictionSets.length} Palpites e Participar`
                  : "Enviar Palpites e Participar"))}
        </Button>
      </div>

      {/* High Score Warning Dialog */}
      <Dialog open={showHighScoreWarning} onOpenChange={setShowHighScoreWarning}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              Placar incomum detectado
            </DialogTitle>
            <DialogDescription>
              Você colocou placares com valores altos, o que é incomum em jogos de futebol. Tem certeza que os placares abaixo estão corretos?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 my-2">
            {highScoreMatches.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <span className="text-sm font-medium">
                  {predictionSets.length > 1 && <span className="text-muted-foreground mr-1">Palpite {item.setIndex + 1}:</span>}
                  {item.match.home_team} <span className="font-bold text-amber-700 dark:text-amber-400">{item.homeScore}</span> x <span className="font-bold text-amber-700 dark:text-amber-400">{item.awayScore}</span> {item.match.away_team}
                </span>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowHighScoreWarning(false)}>
              Corrigir palpites
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                setShowHighScoreWarning(false);
                proceedToDisclaimer();
              }}
            >
              Confirmar placares
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disclaimer Dialog */}
      <Dialog open={showDisclaimerDialog} onOpenChange={setShowDisclaimerDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Aviso Importante
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {hasEntryFee && predictionSets.length > 1 && (
              <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800 text-sm">
                <p className="font-medium text-orange-700 dark:text-orange-400">
                  💰 Você está enviando {predictionSets.length} palpites
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Valor total a pagar: <strong>R$ {totalFee.toFixed(2).replace('.', ',')}</strong> ({predictionSets.length} × R$ {feePerSet.toFixed(2).replace('.', ',')})
                </p>
              </div>
            )}
            <div className="p-4 rounded-lg bg-destructive/10 border-2 border-destructive/30">
              <p className="text-sm font-bold text-destructive mb-2">
                ⚠️ ATENÇÃO: Leia com cuidado antes de continuar
              </p>
              <p className="text-sm text-foreground leading-relaxed">
                A <strong>responsabilidade pelo pagamento da premiação é exclusivamente do criador do bolão{ownerName ? ` (${ownerName})` : ''}</strong>. 
                O <strong>Delfos</strong> é apenas uma plataforma que facilita a organização de bolões e <strong>não se responsabiliza</strong> pelo pagamento de prêmios, valores de entrada ou quaisquer transações financeiras entre os participantes e organizadores.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <Checkbox
                id="disclaimer-accept"
                checked={disclaimerAccepted}
                onCheckedChange={(checked) => setDisclaimerAccepted(checked === true)}
                className="mt-0.5"
              />
              <label htmlFor="disclaimer-accept" className="text-sm font-medium cursor-pointer leading-snug">
                Estou ciente de que a responsabilidade pelo pagamento da premiação é do criador do bolão{ownerName ? ` (${ownerName})` : ''} e não do Delfos.
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDisclaimerDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmSubmit} disabled={!disclaimerAccepted || submitting}>
              {submitting ? "Carregando..." : "Ir para o pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FootballPredictionForm;
