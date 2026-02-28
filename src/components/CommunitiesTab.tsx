import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CommunityCard from "@/components/CommunityCard";
import AdminCommunityManagement from "@/components/AdminCommunityManagement";

interface CommunitiesTabProps {
  userId?: string;
}

const CommunitiesTab = ({ userId }: CommunitiesTabProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: userRole } = useUserRole();
  const [communities, setCommunities] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<Record<string, any>>({});
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [poolCounts, setPoolCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    if (userId) loadData();
  }, [userId]);

  const loadData = async () => {
    if (!userId) return;
    setLoading(true);

    const [{ data: comms }, { data: myMemberships }, { data: profile }] = await Promise.all([
      supabase.from("communities").select("*").order("is_official", { ascending: false }).order("created_at", { ascending: true }),
      supabase.from("community_members").select("*").eq("user_id", userId),
      supabase.from("profiles").select("notify_new_pools").eq("id", userId).single(),
    ]);

    setCommunities(comms || []);
    setUserProfile(profile);

    const memberMap: Record<string, any> = {};
    (myMemberships || []).forEach(m => { memberMap[m.community_id] = m; });
    setMemberships(memberMap);

    if (comms && comms.length > 0) {
      const [{ data: counts }, { data: poolsData }] = await Promise.all([
        supabase.from("community_members").select("community_id"),
        supabase.from("pools").select("owner_id").in("status", ["active"]),
      ]);
      const countMap: Record<string, number> = {};
      (counts || []).forEach(c => { countMap[c.community_id] = (countMap[c.community_id] || 0) + 1; });
      setMemberCounts(countMap);

      // Map pools to communities by responsible_user_id
      const poolCountMap: Record<string, number> = {};
      (comms || []).forEach(comm => {
        const count = (poolsData || []).filter(p => p.owner_id === comm.responsible_user_id).length;
        poolCountMap[comm.id] = count;
      });
      setPoolCounts(poolCountMap);
    }

    setLoading(false);
  };

  const handleFollow = async (communityId: string) => {
    if (!userId) return;
    const notifyEnabled = userProfile?.notify_new_pools ?? false;
    const { error } = await supabase.from("community_members").insert({
      community_id: communityId,
      user_id: userId,
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
    if (!userId) return;
    const community = communities.find(c => c.id === communityId);
    if (community?.is_official) {
      toast({ title: "Não é possível", description: "Você não pode deixar de seguir a comunidade oficial.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("community_members").delete().eq("community_id", communityId).eq("user_id", userId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Você deixou de seguir a comunidade" });
    loadData();
  };

  const handleToggleNotify = async (communityId: string, value: boolean) => {
    if (!userId) return;
    if (value && !userProfile?.notify_new_pools) {
      toast({
        title: "Ative as notificações no perfil",
        description: "Para receber notificações de comunidades, ative a opção 'Novos bolões disponíveis' no seu perfil primeiro.",
        variant: "destructive",
      });
      return;
    }
    const { error } = await supabase.from("community_members").update({ notify_new_pools: value }).eq("community_id", communityId).eq("user_id", userId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setMemberships(prev => ({
      ...prev,
      [communityId]: { ...prev[communityId], notify_new_pools: value },
    }));
  };

  const filteredCommunities = communities.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return c.name?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q);
  });

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
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground text-sm">Carregando comunidades...</p>
      </div>
    );
  }

  if (showAdmin && userRole?.isAdmin) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="rounded-full h-8 px-3 text-xs" onClick={() => setShowAdmin(false)}>
            ← Voltar
          </Button>
        </div>
        <AdminCommunityManagement onRefresh={loadData} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {userRole?.isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="rounded-full h-8 px-3 text-xs" onClick={() => setShowAdmin(true)}>
            ⚙️ Gerenciar
          </Button>
        </div>
      )}

      <div className="relative">
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
            poolCount={poolCounts[community.id] || 0}
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
    </div>
  );
};

export default CommunitiesTab;
