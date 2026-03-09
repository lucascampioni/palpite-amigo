import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trophy, LogOut, User, ChevronDown, ChevronUp, Users, Home, Search, Settings, X, AlertTriangle, Users2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import PoolCard from "@/components/PoolCard";
import { Session } from "@supabase/supabase-js";
import { NotificationService } from "@/services/NotificationService";
import { useUserRole } from "@/hooks/useUserRole";
import delfosLogo from "@/assets/delfos-logo.png";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import CommunitiesTab from "@/components/CommunitiesTab";

const Index = () => {
  const navigate = useNavigate();
  const { data: userRole } = useUserRole();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [myCreatedPools, setMyCreatedPools] = useState<any[]>([]);
  const [myParticipatingPools, setMyParticipatingPools] = useState<any[]>([]);
  const [myAwaitingPixPools, setMyAwaitingPixPools] = useState<any[]>([]);
  const [myAwaitingPaymentPools, setMyAwaitingPaymentPools] = useState<any[]>([]);
  const [myPendingPaymentPools, setMyPendingPaymentPools] = useState<any[]>([]);
  const [myAwaitingApprovalPools, setMyAwaitingApprovalPools] = useState<any[]>([]);
  const [myPendingPredictionPools, setMyPendingPredictionPools] = useState<any[]>([]);
  const [myFailedPools, setMyFailedPools] = useState<{pool: any, reason: string}[]>([]);
  const [myPoolsPendingApprovals, setMyPoolsPendingApprovals] = useState<{pool: any, pendingCount: number}[]>([]);
  const [myPoolsPendingPrizeSend, setMyPoolsPendingPrizeSend] = useState<{pool: any, winnersCount: number}[]>([]);
  const [participantPrizeStatus, setParticipantPrizeStatus] = useState<Record<string, string>>({});
  const [officialPools, setOfficialPools] = useState<any[]>([]);
  const [availablePools, setAvailablePools] = useState<any[]>([]);
  const [communityByOwnerId, setCommunityByOwnerId] = useState<Record<string, { name: string; responsibleName: string }>>({});
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [showFinishedCreated, setShowFinishedCreated] = useState(false);
  const [showFinishedParticipating, setShowFinishedParticipating] = useState(false);
  const [showFailedPools, setShowFailedPools] = useState(false);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "explorar");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (!session) {
          navigate("/entrar");
        }
        if (event === 'SIGNED_IN') {
          window.scrollTo(0, 0);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/entrar");
      } else {
        // Check if phone is verified
        const { data: profile } = await supabase
          .from("profiles")
          .select("phone, phone_verified")
          .eq("id", session.user.id)
          .single();

        // Only redirect to verification if user HAS a phone number but it's not verified yet
        if (profile && profile.phone !== null && profile.phone !== '' && !profile.phone_verified) {
          navigate("/verificacao-whatsapp");
          return;
        }

        NotificationService.requestPermissions();
        NotificationService.setupRealtimeNotifications(session.user.id);
        window.scrollTo(0, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (session?.user) {
      loadPools();
    }
  }, [session]);

  const loadPools = async () => {
    if (!session?.user) return;

    if (!initialLoadDone) setLoading(true);
    const now = new Date();

    const { data: ownedPools } = await supabase
      .from("pools")
      .select("*, participants(count)")
      .eq("owner_id", session.user.id)
      .order("created_at", { ascending: false });

    const { data: participantRecords } = await supabase
      .from("participants")
      .select("pool_id, status, prize_status, payment_proof, rejection_reason, rejection_details")
      .eq("user_id", session.user.id)
      .in("status", ["approved", "pending", "rejected"]);
    
    const approvedRecords = participantRecords?.filter(p => p.status === 'approved') || [];
    const pendingRecords = participantRecords?.filter(p => p.status === 'pending' && !p.payment_proof) || [];
    const awaitingApprovalRecords = participantRecords?.filter(p => p.status === 'pending' && p.payment_proof) || [];
    const rejectedRecords = participantRecords?.filter(p => p.status === 'rejected') || [];
    const participantPoolIds = approvedRecords.map(p => p.pool_id);
    const pendingPoolIds = pendingRecords.map(p => p.pool_id);
    const awaitingApprovalPoolIds = awaitingApprovalRecords.map(p => p.pool_id);

    const prizeStatusMap: Record<string, string> = {};
    participantRecords?.forEach(p => {
      if (p.prize_status) {
        prizeStatusMap[p.pool_id] = p.prize_status;
      }
    });
    setParticipantPrizeStatus(prizeStatusMap);
    
    const awaitingPixParticipants = participantRecords?.filter(p => p.prize_status === 'awaiting_pix') || [];
    const pixSubmittedParticipants = participantRecords?.filter(p => p.prize_status === 'pix_submitted') || [];
    
    const awaitingPixPoolIds = awaitingPixParticipants.map(p => p.pool_id);
    const pixSubmittedPoolIds = pixSubmittedParticipants.map(p => p.pool_id);
    
    let awaitingPixPoolsData: any[] = [];
    if (awaitingPixPoolIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .in("id", awaitingPixPoolIds)
        .order("created_at", { ascending: false });
      awaitingPixPoolsData = data || [];
    }

    let awaitingPaymentPoolsData: any[] = [];
    if (pixSubmittedPoolIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .in("id", pixSubmittedPoolIds)
        .order("created_at", { ascending: false });
      awaitingPaymentPoolsData = data || [];
    }

    // Separate pending payment pools into still active vs expired
    let pendingPaymentPoolsData: any[] = [];
    const failedPools: {pool: any, reason: string}[] = [];
    
    if (pendingPoolIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .in("id", pendingPoolIds)
        .order("created_at", { ascending: false });
      
      (data || []).forEach(pool => {
        if (new Date(pool.deadline) < now || pool.status === 'finished') {
          failedPools.push({ pool, reason: "Pagamento não realizado dentro do prazo" });
        } else {
          pendingPaymentPoolsData.push(pool);
        }
      });
    }

    let awaitingApprovalPoolsData: any[] = [];
    if (awaitingApprovalPoolIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .in("id", awaitingApprovalPoolIds)
        .order("created_at", { ascending: false });
      
      (data || []).forEach(pool => {
        // Only mark as failed if pool is finished or cancelled — 
        // deadline passing alone doesn't mean failure since auto-approve happens at match start
        if (pool.status === 'finished' || pool.status === 'cancelled') {
          failedPools.push({ pool, reason: "Aprovação não concluída dentro do prazo" });
        } else {
          awaitingApprovalPoolsData.push(pool);
        }
      });
    }

    // Rejected pools
    if (rejectedRecords.length > 0) {
      const rejectedPoolIds = rejectedRecords.map(p => p.pool_id);
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .in("id", rejectedPoolIds)
        .order("created_at", { ascending: false });
      
      (data || []).forEach(pool => {
        const record = rejectedRecords.find(r => r.pool_id === pool.id);
        const reason = record?.rejection_reason || record?.rejection_details || "Participação rejeitada pelo organizador";
        failedPools.push({ pool, reason });
      });
    }

    const specialPoolIds = [...awaitingPixPoolIds, ...pixSubmittedPoolIds];
    const regularParticipantPoolIds = participantPoolIds.filter(id => !specialPoolIds.includes(id));
    
    let participatingPoolsData: any[] = [];
    if (regularParticipantPoolIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .in("id", regularParticipantPoolIds)
        .order("created_at", { ascending: false });
      participatingPoolsData = data || [];
    }

    const rejectedPoolIds = rejectedRecords.map(p => p.pool_id);
    const excludeFromOfficialIds = [
      ...ownedPools?.map(p => p.id) || [],
      ...participantPoolIds,
      ...pendingPoolIds,
      ...awaitingApprovalPoolIds,
      ...rejectedPoolIds,
    ];
    
    const nowISO = now.toISOString();

    let officialPoolsData: any[] = [];
    if (excludeFromOfficialIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .eq("is_official", true)
        .eq("is_private", false)
        .eq("status", "active")
        .gt("deadline", nowISO)
        .not("id", "in", `(${excludeFromOfficialIds.map((id) => `"${id}"`).join(',')})`)
        .order("created_at", { ascending: false });
      officialPoolsData = data || [];
    } else {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .eq("is_official", true)
        .eq("is_private", false)
        .eq("status", "active")
        .gt("deadline", nowISO)
        .order("created_at", { ascending: false });
      officialPoolsData = data || [];
    }

    const excludeIds = [
      ...ownedPools?.map(p => p.id) || [],
      ...participantPoolIds,
      ...pendingPoolIds,
      ...awaitingApprovalPoolIds,
      ...rejectedPoolIds,
      ...officialPoolsData?.map(p => p.id) || [],
    ];
    
    let activePools: any[] = [];
    if (excludeIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .eq("status", "active")
        .eq("is_private", false)
        .gt("deadline", nowISO)
        .not("id", "in", `(${excludeIds.map((id) => `"${id}"`).join(',')})`)
        .order("created_at", { ascending: false });
      activePools = data || [];
    } else {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .eq("status", "active")
        .eq("is_private", false)
        .gt("deadline", nowISO)
        .order("created_at", { ascending: false });
      activePools = data || [];
    }


    // Fetch pending approvals for pools the user created
    const poolsPendingApprovals: {pool: any, pendingCount: number}[] = [];
    const poolsPendingPrizeSend: {pool: any, winnersCount: number}[] = [];
    if (ownedPools && ownedPools.length > 0) {
      const ownedPoolIds = ownedPools.map(p => p.id);
      const { data: pendingParticipants } = await supabase
        .from("participants")
        .select("pool_id")
        .in("pool_id", ownedPoolIds)
        .eq("status", "pending")
        .not("payment_proof", "is", null);
      
      if (pendingParticipants && pendingParticipants.length > 0) {
        const countByPool: Record<string, number> = {};
        pendingParticipants.forEach(p => {
          countByPool[p.pool_id] = (countByPool[p.pool_id] || 0) + 1;
        });
        Object.entries(countByPool).forEach(([poolId, count]) => {
          const pool = ownedPools.find(p => p.id === poolId);
          if (pool) poolsPendingApprovals.push({ pool, pendingCount: count });
        });
      }

      // Fetch winners with unpaid prizes in pools the user created
      // Include both awaiting_pix (winner hasn't sent key yet) and pix_submitted (waiting for organizer to pay)
      const { data: prizePendingParticipants } = await supabase
        .from("participants")
        .select("pool_id, prize_status")
        .in("pool_id", ownedPoolIds)
        .in("prize_status", ["pix_submitted", "awaiting_pix"]);
      
      if (prizePendingParticipants && prizePendingParticipants.length > 0) {
        const infoByPool: Record<string, { total: number; awaitingPix: number; readyToPay: number }> = {};
        prizePendingParticipants.forEach(p => {
          if (!infoByPool[p.pool_id]) infoByPool[p.pool_id] = { total: 0, awaitingPix: 0, readyToPay: 0 };
          infoByPool[p.pool_id].total++;
          if (p.prize_status === 'awaiting_pix') infoByPool[p.pool_id].awaitingPix++;
          if (p.prize_status === 'pix_submitted') infoByPool[p.pool_id].readyToPay++;
        });
        Object.entries(infoByPool).forEach(([poolId, info]) => {
          const pool = ownedPools.find(p => p.id === poolId);
          if (pool) poolsPendingPrizeSend.push({ pool, winnersCount: info.total, awaitingPixCount: info.awaitingPix, readyToPayCount: info.readyToPay } as any);
        });
      }
    }

    // Check for estabelecimento pools where user is approved but hasn't made predictions
    let pendingPredictionPoolsData: any[] = [];
    const approvedEstabelecimentoPoolIds = approvedRecords.map(r => r.pool_id);
    if (approvedEstabelecimentoPoolIds.length > 0) {
      // Get pools that are estabelecimento type and still active
      const { data: estPools } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .in("id", approvedEstabelecimentoPoolIds)
        .eq("prize_type", "estabelecimento")
        .eq("status", "active")
        .gt("deadline", now.toISOString());

      if (estPools && estPools.length > 0) {
        // For each, check if user has predictions
        const { data: userParticipants } = await supabase
          .from("participants")
          .select("id, pool_id")
          .eq("user_id", session.user.id)
          .in("pool_id", estPools.map(p => p.id))
          .eq("status", "approved");

        if (userParticipants && userParticipants.length > 0) {
          const participantIds = userParticipants.map(p => p.id);
          const { data: predictions } = await supabase
            .from("football_predictions")
            .select("participant_id")
            .in("participant_id", participantIds);

          const predParticipantIds = new Set(predictions?.map(p => p.participant_id) || []);
          const noPredictionPoolIds = userParticipants
            .filter(p => !predParticipantIds.has(p.id))
            .map(p => p.pool_id);

          pendingPredictionPoolsData = estPools.filter(p => noPredictionPoolIds.includes(p.id));
        }
      }
    }

    // Fetch community info for all pools
    const allPoolOwnerIds = [...new Set([
      ...(ownedPools || []).map(p => p.owner_id),
      ...participatingPoolsData.map(p => p.owner_id),
      ...awaitingPixPoolsData.map(p => p.owner_id),
      ...awaitingPaymentPoolsData.map(p => p.owner_id),
      ...pendingPaymentPoolsData.map(p => p.owner_id),
      ...awaitingApprovalPoolsData.map(p => p.owner_id),
      ...officialPoolsData.map(p => p.owner_id),
      ...activePools.map(p => p.owner_id),
      ...failedPools.map(f => f.pool.owner_id),
      ...pendingPredictionPoolsData.map(p => p.owner_id),
    ])];

    const communityMap: Record<string, { name: string; responsibleName: string }> = {};
    if (allPoolOwnerIds.length > 0) {
      const { data: commsData } = await supabase
        .from("communities")
        .select("responsible_user_id, name, display_responsible_name")
        .in("responsible_user_id", allPoolOwnerIds);
      
      if (commsData && commsData.length > 0) {
        const ownerIdsNeedingNames = commsData
          .filter(c => !c.display_responsible_name)
          .map(c => c.responsible_user_id);
        
        let profileNames: Record<string, string> = {};
        if (ownerIdsNeedingNames.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", ownerIdsNeedingNames);
          (profiles || []).forEach(p => { profileNames[p.id] = p.full_name; });
        }
        
        commsData.forEach(c => {
          communityMap[c.responsible_user_id] = {
            name: c.name,
            responsibleName: c.display_responsible_name || profileNames[c.responsible_user_id] || "Organizador",
          };
        });
      }
    }
    setCommunityByOwnerId(communityMap);

    setMyCreatedPools(ownedPools || []);
    setMyParticipatingPools(participatingPoolsData);
    setMyAwaitingPixPools(awaitingPixPoolsData);
    setMyAwaitingPaymentPools(awaitingPaymentPoolsData);
    setMyPendingPaymentPools(pendingPaymentPoolsData);
    setMyAwaitingApprovalPools(awaitingApprovalPoolsData);
    setMyPendingPredictionPools(pendingPredictionPoolsData);
    setMyPoolsPendingApprovals(poolsPendingApprovals);
    setMyPoolsPendingPrizeSend(poolsPendingPrizeSend);
    setMyFailedPools(failedPools);
    setOfficialPools(officialPoolsData || []);
    setAvailablePools(activePools);
    
    setLoading(false);
    if (!initialLoadDone) {
      window.scrollTo(0, 0);
    }
    setInitialLoadDone(true);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logout realizado",
      description: "Até logo!",
    });
  };

  // Counts for badges
  const pendenciasCount = myPendingPaymentPools.length + myAwaitingPixPools.length + myPoolsPendingApprovals.length + myPoolsPendingPrizeSend.length + myPendingPredictionPools.length;
  const myPoolsActiveCount = myCreatedPools.filter(p => p.status === "active").length;
  const myPoolsFinishedCount = myCreatedPools.filter(p => p.status === "finished").length;
  const participatingActiveCount = myParticipatingPools.filter(p => p.status === "active").length;
  const participatingFinishedCount = myParticipatingPools.filter(p => p.status === "finished").length;
  const exploreCount = officialPools.length + availablePools.length;

  const filterPools = (pools: any[]) => {
    if (!searchQuery.trim()) return pools;
    const q = searchQuery.toLowerCase();
    return pools.filter(p => p.title?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
  };

  const getCommunityProps = (pool: any) => ({
    communityName: communityByOwnerId[pool.owner_id]?.name || null,
    responsibleName: communityByOwnerId[pool.owner_id]?.responsibleName || null,
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <img src={delfosLogo} alt="Delfos" className="h-16 sm:h-20 w-auto animate-pulse" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header with gradient accent */}
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-lg border-b border-border/50 shadow-md">
        <div className="max-w-3xl mx-auto px-3 py-2 flex items-center justify-between">
          <div className="flex items-center">
            <img src={delfosLogo} alt="Delfos" className="h-8 sm:h-10 w-auto" />
          </div>
          <div className="flex items-center gap-1">
            {userRole?.canCreatePools && (
              <Button
                size="sm"
                className="rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg h-9 px-4 text-xs font-semibold hover:shadow-xl transition-all"
                onClick={() => navigate("/criar-bolao")}
              >
                <Plus className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Criar Bolão</span>
                <span className="sm:hidden">Novo</span>
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-primary/10" onClick={() => navigate("/perfil")}>
              <User className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-destructive/10 hover:text-destructive" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="h-[2px] bg-gradient-to-r from-primary via-secondary to-accent" />
      </header>

      {/* Main Content with Tabs */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-3 pt-1 pb-4">

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Tab Navigation */}
          <TabsList className={`w-full grid ${userRole?.canCreatePools ? 'grid-cols-5' : 'grid-cols-4'} mb-2 h-auto bg-muted/60 rounded-xl p-1 gap-0.5`}>
            <TabsTrigger value="explorar" className="rounded-lg text-[10px] sm:text-xs font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm relative flex flex-col items-center gap-0.5 py-1.5 px-0.5">
              <Home className="w-4 h-4" />
              <span>Início</span>
              {exploreCount > 0 && (
                <Badge className="absolute -top-1 -right-0.5 h-4 min-w-4 px-1 text-[10px] bg-accent text-accent-foreground border-0">
                  {exploreCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="comunidades" className="rounded-lg text-[10px] sm:text-xs font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm relative flex flex-col items-center gap-0.5 py-1.5 px-0.5">
              <Users2 className="w-4 h-4" />
              <span className="leading-tight text-[9px] sm:text-xs">Comunidades</span>
            </TabsTrigger>
            <TabsTrigger value="concorrendo" className="rounded-lg text-[10px] sm:text-xs font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm relative flex flex-col items-center gap-0.5 py-1.5 px-0.5">
              <Users className="w-4 h-4" />
              <span className="leading-tight text-[9px] sm:text-xs">Meus Bolões</span>
              {participatingActiveCount > 0 && (
                <Badge className="absolute -top-1 -right-0.5 h-4 min-w-4 px-1 text-[10px] bg-primary text-primary-foreground border-0">
                  {participatingActiveCount}
                </Badge>
              )}
            </TabsTrigger>
            {userRole?.canCreatePools && (
              <TabsTrigger value="meus" className="rounded-lg text-[10px] sm:text-xs font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm relative flex flex-col items-center gap-0.5 py-1.5 px-0.5">
                <Trophy className="w-4 h-4" />
                <span>Criados</span>
                {myPoolsActiveCount > 0 && (
                  <Badge className="absolute -top-1 -right-0.5 h-4 min-w-4 px-1 text-[10px] bg-primary text-primary-foreground border-0">
                    {myPoolsActiveCount}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            <TabsTrigger value="pendencias" className="rounded-lg text-[10px] sm:text-xs font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm relative flex flex-col items-center gap-0.5 py-1.5 px-0.5">
              <AlertTriangle className="w-4 h-4" />
              <span>Pendências</span>
              {pendenciasCount > 0 && (
                <Badge className="absolute -top-1 -right-0.5 h-4 min-w-4 px-1 text-[10px] bg-destructive text-destructive-foreground border-0">
                  {pendenciasCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Search Bar */}
          {activeTab !== "comunidades" && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar bolão..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9 h-10 rounded-xl bg-muted/40 border-muted"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          )}

          {/* ========= TAB: EXPLORAR (INÍCIO) ========= */}
          <TabsContent value="explorar" className="space-y-5 mt-0">
            {officialPools.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  ⭐ Bolões Oficiais
                </h3>
                <div className="space-y-3">
                  {filterPools(officialPools).map((pool) => (
                    <PoolCard key={pool.id} pool={pool} onClick={() => navigate(`/bolao/${pool.slug}`)} {...getCommunityProps(pool)} />
                  ))}
                </div>
              </section>
            )}

            {availablePools.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  🌐 Bolões Públicos
                </h3>
                <div className="space-y-3">
                  {filterPools(availablePools).map((pool) => (
                    <PoolCard key={pool.id} pool={pool} onClick={() => navigate(`/bolao/${pool.slug}`)} {...getCommunityProps(pool)} />
                  ))}
                </div>
              </section>
            )}

            {officialPools.length === 0 && availablePools.length === 0 && (
              <div className="text-center py-12 space-y-3">
                <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
                  <Search className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-muted-foreground">Nenhum bolão disponível</h3>
                <p className="text-sm text-muted-foreground">Novos bolões aparecerão aqui quando forem criados</p>
              </div>
            )}
          </TabsContent>

          {/* ========= TAB: PENDÊNCIAS ========= */}
          <TabsContent value="pendencias" className="space-y-5 mt-0">
            {pendenciasCount > 0 ? (
              <div className="space-y-3">
                {myPendingPaymentPools.length > 0 && (
                  <AlertSection
                    icon="💳"
                    title="Pagamento Pendente"
                    subtitle="Envie o comprovante para confirmar sua participação"
                    bgClass="bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800"
                  >
                    {filterPools(myPendingPaymentPools).map((pool) => (
                      <PoolCard key={pool.id} pool={pool} isUserParticipating hasPendingPayment onClick={() => navigate(`/bolao/${pool.slug}`)} {...getCommunityProps(pool)} />
                    ))}
                  </AlertSection>
                )}


                {myAwaitingPixPools.length > 0 && (
                  <AlertSection
                    icon="🏆"
                    title="Você Ganhou! Envie sua Chave PIX"
                    subtitle="Informe sua chave PIX para receber o prêmio"
                    bgClass="bg-yellow-50 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-800"
                  >
                    {filterPools(myAwaitingPixPools).map((pool) => (
                      <PoolCard key={pool.id} pool={pool} isUserParticipating hasWonPrize onClick={() => navigate(`/bolao/${pool.slug}`)} {...getCommunityProps(pool)} />
                    ))}
                  </AlertSection>
                )}

                {myPoolsPendingApprovals.length > 0 && (
                  <AlertSection
                    icon="📋"
                    title="Solicitações Pendentes nos seus Bolões"
                    subtitle="Participantes aguardando sua aprovação"
                    bgClass="bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-800"
                  >
                    {myPoolsPendingApprovals.map(({ pool, pendingCount }) => (
                      <button
                        key={pool.id}
                        onClick={() => navigate(`/bolao/${pool.slug}`)}
                        className="w-full text-left p-3 rounded-lg bg-card border hover:border-primary/50 hover:shadow-sm transition-all"
                      >
                        <p className="font-medium text-sm">{pool.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Você tem <span className="font-bold text-foreground">{pendingCount}</span> solicitação(ões) pendente(s) de aprovação
                        </p>
                      </button>
                    ))}
                  </AlertSection>
                )}

                {myPoolsPendingPrizeSend.length > 0 && (
                  <AlertSection
                    icon="🏆"
                    title="Prêmios Pendentes de Envio"
                    subtitle="Ganhadores aguardando o envio do prêmio"
                    bgClass="bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800"
                  >
                    {myPoolsPendingPrizeSend.map(({ pool, winnersCount, ...rest }) => {
                      const info = rest as any;
                      return (
                        <button
                          key={pool.id}
                          onClick={() => navigate(`/bolao/${pool.slug}`)}
                          className="w-full text-left p-3 rounded-lg bg-card border hover:border-primary/50 hover:shadow-sm transition-all"
                        >
                          <p className="font-medium text-sm">{pool.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <span className="font-bold text-foreground">{winnersCount}</span> prêmio(s) pendente(s)
                            {info.readyToPayCount > 0 && (
                              <span className="text-primary"> • {info.readyToPayCount} pronto(s) p/ pagar</span>
                            )}
                            {info.awaitingPixCount > 0 && (
                              <span className="text-yellow-600 dark:text-yellow-400"> • {info.awaitingPixCount} aguardando chave PIX</span>
                            )}
                          </p>
                        </button>
                      );
                    })}
                  </AlertSection>
                )}

                {myPendingPredictionPools.length > 0 && (
                  <AlertSection
                    icon="⚽"
                    title="Palpites Pendentes"
                    subtitle="Você foi convidado mas ainda não fez seus palpites"
                    bgClass="bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800"
                  >
                    {filterPools(myPendingPredictionPools).map((pool) => (
                      <PoolCard key={pool.id} pool={pool} isUserParticipating onClick={() => navigate(`/bolao/${pool.slug}`)} {...getCommunityProps(pool)} />
                    ))}
                  </AlertSection>
                )}
              </div>
            ) : (
              <div className="text-center py-12 space-y-3">
                <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-muted-foreground">Nenhuma pendência</h3>
                <p className="text-sm text-muted-foreground">Você está em dia! 🎉</p>
              </div>
            )}
          </TabsContent>

          {/* ========= TAB: COMUNIDADES ========= */}
          <TabsContent value="comunidades" className="mt-0">
            <CommunitiesTab userId={session?.user?.id} />
          </TabsContent>

          {/* ========= TAB: MEUS BOLÕES ========= */}
          <TabsContent value="concorrendo" className="space-y-5 mt-0">
            {myParticipatingPools.length > 0 || myAwaitingApprovalPools.length > 0 || myAwaitingPaymentPools.length > 0 || myFailedPools.length > 0 ? (
              <section className="space-y-3">
                {/* Awaiting payment (PIX submitted, waiting for organizer to send prize) */}
                {myAwaitingPaymentPools.length > 0 && (
                  <div className="space-y-3 p-3 rounded-xl border bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">⏳</span>
                      <div>
                        <h4 className="text-sm font-bold">Aguardando Pagamento do Prêmio</h4>
                        <p className="text-xs text-muted-foreground">Sua chave PIX foi enviada. Aguarde o prêmio.</p>
                      </div>
                    </div>
                    {filterPools(myAwaitingPaymentPools).map((pool) => (
                      <PoolCard key={pool.id} pool={pool} isUserParticipating onClick={() => navigate(`/bolao/${pool.slug}`)} {...getCommunityProps(pool)} />
                    ))}
                  </div>
                )}

                {/* Awaiting approval */}
                {myAwaitingApprovalPools.length > 0 && (
                  <div className="space-y-3">
                    {filterPools(myAwaitingApprovalPools).map((pool) => (
                      <PoolCard key={pool.id} pool={pool} isUserParticipating hasAwaitingApproval onClick={() => navigate(`/bolao/${pool.slug}`)} {...getCommunityProps(pool)} />
                    ))}
                  </div>
                )}
                {/* Active */}
                <div className="space-y-3">
                  {filterPools(myParticipatingPools.filter(p => p.status === "active")).map((pool) => (
                    <PoolCard key={pool.id} pool={pool} isUserParticipating onClick={() => navigate(`/bolao/${pool.slug}`)} {...getCommunityProps(pool)} />
                  ))}
                </div>

                {/* Finished - collapsible */}
                {participatingFinishedCount > 0 && (
                  <div className="space-y-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between h-9 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowFinishedParticipating(!showFinishedParticipating)}
                    >
                      <span className="text-xs font-medium">
                        ✅ Finalizados ({participatingFinishedCount})
                      </span>
                      {showFinishedParticipating ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    {showFinishedParticipating && (
                      <div className="space-y-3">
                        {filterPools(myParticipatingPools.filter(p => p.status === "finished")).map((pool) => (
                          <PoolCard key={pool.id} pool={pool} isUserParticipating prizeReceived={participantPrizeStatus[pool.id] === 'prize_sent'} onClick={() => navigate(`/bolao/${pool.slug}`)} {...getCommunityProps(pool)} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Failed to participate - collapsible */}
                {myFailedPools.length > 0 && (
                  <div className="space-y-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between h-9 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowFailedPools(!showFailedPools)}
                    >
                      <span className="text-xs font-medium">
                        ❌ Não participou ({myFailedPools.length})
                      </span>
                      {showFailedPools ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    {showFailedPools && (
                      <div className="space-y-3">
                        {myFailedPools.map(({ pool, reason }) => (
                          <div key={pool.id} className="space-y-1">
                            <PoolCard pool={pool} onClick={() => navigate(`/bolao/${pool.slug}`)} {...getCommunityProps(pool)} />
                            <p className="text-xs text-destructive font-medium pl-2">
                              Motivo: {reason}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            ) : (
              <div className="text-center py-12 space-y-3">
                <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
                  <Users className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-muted-foreground">Nenhum bolão</h3>
                <p className="text-sm text-muted-foreground">Você ainda não está participando de nenhum bolão</p>
              </div>
            )}
          </TabsContent>

          {/* ========= TAB: CRIADOS ========= */}
          <TabsContent value="meus" className="space-y-5 mt-0">
            {myCreatedPools.length > 0 ? (
              <section className="space-y-3">
                {/* Active */}
                <div className="space-y-3">
                  {filterPools(myCreatedPools.filter(p => p.status === "active")).map((pool) => (
                    <PoolCard key={pool.id} pool={pool} onClick={() => navigate(`/bolao/${pool.slug}`)} {...getCommunityProps(pool)} />
                  ))}
                </div>

                {/* Finished - collapsible */}
                {myPoolsFinishedCount > 0 && (
                  <div className="space-y-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between h-9 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowFinishedCreated(!showFinishedCreated)}
                    >
                      <span className="text-xs font-medium">
                        Finalizados ({myPoolsFinishedCount})
                      </span>
                      {showFinishedCreated ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    {showFinishedCreated && (
                      <div className="space-y-3">
                        {filterPools(myCreatedPools.filter(p => p.status === "finished")).map((pool) => (
                          <PoolCard key={pool.id} pool={pool} onClick={() => navigate(`/bolao/${pool.slug}`)} {...getCommunityProps(pool)} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            ) : (
              <div className="text-center py-12 space-y-3">
                <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
                  <Trophy className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-muted-foreground">Nenhum bolão criado</h3>
                <p className="text-sm text-muted-foreground">Crie seu próprio bolão!</p>
                {userRole?.canCreatePools && (
                  <Button className="mt-2 rounded-xl" onClick={() => navigate("/create-football")}>
                    <Plus className="w-4 h-4 mr-2" /> Criar Bolão
                  </Button>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

    </div>
  );
};

// Reusable alert section component
const AlertSection = ({
  icon,
  title,
  subtitle,
  bgClass,
  children,
}: {
  icon: string;
  title: string;
  subtitle: string;
  bgClass: string;
  children: React.ReactNode;
}) => (
  <div className={`p-3 rounded-xl border ${bgClass}`}>
    <div className="flex items-center gap-2 mb-2">
      <span className="text-lg">{icon}</span>
      <div>
        <h4 className="text-sm font-bold">{title}</h4>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
    <div className="space-y-3">
      {children}
    </div>
  </div>
);

export default Index;
