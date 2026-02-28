import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { Session } from "@supabase/supabase-js";
import delfosLogo from "@/assets/delfos-logo.png";
import { Button } from "@/components/ui/button";
import { User, LogOut, Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import CommunityCard from "@/components/CommunityCard";
import AdminCommunityManagement from "@/components/AdminCommunityManagement";

const Communities = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: userRole } = useUserRole();
  const [session, setSession] = useState<Session | null>(null);
  const [communities, setCommunities] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<Record<string, any>>({});
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session);
      if (!session) navigate("/entrar");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) navigate("/entrar");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (session?.user) loadData();
  }, [session]);

  const loadData = async () => {
    if (!session?.user) return;
    setLoading(true);

    const [{ data: comms }, { data: myMemberships }, { data: profile }] = await Promise.all([
      supabase.from("communities").select("*").order("is_official", { ascending: false }).order("created_at", { ascending: true }),
      supabase.from("community_members").select("*").eq("user_id", session.user.id),
      supabase.from("profiles").select("notify_new_pools").eq("id", session.user.id).single(),
    ]);

    setCommunities(comms || []);
    setUserProfile(profile);

    const memberMap: Record<string, any> = {};
    (myMemberships || []).forEach(m => { memberMap[m.community_id] = m; });
    setMemberships(memberMap);

    // Fetch member counts
    if (comms && comms.length > 0) {
      const { data: counts } = await supabase
        .from("community_members")
        .select("community_id");
      
      const countMap: Record<string, number> = {};
      (counts || []).forEach(c => {
        countMap[c.community_id] = (countMap[c.community_id] || 0) + 1;
      });
      setMemberCounts(countMap);
    }

    setLoading(false);
  };

  const handleFollow = async (communityId: string) => {
    if (!session?.user) return;
    const notifyEnabled = userProfile?.notify_new_pools ?? false;
    
    const { error } = await supabase.from("community_members").insert({
      community_id: communityId,
      user_id: session.user.id,
      notify_new_pools: notifyEnabled,
    });

    if (error) {
      toast({ title: "Erro ao seguir comunidade", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Comunidade seguida! 🎉" });
    loadData();
  };

  const handleUnfollow = async (communityId: string) => {
    if (!session?.user) return;
    const community = communities.find(c => c.id === communityId);
    if (community?.is_official) {
      toast({ title: "Não é possível", description: "Você não pode deixar de seguir a comunidade oficial.", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("community_members")
      .delete()
      .eq("community_id", communityId)
      .eq("user_id", session.user.id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Você deixou de seguir a comunidade" });
    loadData();
  };

  const handleToggleNotify = async (communityId: string, value: boolean) => {
    if (!session?.user) return;

    if (value && !userProfile?.notify_new_pools) {
      toast({
        title: "Ative as notificações no perfil",
        description: "Para receber notificações de comunidades, ative a opção 'Novos bolões disponíveis' no seu perfil primeiro.",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase.from("community_members")
      .update({ notify_new_pools: value })
      .eq("community_id", communityId)
      .eq("user_id", session.user.id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    setMemberships(prev => ({
      ...prev,
      [communityId]: { ...prev[communityId], notify_new_pools: value },
    }));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const filteredCommunities = communities.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return c.name?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q);
  });

  // Sort: official first, then followed, then others
  const sortedCommunities = [...filteredCommunities].sort((a, b) => {
    if (a.is_official && !b.is_official) return -1;
    if (!a.is_official && b.is_official) return 1;
    const aFollowed = !!memberships[a.id];
    const bFollowed = !!memberships[b.id];
    if (aFollowed && !bFollowed) return -1;
    if (!aFollowed && bFollowed) return 1;
    return 0;
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
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-lg border-b border-border/50 shadow-md">
        <div className="max-w-3xl mx-auto px-3 py-2 flex items-center justify-between">
          <div className="flex items-center">
            <img src={delfosLogo} alt="Delfos" className="h-8 sm:h-10 w-auto cursor-pointer" onClick={() => navigate("/")} />
          </div>
          <div className="flex items-center gap-1">
            {userRole?.isAdmin && (
              <Button size="sm" variant="outline" className="rounded-full h-9 px-3 text-xs" onClick={() => setShowAdmin(!showAdmin)}>
                {showAdmin ? "Comunidades" : "Gerenciar"}
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

      <main className="flex-1 max-w-3xl mx-auto w-full px-3 pt-3 pb-4">
        {showAdmin && userRole?.isAdmin ? (
          <AdminCommunityManagement onRefresh={loadData} />
        ) : (
          <>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar comunidade..."
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

            <div className="space-y-3">
              {sortedCommunities.map(community => (
                <CommunityCard
                  key={community.id}
                  community={community}
                  membership={memberships[community.id]}
                  memberCount={memberCounts[community.id] || 0}
                  userNotifyEnabled={userProfile?.notify_new_pools ?? false}
                  onFollow={() => handleFollow(community.id)}
                  onUnfollow={() => handleUnfollow(community.id)}
                  onToggleNotify={(val) => handleToggleNotify(community.id, val)}
                  onClick={() => navigate(`/comunidade/${community.slug}`)}
                />
              ))}

              {sortedCommunities.length === 0 && (
                <div className="text-center py-12 space-y-3">
                  <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
                    <Search className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-muted-foreground">Nenhuma comunidade encontrada</h3>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="sticky bottom-0 bg-card/95 backdrop-blur-lg border-t border-border/50 shadow-lg">
        <div className="max-w-3xl mx-auto flex">
          <button onClick={() => navigate("/")} className="flex-1 flex flex-col items-center gap-0.5 py-2 text-muted-foreground hover:text-foreground transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            <span className="text-[10px] font-medium">Início</span>
          </button>
          <button className="flex-1 flex flex-col items-center gap-0.5 py-2 text-primary font-semibold transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span className="text-[10px]">Comunidades</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Communities;
