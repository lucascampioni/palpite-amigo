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

const Index = () => {
  const navigate = useNavigate();
  const { data: userRole } = useUserRole();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [myCreatedPools, setMyCreatedPools] = useState<any[]>([]);
  const [myParticipatingPools, setMyParticipatingPools] = useState<any[]>([]);
  const [myAwaitingProofPools, setMyAwaitingProofPools] = useState<any[]>([]); // Now holds winners awaiting PIX
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
    
    // Filter by prize_status to find pools where user won and needs to submit PIX
    const awaitingPixParticipants = participantRecords?.filter(p => p.prize_status === 'awaiting_pix') || [];
    const awaitingPixPoolIds = awaitingPixParticipants.map(p => p.pool_id);
    
    let awaitingPixPoolsData: any[] = [];
    if (awaitingPixPoolIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .in("id", awaitingPixPoolIds)
        .order("created_at", { ascending: false });
      awaitingPixPoolsData = data || [];
    }

    // Regular participating pools (approved and not awaiting pix)
    const regularParticipantPoolIds = participantPoolIds.filter(id => !awaitingPixPoolIds.includes(id));
    
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
      ...awaitingPixPoolIds,
    ];
    
    let officialPoolsData: any[] = [];
    if (excludeFromOfficialIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .eq("is_official", true)
        .eq("is_private", false)
        .eq("status", "active")
        .not("id", "in", `(${excludeFromOfficialIds.join(',')})`)
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
      ...awaitingPixPoolIds,
    ];
    
    let activePools: any[] = [];
    if (excludeIds.length > 0) {
      const { data } = await supabase
        .from("pools")
        .select("*, participants(count)")
        .eq("status", "active")
        .eq("is_private", false)
        .not("id", "in", `(${excludeIds.join(',')})`)
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
    setMyAwaitingProofPools(awaitingPixPoolsData); // Now holds prize winners awaiting PIX
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
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-glow">
              <span className="text-2xl">⚽</span>
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              Palpite Amigo
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/profile")}>
              <User className="w-4 h-4 mr-2" />
              Perfil
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <PoolStats
          myPoolsCount={myCreatedPools.length + myParticipatingPools.length}
          activePoolsCount={myCreatedPools.filter(p => p.status === "active").length + myParticipatingPools.filter(p => p.status === "active").length}
          finishedPoolsCount={myCreatedPools.filter(p => p.status === "finished").length + myParticipatingPools.filter(p => p.status === "finished").length}
          pendingApprovalsCount={0}
        />

        {/* Create Pool CTA - Only for Admins */}
        {userRole?.isAdmin ? (
          <div className="text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold">
              ⚽ Bem-vindo ao Palpite Amigo! 🏆
            </h2>
            <p className="text-muted-foreground text-lg">
              Crie bolões de futebol e divirta-se com seus amigos
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                className="shadow-lg hover:shadow-xl transition-all"
                onClick={() => navigate("/create-football")}
              >
                <Plus className="w-5 h-5 mr-2" />
                ⚽ Criar Bolão de Futebol
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold">
              ⚽ Bem-vindo ao Palpite Amigo! 🏆
            </h2>
            <p className="text-muted-foreground text-lg">
              Participe dos bolões oficiais e divirta-se com seus amigos
            </p>
          </div>
        )}

        {/* Official Pools Section */}
        {officialPools.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
                <span className="text-lg">⚽</span>
              </div>
              <h3 className="text-2xl font-bold">⭐ Bolões Oficiais</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

        {/* Awaiting Proof Section */}
        {myAwaitingProofPools.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
                <span className="text-lg">📎</span>
              </div>
              <h3 className="text-2xl font-bold">⏳ Pendente de Envio</h3>
            </div>
            <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800">
              <p className="text-sm font-medium text-orange-700 dark:text-orange-300 mb-2">
                ⚠️ Seus palpites ainda não foram enviados!
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Clique no bolão abaixo para enviar o comprovante de pagamento e sua chave PIX (ou apenas a chave PIX para bolões gratuitos).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myAwaitingProofPools.map((pool) => (
                  <div key={pool.id} className="relative">
                    <PoolCard
                      pool={pool}
                      onClick={() => navigate(`/pool/${pool.id}`)}
                    />
                    <div className="absolute top-2 right-2 bg-orange-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
                      Pendente
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Awaiting Prize PIX Section */}
        {myAwaitingProofPools.length > 0 && (
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
                {myAwaitingProofPools.map((pool) => (
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
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏆</span>
              <h3 className="text-2xl font-bold">Bolões que participo</h3>
            </div>
            
            {/* Active Pools */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
        {myCreatedPools.length === 0 && myParticipatingPools.length === 0 && availablePools.length === 0 && officialPools.length === 0 && (
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
