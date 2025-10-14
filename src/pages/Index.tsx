import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trophy, LogOut, User, ChevronDown, ChevronUp, Users } from "lucide-react";
import PoolCard from "@/components/PoolCard";
import PoolStats from "@/components/PoolStats";
import { Session } from "@supabase/supabase-js";
import { NotificationService } from "@/services/NotificationService";
import { useUserRole } from "@/hooks/useUserRole";
import chutaiLogo from "@/assets/chutai-logo.png";

const Index = () => {
  const navigate = useNavigate();
  const { data: userRole } = useUserRole();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [myCreatedPools, setMyCreatedPools] = useState<any[]>([]);
  const [myParticipatingPools, setMyParticipatingPools] = useState<any[]>([]);
  const [myAwaitingPixPools, setMyAwaitingPixPools] = useState<any[]>([]); // Pools where user won and needs to submit PIX
  const [myAwaitingPaymentPools, setMyAwaitingPaymentPools] = useState<any[]>([]); // Pools where user submitted PIX and awaits payment
  const [participantPrizeStatus, setParticipantPrizeStatus] = useState<Record<string, string>>({}); // Map pool_id -> prize_status
  const [officialPools, setOfficialPools] = useState<any[]>([]);
  const [availablePools, setAvailablePools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFinishedCreated, setShowFinishedCreated] = useState(false);
  const [showFinishedParticipating, setShowFinishedParticipating] = useState(false);

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
        // Setup notifications
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

    // Load pools owned by user
    const { data: ownedPools } = await supabase
      .from("pools")
      .select("*, participants(count)")
      .eq("owner_id", session.user.id)
      .order("created_at", { ascending: false });

    // Load pools where user is a participant (approved)
    const { data: participantRecords } = await supabase
      .from("participants")
      .select("pool_id, status, prize_status")
      .eq("user_id", session.user.id)
      .eq("status", "approved");
    
    const participantPoolIds = participantRecords?.map(p => p.pool_id) || [];
    
    // Create a map of pool_id -> prize_status for easy lookup
    const prizeStatusMap: Record<string, string> = {};
    participantRecords?.forEach(p => {
      if (p.prize_status) {
        prizeStatusMap[p.pool_id] = p.prize_status;
      }
    });
    setParticipantPrizeStatus(prizeStatusMap);
    
    // Separate pools by prize status
    const awaitingPixParticipants = participantRecords?.filter(p => p.prize_status === 'awaiting_pix') || [];
    const pixSubmittedParticipants = participantRecords?.filter(p => p.prize_status === 'pix_submitted') || [];
    
    const awaitingPixPoolIds = awaitingPixParticipants.map(p => p.pool_id);
    const pixSubmittedPoolIds = pixSubmittedParticipants.map(p => p.pool_id);
    
    // Load pools where user needs to submit PIX
    let awaitingPixPoolsData: any[] = [];
    if (awaitingPixPoolIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .in("id", awaitingPixPoolIds)
        .order("created_at", { ascending: false });
      awaitingPixPoolsData = data || [];
    }

    // Load pools where user submitted PIX and awaits payment
    let awaitingPaymentPoolsData: any[] = [];
    if (pixSubmittedPoolIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .in("id", pixSubmittedPoolIds)
        .order("created_at", { ascending: false });
      awaitingPaymentPoolsData = data || [];
    }

    // Regular participating pools (approved and no prize status OR prize already sent)
    // Include all pools that are not in special awaiting states
    const specialPoolIds = [...awaitingPixPoolIds, ...pixSubmittedPoolIds];
    const regularParticipantPoolIds = participantPoolIds.filter(id => !specialPoolIds.includes(id));
    
    let participatingPoolsData: any[] = [];
    if (regularParticipantPoolIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .in("id", regularParticipantPoolIds)
        .neq("owner_id", session.user.id)
        .order("created_at", { ascending: false });
      participatingPoolsData = data || [];
    }


    // Load official pools (marked as official by app admin)
    // Exclude pools where user is owner or participant
    const excludeFromOfficialIds = [
      ...ownedPools?.map(p => p.id) || [],
      ...participantPoolIds,
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
    
    // Filter out pools with expired deadline where user hasn't participated
    const now = new Date();
    officialPoolsData = officialPoolsData.filter(pool => new Date(pool.deadline) > now);

    // Load other public pools (excluding owned, participating, and official)
    const excludeIds = [
      ...ownedPools?.map(p => p.id) || [],
      ...participantPoolIds,
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
    
    // Filter out pools with expired deadline where user hasn't participated
    activePools = activePools.filter(pool => new Date(pool.deadline) > now);

    setMyCreatedPools(ownedPools || []);
    setMyParticipatingPools(participatingPoolsData);
    setMyAwaitingPixPools(awaitingPixPoolsData);
    setMyAwaitingPaymentPools(awaitingPaymentPoolsData);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted to-background">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={chutaiLogo} alt="Chutaí" className="h-24 w-auto" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/profile")} className="hover:bg-primary/10">
              <User className="w-4 h-4 mr-2" />
              Perfil
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="hover:bg-destructive/10 hover:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">

        {/* Hero Section */}
        {userRole?.isAdmin ? (
          <div className="text-center space-y-4 py-4">
            <div className="inline-block mb-2">
              <img src={chutaiLogo} alt="Chutaí" className="h-52 w-auto mx-auto" />
            </div>
            <p className="text-muted-foreground text-xl max-w-2xl mx-auto">
              Gerencie bolões de futebol e divirta-se com seus amigos
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button
                size="lg"
                className="shadow-xl hover:shadow-2xl transition-all text-lg px-8 py-6 rounded-xl bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-accent"
                onClick={() => navigate("/create-football")}
              >
                <Plus className="w-6 h-6 mr-2" />
                Criar Bolão de Futebol
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-4 py-4">
            <div className="inline-block mb-2">
              <img src={chutaiLogo} alt="Chutaí" className="h-52 w-auto mx-auto" />
            </div>
            <p className="text-muted-foreground text-xl max-w-2xl mx-auto">
              Mostre que você entende de futebol — entre no jogo e Chutaí!
            </p>
          </div>
        )}

        {/* Official Pools Section */}
        {officialPools.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center shadow-lg">
                <Trophy className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-3xl font-bold">Bolões Oficiais disponíveis</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {officialPools.map((pool) => (
                <PoolCard
                  key={pool.id}
                  pool={pool}
                  onClick={() => navigate(`/pool/${pool.id}`)}
                />
              ))}
            </div>
          </section>
        )}


        {/* Awaiting PIX Submission Section */}
        {myAwaitingPixPools.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-yellow-500 flex items-center justify-center">
                <span className="text-lg">🏆</span>
              </div>
              <h3 className="text-2xl font-bold">🎉 Você Ganhou! Envie sua Chave PIX</h3>
            </div>
            <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
              <p className="text-sm text-muted-foreground mb-4">
                Parabéns! Informe sua chave PIX para receber o prêmio.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myAwaitingPixPools.map((pool) => (
                  <PoolCard
                    key={pool.id}
                    pool={pool}
                    isUserParticipating={true}
                    hasWonPrize={true}
                    onClick={() => navigate(`/pool/${pool.id}`)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Awaiting Payment Section */}
        {myAwaitingPaymentPools.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                <span className="text-lg">⏳</span>
              </div>
              <h3 className="text-2xl font-bold">Aguardando Pagamento</h3>
            </div>
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-muted-foreground mb-4">
                Sua chave PIX foi enviada. Aguarde o pagamento do prêmio.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myAwaitingPaymentPools.map((pool) => (
                  <PoolCard
                    key={pool.id}
                    pool={pool}
                    isUserParticipating={true}
                    onClick={() => navigate(`/pool/${pool.id}`)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Pools I Created Section */}
        {myCreatedPools.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚽</span>
              <h3 className="text-2xl font-bold">Bolões que criei</h3>
            </div>
            
            {/* Active Pools */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myCreatedPools.filter(p => p.status === "active").map((pool) => (
                <PoolCard
                  key={pool.id}
                  pool={pool}
                  onClick={() => navigate(`/pool/${pool.id}`)}
                />
              ))}
            </div>

            {/* Finished Pools Collapsible */}
            {myCreatedPools.filter(p => p.status === "finished").length > 0 && (
              <div className="space-y-3 pt-4">
                <Button
                  variant="ghost"
                  className="w-full justify-between"
                  onClick={() => setShowFinishedCreated(!showFinishedCreated)}
                >
                  <span className="text-sm font-medium text-muted-foreground">
                    Bolões Finalizados ({myCreatedPools.filter(p => p.status === "finished").length})
                  </span>
                  {showFinishedCreated ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
                
                {showFinishedCreated && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myCreatedPools.filter(p => p.status === "finished").map((pool) => (
                      <PoolCard
                        key={pool.id}
                        pool={pool}
                        onClick={() => navigate(`/pool/${pool.id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Pools I'm Participating Section */}
        {myParticipatingPools.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent to-primary-glow flex items-center justify-center shadow-lg">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-3xl font-bold">Bolões que participo</h3>
                <p className="text-muted-foreground">Seus palpites estão salvos</p>
              </div>
            </div>
            
            {/* Active Pools */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myParticipatingPools.filter(p => p.status === "active").map((pool) => (
                <PoolCard
                  key={pool.id}
                  pool={pool}
                  onClick={() => navigate(`/pool/${pool.id}`)}
                  isUserParticipating={true}
                />
              ))}
            </div>

            {/* Finished Pools Collapsible */}
            {myParticipatingPools.filter(p => p.status === "finished").length > 0 && (
              <div className="space-y-3 pt-4">
                <Button
                  variant="ghost"
                  className="w-full justify-between"
                  onClick={() => setShowFinishedParticipating(!showFinishedParticipating)}
                >
                  <span className="text-sm font-medium text-muted-foreground">
                    Bolões Finalizados ({myParticipatingPools.filter(p => p.status === "finished").length})
                  </span>
                  {showFinishedParticipating ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
                
                {showFinishedParticipating && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myParticipatingPools.filter(p => p.status === "finished").map((pool) => (
                      <PoolCard
                        key={pool.id}
                        pool={pool}
                        onClick={() => navigate(`/pool/${pool.id}`)}
                        isUserParticipating={true}
                        prizeReceived={participantPrizeStatus[pool.id] === 'prize_sent'}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Available Pools Section */}
        {availablePools.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌐</span>
              <h3 className="text-2xl font-bold">Bolões públicos</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availablePools.map((pool) => (
                <PoolCard
                  key={pool.id}
                  pool={pool}
                  onClick={() => navigate(`/pool/${pool.id}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {myCreatedPools.length === 0 && myParticipatingPools.length === 0 && myAwaitingPixPools.length === 0 && myAwaitingPaymentPools.length === 0 && availablePools.length === 0 && officialPools.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <div className="w-24 h-24 mx-auto rounded-full bg-muted flex items-center justify-center">
              <span className="text-5xl">⚽</span>
            </div>
            <h3 className="text-xl font-semibold text-muted-foreground">
              Nenhum bolão encontrado
            </h3>
            <p className="text-muted-foreground">
              Seja o primeiro a criar um bolão de futebol!
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
