import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Copy, Upload, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PaymentProofSubmission } from "@/components/PaymentProofSubmission";
import { Checkbox } from "@/components/ui/checkbox";

interface FootballPredictionFormProps {
  poolId: string;
  userId: string;
  onSuccess: () => void;
  entryFee?: number | null;
  pool?: any;
  pixKey?: string;
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

const FootballPredictionForm = ({ poolId, userId, onSuccess, entryFee, pool, pixKey }: FootballPredictionFormProps) => {
  const { toast } = useToast();
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showDisclaimerDialog, setShowDisclaimerDialog] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [createdParticipantId, setCreatedParticipantId] = useState<string | null>(null);

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
      setPredictions(data.map(m => ({ matchId: m.id, homeScore: '', awayScore: '' })));

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

            // Persistir no banco para próximas visualizações
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

  const handlePredictionChange = (matchId: string, field: 'homeScore' | 'awayScore', value: string) => {
    // Allow empty string or valid number between 0-99
    if (value === '' || (/^\d+$/.test(value) && parseInt(value) <= 99)) {
      setPredictions(prev =>
        prev.map(p => p.matchId === matchId ? { ...p, [field]: value } : p)
      );
    }
  };

  const handleSubmitClick = () => {
    // Validate all predictions are filled
    const hasEmptyPredictions = predictions.some(p => p.homeScore === '' || p.awayScore === '');
    if (hasEmptyPredictions) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Por favor, preencha todos os placares.",
      });
      return;
    }
    // Show disclaimer dialog
    setDisclaimerAccepted(false);
    setShowDisclaimerDialog(true);
  };

  const handleConfirmSubmit = async () => {
    setShowDisclaimerDialog(false);

    setSubmitting(true);

    // Determine status based on entry fee
    const hasEntryFee = pool?.entry_fee && parseFloat(pool.entry_fee) > 0;
    const initialStatus = hasEntryFee ? "pending" : "approved";

    // First, create participant
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
        guess_value: "Palpites de futebol",
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

    // Then, create predictions
    const predictionsData = predictions.map(p => ({
      participant_id: participant.id,
      match_id: p.matchId,
      home_score_prediction: parseInt(p.homeScore),
      away_score_prediction: parseInt(p.awayScore),
    }));

    const { error: predictionsError } = await supabase
      .from("football_predictions")
      .insert(predictionsData);

    if (predictionsError) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: predictionsError.message,
      });
      // Remove participant if predictions failed
      await supabase.from("participants").delete().eq("id", participant.id);
    } else {
      if (hasEntryFee) {
        setCreatedParticipantId(participant.id);
        setShowPaymentDialog(true);
      } else {
        toast({
          title: "🎉 Você está inscrito no bolão!",
          description: "Boa sorte! Seus palpites foram salvos. Agora é só esperar a conclusão dos jogos. 🍀",
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
    const hasEntryFee = pool?.entry_fee && parseFloat(pool.entry_fee) > 0;
    return (
      <div className="space-y-4">
        {hasEntryFee ? (
          <>
            <div className="p-6 rounded-lg bg-orange-50 dark:bg-orange-950 border-2 border-orange-200 dark:border-orange-800 text-center">
              <p className="text-lg font-semibold text-orange-700 dark:text-orange-300 mb-2">
                ⚠️ Palpites registrados!
              </p>
              <p className="text-sm text-muted-foreground">
                Para confirmar sua participação, envie o comprovante de pagamento abaixo.
              </p>
            </div>

            <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    💳 Pagamento necessário
                  </DialogTitle>
                  <DialogDescription>
                    Seus palpites foram salvos! Agora envie o comprovante para ser aprovado no bolão.
                  </DialogDescription>
                </DialogHeader>
                {createdParticipantId && (
                  <PaymentProofSubmission
                    participantId={createdParticipantId}
                    poolId={poolId}
                    poolTitle={pool?.title || ''}
                    entryFee={pool?.entry_fee ? parseFloat(pool.entry_fee) : 0}
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
              Boa sorte! Seus palpites foram salvos. Agora é só esperar a conclusão dos jogos. 🍀
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

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Faça seus palpites</h3>
      
      {matches.map((match, index) => {
        const prediction = predictions.find(p => p.matchId === match.id);
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
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
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
                    onChange={(e) => handlePredictionChange(match.id, 'homeScore', e.target.value)}
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
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
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
                    onChange={(e) => handlePredictionChange(match.id, 'awayScore', e.target.value)}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-2">
        <p className="font-medium">📊 Sistema de Pontuação:</p>
        {pool?.scoring_system === 'exact_only' ? (
          <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs">
            <li><strong>1 ponto</strong>: Placar exato</li>
            <li><strong>0 pontos</strong>: Qualquer outro resultado</li>
          </ul>
        ) : (
          <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs">
            <li><strong>5 pontos</strong>: Placar exato</li>
            <li><strong>3 pontos</strong>: Acertar o vencedor ou empate</li>
            <li><strong>+1 ponto</strong>: Acertar a diferença de gols (caso acerte o vencedor ou empate)</li>
          </ul>
        )}
      </div>

      <Button onClick={handleSubmitClick} disabled={submitting} className="w-full" size="lg">
        {submitting ? "Enviando..." : "Enviar Palpites e Participar"}
      </Button>

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
            <div className="p-4 rounded-lg bg-destructive/10 border-2 border-destructive/30">
              <p className="text-sm font-bold text-destructive mb-2">
                ⚠️ ATENÇÃO: Leia com cuidado antes de continuar
              </p>
              <p className="text-sm text-foreground leading-relaxed">
                A <strong>responsabilidade pelo pagamento da premiação é exclusivamente do criador do bolão</strong>. 
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
                Estou ciente de que a responsabilidade pelo pagamento da premiação é do criador do bolão e não do Delfos.
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