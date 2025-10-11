import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calendar, Trophy, Users, Share2, Award, Copy } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import DeclareResultDialog from "@/components/DeclareResultDialog";
import WinnerDisplay from "@/components/WinnerDisplay";
import FootballPredictionForm from "@/components/FootballPredictionForm";
import FootballRanking from "@/components/FootballRanking";
import FootballParticipantsPredictions from "@/components/FootballParticipantsPredictions";

const PoolDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pool, setPool] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [guessValue, setGuessValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [winner, setWinner] = useState<any>(null);
  const [hasFootballMatches, setHasFootballMatches] = useState(false);
  const [pixKey, setPixKey] = useState<string | null>(null);

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // Save the current URL to redirect back after login
        const redirectUrl = `/pool/${id}`;
        navigate(`/auth?redirect=${encodeURIComponent(redirectUrl)}`);
        return;
      }
      
      loadPoolData();
    };
    
    checkAuthAndLoadData();
  }, [id, navigate]);

  const loadPoolData = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);

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
    setIsOwner(user?.id === poolData.owner_id);

    const { data: participantsData } = await supabase
      .from("participants")
      .select("*")
      .eq("pool_id", id);

    setParticipants(participantsData || []);
    setHasJoined(participantsData?.some(p => p.user_id === user?.id) || false);
    
    // Detect if this pool has football matches (even if pool_type is not set)
    const { data: matchesData } = await supabase
      .from("football_matches")
      .select("id")
      .eq("pool_id", id);
    setHasFootballMatches((matchesData?.length || 0) > 0);
    
    // Load PIX key from separate payment info table
    const { data: paymentData } = await supabase
      .from("pool_payment_info")
      .select("pix_key")
      .eq("pool_id", id)
      .maybeSingle();
    setPixKey(paymentData?.pix_key || null);
    
    // Load winner if pool is finished
    if (poolData.winner_id) {
      const winnerData = participantsData?.find(p => p.user_id === poolData.winner_id);
      setWinner(winnerData);
    }
    
    setLoading(false);
  };

  const handleJoinPool = async () => {
    if (!userId) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Você precisa estar logado.",
      });
      return;
    }

    if (!guessValue.trim()) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Por favor, insira seu palpite.",
      });
      return;
    }

    // Check if deadline has passed
    if (new Date() > new Date(pool.deadline)) {
      toast({
        variant: "destructive",
        title: "Prazo expirado",
        description: "O prazo para palpites já passou.",
      });
      return;
    }

    setSubmitting(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();

    const { error } = await supabase
      .from("participants")
      .insert({
        pool_id: id!,
        user_id: userId,
        participant_name: profile?.full_name || "Usuário",
        guess_value: guessValue,
        status: "pending",
      });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } else {
      toast({
        title: "Solicitação enviada!",
        description: "Aguarde a aprovação do criador do bolão.",
      });
      loadPoolData();
    }

    setSubmitting(false);
  };

  const handleApprove = async (participantId: string) => {
    const { error } = await supabase
      .from("participants")
      .update({ status: "approved" })
      .eq("id", participantId);

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } else {
      toast({
        title: "Participante aprovado!",
      });
      loadPoolData();
    }
  };

  const handleReject = async (participantId: string) => {
    const { error } = await supabase
      .from("participants")
      .update({ status: "rejected" })
      .eq("id", participantId);

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } else {
      toast({
        title: "Participante rejeitado",
      });
      loadPoolData();
    }
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copiado!",
      description: "Compartilhe com seus amigos.",
    });
  };

  const handleCopyPixKey = () => {
    if (pixKey) {
      navigator.clipboard.writeText(pixKey);
      toast({
        title: "Chave PIX copiada!",
        description: "Cole para fazer o pagamento.",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!pool) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-primary text-primary-foreground";
      case "finished":
        return "bg-secondary text-secondary-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const approvedParticipants = participants.filter(p => p.status === "approved");
  const pendingParticipants = participants.filter(p => p.status === "pending");
  const isPastDeadline = new Date() > new Date(pool.deadline);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background p-4">
      <div className="max-w-4xl mx-auto pt-8 pb-16 space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <Button variant="outline" onClick={handleShare}>
            <Share2 className="w-4 h-4 mr-2" />
            Compartilhar
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <CardTitle className="text-3xl">{pool.title}</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Badge className={getStatusColor(pool.status)}>
                    {pool.status === "active" ? "Ativo" : "Finalizado"}
                  </Badge>
                  <Badge variant="outline">
                    {pool.pool_type === "custom" ? "🎯 Customizado" : "⚽ Futebol"}
                  </Badge>
                  {isPastDeadline && pool.status === "active" && (
                    <Badge variant="destructive">
                      Prazo Expirado
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <CardDescription className="text-base mt-4">{pool.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Winner Display */}
            {pool.status === "finished" && winner && pool.result_value && (
              <>
                <WinnerDisplay 
                  winner={winner} 
                  resultValue={pool.result_value}
                  measurementUnit={pool.measurement_unit}
                />
                <Separator />
              </>
            )}

            {/* No winner message */}
            {pool.status === "finished" && !winner && pool.result_value && (
              <>
                <Card className="border-2 border-muted">
                  <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground">
                      Resultado: <strong>{pool.result_value}</strong>
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Nenhum participante acertou exatamente ou chegou próximo o suficiente.
                    </p>
                  </CardContent>
                </Card>
                <Separator />
              </>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Calendar className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Prazo</p>
                  <p className="font-medium">
                    {format(new Date(pool.deadline), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Users className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Participantes</p>
                  <p className="font-medium">{approvedParticipants.length} aprovado(s)</p>
                </div>
              </div>
            </div>

            {pixKey && !(pool.pool_type === "football" || hasFootballMatches) && hasJoined && pool.status === "active" && (
              <>
                <Separator />
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium mb-1">💰 Chave PIX para pagamento</p>
                      <p className="text-sm font-mono text-muted-foreground">{pixKey}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Faça o pagamento e aguarde a aprovação do criador.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyPixKey}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar
                    </Button>
                  </div>
                </div>
              </>
            )}

            {!isOwner && !hasJoined && pool.status === "active" && !isPastDeadline && (
              <>
                <Separator />
                {(pool.pool_type === "football" || hasFootballMatches) ? (
                  <FootballPredictionForm
                    poolId={pool.id}
                    userId={userId!}
                    onSuccess={loadPoolData}
                  />
                ) : (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Enviar seu palpite</h3>
                    <div className="space-y-2">
                      <Label>{pool.guess_label}</Label>
                      <Input
                        value={guessValue}
                        onChange={(e) => setGuessValue(e.target.value)}
                        placeholder="Digite seu palpite"
                      />
                    </div>
                    <Button onClick={handleJoinPool} disabled={submitting} className="w-full">
                      {submitting ? "Enviando..." : "Enviar Palpite"}
                    </Button>
                  </div>
                )}
              </>
            )}

            {isPastDeadline && !hasJoined && pool.status === "active" && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm font-medium text-destructive">
                  ⏰ O prazo para palpites expirou
                </p>
              </div>
            )}

            {hasJoined && (
              <>
                {pixKey && (
                  <>
                    <Separator />
                    <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium mb-1">💰 Chave PIX para pagamento</p>
                          <p className="text-sm font-mono text-muted-foreground">{pixKey}</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Faça o pagamento e aguarde a aprovação do criador.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyPixKey}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copiar
                        </Button>
                      </div>
                    </div>
                  </>
                )}
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-sm font-medium text-primary">
                    ✓ Palpite enviado com sucesso!
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {pixKey ? "Faça o pagamento usando a chave PIX acima e aguarde a aprovação." : "Aguarde a aprovação do criador do bolão."}
                  </p>
                </div>
              </>
            )}

            {isOwner && pool.status === "active" && !(pool.pool_type === "football" || hasFootballMatches) && (
              <>
                <Separator />
                <Button 
                  onClick={() => setShowResultDialog(true)}
                  variant="secondary"
                  className="w-full"
                  size="lg"
                >
                  <Award className="w-5 h-5 mr-2" />
                  Declarar Resultado e Vencedor
                </Button>
              </>
            )}

            {(pool.pool_type === "football" || hasFootballMatches) && pool.status === "active" && (
              <>
                <Separator />
                <div className="p-4 rounded-lg bg-secondary/10 border border-secondary/20">
                  <p className="text-sm font-medium mb-2">
                    🤖 Resultados Automáticos
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Os resultados dos jogos e o vencedor do bolão serão determinados automaticamente através da API de futebol.
                  </p>
                </div>
              </>
            )}

            {isOwner && pendingParticipants.length > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-secondary" />
                    Solicitações Pendentes
                  </h3>
                  <div className="space-y-3">
                    {pendingParticipants.map((participant) => (
                      <Card key={participant.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{participant.participant_name}</p>
                              <p className="text-sm text-muted-foreground">
                                Palpite: {participant.guess_value}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleApprove(participant.id)}
                              >
                                Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleReject(participant.id)}
                              >
                                Rejeitar
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </>
            )}

            {(pool.pool_type === "football" || hasFootballMatches) && (
              <>
                <Separator />
                <div className="p-4 rounded-lg bg-muted/50 border">
                  <p className="text-sm font-medium mb-2">
                    📊 Sistema de Pontuação
                  </p>
                  {pool.scoring_system === "exact_only" ? (
                    <p className="text-xs text-muted-foreground">
                      <strong>Placar Exato Apenas:</strong> 1 ponto por placar exato acertado. Qualquer outro resultado não dá pontos.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      <strong>Sistema Completo:</strong> 5 pontos por placar exato, 3 pontos por resultado correto, 1 ponto por diferença de gols correta.
                    </p>
                  )}
                </div>
              </>
            )}

            {(pool.status === "finished") && (pool.pool_type === "football" || hasFootballMatches) && (
              <>
                <Separator />
                <FootballRanking poolId={pool.id} />
              </>
            )}

            {approvedParticipants.length > 0 && (pool.pool_type === "football" || hasFootballMatches) && (
              <>
                <Separator />
                <FootballParticipantsPredictions poolId={pool.id} participants={approvedParticipants} />
              </>
            )}

            {approvedParticipants.length > 0 && !(pool.pool_type === "football" || hasFootballMatches) && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Participantes Aprovados</h3>
                  <div className="grid gap-3">
                    {approvedParticipants.map((participant) => (
                      <div
                        key={participant.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <p className="font-medium">{participant.participant_name}</p>
                        <Badge variant="secondary">{participant.guess_value}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Declare Result Dialog */}
        <DeclareResultDialog
          pool={pool}
          participants={participants}
          open={showResultDialog}
          onOpenChange={setShowResultDialog}
          onSuccess={loadPoolData}
        />
      </div>
    </div>
  );
};

export default PoolDetail;
