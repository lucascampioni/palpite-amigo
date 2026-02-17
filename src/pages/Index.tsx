import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trophy, LogOut, User, ChevronDown, ChevronUp, Users, Home, Search, Settings, X, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import PoolCard from "@/components/PoolCard";
import { Session } from "@supabase/supabase-js";
import { NotificationService } from "@/services/NotificationService";
import { useUserRole } from "@/hooks/useUserRole";
import palpiteAmigoLogo from "@/assets/logo-icon.png";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

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
  const [participantPrizeStatus, setParticipantPrizeStatus] = useState<Record<string, string>>({});
  const [officialPools, setOfficialPools] = useState<any[]>([]);
  const [availablePools, setAvailablePools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFinishedCreated, setShowFinishedCreated] = useState(false);
  const [showFinishedParticipating, setShowFinishedParticipating] = useState(false);
  const [activeTab, setActiveTab] = useState("explorar");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (!session) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      } else {
        NotificationService.requestPermissions();
        NotificationService.setupRealtimeNotifications(session.user.id);
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

    setLoading(true);

    const { data: ownedPools } = await supabase
      .from("pools")
      .select("*, participants(count)")
      .eq("owner_id", session.user.id)
      .order("created_at", { ascending: false });

    const { data: participantRecords } = await supabase
      .from("participants")
      .select("pool_id, status, prize_status, payment_proof")
      .eq("user_id", session.user.id)
      .in("status", ["approved", "pending"]);
    
    const approvedRecords = participantRecords?.filter(p => p.status === 'approved') || [];
    const pendingRecords = participantRecords?.filter(p => p.status === 'pending' && !p.payment_proof) || [];
    const awaitingApprovalRecords = participantRecords?.filter(p => p.status === 'pending' && p.payment_proof) || [];
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

    let pendingPaymentPoolsData: any[] = [];
    if (pendingPoolIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .in("id", pendingPoolIds)
        .order("created_at", { ascending: false });
      pendingPaymentPoolsData = data || [];
    }

    let awaitingApprovalPoolsData: any[] = [];
    if (awaitingApprovalPoolIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .in("id", awaitingApprovalPoolIds)
        .order("created_at", { ascending: false });
      awaitingApprovalPoolsData = data || [];
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

    const excludeFromOfficialIds = [
      ...ownedPools?.map(p => p.id) || [],
      ...participantPoolIds,
      ...pendingPoolIds,
    ];
    
    let officialPoolsData: any[] = [];
    if (excludeFromOfficialIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .eq("is_official", true)
        .eq("is_private", false)
        .eq("status", "active")
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
        .order("created_at", { ascending: false });
      officialPoolsData = data || [];
    }
    
    const now = new Date();
    officialPoolsData = officialPoolsData.filter(pool => new Date(pool.deadline) > now);

    const excludeIds = [
      ...ownedPools?.map(p => p.id) || [],
      ...participantPoolIds,
      ...pendingPoolIds,
      ...officialPoolsData?.map(p => p.id) || [],
    ];
    
    let activePools: any[] = [];
    if (excludeIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .eq("status", "active")
        .eq("is_private", false)
        .not("id", "in", `(${excludeIds.map((id) => `"${id}"`).join(',')})`)
        .order("created_at", { ascending: false });
      activePools = data || [];
    } else {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .eq("status", "active")
        .eq("is_private", false)
        .order("created_at", { ascending: false});
      activePools = data || [];
    }
    
    activePools = activePools.filter(pool => new Date(pool.deadline) > now);


    setMyCreatedPools(ownedPools || []);
    setMyParticipatingPools(participatingPoolsData);
    setMyAwaitingPixPools(awaitingPixPoolsData);
    setMyAwaitingPaymentPools(awaitingPaymentPoolsData);
    setMyPendingPaymentPools(pendingPaymentPoolsData);
    setMyAwaitingApprovalPools(awaitingApprovalPoolsData);
    setOfficialPools(officialPoolsData || []);
    setAvailablePools(activePools);
    
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logout realizado",
      description: "Até logo!",
    });
  };

  // Counts for badges
  const pendenciasCount = myPendingPaymentPools.length + myAwaitingApprovalPools.length + myAwaitingPixPools.length + myAwaitingPaymentPools.length;
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <img src={palpiteAmigoLogo} alt="Palpite Amigo" className="h-20 w-auto animate-pulse" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Compact Header */}
      <header className="border-b bg-card/90 backdrop-blur-md sticky top-0 z-20 shadow-sm">
        <div className="max-w-3xl mx-auto px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={palpiteAmigoLogo} alt="Palpite Amigo" className="h-10 w-auto" />
            <span className="font-bold text-lg text-foreground hidden sm:inline">Palpite Amigo</span>
          </div>
          <div className="flex items-center gap-1">
            {userRole?.canCreatePools && (
              <Button
                size="sm"
                className="rounded-full bg-primary text-primary-foreground shadow-md h-9 px-3 text-xs font-semibold"
                onClick={() => navigate("/create-football")}
              >
                <Plus className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Criar Bolão</span>
                <span className="sm:hidden">Novo</span>
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => navigate("/profile")}>
              <User className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:text-destructive" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content with Tabs */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-3 pt-3 pb-4">
        {/* Search Bar */}
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Tab Navigation */}
          <TabsList className="w-full grid grid-cols-4 mb-4 h-11 bg-muted/60 rounded-xl p-1">
            <TabsTrigger value="explorar" className="rounded-lg text-xs sm:text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm relative">
              <Home className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Início</span>
              {exploreCount > 0 && (
                <Badge className="absolute -top-1.5 -right-1 h-4 min-w-4 px-1 text-[10px] bg-accent text-accent-foreground border-0">
                  {exploreCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pendencias" className="rounded-lg text-xs sm:text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm relative">
              <AlertTriangle className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Pendências</span>
              {pendenciasCount > 0 && (
                <Badge className="absolute -top-1.5 -right-1 h-4 min-w-4 px-1 text-[10px] bg-destructive text-destructive-foreground border-0">
                  {pendenciasCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="concorrendo" className="rounded-lg text-xs sm:text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm relative">
              <Users className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Concorrendo</span>
              {participatingActiveCount > 0 && (
                <Badge className="absolute -top-1.5 -right-1 h-4 min-w-4 px-1 text-[10px] bg-primary text-primary-foreground border-0">
                  {participatingActiveCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="meus" className="rounded-lg text-xs sm:text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm relative">
              <Trophy className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Criados</span>
              {myPoolsActiveCount > 0 && (
                <Badge className="absolute -top-1.5 -right-1 h-4 min-w-4 px-1 text-[10px] bg-primary text-primary-foreground border-0">
                  {myPoolsActiveCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ========= TAB: EXPLORAR (INÍCIO) ========= */}
          <TabsContent value="explorar" className="space-y-5 mt-0">
            {officialPools.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  ⭐ Bolões Oficiais
                </h3>
                <div className="space-y-3">
                  {filterPools(officialPools).map((pool) => (
                    <PoolCard key={pool.id} pool={pool} onClick={() => navigate(`/pool/${pool.id}`)} />
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
                    <PoolCard key={pool.id} pool={pool} onClick={() => navigate(`/pool/${pool.id}`)} />
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
                      <PoolCard key={pool.id} pool={pool} isUserParticipating hasPendingPayment onClick={() => navigate(`/pool/${pool.id}`)} />
                    ))}
                  </AlertSection>
                )}

                {myAwaitingApprovalPools.length > 0 && (
                  <AlertSection
                    icon="⏳"
                    title="Pendente Aprovação"
                    subtitle="Comprovante enviado. Aguarde o organizador."
                    bgClass="bg-yellow-50 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-800"
                  >
                    {filterPools(myAwaitingApprovalPools).map((pool) => (
                      <PoolCard key={pool.id} pool={pool} isUserParticipating hasAwaitingApproval onClick={() => navigate(`/pool/${pool.id}`)} />
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
                      <PoolCard key={pool.id} pool={pool} isUserParticipating hasWonPrize onClick={() => navigate(`/pool/${pool.id}`)} />
                    ))}
                  </AlertSection>
                )}

                {myAwaitingPaymentPools.length > 0 && (
                  <AlertSection
                    icon="⏳"
                    title="Aguardando Pagamento"
                    subtitle="Sua chave PIX foi enviada. Aguarde o prêmio."
                    bgClass="bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800"
                  >
                    {filterPools(myAwaitingPaymentPools).map((pool) => (
                      <PoolCard key={pool.id} pool={pool} isUserParticipating onClick={() => navigate(`/pool/${pool.id}`)} />
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

          {/* ========= TAB: CONCORRENDO ========= */}
          <TabsContent value="concorrendo" className="space-y-5 mt-0">
            {myParticipatingPools.length > 0 ? (
              <section className="space-y-3">
                {/* Active */}
                <div className="space-y-3">
                  {filterPools(myParticipatingPools.filter(p => p.status === "active")).map((pool) => (
                    <PoolCard key={pool.id} pool={pool} isUserParticipating onClick={() => navigate(`/pool/${pool.id}`)} />
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
                        Finalizados ({participatingFinishedCount})
                      </span>
                      {showFinishedParticipating ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    {showFinishedParticipating && (
                      <div className="space-y-3">
                        {filterPools(myParticipatingPools.filter(p => p.status === "finished")).map((pool) => (
                          <PoolCard key={pool.id} pool={pool} isUserParticipating prizeReceived={participantPrizeStatus[pool.id] === 'prize_sent'} onClick={() => navigate(`/pool/${pool.id}`)} />
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
                    <PoolCard key={pool.id} pool={pool} onClick={() => navigate(`/pool/${pool.id}`)} />
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
                          <PoolCard key={pool.id} pool={pool} onClick={() => navigate(`/pool/${pool.id}`)} />
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
