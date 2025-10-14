import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calendar, Trophy, Users, Share2, Award, Copy, Lock, Unlock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import DeclareResultDialog from "@/components/DeclareResultDialog";
import WinnerDisplay from "@/components/WinnerDisplay";
import FootballPredictionForm from "@/components/FootballPredictionForm";
import FootballRanking from "@/components/FootballRanking";
import FootballParticipantsPredictions from "@/components/FootballParticipantsPredictions";
import { PrizePixSubmission } from "@/components/PrizePixSubmission";
import { AdminPrizeManagement } from "@/components/AdminPrizeManagement";
import { useUserRole } from "@/hooks/useUserRole";

const PoolDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: userRole } = useUserRole();
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
  const [currentUserParticipant, setCurrentUserParticipant] = useState<any>(null);

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
    const myParticipant = participantsData?.find(p => p.user_id === user?.id) || null;
    setCurrentUserParticipant(myParticipant);
    setHasJoined(!!myParticipant);
    
    // Detect if this pool has football matches (even if pool_type is not set)
    const { data: matchesData } = await supabase
      .from("football_matches")
      .select("id")
      .eq("pool_id", id);
    setHasFootballMatches((matchesData?.length || 0) > 0);
    
    // No need to load pix/payment info anymore
    
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
        status: "approved", // Direct approval - no payment required
      });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } else {
      toast({
        title: "Sucesso!",
        description: "Você entrou no bolão! Boa sorte!",
      });
      loadPoolData();
    }

    setSubmitting(false);
  };


  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copiado!",
      description: "Compartilhe com seus amigos.",
    });
  };

  const handleMarkWinner = async (participantUserId: string) => {
    const { error: updateError } = await supabase
      .from("participants")
      .update({ prize_status: 'awaiting_pix' })
      .eq("pool_id", id!)
      .eq("user_id", participantUserId);

    if (updateError) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: updateError.message,
      });
      return;
    }

    toast({
      title: "Ganhador marcado!",
      description: "O participante foi notificado para enviar a chave PIX.",
    });
    loadPoolData();
  };

  const handleTogglePrivacy = async () => {
    const { error } = await supabase
      .from("pools")
      .update({ is_private: !pool.is_private })
      .eq("id", id!);

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } else {
      toast({
        title: pool.is_private ? "Bolão agora é público" : "Bolão agora é privado",
        description: pool.is_private 
          ? "Qualquer pessoa poderá ver e participar do bolão" 
          : "Apenas pessoas com o link poderão acessar",
      });
      loadPoolData();
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
    if (status === "finished") return "bg-gray-500 text-white";
    if (hasJoined) return "bg-blue-500 text-white";
    return "bg-green-500 text-white";
  };

  const getStatusText = (status: string) => {
    if (status === "finished") return "Finalizado";
    if (hasJoined) return "Participando";
    return "Disponível";
  };

  const approvedParticipants = participants;
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
                    {getStatusText(pool.status)}
                  </Badge>
                  {pool.is_private ? (
                    <Badge variant="secondary" className="text-sm">
                      <Lock className="w-3 h-3 mr-1" />
                      Bolão Privado
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-sm">
                      <Unlock className="w-3 h-3 mr-1" />
                      Bolão Público
                    </Badge>
                  )}
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

            {(pool.pool_type === "football" || hasFootballMatches) && (
              <>
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
                  <p className="font-medium">
                    {approvedParticipants.length} aprovado(s)
                    {pool.max_participants && approvedParticipants.length >= pool.max_participants && (
                      <span className="ml-2 text-xs text-destructive">(Cheio)</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {isOwner && pool.status === "active" && (
              <>
                <Separator />
                <div className="p-4 rounded-lg bg-muted/50 border">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Privacidade do Bolão</p>
                      <p className="text-xs text-muted-foreground">
                        {pool.is_private 
                          ? "🔒 Bolão está PRIVADO - Apenas pessoas com o link podem acessar" 
                          : "🌐 Bolão está PÚBLICO - Visível na lista de bolões públicos"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {pool.is_private ? "Privado" : "Público"}
                      </span>
                      <Switch
                        checked={!pool.is_private}
                        onCheckedChange={handleTogglePrivacy}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {!isOwner && pool.status === "active" && !isPastDeadline && (
              <>
                {hasJoined ? (
                  <div className="p-6 rounded-lg bg-green-50 dark:bg-green-950 border-2 border-green-200 dark:border-green-800 text-center">
                    <p className="text-lg font-semibold text-green-700 dark:text-green-300 mb-2">
                      ✓ Você já está participando deste bolão!
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Boa sorte! Seus palpites foram salvos.
                    </p>
                  </div>
                ) : pool.max_participants && approvedParticipants.length >= pool.max_participants ? (
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm font-medium text-destructive">
                      🚫 Bolão cheio - Limite de {pool.max_participants} participantes atingido
                    </p>
                  </div>
                ) : (
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
              </>
            )}

            {isPastDeadline && !hasJoined && pool.status === "active" && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm font-medium text-destructive">
                  ⏰ O prazo para palpites expirou
                </p>
              </div>
            )}

            {hasJoined && currentUserParticipant?.status === 'approved' && (
              <>
                <Separator />
                
                {/* Winner needs to submit PIX */}
                {currentUserParticipant.prize_status === 'awaiting_pix' && (
                  <PrizePixSubmission
                    participantId={currentUserParticipant.id}
                    poolTitle={pool.title}
                    onSuccess={loadPoolData}
                  />
                )}
                
                {/* PIX submitted, waiting for admin to send prize */}
                {currentUserParticipant.prize_status === 'pix_submitted' && (
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      ✓ Chave PIX Enviada!
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Aguarde o envio do prêmio para sua chave PIX.
                    </p>
                  </div>
                )}
                
                {/* Prize sent */}
                {currentUserParticipant.prize_status === 'prize_sent' && (
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">
                      ✓ Prêmio Enviado!
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      O prêmio foi enviado para sua chave PIX. Verifique sua conta.
                    </p>
                  </div>
                )}
                
                {/* Regular approved participant (not a winner) */}
                {!currentUserParticipant.prize_status && (
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">
                      ✓ Você está participando deste bolão!
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Sua participação foi aprovada. Boa sorte!
                    </p>
                  </div>
                )}
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
                    🤖 Funcionalidades Automáticas
                  </p>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      • O vencedor do bolão será determinado automaticamente de acordo com o resultado dos jogos.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      • Prazo para apostas: {format(new Date(pool.deadline), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} (30min antes do primeiro jogo)
                    </p>
                  </div>
                </div>
              </>
            )}



            {(pool.status === "finished") && (pool.pool_type === "football" || hasFootballMatches) && (
              <>
                <Separator />
                <FootballRanking poolId={pool.id} />
              </>
            )}

            {/* Admin Prize Management Section */}
            {(userRole?.isAdmin || isOwner) && pool.status === "finished" && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-500" />
                    Gerenciar Prêmios
                  </h3>
                  {participants
                    .filter(p => p.prize_status && p.prize_status !== 'prize_sent')
                    .map((participant) => (
                      <AdminPrizeManagement
                        key={participant.id}
                        participant={{
                          id: participant.id,
                          participant_name: participant.participant_name,
                          prize_pix_key: participant.prize_pix_key,
                          prize_pix_key_type: participant.prize_pix_key_type,
                          prize_status: participant.prize_status,
                          prize_proof_url: participant.prize_proof_url,
                        }}
                        poolId={pool.id}
                        onSuccess={loadPoolData}
                      />
                    ))}
                  {participants.filter(p => p.prize_status && p.prize_status !== 'prize_sent').length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Nenhum prêmio pendente no momento.
                    </p>
                  )}
                </div>
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
                      <Card key={participant.id}>
                        <CardContent className="p-4">
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <p className="font-medium">{participant.participant_name}</p>
                              <Badge variant="secondary">{participant.guess_value}</Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
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
