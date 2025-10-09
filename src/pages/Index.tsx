import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trophy, LogOut } from "lucide-react";
import PoolCard from "@/components/PoolCard";
import PoolStats from "@/components/PoolStats";
import { Session } from "@supabase/supabase-js";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [myPools, setMyPools] = useState<any[]>([]);
  const [availablePools, setAvailablePools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

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

    // Load active pools that user can join
    const { data: activePools } = await supabase
      .from("pools")
      .select("*, participants(count)")
      .eq("status", "active")
      .neq("owner_id", session.user.id)
      .order("created_at", { ascending: false });

    setMyPools(ownedPools || []);
    setAvailablePools(activePools || []);
    
    // Count pending approvals for owned pools
    const poolIds = ownedPools?.map(p => p.id) || [];
    if (poolIds.length > 0) {
      const { count } = await supabase
        .from("participants")
        .select("*", { count: "exact", head: true })
        .in("pool_id", poolIds)
        .eq("status", "pending");
      
      setPendingApprovalsCount(count || 0);
    }
    
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
              <Trophy className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              Bolão App
            </h1>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <PoolStats
          myPoolsCount={myPools.length}
          activePoolsCount={myPools.filter(p => p.status === "active").length}
          finishedPoolsCount={myPools.filter(p => p.status === "finished").length}
          pendingApprovalsCount={pendingApprovalsCount}
        />

        {/* Create Pool CTA */}
        <div className="text-center space-y-4">
          <h2 className="text-3xl md:text-4xl font-bold">
            Bem-vindo aos seus bolões! 🎉
          </h2>
          <p className="text-muted-foreground text-lg">
            Crie bolões e divirta-se com seus amigos
          </p>
          <Button
            size="lg"
            onClick={() => navigate("/create")}
            className="shadow-lg hover:shadow-xl transition-all"
          >
            <Plus className="w-5 h-5 mr-2" />
            Criar Novo Bolão
          </Button>
        </div>

        {/* My Pools Section */}
        {myPools.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-6 h-6 text-primary" />
              <h3 className="text-2xl font-bold">Meus Bolões</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myPools.map((pool) => (
                <PoolCard
                  key={pool.id}
                  pool={pool}
                  onClick={() => navigate(`/pool/${pool.id}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Available Pools Section */}
        {availablePools.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-2xl font-bold">Bolões Disponíveis</h3>
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
        {myPools.length === 0 && availablePools.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <div className="w-24 h-24 mx-auto rounded-full bg-muted flex items-center justify-center">
              <Trophy className="w-12 h-12 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-muted-foreground">
              Nenhum bolão encontrado
            </h3>
            <p className="text-muted-foreground">
              Seja o primeiro a criar um bolão!
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
