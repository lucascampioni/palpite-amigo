import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Copy, Upload, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PaymentProofSubmission } from "@/components/PaymentProofSubmission";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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

  const hasEntryFee = pool?.entry_fee && parseFloat(pool.entry_fee) > 0;
  const feePerSet = hasEntryFee ? parseFloat(pool.entry_fee) : 0;
  const totalFee = feePerSet * predictionSets.length;

  useEffect(() => {
    loadMatches();
  }, [poolId]);

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

  const handlePredictionChange = (setIndex: number, matchId: string, field: 'homeScore' | 'awayScore', value: string) => {
    if (value === '' || (/^\d+$/.test(value) && parseInt(value) <= 99)) {
      setPredictionSets(prev =>
        prev.map((set, i) =>
          i === setIndex
            ? set.map(p => p.matchId === matchId ? { ...p, [field]: value } : p)
            : set
        )
      );
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

  const handleSubmitClick = () => {
    // Validate all predictions in all sets are filled
    for (let i = 0; i < predictionSets.length; i++) {
      const hasEmpty = predictionSets[i].some(p => p.homeScore === '' || p.awayScore === '');
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
    setDisclaimerAccepted(false);
    setShowDisclaimerDialog(true);
  };

  const handleConfirmSubmit = async () => {
    setShowDisclaimerDialog(false);
    setSubmitting(true);

    const initialStatus = hasEntryFee ? "pending" : "approved";

    // Check if user already has a non-rejected participant record in this pool
    const { data: existingParticipant } = await supabase
      .from("participants")
      .select("id, status")
      .eq("pool_id", poolId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingParticipant && existingParticipant.status !== 'rejected') {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Você já está participando deste bolão. Não é possível enviar novos palpites.",
      });
      setSubmitting(false);
      return;
    }

    // If there's a rejected record, delete it and its predictions first
    if (existingParticipant && existingParticipant.status === 'rejected') {
      await supabase
        .from("football_predictions")
        .delete()
        .eq("participant_id", existingParticipant.id);
      await supabase
        .from("participants")
        .delete()
        .eq("id", existingParticipant.id);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();

    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .insert({
        pool_id: poolId,
        user_id: userId,
        participant_name: profile?.full_name || "Usuário",
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
        prediction_set: setIndex + 1,
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
      if (hasEntryFee) {
        setCreatedParticipantId(participant.id);
        setShowPaymentDialog(true);
      } else {
        toast({
          title: "🎉 Você está inscrito no bolão!",
          description: `${predictionSets.length} palpite${predictionSets.length > 1 ? 's' : ''} salvo${predictionSets.length > 1 ? 's' : ''}. Boa sorte! 🍀`,
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
                {createdParticipantId && (
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
      <div className="p-4 rounded-lg bg-secondary/10 border border-secondary/20">
        <p className="text-sm font-medium mb-2">
          💡 Informações importantes
        </p>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            • O vencedor do bolão será definido de acordo com o resultado dos jogos.
          </p>
          {predictionCutoffDate && (
            <p className="text-xs text-muted-foreground">
              • Prazo para apostas: <strong>{format(predictionCutoffDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</strong> (3h antes do primeiro jogo).
            </p>
          )}
          {hasEntryFee && proofCutoffDate && (
            <>
              <p className="text-xs text-muted-foreground">
                • Prazo para comprovante de pagamento: <strong>{format(proofCutoffDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</strong> (2h30 antes do primeiro jogo).
              </p>
              <p className="text-xs text-destructive font-medium">
                • Quem não enviar o comprovante até o prazo será <strong>rejeitado automaticamente</strong>.
              </p>
            </>
          )}

          {/* Scoring system */}
          <div className="mt-2 pt-2 border-t border-secondary/20">
            <p className="text-xs text-muted-foreground font-medium">📊 Sistema de Pontuação:</p>
            {pool?.scoring_system === 'exact_only' ? (
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground text-xs mt-1">
                <li><strong>1 ponto</strong>: Placar exato</li>
                <li><strong>0 pontos</strong>: Qualquer outro resultado</li>
              </ul>
            ) : (
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground text-xs mt-1">
                <li><strong>5 pontos</strong>: Placar exato</li>
                <li><strong>3 pontos</strong>: Acertar o vencedor ou empate</li>
                <li><strong>+1 ponto</strong>: Acertar a diferença de gols (caso acerte o vencedor ou empate)</li>
              </ul>
            )}
          </div>

          {/* Tie breaker */}
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
        </div>
      </div>

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
            {predictionSets.length > 1 && (
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

      {/* Current set matches */}
      {matches.map((match) => {
        const prediction = currentPredictions.find(p => p.matchId === match.id);
        return (
          <Card key={match.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {match.home_team} vs {match.away_team}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {format(new Date(match.match_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
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
                    placeholder=""
                    value={prediction?.homeScore || ''}
                    onChange={(e) => handlePredictionChange(activeSetIndex, match.id, 'homeScore', e.target.value)}
                    required
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
                    placeholder=""
                    value={prediction?.awayScore || ''}
                    onChange={(e) => handlePredictionChange(activeSetIndex, match.id, 'awayScore', e.target.value)}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Add prediction set button + fee warning */}
      <div className="space-y-2">
        <Button
          variant="outline"
          onClick={addPredictionSet}
          className="w-full border-dashed"
        >
          <Plus className="w-4 h-4 mr-2" />
          Adicionar mais um palpite
        </Button>
        {hasEntryFee && (
          <p className="text-xs text-center text-orange-600 dark:text-orange-400 font-medium">
            ⚠️ Cada palpite adicional acrescenta <strong>R$ {feePerSet.toFixed(2).replace('.', ',')}</strong> ao valor da inscrição
          </p>
        )}
      </div>

      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-sm">
        <p className="font-medium text-amber-700 dark:text-amber-400">
          ⚠️ Atenção: você só pode fazer seus palpites agora!
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Após enviar, não será possível editar, excluir ou adicionar novos palpites.
        </p>
      </div>


      {/* Submit area with summary */}
      <div className="space-y-2">
        {(predictionSets.length > 1 || hasEntryFee) && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm text-center space-y-1">
            <p className="font-semibold">
              🎯 {predictionSets.length} palpite{predictionSets.length > 1 ? 's' : ''}
              {hasEntryFee && (
                <> · 💰 R$ {totalFee.toFixed(2).replace('.', ',')}</>
              )}
            </p>
            {hasEntryFee && predictionSets.length > 1 && (
              <p className="text-xs text-muted-foreground">
                {predictionSets.length} × R$ {feePerSet.toFixed(2).replace('.', ',')} cada
              </p>
            )}
          </div>
        )}
        <Button onClick={handleSubmitClick} disabled={submitting} className="w-full" size="lg">
          {submitting ? "Enviando..." : predictionSets.length > 1
            ? `Enviar ${predictionSets.length} Palpites e Participar`
            : "Enviar Palpites e Participar"}
        </Button>
      </div>

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
              {submitting ? "Enviando..." : "Confirmar e Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FootballPredictionForm;
