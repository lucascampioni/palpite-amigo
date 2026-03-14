import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calendar, Trophy, Users, Share2, Award, Copy, Lock, Unlock, CheckCircle, Edit, ChevronDown, ChevronUp, Info, Trash2, X, MessageCircle, Send, Plus } from "lucide-react";
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

import { PrizePixSubmission } from "@/components/PrizePixSubmission";
import { AdminPrizeManagement } from "@/components/AdminPrizeManagement";
import { PaymentProofSubmission } from "@/components/PaymentProofSubmission";
import { AdminPendingParticipants } from "@/components/AdminPendingParticipants";
import { AdminRejectedParticipants } from "@/components/AdminRejectedParticipants";
import { AdminParticipantsManager } from "@/components/AdminParticipantsManager";
import { useUserRole } from "@/hooks/useUserRole";
import WhatsAppMessagePanel from "@/components/WhatsAppMessagePanel";
import VipGroupInviteModal from "@/components/VipGroupInviteModal";
import VoucherManager from "@/components/VoucherManager";

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
  const [paidPrizesOpen, setPaidPrizesOpen] = useState(false);
  const [signedProofUrl, setSignedProofUrl] = useState<string | null>(null);
  const [userPrizeInfo, setUserPrizeInfo] = useState<{ amount: number; placement: number; isTied: boolean; tiedWithCount: number } | null>(null);
  const [participantsPoints, setParticipantsPoints] = useState<Record<string, number>>({});
  const [hasAnyMatchResult, setHasAnyMatchResult] = useState(false);
  const [anyMatchStarted, setAnyMatchStarted] = useState(false);
  const [showAddMoreForm, setShowAddMoreForm] = useState(false);
  const [userExistingSetCount, setUserExistingSetCount] = useState(0);
  const [participantPhones, setParticipantPhones] = useState<Record<string, string>>({});
  const [rankingData, setRankingData] = useState<{ participant_id: string; participant_name: string; total_points: number }[]>([]);
  const [allUsersWithPhone, setAllUsersWithPhone] = useState<{ id: string; full_name: string; phone: string; notify_pool_updates?: boolean; notify_new_pools?: boolean }[]>([]);
  const [userHasPhone, setUserHasPhone] = useState<boolean | null>(null);
  const [showVipModal, setShowVipModal] = useState(false);
  const [showPoolInfo, setShowPoolInfo] = useState(false);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [ownerPhone, setOwnerPhone] = useState<string | null>(null);
  const [sendingCommunityNotification, setSendingCommunityNotification] = useState(false);
  const [ownerCommunityName, setOwnerCommunityName] = useState<string | null>(null);

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

      const maxW = pool.max_winners || 3;
      const tieGroupSize = groupEnd - groupStart + 1;

      // The tie group must touch at least one prize position (0 to maxW-1)
      if (groupStart >= maxW) return; // entire group is outside prize range

      // Calculate actual prize values, handling percentage-based prizes
      const totalPredictionSets = rankingData.length > 0 ? rankingData.length : participants.filter(p => p.status === 'approved').length;
      const totalCollected = (pool.entry_fee ? parseFloat(pool.entry_fee) : 0) * totalPredictionSets;
      const isPercentage = pool.prize_type === 'percentage';
      
      const calcPrize = (val: any) => {
        const num = val ? parseFloat(val) : 0;
        return isPercentage ? (num / 100) * totalCollected : num;
      };

      const prizes = [
        calcPrize(pool.first_place_prize),
        maxW >= 2 ? calcPrize(pool.second_place_prize) : 0,
        maxW >= 3 ? calcPrize(pool.third_place_prize) : 0,
      ];

      // Sum prizes for positions covered by the tie group (limited to max_winners)
      let prizeSum = 0;
      const prizeEnd = Math.min(groupEnd, maxW - 1);
      for (let i = groupStart; i <= prizeEnd; i++) {
        prizeSum += prizes[i] || 0;
      }
      
      // Divide equally among ALL members of the tie group
      const prizeAmount = prizeSum / tieGroupSize;

      if (prizeAmount > 0) {
        setUserPrizeInfo({
          amount: prizeAmount,
          placement: groupStart + 1,
          isTied: tieGroupSize > 1,
          tiedWithCount: tieGroupSize > 1 ? tieGroupSize - 1 : 0
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
      if (Object.keys(participantsPoints).length === 0) return;

      // Check if all matches are finished
      const { data: matches } = await supabase
        .from('football_matches')
        .select('id, home_score, away_score, status')
        .eq('pool_id', poolId);

      if (!matches || matches.length === 0) return;

      const excludedStatuses = ['postponed', 'cancelled', 'abandoned'];
      const countableMatches = matches.filter(m => !excludedStatuses.includes(m.status));
      const allMatchesFinished = countableMatches.length > 0 && countableMatches.every(m => m.status === 'finished');
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

  // Calculate prize amount per winner participant for admin management
  const winnerPrizeAmounts = useMemo<Record<string, number>>(() => {
    if (!pool || participants.length === 0) return {};
    
    const maxW = pool.max_winners || 3;
    const totalPredictionSets = rankingData.length > 0 ? rankingData.length : participants.filter(p => p.status === 'approved').length;
    const totalCollected = (pool.entry_fee ? parseFloat(String(pool.entry_fee)) : 0) * totalPredictionSets;
    const isPercentage = pool.prize_type === 'percentage';
    
    const calcPrize = (val: any) => {
      const num = val ? parseFloat(String(val)) : 0;
      return isPercentage ? (num / 100) * totalCollected : num;
    };

    const prizes = [
      calcPrize(pool.first_place_prize),
      maxW >= 2 ? calcPrize(pool.second_place_prize) : 0,
      maxW >= 3 ? calcPrize(pool.third_place_prize) : 0,
    ];

    const sorted = participants
      .filter(p => p.status === 'approved')
      .map(p => ({ ...p, total_points: participantsPoints[p.id] || 0 }))
      .sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

    const amounts: Record<string, number> = {};
    let pos = 0;
    while (pos < sorted.length) {
      const score = sorted[pos].total_points;
      let groupEnd = pos;
      while (groupEnd < sorted.length - 1 && sorted[groupEnd + 1].total_points === score) {
        groupEnd++;
      }
      const groupSize = groupEnd - pos + 1;
      
      if (pos < maxW) {
        let prizeSum = 0;
        const end = Math.min(groupEnd, maxW - 1);
        for (let i = pos; i <= end; i++) {
          prizeSum += prizes[i] || 0;
        }
        const perPerson = prizeSum / groupSize;
        if (perPerson > 0) {
          for (let i = pos; i <= groupEnd; i++) {
            amounts[sorted[i].id] = perPerson;
          }
        }
      }
      pos = groupEnd + 1;
    }
    return amounts;
  }, [pool, participants, participantsPoints, rankingData]);

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

  // Listen for scroll-to-prize events from FootballRanking
  useEffect(() => {
    const handler = (e: Event) => {
      const participantId = (e as CustomEvent).detail;
      // Check if this participant is in the paid section
      const isPaid = participants.find(p => p.id === participantId)?.prize_status === 'prize_sent';
      if (isPaid) {
        setPaidPrizesOpen(true);
      }
      // Wait for collapsible to open, then scroll
      setTimeout(() => {
        const el = document.getElementById(`premio-${participantId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-primary', 'rounded-lg');
          setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'rounded-lg'), 2000);
        }
      }, 300);
    };
    window.addEventListener('scroll-to-prize', handler);
    return () => window.removeEventListener('scroll-to-prize', handler);
  }, [participants]);

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
    const ownerCheck = user?.id === poolData.owner_id;
    setIsOwner(ownerCheck);

    // Check if user is a participant
    const { data: userParticipantCheck } = await supabase
      .from("participants")
      .select("id")
      .eq("pool_id", poolData.id)
      .eq("user_id", user?.id || '')
      .maybeSingle();

    // Check if pool belongs to a community (allows public access for finished pools)
    const { data: poolCommunity } = await supabase
      .from('communities')
      .select('id')
      .eq('responsible_user_id', poolData.owner_id)
      .limit(1)
      .maybeSingle();
    const belongsToCommunity = !!poolCommunity;

    // If deadline passed (or pool cancelled/finished) and user is NOT participant and NOT owner, redirect
    // Exception: finished pools from communities are accessible to all authenticated users
    const deadlinePassed = new Date(poolData.deadline) < new Date();
    const poolClosed = poolData.status === 'cancelled' || poolData.status === 'finished';
    const isFinishedCommunityPool = poolData.status === 'finished' && belongsToCommunity;
    if ((deadlinePassed || poolClosed) && !ownerCheck && !userParticipantCheck && !isFinishedCommunityPool) {
      toast({
        variant: "destructive",
        title: "Inscrições encerradas",
        description: "O prazo para participar deste bolão já expirou.",
      });
      navigate("/");
      return;
    }

    // Load owner name using security definer function
    const { data: ownerNameData } = await supabase
      .rpc("get_pool_owner_name", { pool_uuid: poolData.id });
    setOwnerName(ownerNameData || null);

    // Load owner phone for WhatsApp contact (using security definer function)
    const { data: ownerPhoneData } = await supabase
      .rpc("get_pool_owner_phone", { pool_uuid: poolData.id });
    setOwnerPhone(ownerPhoneData || null);

    // Load community name for this pool's owner
    const { data: ownerCommunity } = await supabase
      .from('communities')
      .select('name')
      .eq('responsible_user_id', poolData.owner_id)
      .limit(1)
      .maybeSingle();
    setOwnerCommunityName(ownerCommunity?.name || null);

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

    // Aggregate points per participant using the BEST prediction set (do not sum sets)
    const participantIds = (participantsData || []).map((p: any) => p.id);
    let pointsMap: Record<string, number> = {};
    if (participantIds.length > 0) {
      const { data: preds } = await supabase
        .from("football_predictions")
        .select("participant_id, prediction_set, points_earned")
        .in("participant_id", participantIds);

      if (preds) {
        const setTotals: Record<string, number> = {};

        for (const row of preds as any[]) {
          const set = row.prediction_set || 1;
          const setKey = `${row.participant_id}_${set}`;
          setTotals[setKey] = (setTotals[setKey] || 0) + (row.points_earned || 0);
        }

        for (const [setKey, total] of Object.entries(setTotals)) {
          const participantId = setKey.split("_")[0];
          pointsMap[participantId] = Math.max(pointsMap[participantId] ?? Number.NEGATIVE_INFINITY, total);
        }

        // Keep 0 for participants that only have zero-point sets
        Object.keys(pointsMap).forEach((pid) => {
          if (pointsMap[pid] === Number.NEGATIVE_INFINITY) pointsMap[pid] = 0;
        });
      }
    }
    setParticipantsPoints(pointsMap);

    const myParticipant = participantsData?.find(p => p.user_id === user?.id) || null;
    // Check if estabelecimento participant has predictions
    let hasPredictions = true;
    if (myParticipant && poolData.prize_type === 'estabelecimento') {
      const { count } = await supabase
        .from("football_predictions")
        .select("id", { count: 'exact', head: true })
        .eq("participant_id", myParticipant.id);
      hasPredictions = (count || 0) > 0;
    }
    setCurrentUserParticipant(myParticipant ? { ...myParticipant, _hasPredictions: hasPredictions } : null);
    setHasJoined(!!myParticipant);
    
    // Detect if this pool has football matches (even if pool_type is not set)
    const { data: matchesData } = await supabase
      .from("football_matches")
      .select("id, home_team, away_team, home_team_crest, away_team_crest, home_score, away_score, match_date, championship, status")
      .eq("pool_id", poolId)
      .order("match_date", { ascending: true });
    setHasFootballMatches((matchesData?.length || 0) > 0);
    setFootballMatches(matchesData || []);
    
    // Set earliest VALID match date (exclude postponed/cancelled/abandoned)
    const excludedStatuses = ['postponed', 'cancelled', 'abandoned'];
    const validMatches = matchesData?.filter(m => !excludedStatuses.includes(m.status)) || [];
    if (validMatches.length > 0) {
      setFirstMatchDate(new Date(validMatches[0].match_date));
    } else if (matchesData && matchesData.length > 0) {
      // Fallback: use first match even if excluded (pool may be cancelled)
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

    // Check if prediction cutoff has passed (pool.deadline is kept updated by edge functions)
    const cutoff = new Date(pool.deadline);

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

  const handleNotifyCommunityFollowers = async () => {
    if (!poolId || !pool) return;
    if (pool.community_notified) {
      toast({ variant: "destructive", title: "Já enviado", description: "A notificação para a comunidade já foi enviada anteriormente." });
      return;
    }

    if (!confirm("Enviar notificação via WhatsApp para todos os seguidores da comunidade que ativaram notificações? Esta ação só pode ser feita uma vez.")) return;

    setSendingCommunityNotification(true);
    try {
      const { data, error } = await supabase.functions.invoke('notify-community-followers', {
        body: { pool_id: poolId },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Notificação enviada! 🎉",
          description: `${data.sent} mensagem(ns) enviada(s) com sucesso.`,
        });
        setPool((prev: any) => ({ ...prev, community_notified: true }));
      } else {
        throw new Error(data?.error || 'Erro desconhecido');
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao enviar",
        description: err.message || "Não foi possível enviar as notificações.",
      });
    } finally {
      setSendingCommunityNotification(false);
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
  const isFinishedCommunityPool = pool.status === 'finished' && !!ownerCommunityName;

  // Calculate total entry fee considering multiple prediction sets
  const predictionSetsCount = (() => {
    const gv = currentUserParticipant?.guess_value || '';
    const match = gv.match(/^(\d+)\s+palpite/);
    return match ? parseInt(match[1]) : 1;
  })();
  const singleEntryFee = pool.entry_fee ? parseFloat(pool.entry_fee) : 0;
  const totalEntryFee = singleEntryFee * predictionSetsCount;

  const getStatusColor = (status: string) => {
    if (status === "cancelled") return "bg-destructive text-destructive-foreground";
    if (status === "finished") return "bg-gray-500 text-white";
    if (isRejected) return "bg-destructive text-destructive-foreground";
    if (isAwaitingApproval) return "bg-yellow-500 text-white";
    if (isPendingPayment) return "bg-orange-500 text-white";
    if (hasJoined) return "bg-blue-500 text-white";
    return "bg-green-500 text-white";
  };

  const getStatusText = (status: string) => {
    if (status === "cancelled") return "🚫 Cancelado";
    if (status === "finished") return "Finalizado";
    if (isRejected) return "❌ Participação Reprovada";
    if (isAwaitingApproval) return "⏳ Pendente Aprovação";
    if (isPendingPayment) return "⚠️ Pagamento Pendente";
    if (hasJoined) return "Participando";
    return "Disponível";
  };

  const approvedParticipants = participants.filter(p => p.status === 'approved');
  // Use pool.deadline as single source of truth (updated by edge functions on match cancellations)
  const predictionCutoff = new Date(pool.deadline);
  // Proof cutoff: 30 min after prediction cutoff (i.e. 2h30 before first valid match)
  const proofCutoff = new Date(predictionCutoff.getTime() + 30 * 60 * 1000);
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

        {/* Cancelled Banner */}
        {pool.status === "cancelled" && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-destructive to-destructive/80 text-destructive-foreground shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🚫</span>
              <div>
                <p className="font-bold text-lg">Bolão Cancelado</p>
                <p className="text-sm opacity-90">Todos os jogos deste bolão foram adiados ou cancelados. O bolão foi cancelado automaticamente.</p>
              </div>
            </div>
          </div>
        )}

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="space-y-1.5 min-w-0">
                <CardTitle className="text-xl sm:text-3xl leading-tight">{pool.title}</CardTitle>
                {ownerName && (
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Criado por <span className="font-medium">{ownerName}</span>
                  </p>
                )}
                <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                  <Badge className={`text-[10px] sm:text-xs px-2 py-0.5 ${getStatusColor(pool.status)}`}>
                    {getStatusText(pool.status)}
                  </Badge>
                  {pool.is_private ? (
                    <Badge variant="secondary" className="text-[10px] sm:text-xs px-2 py-0.5">
                      <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                      Privado
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-[10px] sm:text-xs px-2 py-0.5">
                      <Unlock className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                      Público
                    </Badge>
                  )}
                  {isPastDeadline && pool.status === "active" && (
                    <Badge variant="destructive" className="text-[10px] sm:text-xs px-2 py-0.5">
                      Prazo Expirado
                    </Badge>
                  )}
                </div>
              </div>
              {isOwner && participants.length === 0 && (
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs sm:text-sm"
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
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Excluir
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs sm:text-sm"
                    onClick={() => navigate(`/editar-bolao/${poolId}`)}
                  >
                    <Edit className="w-3.5 h-3.5 mr-1" />
                    Editar
                  </Button>
                </div>
              )}
            </div>
            <CardDescription className="text-sm sm:text-base mt-3">{pool.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Winner Display - hidden from rejected participants */}
            {pool.status === "finished" && winners.length > 0 && pool.pool_type !== "football" && !isRejected && (
              <>
                <WinnerDisplay 
                  winners={winners} 
                  resultValue={pool.result_value}
                  measurementUnit={pool.measurement_unit}
                  prizeType={pool.prize_type}
                  estabelecimentoPrizeDescription={pool.estabelecimento_prize_description}
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
                    {format(new Date(pool.deadline), "dd/MM 'às' HH:mm", { locale: ptBR })}
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

              {/* Estabelecimento prize display */}
              {pool.prize_type === 'estabelecimento' && pool.estabelecimento_prize_description && (
                <div className="rounded-xl bg-gradient-to-r from-amber-500/10 via-primary/5 to-orange-500/10 border-2 border-amber-500/40 px-4 py-4">
                  {/* Prize name - MAIN highlight */}
                  <div className="text-center mb-3">
                    <p className="text-xs font-medium text-amber-600 mb-1">🏆 Prêmio</p>
                    <p className="text-xl sm:text-2xl font-extrabold text-foreground leading-tight">{pool.estabelecimento_prize_description}</p>
                  </div>
                  {pool.estabelecimento_prize_address && (() => {
                    const addressParts = pool.estabelecimento_prize_address.split('\n');
                    const hasName = addressParts.length > 1;
                    const placeName = hasName ? addressParts[0] : null;
                    const addressLine = hasName ? addressParts.slice(1).join(', ') : addressParts[0];
                    return (
                      <div className="mt-2 p-2.5 rounded-lg bg-background/80 border border-amber-300/50 dark:border-amber-700/50">
                        <p className="text-[0.65rem] font-medium text-center text-muted-foreground mb-0.5">📍 Local para resgate</p>
                        {placeName && (
                          <p className="text-sm text-center font-semibold">{placeName}</p>
                        )}
                        <p className="text-xs text-center text-muted-foreground mt-0.5">{addressLine}</p>
                        <button
                          type="button"
                          onClick={() => {
                            const fullText = placeName ? `${placeName} - ${addressLine}` : addressLine;
                            navigator.clipboard.writeText(fullText);
                          }}
                          className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-primary font-medium py-1.5 rounded-md border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
                        >
                          <Copy className="w-3 h-3" />
                          Copiar endereço
                        </button>
                      </div>
                    );
                  })()}
                  <p className="text-[0.65rem] text-muted-foreground text-center mt-2">
                    ⚠️ Em caso de empate, os critérios de desempate são: 1º Maior número de placares exatos · 2º Maior número total de acertos · 3º Horário do envio do palpite · 4º Sorteio automático
                  </p>
                </div>
              )}

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
                const showPercentageOnly = isPercentage && !isFinished && !isPastDeadline;
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
                              {isFinished || isPastDeadline
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
            {isOwner && pool.entry_fee && parseFloat(pool.entry_fee) > 0 && pool.prize_type !== 'estabelecimento' && firstMatchDate && pool.status === 'active' && (
              <Collapsible>
                <CollapsibleTrigger className="w-full p-3 rounded-xl bg-yellow-50 dark:bg-yellow-950/30 border-2 border-yellow-300 dark:border-yellow-700 flex items-center justify-between">
                  <span className="font-bold text-xs sm:text-sm text-yellow-700 dark:text-yellow-400 flex items-center gap-1.5">
                    ⚠️ Atenção - Prazos de aprovação
                  </span>
                  <ChevronDown className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3 pt-2 rounded-b-xl bg-yellow-50 dark:bg-yellow-950/30 border-2 border-t-0 border-yellow-300 dark:border-yellow-700 -mt-2">
                    <div className="space-y-1.5 text-[11px] sm:text-xs text-yellow-800 dark:text-yellow-300 leading-relaxed">
                      <p>
                        • Sem comprovante até <strong>{format(proofCutoff, "dd/MM 'às' HH:mm", { locale: ptBR })}</strong> → <strong>rejeitado automaticamente</strong>.
                      </p>
                      <p>
                        • Você tem até <strong>{firstMatchDate ? format(firstMatchDate, "dd/MM 'às' HH:mm", { locale: ptBR }) : format(new Date(new Date(pool.deadline).getTime() + 3 * 60 * 60 * 1000), "dd/MM 'às' HH:mm", { locale: ptBR })}</strong> para aprovar/reprovar.
                      </p>
                      <p className="font-semibold text-yellow-900 dark:text-yellow-200">
                        ⏰ Após isso, pendentes com comprovante serão <strong>APROVADOS AUTOMATICAMENTE</strong>.
                      </p>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
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

            {/* Voucher Manager for Estabelecimento pools */}
            {isOwner && pool.prize_type === 'estabelecimento' && pool.status === 'active' && (
              <>
                <Separator />
                <VoucherManager
                  poolId={pool.id}
                  poolTitle={pool.title}
                  poolSlug={pool.slug}
                  deadline={pool.deadline}
                />
              </>
            )}

            {isOwner && pool.status === "active" && (
              <>
                <Separator />
                <div className="p-3 sm:p-4 rounded-lg bg-muted/50 border">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="text-xs sm:text-sm font-medium">Privacidade do Bolão</p>
                      <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug">
                        {pool.is_private 
                          ? "🔒 PRIVADO — Só quem tem o link acessa" 
                          : "🌐 PÚBLICO — Visível para todos"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
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
                {hasJoined && !(pool.prize_type === 'estabelecimento' && currentUserParticipant?.status === 'approved' && !currentUserParticipant?._hasPredictions) ? (
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

                        {/* Edit / Cancel buttons for pending participants (only if no proof sent) */}
                        {!currentUserParticipant.payment_proof && <>
                          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 mt-2">
                            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                              💡 Quer fazer mais palpites? Toque em <strong>Editar palpites</strong> e adicione novos conjuntos. Após o pagamento, não será possível adicionar novos palpites.
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-9 text-xs sm:text-sm"
                            onClick={async () => {
                              if (!confirm("Deseja editar seus palpites? Seus palpites atuais serão apagados e você poderá refazer a inscrição do zero.")) return;
                              await supabase
                                .from("football_predictions")
                                .delete()
                                .eq("participant_id", currentUserParticipant.id);
                              await supabase
                                .from("participants")
                                .delete()
                                .eq("id", currentUserParticipant.id);
                              toast({
                                title: "Palpites removidos",
                                description: "Refaça sua inscrição com novos palpites.",
                              });
                              setCurrentUserParticipant(null);
                              setHasJoined(false);
                              setParticipants(prev => prev.filter(p => p.id !== currentUserParticipant.id));
                            }}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Editar palpites
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="flex-1 h-9 text-xs sm:text-sm"
                            onClick={async () => {
                              if (!confirm("Tem certeza que deseja cancelar sua participação? Todos os seus dados serão excluídos deste bolão.")) return;
                              await supabase
                                .from("football_predictions")
                                .delete()
                                .eq("participant_id", currentUserParticipant.id);
                              await supabase
                                .from("participants")
                                .delete()
                                .eq("id", currentUserParticipant.id);
                              toast({
                                title: "Participação cancelada",
                                description: "Você saiu do bolão.",
                              });
                              setCurrentUserParticipant(null);
                              setHasJoined(false);
                              setParticipants(prev => prev.filter(p => p.id !== currentUserParticipant.id));
                            }}
                          >
                            <X className="w-4 h-4 mr-2" />
                            Cancelar participação
                          </Button>
                         </div>
                        </>}
                      </>
                    ) : (
                      <div className="p-6 rounded-lg bg-green-50 dark:bg-green-950 border-2 border-green-200 dark:border-green-800 text-center space-y-3">
                        <p className="text-lg font-semibold text-green-700 dark:text-green-300 mb-2">
                          ✓ Você já está participando deste bolão!
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Boa sorte! Seus palpites foram salvos. Agora é só esperar a conclusão dos jogos.
                        </p>
                        {pool.has_whatsapp_group && ownerPhone && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full mt-2"
                            onClick={() => {
                              const phone = ownerPhone.replace(/\D/g, '');
                              const message = encodeURIComponent(
                                `Olá ${ownerName || ''}! Estou participando do bolão "${pool.title}" e gostaria de entrar no grupo do WhatsApp. Pode me adicionar?`
                              );
                              window.open(`https://wa.me/55${phone}?text=${message}`, '_blank');
                            }}
                          >
                            <MessageCircle className="w-4 h-4" />
                            Entrar no grupo do WhatsApp
                          </Button>
                        )}
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
                      totalPrizes={(() => {
                        const isPercentage = pool.prize_type === 'percentage';
                        const totalPredictionSets = rankingData.length > 0 ? rankingData.length : participants.filter(p => p.status === 'approved').length;
                        const totalCollected = (pool.entry_fee ? parseFloat(pool.entry_fee) : 0) * totalPredictionSets;
                        const calc = (val: any) => {
                          const num = val ? parseFloat(val) : 0;
                          return isPercentage ? (num / 100) * totalCollected : num;
                        };
                        return {
                          first: calc(pool.first_place_prize),
                          second: calc(pool.second_place_prize),
                          third: calc(pool.third_place_prize)
                        };
                      })()}
                      onSuccess={loadPoolData}
                    />
                  </>
                )}
                
                {/* PIX submitted, waiting for admin to send prize */}
                {currentUserParticipant.prize_status === 'pix_submitted' && (
                  <>
                    <Separator />
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        ✓ Chave PIX Enviada!
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Aguarde até 24h para recebimento.{' '}
                        {ownerPhone ? (
                          <a
                            href={`https://wa.me/${ownerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${ownerName || ''}! Tudo bem? Participei do bolão "${pool?.title}" na Delfos e enviei minha chave PIX para recebimento do prêmio, mas ainda não recebi. Pode verificar, por favor?\n\nLink do bolão: https://delfos.app.br/bolao/${pool?.slug || pool?.id}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 underline"
                          >
                            Passou de 24h? Fale com o organizador
                          </a>
                        ) : (
                          <span>Caso passe de 24h, entre em contato com o organizador.</span>
                        )}
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
                      {ownerPhone && (
                        <a
                          href={`https://wa.me/${ownerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${ownerName || ''}! Meu prêmio do bolão "${pool?.title}" foi marcado como pago, mas ainda não recebi. Pode verificar?`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          Não recebeu? Fale com o criador
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

            {/* Notify Community Followers Button - owner only, one-time */}
            {isOwner && pool.status === 'active' && ownerCommunityName && (
              <>
                <Separator />
                <div className={`p-3 sm:p-4 rounded-xl border-2 space-y-2.5 ${pool.community_notified ? 'border-border bg-card' : 'border-orange-400/60 bg-orange-50/50 dark:bg-orange-950/20'}`}>
                  <div className="flex items-start gap-2.5">
                    <Send className={`w-4 h-4 sm:w-5 sm:h-5 mt-0.5 shrink-0 ${pool.community_notified ? 'text-muted-foreground' : 'text-orange-500'}`} />
                    <div className="space-y-1 min-w-0">
                      <h4 className="font-semibold text-xs sm:text-sm leading-tight">
                        Divulgar para seguidores da {ownerCommunityName}
                      </h4>
                      <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                        Envia uma mensagem via WhatsApp para <strong>todos</strong> os seguidores que ativaram notificações de novos bolões.
                      </p>
                      {!pool.community_notified && (
                        <p className="text-[11px] sm:text-xs text-orange-600 dark:text-orange-400 font-medium mt-1 leading-relaxed">
                          ⚠️ Envio em massa — só pode ser feito <strong>1 vez</strong> por bolão.
                        </p>
                      )}
                      {pool.community_notified && (
                        <p className="text-[11px] sm:text-xs font-medium flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                          Notificação já enviada
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={pool.community_notified ? "outline" : "default"}
                    className={`w-full text-xs sm:text-sm h-8 sm:h-9 ${!pool.community_notified ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}`}
                    disabled={pool.community_notified || sendingCommunityNotification}
                    onClick={handleNotifyCommunityFollowers}
                  >
                    {sendingCommunityNotification ? (
                      "Enviando..."
                    ) : pool.community_notified ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 mr-1" />
                        Já enviado
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5 mr-1" />
                        Notificar seguidores (apenas 1x)
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}

            {/* Informações importantes for joined users */}
            {((pool.status === "active" || pool.status === "finished") && (pool.pool_type === "football" || hasFootballMatches) && (currentUserParticipant?.status === 'approved' || isOwner || isFinishedCommunityPool)) && (
              <>
                <Separator />
                <Collapsible>
                  <CollapsibleTrigger className="w-full p-3 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-between text-sm font-medium hover:bg-secondary/20 transition-colors">
                    <span>💡 Informações importantes</span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-3 pt-2 rounded-b-lg bg-secondary/10 border border-t-0 border-secondary/20 space-y-1">
                      <p className="text-xs text-muted-foreground">
                        • O vencedor do bolão será definido de acordo com o resultado dos jogos.
                      </p>
                      <div className="mt-2 pt-2 border-t border-secondary/20">
                        <p className="text-xs text-muted-foreground font-medium">📊 Sistema de Pontuação:</p>
                        {pool?.scoring_system === 'exact_only' ? (
                          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground text-xs mt-1">
                            <li><strong>1 ponto</strong>: Placar exato</li>
                            <li><strong>0 pontos</strong>: Qualquer outro resultado</li>
                          </ul>
                        ) : pool?.scoring_system === 'simplified' ? (
                          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground text-xs mt-1">
                            <li><strong>3 pontos</strong>: Placar exato</li>
                            <li><strong>1 ponto</strong>: Acertar o vencedor ou empate</li>
                          </ul>
                        ) : (
                          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground text-xs mt-1">
                            <li><strong>5 pontos</strong>: Placar exato</li>
                            <li><strong>3 pontos</strong>: Acertar o vencedor ou empate</li>
                            <li><strong>+1 ponto</strong>: Acertar a diferença de gols (caso acerte o vencedor ou empate)</li>
                          </ul>
                        )}
                      </div>
                      <div className="mt-2 pt-2 border-t border-secondary/20">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          ✅ <strong>Critério de empate:</strong>
                        </p>
                        {pool?.prize_type === 'estabelecimento' ? (
                          <ul className="list-decimal list-inside space-y-0.5 text-muted-foreground text-xs mt-1">
                            <li>Maior número de placares exatos</li>
                            <li>Maior número total de acertos</li>
                            <li>Horário do envio do palpite (quem enviou primeiro)</li>
                            <li>Sorteio automático</li>
                          </ul>
                        ) : pool?.max_winners === 1 ? (
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
              </>
            )}

            {((pool.status === "active" || pool.status === "finished") && (pool.pool_type === "football" || hasFootballMatches) && (isOwner || currentUserParticipant?.status === 'approved' || isFinishedCommunityPool)) && (
              pool.prize_type === 'estabelecimento' && !isOwner && currentUserParticipant && !currentUserParticipant._hasPredictions ? (
                <>
                  <Separator />
                  <Card className="border-2 border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-amber-500/10">
                    <CardContent className="p-6 text-center space-y-2">
                      <Lock className="w-8 h-8 mx-auto text-amber-500" />
                      <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                        Ranking bloqueado
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Você precisa enviar seus palpites para poder ver o ranking dos outros participantes.
                      </p>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <>
                  <Separator />
                  <FootballRanking poolId={pool.id} pool={pool} approvedParticipantsCount={participants.filter(p => p.status === 'approved').length} isOwner={isOwner} />
                </>
              )
            )}

            {/* Admin Prize Management Section */}
            {isOwner && pool.status === "finished" && (
              <>
                <Separator />
                <div className="space-y-4" id="gerenciar-premios">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-500" />
                    Gerenciar Prêmios
                  </h3>
                  {participants
                    .filter(p => p.prize_status && p.prize_status !== 'prize_sent')
                    .map((participant) => (
                      <div key={participant.id} id={`premio-${participant.id}`}>
                        <AdminPrizeManagement
                          participant={{
                            id: participant.id,
                            participant_name: participant.participant_name,
                            prize_pix_key: participant.prize_pix_key,
                            prize_pix_key_type: participant.prize_pix_key_type,
                            prize_status: participant.prize_status,
                            prize_proof_url: participant.prize_proof_url,
                            user_id: participant.user_id,
                          }}
                          poolId={pool.id}
                          poolTitle={pool.title}
                          participantPhone={participantPhones[participant.user_id]}
                          prizeAmount={winnerPrizeAmounts[participant.id]}
                          onSuccess={loadPoolData}
                        />
                      </div>
                    ))}
                  {participants.filter(p => p.prize_status && p.prize_status !== 'prize_sent').length === 0 && 
                   participants.filter(p => p.prize_status === 'prize_sent').length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Nenhum prêmio pendente no momento.
                    </p>
                  )}

                  {/* Paid prizes - collapsible */}
                  {participants.filter(p => p.prize_status === 'prize_sent').length > 0 && (
                    <Collapsible open={paidPrizesOpen} onOpenChange={setPaidPrizesOpen}>
                      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span>Prêmios já pagos ({participants.filter(p => p.prize_status === 'prize_sent').length})</span>
                        {paidPrizesOpen ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-4 mt-3">
                        {participants
                          .filter(p => p.prize_status === 'prize_sent')
                          .map((participant) => (
                            <div key={participant.id} id={`premio-${participant.id}`}>
                              <AdminPrizeManagement
                                participant={{
                                  id: participant.id,
                                  participant_name: participant.participant_name,
                                  prize_pix_key: participant.prize_pix_key,
                                  prize_pix_key_type: participant.prize_pix_key_type,
                                  prize_status: participant.prize_status,
                                  prize_proof_url: participant.prize_proof_url,
                                  user_id: participant.user_id,
                                }}
                                poolId={pool.id}
                                poolTitle={pool.title}
                                participantPhone={participantPhones[participant.user_id]}
                                prizeAmount={winnerPrizeAmounts[participant.id]}
                                onSuccess={loadPoolData}
                              />
                            </div>
                          ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              </>
            )}


            {approvedParticipants.length > 0 && !(pool.pool_type === "football" || hasFootballMatches) && (isOwner || currentUserParticipant?.status === 'approved') && (
              <>
                <Separator />
                <Collapsible>
                  <CollapsibleTrigger className="w-full flex items-center justify-between py-2 hover:opacity-80 transition-opacity">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <Users className="w-5 h-5 text-primary" />
                      Participantes Aprovados ({approvedParticipants.length})
                    </h3>
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid gap-3 mt-3">
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
                  </CollapsibleContent>
                </Collapsible>
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
