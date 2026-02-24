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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const { slug } = useParams();
  const [poolId, setPoolId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: userRole } = useUserRole();
  const [pool, setPool] = useState<any>(null);
  const [firstMatchDate, setFirstMatchDate] = useState<Date | null>(null);
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
  const [footballMatches, setFootballMatches] = useState<any[]>([]);
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
      // For percentage prizes, use total prediction sets (from ranking data) not just participant count
      const totalPredictionSets = rankingData.length > 0 ? rankingData.length : participants.filter(p => p.status === 'approved').length;
      const totalCollected = (pool.entry_fee ? parseFloat(pool.entry_fee) : 0) * totalPredictionSets;
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
  }, [currentUserParticipant, participants, participantsPoints, pool, hasFootballMatches, rankingData]);

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
        .eq('pool_id', poolId);

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
        .sort((a: any, b: any) => {
          if (b.total_points !== a.total_points) return b.total_points - a.total_points;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });

      const maxWinners = pool.max_winners || 3;
      const winnersToUpdate: string[] = [];
      
      const allZeroPoints = participantsWithPoints.every((p: any) => p.total_points === 0);

      if (allZeroPoints) {
        // When nobody scored, winners are determined by earliest join time
        const topN = Math.min(maxWinners, participantsWithPoints.length);
        for (let i = 0; i < topN; i++) {
          winnersToUpdate.push(participantsWithPoints[i].id);
        }
      } else {
        let currentPosition = 0;
        while (currentPosition < participantsWithPoints.length && currentPosition < maxWinners) {
          const currentScore = participantsWithPoints[currentPosition].total_points;
          if (currentScore === 0) break;

          let tieGroupEnd = currentPosition;
          while (
            tieGroupEnd < participantsWithPoints.length &&
            participantsWithPoints[tieGroupEnd].total_points === currentScore
          ) {
            tieGroupEnd++;
          }

          if (currentPosition < maxWinners) {
            for (let i = currentPosition; i < tieGroupEnd; i++) {
              if (participantsWithPoints[i].total_points > 0) {
                winnersToUpdate.push(participantsWithPoints[i].id);
              }
            }
          }

          currentPosition = tieGroupEnd;
        }
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
  }, [pool, participants, participantsPoints, hasFootballMatches, poolId]);

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        const redirectUrl = `/bolao/${slug}`;
        navigate(`/entrar?redirect=${encodeURIComponent(redirectUrl)}`);
        return;
      }
      
      // Resolve slug to pool ID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug || '');
      
      let resolvedId: string | null = null;
      if (isUUID) {
        // Direct UUID access (backward compatibility)
        resolvedId = slug!;
      } else {
        // Slug-based lookup
        const { data: poolBySlug } = await supabase
          .from("pools")
          .select("id")
          .eq("slug", slug)
          .single();
        resolvedId = poolBySlug?.id || null;
      }
      
      if (!resolvedId) {
        toast({ variant: "destructive", title: "Erro", description: "Bolão não encontrado." });
        navigate("/");
        return;
      }
      
      setPoolId(resolvedId);
    };
    
    checkAuthAndLoadData();
  }, [slug, navigate]);

  useEffect(() => {
    if (poolId) loadPoolData();
  }, [poolId]);

  const loadPoolData = async () => {
    try {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);

    const { data: poolData, error: poolError } = await supabase
      .from("pools")
      .select("*")
      .eq("id", poolId)
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
      .eq("pool_id", poolId);

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
      .select("id, home_team, away_team, home_team_crest, away_team_crest, home_score, away_score, match_date, championship, status")
      .eq("pool_id", poolId)
      .order("match_date", { ascending: true });
    setHasFootballMatches((matchesData?.length || 0) > 0);
    setFootballMatches(matchesData || []);
    
    // Set earliest match date
    if (matchesData && matchesData.length > 0) {
      setFirstMatchDate(new Date(matchesData[0].match_date));
    }
    
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
      const { data: rankData } = await supabase.rpc("get_football_pool_ranking", { p_pool_id: poolId });
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
      .eq('pool_id', poolId)
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
          .sort((a, b) => {
            if (b.total_points !== a.total_points) return b.total_points - a.total_points;
            // Tiebreaker: earliest join time
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          }) || [];
        
        if (participantsWithPoints.length > 0) {
          const allZero = participantsWithPoints.every(p => p.total_points === 0);
          if (allZero) {
            // When all have 0 points, winner is whoever joined first
            const maxW = poolData.max_winners || 3;
            const topN = participantsWithPoints.slice(0, maxW);
            setWinners(topN.map(w => ({ ...w, tiebreaker_by_join_time: true })));
          } else {
            const highestScore = participantsWithPoints[0].total_points;
            const topWinners = participantsWithPoints.filter(p => p.total_points === highestScore && p.total_points > 0);
            setWinners(topWinners);
          }
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
      navigate("/perfil");
      return;
    }

    // Check if prediction cutoff has passed (3h before first match)
    const cutoff = firstMatchDate 
      ? new Date(firstMatchDate.getTime() - 3 * 60 * 60 * 1000)
      : new Date(pool.deadline);
    if (new Date() > cutoff) {
      toast({
        variant: "destructive",
        title: "Prazo expirado",
        description: "O prazo para palpites já passou (3h antes do primeiro jogo).",
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
        pool_id: poolId!,
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
    const url = `https://delfos.app.br/bolao/${pool?.slug || poolId}`;
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
      .eq("pool_id", poolId!)
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
      .eq("id", poolId!);

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

  // Calculate total entry fee considering multiple prediction sets
  const predictionSetsCount = (() => {
    const gv = currentUserParticipant?.guess_value || '';
    const match = gv.match(/^(\d+)\s+palpite/);
    return match ? parseInt(match[1]) : 1;
  })();
  const singleEntryFee = pool.entry_fee ? parseFloat(pool.entry_fee) : 0;
  const totalEntryFee = singleEntryFee * predictionSetsCount;

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
  // Prediction cutoff: 3h before first match, or pool deadline as fallback
  const predictionCutoff = firstMatchDate 
    ? new Date(firstMatchDate.getTime() - 3 * 60 * 60 * 1000) 
    : new Date(pool.deadline);
  const proofCutoff = firstMatchDate 
    ? new Date(firstMatchDate.getTime() - 2.5 * 60 * 60 * 1000)
    : new Date(pool.deadline);
  const isPastDeadline = new Date() > predictionCutoff;
  const isPastProofDeadline = new Date() > proofCutoff;

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
                  <>
                    <p className="text-sm text-orange-100">Envie o comprovante de pagamento abaixo para confirmar sua participação.</p>
                    {predictionSetsCount > 1 && singleEntryFee > 0 && (
                      <p className="text-sm text-orange-100 mt-1 font-semibold">
                        💰 Valor total: R$ {totalEntryFee.toFixed(2).replace('.', ',')} ({predictionSetsCount} palpites × R$ {singleEntryFee.toFixed(2).replace('.', ',')})
                      </p>
                    )}
                  </>
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
                <p className="text-sm text-yellow-100 mt-1">🔒 Fique tranquilo! Caso o criador não aprove ou recuse até o horário do primeiro jogo, sua participação será aprovada automaticamente.</p>
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
                      await supabase.from("pool_payment_info").delete().eq("pool_id", poolId!);
                      await supabase.from("football_matches").delete().eq("pool_id", poolId!);
                      const { error } = await supabase.from("pools").delete().eq("id", poolId!);
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
                    onClick={() => navigate(`/editar-bolao/${poolId}`)}
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
            {/* Winner Display - hidden from rejected participants */}
            {pool.status === "finished" && winners.length > 0 && pool.pool_type !== "football" && !isRejected && (
              <>
                <WinnerDisplay 
                  winners={winners} 
                  resultValue={pool.result_value}
                  measurementUnit={pool.measurement_unit}
                />
                <Separator />
              </>
            )}

            {/* No winner message - hidden from rejected participants */}
            {pool.status === "finished" && winners.length === 0 && pool.result_value && !isRejected && (
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
                {/* Show matches list for owner when no participants yet */}
                {isOwner && approvedParticipants.length === 0 && footballMatches.length > 0 && (
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2 group">
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        ⚽ Jogos do Bolão ({footballMatches.length})
                      </h3>
                      <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-2 mt-2">
                        {footballMatches.map((match) => (
                          <div
                            key={match.id}
                            className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {match.home_team_crest && (
                                  <img src={match.home_team_crest} alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                )}
                                <span className="font-medium text-sm">{match.home_team}</span>
                                <span className="text-muted-foreground text-xs">x</span>
                                <span className="font-medium text-sm">{match.away_team}</span>
                                {match.away_team_crest && (
                                  <img src={match.away_team_crest} alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                📅 {format(new Date(match.match_date), "dd/MM 'às' HH:mm", { locale: ptBR })} · {match.championship}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </>
            )}

            {/* Compact info strip */}
            <div className="flex flex-col gap-2 text-sm text-center">
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-muted-foreground">
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <Calendar className="w-3.5 h-3.5" />
                  Palpites até <strong className="text-foreground ml-0.5">
                    {firstMatchDate 
                      ? format(new Date(firstMatchDate.getTime() - 3 * 60 * 60 * 1000), "dd/MM 'às' HH:mm", { locale: ptBR })
                      : format(new Date(pool.deadline), "dd/MM 'às' HH:mm", { locale: ptBR })
                    }
                  </strong>
                </span>
                <span className="text-muted-foreground/30">·</span>
                {!isOwner && (
                  <>
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Users className="w-3.5 h-3.5" />
                      {approvedParticipants.length} participante{approvedParticipants.length !== 1 ? 's' : ''}
                      {pool.max_participants && approvedParticipants.length >= pool.max_participants && (
                        <span className="text-destructive text-xs">(Cheio)</span>
                      )}
                    </span>
                    <span className="text-muted-foreground/30">·</span>
                  </>
                )}
                {pool.entry_fee && parseFloat(pool.entry_fee) > 0 && (
                  <span className="whitespace-nowrap">
                    Entrada: <strong className="text-foreground">R$ {parseFloat(pool.entry_fee).toFixed(2).replace('.', ',')}</strong>
                  </span>
                )}
              </div>

              {/* Prize highlight */}
              {(pool.first_place_prize || pool.second_place_prize || pool.third_place_prize) && (() => {
                const totalPredictionSets = rankingData.length > 0 ? rankingData.length : participants.filter(p => p.status === 'approved').length;
                const totalCollected = (pool.entry_fee || 0) * totalPredictionSets;
                const isPercentage = pool.prize_type === 'percentage';
                const calcPrize = (pct: number) => isPercentage ? (pct / 100) * totalCollected : pct;
                const formatPrize = (val: number) => `R$ ${val.toFixed(2).replace('.', ',')}`;
                const items: { emoji: string; val: string }[] = [];
                if (pool.first_place_prize) {
                  const pct = parseFloat(pool.first_place_prize);
                  items.push({ emoji: '🥇', val: formatPrize(isPercentage ? calcPrize(pct) : pct) });
                }
                if (pool.second_place_prize) {
                  const pct = parseFloat(pool.second_place_prize);
                  items.push({ emoji: '🥈', val: formatPrize(isPercentage ? calcPrize(pct) : pct) });
                }
                if (pool.third_place_prize) {
                  const pct = parseFloat(pool.third_place_prize);
                  items.push({ emoji: '🥉', val: formatPrize(isPercentage ? calcPrize(pct) : pct) });
                }
                const isFinished = pool.status === 'finished';
                const showPercentageOnly = isPercentage && !isFinished;
                return (
                  <div className="rounded-xl bg-gradient-to-r from-yellow-500/10 via-primary/5 to-orange-500/10 border border-primary/20 px-3 py-2.5">
                    {showPercentageOnly ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-center gap-2">
                          <Trophy className="w-4 h-4 text-primary flex-shrink-0" />
                          <span className="font-semibold text-primary">Premiação</span>
                        </div>
                        {(() => {
                          const entryFee = parseFloat(pool.entry_fee || '0');
                          const pctItems: { emoji: string; pct: number }[] = [];
                          if (pool.first_place_prize) pctItems.push({ emoji: '🥇', pct: parseFloat(pool.first_place_prize) });
                          if (pool.second_place_prize) pctItems.push({ emoji: '🥈', pct: parseFloat(pool.second_place_prize) });
                          if (pool.third_place_prize) pctItems.push({ emoji: '🥉', pct: parseFloat(pool.third_place_prize) });
                          return (
                            <>
                              <div className="flex items-center justify-center gap-3 flex-wrap">
                                {pctItems.map((item, i) => (
                                  <span key={i} className="font-bold whitespace-nowrap text-sm">
                                    {item.emoji} {item.pct}% do arrecadado
                                  </span>
                                ))}
                              </div>
                              {totalCollected > 0 && (
                                <div className="flex items-center justify-center gap-2 flex-wrap">
                                  {items.map((item, i) => (
                                    <span key={i} className="text-xs text-muted-foreground whitespace-nowrap">
                                      {item.emoji} Atual: {item.val}
                                    </span>
                                  ))}
                                </div>
                              )}
                               <p className="text-xs text-center text-muted-foreground">
                                 Quanto mais palpites, maior o prêmio! 🚀
                               </p>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-center gap-3 flex-wrap">
                          <Trophy className="w-4 h-4 text-primary flex-shrink-0" />
                          <span className="font-semibold text-primary">Premiação</span>
                          {items.map((item, i) => (
                            <span key={i} className="font-bold whitespace-nowrap">
                              {item.emoji} {item.val}
                            </span>
                          ))}
                        </div>
                        {isPercentage && (() => {
                          const pctParts: string[] = [];
                          if (pool.first_place_prize) pctParts.push(`🥇 ${parseFloat(pool.first_place_prize)}%`);
                          if (pool.second_place_prize) pctParts.push(`🥈 ${parseFloat(pool.second_place_prize)}%`);
                          if (pool.third_place_prize) pctParts.push(`🥉 ${parseFloat(pool.third_place_prize)}%`);
                          const pctStr = pctParts.join(' · ');
                          return (
                            <p className="text-[0.65rem] text-muted-foreground text-center mt-1">
                              {isFinished
                                ? `* ${pctStr} do valor arrecadado (${totalPredictionSets} palpite${totalPredictionSets !== 1 ? 's' : ''})`
                                : `* ${pctStr} do valor arrecadado — atualizado conforme novas inscrições`}
                            </p>
                          );
                        })()}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Auto-approve warning for creators */}
            {isOwner && pool.entry_fee && parseFloat(pool.entry_fee) > 0 && firstMatchDate && pool.status === 'active' && (
              <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-950/30 border-2 border-yellow-300 dark:border-yellow-700">
                <p className="font-bold text-yellow-700 dark:text-yellow-400 flex items-center gap-2 mb-2">
                  ⚠️ Atenção - Prazos de aprovação
                </p>
                <div className="space-y-2 text-sm text-yellow-800 dark:text-yellow-300">
                  <p>
                    • Participantes que <strong>não enviarem comprovante</strong> até <strong>{format(new Date(firstMatchDate.getTime() - 2.5 * 60 * 60 * 1000), "dd/MM 'às' HH:mm", { locale: ptBR })}</strong> (2h30 antes do jogo) serão <strong>rejeitados automaticamente</strong>.
                  </p>
                  <p>
                    • Você tem até <strong>{format(firstMatchDate, "dd/MM 'às' HH:mm", { locale: ptBR })}</strong> (horário do 1º jogo) para aprovar/reprovar os participantes que enviaram comprovante.
                  </p>
                  <p className="font-semibold text-yellow-900 dark:text-yellow-200">
                    ⏰ Após esse horário, todos os participantes com comprovante pendente de análise serão <strong>APROVADOS AUTOMATICAMENTE</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Admin: Participants Manager (collapsible approved/pending/rejected) */}
            {(userRole?.isAdmin || isOwner) && (
              <AdminParticipantsManager
                poolId={pool.id}
                participants={participants}
                entryFee={pool.entry_fee}
                firstMatchDate={firstMatchDate}
                onParticipantUpdate={(id, changes) => {
                  setParticipants(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
                  setCurrentUserParticipant((prev: any) => prev?.id === id ? { ...prev, ...changes } : prev);
                }}
              />
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
                                // Delete football predictions first (if any)
                                await supabase
                                  .from("football_predictions")
                                  .delete()
                                  .eq("participant_id", currentUserParticipant.id);

                                // Delete the participant record entirely so user starts fresh
                                const { error } = await supabase
                                  .from("participants")
                                  .delete()
                                  .eq("id", currentUserParticipant.id);

                                if (!error) {
                                  toast({
                                    title: "Pronto!",
                                    description: "Faça seu palpite novamente do início.",
                                  });
                                  // Reset local state so the prediction form appears immediately
                                  setCurrentUserParticipant(null);
                                  setHasJoined(false);
                                  setParticipants(prev => prev.filter(p => p.id !== currentUserParticipant.id));
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
                            entryFee={totalEntryFee}
                            pixKey={pool.pix_key}
                            firstMatchDate={firstMatchDate}
                            onSuccess={loadPoolData}
                          />
                        )}



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
                      <Button onClick={() => navigate("/perfil")} variant="default">
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
                        firstMatchDate={firstMatchDate}
                        ownerName={ownerName || undefined}
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



            {/* WhatsApp Message Panel for admin/owner */}
            {(userRole?.isAdmin || isOwner) && (pool.pool_type === "football" || hasFootballMatches) && (
              <>
                <Separator />
                <WhatsAppMessagePanel
                  poolTitle={pool.title}
                  poolId={pool.id}
                  poolSlug={pool.slug}
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
                  entryFee={pool.entry_fee ? parseFloat(pool.entry_fee) : undefined}
                  prizeType={pool.prize_type}
                  approvedPredictionSets={approvedParticipants.length}
                  poolStatus={pool.status}
                />
              </>
            )}

            {((pool.status === "active" || pool.status === "finished") && (pool.pool_type === "football" || hasFootballMatches) && (isOwner || currentUserParticipant?.status === 'approved')) && (
              <>
                <Separator />
                <FootballRanking poolId={pool.id} pool={pool} approvedParticipantsCount={participants.filter(p => p.status === 'approved').length} isOwner={isOwner} />
              </>
            )}

            {/* Admin Prize Management Section */}
            {isOwner && pool.status === "finished" && (
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

            {approvedParticipants.length > 0 && (pool.pool_type === "football" || hasFootballMatches) && pool.status !== "finished" && new Date() > new Date(pool.deadline) && !hasAnyMatchResult && (isOwner || currentUserParticipant?.status === 'approved') && (
              <>
                <Separator />
                <FootballParticipantsPredictions poolId={pool.id} participants={approvedParticipants} />
              </>
            )}

            {approvedParticipants.length > 0 && !(pool.pool_type === "football" || hasFootballMatches) && (isOwner || currentUserParticipant?.status === 'approved') && (
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
                              {pool.pool_type !== "football" && (
                                <Badge variant="secondary">{participant.guess_value}</Badge>
                              )}
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
