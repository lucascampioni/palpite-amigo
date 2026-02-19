import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calendar, Trophy, Users, Share2, Award, Copy, Lock, Unlock, CheckCircle, Edit, ChevronDown, ChevronUp, Info, Trash2, X } from "lucide-react";
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
import { PaymentProofSubmission } from "@/components/PaymentProofSubmission";
import { AdminPendingParticipants } from "@/components/AdminPendingParticipants";
import { AdminRejectedParticipants } from "@/components/AdminRejectedParticipants";
import { AdminParticipantsManager } from "@/components/AdminParticipantsManager";
import { useUserRole } from "@/hooks/useUserRole";
import WhatsAppMessagePanel from "@/components/WhatsAppMessagePanel";
import VipGroupInviteModal from "@/components/VipGroupInviteModal";

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
  const [winners, setWinners] = useState<any[]>([]);
  const [hasFootballMatches, setHasFootballMatches] = useState(false);
  const [currentUserParticipant, setCurrentUserParticipant] = useState<any>(null);
  const [signedProofUrl, setSignedProofUrl] = useState<string | null>(null);
  const [userPrizeInfo, setUserPrizeInfo] = useState<{ amount: number; placement: number; isTied: boolean; tiedWithCount: number } | null>(null);
  const [participantsPoints, setParticipantsPoints] = useState<Record<string, number>>({});
  const [hasAnyMatchResult, setHasAnyMatchResult] = useState(false);
  const [participantPhones, setParticipantPhones] = useState<Record<string, string>>({});
  const [rankingData, setRankingData] = useState<{ participant_id: string; participant_name: string; total_points: number }[]>([]);
  const [allUsersWithPhone, setAllUsersWithPhone] = useState<{ id: string; full_name: string; phone: string; notify_pool_updates?: boolean; notify_new_pools?: boolean }[]>([]);
  const [userHasPhone, setUserHasPhone] = useState<boolean | null>(null);
  const [showVipModal, setShowVipModal] = useState(false);
  const [showPoolInfo, setShowPoolInfo] = useState(false);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [ownerPhone, setOwnerPhone] = useState<string | null>(null);

  useEffect(() => {
    const buildSigned = async () => {
      const raw = currentUserParticipant?.prize_proof_url as string | undefined;
      if (!raw) { setSignedProofUrl(null); return; }
      if (raw.includes('/object/sign/')) { setSignedProofUrl(raw); return; }
      let filePath = raw;
      if (raw.includes('/payment-proofs/')) {
        filePath = raw.split('/payment-proofs/')[1];
      }
      const { data } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(filePath, 31536000);
      setSignedProofUrl(data?.signedUrl || raw);
    };
    buildSigned();
  }, [currentUserParticipant?.prize_proof_url]);

  useEffect(() => {
    const calculateUserPrize = () => {
      if (!currentUserParticipant || !pool) return;
      if (!(pool.pool_type === 'football' || hasFootballMatches)) return;
      if (!participants || participants.length === 0) return;

      // Calculate ranking using aggregated points map
      const participantsWithPoints = participants
        .filter(p => p.status === 'approved')
        .map(p => ({
          ...p,
          total_points: participantsPoints[p.id] || 0
        }))
        .sort((a, b) => b.total_points - a.total_points);

      const userPoints = participantsPoints[currentUserParticipant.id] || 0;

      // Find user's index in sorted list
      const userIndex = participantsWithPoints.findIndex(p => p.id === currentUserParticipant.id);
      if (userIndex === -1) return;

      // Determine the full tie group boundaries for this score
      let groupStart = userIndex;
      let groupEnd = userIndex;
      while (groupStart > 0 && participantsWithPoints[groupStart - 1].total_points === userPoints) {
        groupStart--;
      }
      while (groupEnd < participantsWithPoints.length - 1 && participantsWithPoints[groupEnd + 1].total_points === userPoints) {
        groupEnd++;
      }

      // Calculate overlap of the tie group with the prize-bearing top 3 positions
      const topStart = 0;
      const topEnd = 2; // indices 0,1,2 correspond to 1º, 2º, 3º
      const overlapStart = Math.max(groupStart, topStart);
      const overlapEnd = Math.min(groupEnd, topEnd);
      const overlapCount = overlapEnd >= overlapStart ? (overlapEnd - overlapStart + 1) : 0;

      if (overlapCount <= 0) return; // no prize for this user

      // Calculate actual prize values, handling percentage-based prizes
      const approvedCount = participants.filter(p => p.status === 'approved').length;
      const totalCollected = (pool.entry_fee ? parseFloat(pool.entry_fee) : 0) * approvedCount;
      const isPercentage = pool.prize_type === 'percentage';
      
      const calcPrize = (val: any) => {
        const num = val ? parseFloat(val) : 0;
        return isPercentage ? (num / 100) * totalCollected : num;
      };

      const prizes = [
        calcPrize(pool.first_place_prize),
        calcPrize(pool.second_place_prize),
        calcPrize(pool.third_place_prize),
      ];

      // Sum prizes for the overlapped positions only, then split equally among overlapped participants
      let prizeSum = 0;
      for (let i = overlapStart; i <= overlapEnd; i++) {
        prizeSum += prizes[i] || 0;
      }
      const prizeAmount = prizeSum / overlapCount;

      if (prizeAmount > 0) {
        setUserPrizeInfo({
          amount: prizeAmount,
          placement: overlapStart + 1, // placement is the first position involved in the tie within top 3
          isTied: overlapCount > 1,
          tiedWithCount: overlapCount > 1 ? overlapCount - 1 : 0
        });
      }
    };

    calculateUserPrize();
  }, [currentUserParticipant, participants, participantsPoints, pool, hasFootballMatches]);

  // Update winners' prize_status when all matches are finished
  useEffect(() => {
    const updateWinnersPrizeStatus = async () => {
      if (!pool || !hasFootballMatches) return;
      if (pool.status !== 'active' && pool.status !== 'finished') return;
      if (participants.length === 0) return;

      // Check if all matches are finished
      const { data: matches } = await supabase
        .from('football_matches')
        .select('id, home_score, away_score, status')
        .eq('pool_id', id);

      if (!matches || matches.length === 0) return;

      const allMatchesFinished = matches.every(m => m.status === 'finished');
      if (!allMatchesFinished) return;

      console.log('All matches finished, updating winners prize_status...');

      // Get pool prize details
      const prizes = [
        pool.first_place_prize ? parseFloat(pool.first_place_prize) : 0,
        pool.second_place_prize ? parseFloat(pool.second_place_prize) : 0,
        pool.third_place_prize ? parseFloat(pool.third_place_prize) : 0
      ];

      // Calculate ranking
      const participantsWithPoints = participants
        .filter((p: any) => p.status === 'approved')
        .map((p: any) => ({
          ...p,
          total_points: participantsPoints[p.id] || 0
        }))
        .sort((a: any, b: any) => b.total_points - a.total_points);

      const winnersToUpdate: string[] = [];
      let currentPosition = 0;

      while (currentPosition < participantsWithPoints.length && currentPosition < 3) {
        const currentScore = participantsWithPoints[currentPosition].total_points;
        
        // Skip if score is 0
        if (currentScore === 0) break;

        // Find all participants with the same score (tie group)
        let tieGroupEnd = currentPosition;
        while (
          tieGroupEnd < participantsWithPoints.length &&
          participantsWithPoints[tieGroupEnd].total_points === currentScore
        ) {
          tieGroupEnd++;
        }

        // If this group touches any prize position (top 3), they all get prize
        if (currentPosition <= 2) {
          for (let i = currentPosition; i < tieGroupEnd; i++) {
            if (participantsWithPoints[i].total_points > 0) {
              winnersToUpdate.push(participantsWithPoints[i].id);
            }
          }
        }

        currentPosition = tieGroupEnd;
      }

      // Update prize_status for winners who haven't submitted PIX yet
      const winnersNeedingUpdate = winnersToUpdate.filter(wId => {
        const p = participants.find(pp => pp.id === wId);
        return p && !p.prize_status;
      });

      if (winnersNeedingUpdate.length > 0) {
        const { error: updateError } = await supabase
          .from('participants')
          .update({ prize_status: 'awaiting_pix' })
          .in('id', winnersNeedingUpdate)
          .is('prize_status', null);

        if (!updateError) {
          console.log(`Updated ${winnersNeedingUpdate.length} winners to awaiting_pix status`);
          // Update local state instead of reloading to avoid infinite loop
          setParticipants(prev => prev.map(p => 
            winnersNeedingUpdate.includes(p.id) ? { ...p, prize_status: 'awaiting_pix' } : p
          ));
          setCurrentUserParticipant((prev: any) => 
            prev && winnersNeedingUpdate.includes(prev.id) ? { ...prev, prize_status: 'awaiting_pix' } : prev
          );
        } else {
          console.error('Error updating winners prize_status:', updateError);
        }
      }
    };

    updateWinnersPrizeStatus();
  }, [pool, participants, participantsPoints, hasFootballMatches, id]);

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
    try {
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

    // Load owner name using security definer function
    const { data: ownerNameData } = await supabase
      .rpc("get_pool_owner_name", { pool_uuid: poolData.id });
    setOwnerName(ownerNameData || null);

    // Load owner phone for WhatsApp contact (using security definer function)
    const { data: ownerPhoneData } = await supabase
      .rpc("get_pool_owner_phone", { pool_uuid: poolData.id });
    setOwnerPhone(ownerPhoneData || null);

    // Check if user has phone registered
    if (user) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .single();
      setUserHasPhone(!!profileData?.phone);
    }

    const { data: participantsData } = await supabase
      .from("participants")
      .select("*")
      .eq("pool_id", id);

    setParticipants(participantsData || []);

    // Aggregate points per participant for ranking/prize calculation
    const participantIds = (participantsData || []).map((p: any) => p.id);
    let pointsMap: Record<string, number> = {};
    if (participantIds.length > 0) {
      const { data: preds } = await supabase
        .from("football_predictions")
        .select("participant_id, points_earned")
        .in("participant_id", participantIds);
      if (preds) {
        for (const row of preds as any[]) {
          pointsMap[row.participant_id] = (pointsMap[row.participant_id] || 0) + (row.points_earned || 0);
        }
      }
    }
    setParticipantsPoints(pointsMap);

    const myParticipant = participantsData?.find(p => p.user_id === user?.id) || null;
    setCurrentUserParticipant(myParticipant);
    setHasJoined(!!myParticipant);
    
    // Detect if this pool has football matches (even if pool_type is not set)
    const { data: matchesData } = await supabase
      .from("football_matches")
      .select("id, home_score, away_score")
      .eq("pool_id", id);
    setHasFootballMatches((matchesData?.length || 0) > 0);
    
    // Check if any match has results
    const hasResults = matchesData?.some(m => m.home_score !== null && m.away_score !== null) ?? false;
    setHasAnyMatchResult(hasResults);

    // Load participant phones for WhatsApp panel (admin/owner only)
    const userIds = (participantsData || []).map((p: any) => p.user_id);
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, phone")
        .in("id", userIds);
      const phoneMap: Record<string, string> = {};
      profiles?.forEach((p: any) => {
        if (p.phone) phoneMap[p.id] = p.phone;
      });
      setParticipantPhones(phoneMap);
    }

    // Load ranking data for WhatsApp messages
    if ((matchesData?.length || 0) > 0) {
      const { data: rankData } = await supabase.rpc("get_football_pool_ranking", { p_pool_id: id });
      setRankingData(rankData || []);
    }

    // Load all registered users with phone for promotional WhatsApp messages
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, phone, notify_pool_updates, notify_new_pools")
      .not("phone", "is", null);
    if (allProfiles) {
      setAllUsersWithPhone(allProfiles.filter(p => p.phone).map(p => ({ id: p.id, full_name: p.full_name, phone: p.phone!, notify_pool_updates: p.notify_pool_updates ?? true, notify_new_pools: p.notify_new_pools ?? true })));
    }
    
    // Load pool payment info
    const { data: paymentInfo } = await supabase
      .from('pool_payment_info')
      .select('pix_key')
      .eq('pool_id', id)
      .maybeSingle();
    
    setPool({ ...poolData, pix_key: paymentInfo?.pix_key || null });
    
    // Load winners if pool is finished
    if (poolData.status === 'finished') {
      if (hasFootballMatches || poolData.pool_type === 'football') {
        // For football pools, find all participants with the highest score
        const participantsWithPoints = participantsData
          ?.filter(p => p.status === 'approved')
          .map(p => ({
            ...p,
            total_points: pointsMap[p.id] || 0
          }))
          .sort((a, b) => b.total_points - a.total_points) || [];
        
        if (participantsWithPoints.length > 0) {
          const highestScore = participantsWithPoints[0].total_points;
          const topWinners = participantsWithPoints.filter(p => p.total_points === highestScore && p.total_points > 0);
          setWinners(topWinners);
        }
      } else if (poolData.winner_id) {
        // For non-football pools, use the single winner_id
        const winnerData = participantsData?.find(p => p.user_id === poolData.winner_id);
        setWinners(winnerData ? [winnerData] : []);
      }
    }
    
    setLoading(false);
    } catch (error) {
      console.error('Error loading pool data:', error);
      setLoading(false);
    }
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

    // Check if user has phone
    if (!userHasPhone) {
      toast({
        variant: "destructive",
        title: "Telefone obrigatório",
        description: "Cadastre seu telefone no perfil antes de participar de um bolão.",
      });
      navigate("/profile");
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

    // Determine status based on entry fee
    const hasEntryFee = pool.entry_fee && parseFloat(pool.entry_fee) > 0;
    const initialStatus = hasEntryFee ? "pending" : "approved";

    const { error } = await supabase
      .from("participants")
      .insert({
        pool_id: id!,
        user_id: userId,
        participant_name: profile?.full_name || "Usuário",
        guess_value: guessValue,
        status: initialStatus,
      });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } else {
      if (hasEntryFee) {
        toast({
          title: "Participação registrada!",
          description: "Envie o comprovante de pagamento para ser aprovado.",
        });
      } else {
        toast({
          title: "Sucesso!",
          description: "Você entrou no bolão! Boa sorte!",
        });
      }
      loadPoolData();

      // Show VIP group invite if user hasn't been invited yet
      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("vip_group_invited_at")
          .eq("id", userId)
          .single();
        if (!profile?.vip_group_invited_at) {
          setShowVipModal(true);
        }
      }
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

  const isPendingPayment = !isOwner && currentUserParticipant?.status === 'pending' && !currentUserParticipant?.payment_proof;
  const isAwaitingApproval = !isOwner && currentUserParticipant?.status === 'pending' && !!currentUserParticipant?.payment_proof;
  const isRejected = !isOwner && currentUserParticipant?.status === 'rejected';

  const getStatusColor = (status: string) => {
    if (status === "finished") return "bg-gray-500 text-white";
    if (isRejected) return "bg-destructive text-destructive-foreground";
    if (isAwaitingApproval) return "bg-yellow-500 text-white";
    if (isPendingPayment) return "bg-orange-500 text-white";
    if (hasJoined) return "bg-blue-500 text-white";
    return "bg-green-500 text-white";
  };

  const getStatusText = (status: string) => {
    if (status === "finished") return "Finalizado";
    if (isRejected) return "❌ Participação Reprovada";
    if (isAwaitingApproval) return "⏳ Pendente Aprovação";
    if (isPendingPayment) return "⚠️ Pagamento Pendente";
    if (hasJoined) return "Participando";
    return "Disponível";
  };

  const approvedParticipants = participants.filter(p => p.status === 'approved');
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

        {/* Pending Payment Banner */}
        {isPendingPayment && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg animate-pulse">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="font-bold text-lg">
                  {currentUserParticipant?.rejection_reason ? 'Comprovante Recusado' : 'Pagamento Pendente'}
                </p>
                {currentUserParticipant?.rejection_reason ? (
                  <>
                    <p className="text-sm text-orange-100">
                      <strong>Motivo:</strong> {currentUserParticipant.rejection_reason}
                    </p>
                    {currentUserParticipant.rejection_details && (
                      <p className="text-sm text-orange-100 mt-1">
                        <strong>Detalhes:</strong> {currentUserParticipant.rejection_details}
                      </p>
                    )}
                    <p className="text-sm text-orange-100 mt-1">Envie um novo comprovante abaixo.</p>
                  </>
                ) : (
                  <p className="text-sm text-orange-100">Envie o comprovante de pagamento abaixo para confirmar sua participação.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Awaiting Approval Banner */}
        {isAwaitingApproval && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-yellow-500 to-yellow-600 text-white shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⏳</span>
              <div>
                <p className="font-bold text-lg">Pendente Aprovação</p>
                <p className="text-sm text-yellow-100">Seu comprovante foi enviado. Aguarde a aprovação do organizador.</p>
              </div>
            </div>
          </div>
        )}

        {/* Rejected Banner */}
        {isRejected && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-destructive to-destructive/80 text-destructive-foreground shadow-lg">
        <div className="flex items-center gap-3">
              <span className="text-2xl">❌</span>
              <div className="flex-1">
                <p className="font-bold text-lg">Participação Reprovada</p>
                <p className="text-sm opacity-90">
                  <strong>Motivo:</strong> {currentUserParticipant?.rejection_reason || 'Não informado'}
                </p>
                {currentUserParticipant?.rejection_details && (
                  <p className="text-sm opacity-80 mt-1">
                    <strong>Detalhes:</strong> {currentUserParticipant.rejection_details}
                  </p>
                )}
              </div>
            </div>
            {ownerPhone && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full bg-white/10 border-white/20 hover:bg-white/20 text-white"
                onClick={() => {
                  const phone = ownerPhone.replace(/\D/g, '');
                  const message = encodeURIComponent(
                    `Olá ${ownerName || ''}! Minha participação no bolão "${pool.title}" foi reprovada. Motivo: ${currentUserParticipant?.rejection_reason || 'Não informado'}. Podemos resolver?`
                  );
                  window.open(`https://wa.me/55${phone}?text=${message}`, '_blank');
                }}
              >
                📱 Falar com o organizador no WhatsApp
              </Button>
            )}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <CardTitle className="text-3xl">{pool.title}</CardTitle>
                {ownerName && (
                  <p className="text-sm text-muted-foreground">
                    Criado por <span className="font-medium">{ownerName}</span>
                  </p>
                )}
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
              <div className="flex gap-2">
                {isOwner && participants.length === 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      if (!confirm("Tem certeza que deseja excluir este bolão? Esta ação não pode ser desfeita.")) return;
                      await supabase.from("pool_payment_info").delete().eq("pool_id", id!);
                      await supabase.from("football_matches").delete().eq("pool_id", id!);
                      const { error } = await supabase.from("pools").delete().eq("id", id!);
                      if (error) {
                        toast({ variant: "destructive", title: "Erro", description: "Não foi possível excluir o bolão." });
                      } else {
                        toast({ title: "Bolão excluído com sucesso!" });
                        navigate("/");
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir
                  </Button>
                )}
                {isOwner && participants.length === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/edit-pool/${id}`)}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Editar
                  </Button>
                )}
              </div>
            </div>
            <CardDescription className="text-base mt-4">{pool.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Winner Display */}
            {pool.status === "finished" && winners.length > 0 && (
              <>
                <WinnerDisplay 
                  winners={winners} 
                  resultValue={pool.result_value}
                  measurementUnit={pool.measurement_unit}
                />
                <Separator />
              </>
            )}

            {/* No winner message */}
            {pool.status === "finished" && winners.length === 0 && pool.result_value && (
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
              {!isOwner && (
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
              )}
              {pool.entry_fee && parseFloat(pool.entry_fee) > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <span className="text-lg">💰</span>
                  <div>
                    <p className="text-sm text-muted-foreground">Valor de Entrada</p>
                    <p className="font-medium">R$ {parseFloat(pool.entry_fee).toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Admin: Participants Manager (collapsible approved/pending/rejected) */}
            {(userRole?.isAdmin || isOwner) && (
              <AdminParticipantsManager
                poolId={pool.id}
                participants={participants}
                onSuccess={loadPoolData}
              />
            )}

            {/* Prize Information */}
            {(pool.first_place_prize || pool.second_place_prize || pool.third_place_prize) && (
              <>
                <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-primary" />
                      Premiação
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const approvedCount = participants.filter(p => p.status === 'approved').length;
                      const totalCollected = (pool.entry_fee || 0) * approvedCount;
                      const isPercentage = pool.prize_type === 'percentage';
                      
                      const calcPrize = (pct: number) => isPercentage ? (pct / 100) * totalCollected : pct;
                      const formatPrize = (val: number) => `R$ ${val.toFixed(2).replace('.', ',')}`;

                      return (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {pool.first_place_prize && (
                              <div className="p-3 rounded-lg bg-gradient-to-br from-yellow-500/20 to-yellow-400/10 border-2 border-yellow-500">
                                <div className="flex items-center gap-2 mb-1">
                                  <Trophy className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />
                                  <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">1º Lugar</p>
                                </div>
                                <p className="text-xl font-bold text-yellow-800 dark:text-yellow-300">
                                  {isPercentage
                                    ? formatPrize(calcPrize(parseFloat(pool.first_place_prize)))
                                    : formatPrize(parseFloat(pool.first_place_prize))}
                                </p>
                                {isPercentage && (
                                  <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">
                                    ({parseFloat(pool.first_place_prize)}% do arrecadado)
                                  </p>
                                )}
                              </div>
                            )}
                            {pool.second_place_prize && (
                              <div className="p-3 rounded-lg bg-gradient-to-br from-gray-400/20 to-gray-300/10 border-2 border-gray-400">
                                <div className="flex items-center gap-2 mb-1">
                                  <Award className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">2º Lugar</p>
                                </div>
                                <p className="text-xl font-bold text-gray-800 dark:text-gray-200">
                                  {isPercentage
                                    ? formatPrize(calcPrize(parseFloat(pool.second_place_prize)))
                                    : formatPrize(parseFloat(pool.second_place_prize))}
                                </p>
                                {isPercentage && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                    ({parseFloat(pool.second_place_prize)}% do arrecadado)
                                  </p>
                                )}
                              </div>
                            )}
                            {pool.third_place_prize && (
                              <div className="p-3 rounded-lg bg-gradient-to-br from-orange-600/20 to-orange-500/10 border-2 border-orange-600">
                                <div className="flex items-center gap-2 mb-1">
                                  <Award className="w-4 h-4 text-orange-700 dark:text-orange-500" />
                                  <p className="text-sm font-semibold text-orange-800 dark:text-orange-400">3º Lugar</p>
                                </div>
                                <p className="text-xl font-bold text-orange-900 dark:text-orange-300">
                                  {isPercentage
                                    ? formatPrize(calcPrize(parseFloat(pool.third_place_prize)))
                                    : formatPrize(parseFloat(pool.third_place_prize))}
                                </p>
                                {isPercentage && (
                                  <p className="text-xs text-orange-700 dark:text-orange-500 mt-1">
                                    ({parseFloat(pool.third_place_prize)}% do arrecadado)
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                          {isPercentage && (
                            <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
                              {isOwner && (
                                <p className="text-sm text-muted-foreground">
                                  📊 Valor total arrecadado: <strong>{formatPrize(totalCollected)}</strong> ({approvedCount} participante{approvedCount !== 1 ? 's' : ''} × {formatPrize(pool.entry_fee || 0)})
                                </p>
                              )}
                              <p className={`text-xs text-muted-foreground ${isOwner ? 'mt-1' : ''}`}>
                                Os valores acima são atualizados automaticamente conforme novos participantes entram no bolão.
                              </p>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* Tie Breaker Explanation */}
                <Card className="border-2 border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-blue-500/10">
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <p className="font-semibold text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        Critério de empate:
                      </p>
                      {pool.max_winners === 1 ? (
                        <>
                          <p className="text-sm text-muted-foreground">
                            Se houver empate na maior pontuação, o prêmio do 1º lugar será dividido igualmente entre todos os participantes empatados.
                          </p>
                          <p className="text-sm text-muted-foreground">
                            <strong>Exemplo:</strong> se o prêmio é R$100,00 e 4 jogadores empatarem com a maior pontuação, cada um receberá R$25,00.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">
                            Se houver empate entre participantes, os valores das posições empatadas serão somados e divididos igualmente entre os vencedores.
                          </p>
                          <p className="text-sm text-muted-foreground">
                            <strong>Exemplo:</strong> se o 1º lugar paga R$50,00 e o 2º R$30,00, e dois jogadores empatarem em 1º, cada um receberá R$40,00.
                          </p>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

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
                  <>
                    {currentUserParticipant?.status === 'rejected' ? (
                      <>
                        <Separator />
                        <Card className="border-2 border-destructive/20 bg-gradient-to-br from-destructive/5 to-destructive/10">
                          <CardContent className="p-6 text-center space-y-3">
                            <div className="w-12 h-12 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                              <X className="w-6 h-6 text-destructive" />
                            </div>
                            <p className="text-lg font-semibold text-destructive">
                              Participação Reprovada
                            </p>
                            <div className="text-sm text-muted-foreground space-y-1">
                              <p><strong>Motivo:</strong> {currentUserParticipant?.rejection_reason || 'Não informado'}</p>
                              {currentUserParticipant?.rejection_details && (
                                <p><strong>Detalhes:</strong> {currentUserParticipant.rejection_details}</p>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              onClick={async () => {
                                const { error } = await supabase
                                  .from("participants")
                                  .update({ 
                                    status: "pending" as any, 
                                    payment_proof: null, 
                                    rejection_reason: null, 
                                    rejection_details: null 
                                  })
                                  .eq("id", currentUserParticipant.id);
                                if (!error) {
                                  toast({
                                    title: "Pronto!",
                                    description: "Você pode enviar um novo palpite.",
                                  });
                                  loadPoolData();
                                } else {
                                  toast({
                                    variant: "destructive",
                                    title: "Erro",
                                    description: error.message,
                                  });
                                }
                              }}
                              className="w-full"
                            >
                              🔄 Tentar novamente com novo palpite
                            </Button>
                            {ownerPhone && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const phone = ownerPhone.replace(/\D/g, '');
                                  const message = encodeURIComponent(
                                    `Olá ${ownerName || ''}! Minha participação no bolão "${pool.title}" foi reprovada. Motivo: ${currentUserParticipant?.rejection_reason || 'Não informado'}. Podemos resolver?`
                                  );
                                  window.open(`https://wa.me/55${phone}?text=${message}`, '_blank');
                                }}
                                className="w-full"
                              >
                                📱 Falar com o organizador no WhatsApp
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      </>
                    ) : currentUserParticipant?.status === 'pending' ? (
                      <>
                        <Separator />
                        {currentUserParticipant?.payment_proof ? (
                          <Card className="border-2 border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-orange-500/10">
                            <CardContent className="p-6 text-center space-y-2">
                              <div className="w-12 h-12 mx-auto rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                                <CheckCircle className="w-6 h-6 text-orange-500" />
                              </div>
                              <p className="text-lg font-semibold text-orange-600 dark:text-orange-400">
                                Aguardando aprovação
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Seu comprovante foi enviado com sucesso. O organizador irá analisar e aprovar sua participação.
                              </p>
                            </CardContent>
                          </Card>
                        ) : (
                          <PaymentProofSubmission
                            participantId={currentUserParticipant.id}
                            poolId={pool.id}
                            poolTitle={pool.title}
                            entryFee={pool.entry_fee ? parseFloat(pool.entry_fee) : 0}
                            pixKey={pool.pix_key}
                            onSuccess={loadPoolData}
                          />
                        )}

                        {/* Collapsible Pool Info */}
                        <div className="border rounded-lg overflow-hidden">
                          <button
                            onClick={() => setShowPoolInfo(!showPoolInfo)}
                            className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
                          >
                            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                              <Info className="w-4 h-4" />
                              Informações do bolão
                            </span>
                            {showPoolInfo ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                          {showPoolInfo && (
                            <div className="p-4 space-y-4 border-t">
                              {/* Prize Info */}
                              {(pool.first_place_prize || pool.second_place_prize || pool.third_place_prize) && (
                                <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-base flex items-center gap-2">
                                      <Trophy className="w-4 h-4 text-primary" />
                                      Premiação
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    {(() => {
                                      const approvedCount = participants.filter(p => p.status === 'approved').length;
                                      const totalCollected = (pool.entry_fee || 0) * approvedCount;
                                      const isPercentage = pool.prize_type === 'percentage';
                                      const calcPrize = (pct: number) => isPercentage ? (pct / 100) * totalCollected : pct;
                                      const formatPrize = (val: number) => `R$ ${val.toFixed(2).replace('.', ',')}`;
                                      return (
                                        <div className="grid grid-cols-1 gap-2">
                                          {pool.first_place_prize && (
                                            <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500/20 to-yellow-400/10 border border-yellow-500">
                                              <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">1º Lugar: {isPercentage ? formatPrize(calcPrize(parseFloat(pool.first_place_prize))) : formatPrize(parseFloat(pool.first_place_prize))} {isPercentage && <span className="text-xs">({parseFloat(pool.first_place_prize)}%)</span>}</p>
                                            </div>
                                          )}
                                          {pool.second_place_prize && (
                                            <div className="p-2 rounded-lg bg-gradient-to-br from-gray-400/20 to-gray-300/10 border border-gray-400">
                                              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">2º Lugar: {isPercentage ? formatPrize(calcPrize(parseFloat(pool.second_place_prize))) : formatPrize(parseFloat(pool.second_place_prize))} {isPercentage && <span className="text-xs">({parseFloat(pool.second_place_prize)}%)</span>}</p>
                                            </div>
                                          )}
                                          {pool.third_place_prize && (
                                            <div className="p-2 rounded-lg bg-gradient-to-br from-orange-600/20 to-orange-500/10 border border-orange-600">
                                              <p className="text-sm font-semibold text-orange-800 dark:text-orange-400">3º Lugar: {isPercentage ? formatPrize(calcPrize(parseFloat(pool.third_place_prize))) : formatPrize(parseFloat(pool.third_place_prize))} {isPercentage && <span className="text-xs">({parseFloat(pool.third_place_prize)}%)</span>}</p>
                                            </div>
                                          )}
                                          {isPercentage && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                              Os valores são atualizados conforme novos participantes entram no bolão.
                                            </p>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </CardContent>
                                </Card>
                              )}

                              {/* Tie Breaker */}
                              <Card className="border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-blue-500/10">
                                <CardContent className="pt-4">
                                  <div className="space-y-2">
                                    <p className="font-semibold text-sm flex items-center gap-2">
                                      <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                      Critério de empate:
                                    </p>
                                    {pool.max_winners === 1 ? (
                                      <>
                                        <p className="text-sm text-muted-foreground">
                                          Se houver empate na maior pontuação, o prêmio do 1º lugar será dividido igualmente entre todos os participantes empatados.
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          <strong>Exemplo:</strong> se o prêmio é R$100,00 e 4 jogadores empatarem com a maior pontuação, cada um receberá R$25,00.
                                        </p>
                                      </>
                                    ) : (
                                      <>
                                        <p className="text-sm text-muted-foreground">
                                          Se houver empate entre participantes, os valores das posições empatadas serão somados e divididos igualmente entre os vencedores.
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          <strong>Exemplo:</strong> se o 1º lugar paga R$50,00 e o 2º R$30,00, e dois jogadores empatarem em 1º, cada um receberá R$40,00.
                                        </p>
                                      </>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="p-6 rounded-lg bg-green-50 dark:bg-green-950 border-2 border-green-200 dark:border-green-800 text-center">
                        <p className="text-lg font-semibold text-green-700 dark:text-green-300 mb-2">
                          ✓ Você já está participando deste bolão!
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Boa sorte! Seus palpites foram salvos. Agora é só esperar a conclusão dos jogos.
                        </p>
                      </div>
                    )}
                  </>
                ) : pool.max_participants && approvedParticipants.length >= pool.max_participants ? (
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm font-medium text-destructive">
                      🚫 Bolão cheio - Limite de {pool.max_participants} participantes atingido
                    </p>
                  </div>
                ) : userHasPhone === false ? (
                  <>
                    <Separator />
                    <div className="p-6 rounded-lg bg-yellow-50 dark:bg-yellow-950 border-2 border-yellow-200 dark:border-yellow-800 text-center space-y-3">
                      <p className="text-lg font-semibold text-yellow-700 dark:text-yellow-300">
                        📱 Telefone obrigatório
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Para participar de um bolão, você precisa cadastrar seu telefone no perfil.
                      </p>
                      <Button onClick={() => navigate("/profile")} variant="default">
                        Ir para o Perfil
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Separator />
                    {(pool.pool_type === "football" || hasFootballMatches) ? (
                      <FootballPredictionForm
                        poolId={pool.id}
                        userId={userId!}
                        onSuccess={loadPoolData}
                        pool={pool}
                        pixKey={pool.pix_key}
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
                {/* Winner needs to submit PIX */}
                {currentUserParticipant.prize_status === 'awaiting_pix' && userPrizeInfo && (
                  <>
                    <Separator />
                    <PrizePixSubmission
                      participantId={currentUserParticipant.id}
                      poolTitle={pool.title}
                      prizeAmount={userPrizeInfo.amount}
                      placement={userPrizeInfo.placement}
                      isTied={userPrizeInfo.isTied}
                      tiedWithCount={userPrizeInfo.tiedWithCount}
                      totalPrizes={{
                        first: pool.first_place_prize ? parseFloat(pool.first_place_prize) : 0,
                        second: pool.second_place_prize ? parseFloat(pool.second_place_prize) : 0,
                        third: pool.third_place_prize ? parseFloat(pool.third_place_prize) : 0
                      }}
                      onSuccess={loadPoolData}
                    />
                  </>
                )}
                
                {/* PIX submitted, waiting for admin to send prize */}
                {currentUserParticipant.prize_status === 'pix_submitted' && (
                  <>
                    <Separator />
                    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        ✓ Chave PIX Enviada!
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Aguarde o envio do prêmio para sua chave PIX.
                      </p>
                    </div>
                  </>
                )}
                
                {/* Prize sent */}
                {currentUserParticipant.prize_status === 'prize_sent' && (
                  <>
                    <Separator />
                    <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 space-y-3">
                      <div>
                        <p className="text-sm font-medium text-green-700 dark:text-green-300">
                          ✓ Prêmio Enviado!
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          O prêmio foi enviado para sua chave PIX. Verifique sua conta.
                        </p>
                      </div>
                      {currentUserParticipant.prize_proof_url && (
                        <a
                          href={signedProofUrl || currentUserParticipant.prize_proof_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Ver comprovante de pagamento
                        </a>
                      )}
                    </div>
                  </>
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
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-secondary/10 border border-secondary/20">
                    <p className="text-sm font-medium mb-2">
                      💡 Informações importantes
                    </p>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        • O vencedor do bolão será definido de acordo com o resultado dos jogos.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        • Prazo para apostas: {format(new Date(pool.deadline), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} (30min antes do primeiro jogo).
                      </p>
                    </div>
                  </div>
                  
                  <div className="p-4 rounded-lg bg-muted/50 border">
                    <p className="text-sm font-medium mb-2">📊 Sistema de Pontuação:</p>
                    {pool.scoring_system === 'exact_only' ? (
                      <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                        <li><strong>1 ponto</strong>: Placar exato</li>
                        <li><strong>0 pontos</strong>: Qualquer outro resultado</li>
                      </ul>
                    ) : (
                      <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                        <li><strong>5 pontos</strong>: Placar exato</li>
                        <li><strong>3 pontos</strong>: Acertar o vencedor ou empate</li>
                        <li><strong>+1 ponto</strong>: Acertar a diferença de gols (caso acerte o vencedor ou empate)</li>
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}


            {/* WhatsApp Message Panel for admin/owner */}
            {(userRole?.isAdmin || isOwner) && (pool.pool_type === "football" || hasFootballMatches) && (
              <>
                <Separator />
                <WhatsAppMessagePanel
                  poolTitle={pool.title}
                  poolId={pool.id}
                  participants={participants}
                  poolDeadline={pool.deadline}
                  ranking={rankingData}
                  phones={participantPhones}
                  allUsersWithPhone={allUsersWithPhone}
                  isAdmin={!!userRole?.isAdmin}
                  poolPrizes={{
                    first: pool.first_place_prize ? parseFloat(pool.first_place_prize) : undefined,
                    second: pool.second_place_prize ? parseFloat(pool.second_place_prize) : undefined,
                    third: pool.third_place_prize ? parseFloat(pool.third_place_prize) : undefined,
                  }}
                />
              </>
            )}

            {((pool.status === "active" || pool.status === "finished") && (pool.pool_type === "football" || hasFootballMatches)) && (
              <>
                <Separator />
                <FootballRanking poolId={pool.id} pool={pool} approvedParticipantsCount={participants.filter(p => p.status === 'approved').length} />
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

            {approvedParticipants.length > 0 && (pool.pool_type === "football" || hasFootballMatches) && pool.status !== "finished" && new Date() > new Date(pool.deadline) && !hasAnyMatchResult && (
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

        {/* VIP Group Invite Modal */}
        {userId && (
          <VipGroupInviteModal
            open={showVipModal}
            onOpenChange={setShowVipModal}
            userId={userId}
            whatsappGroupLink="https://chat.whatsapp.com/SEU_LINK_DO_GRUPO_AQUI"
          />
        )}
      </div>
    </div>
  );
};

export default PoolDetail;
