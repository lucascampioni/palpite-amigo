import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import delfosLogo from "@/assets/delfos-logo.png";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, UserCheck, Star, ChevronDown, ChevronUp, MessageCircle, Bell, BellOff, Heart, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import PoolCard from "@/components/PoolCard";

const CommunityDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [community, setCommunity] = useState<any>(null);
  const [pools, setPools] = useState<any[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFinished, setShowFinished] = useState(false);
  const [responsiblePhone, setResponsiblePhone] = useState<string | null>(null);
  const [responsibleFullName, setResponsibleFullName] = useState<string | null>(null);
  const [participantMap, setParticipantMap] = useState<Record<string, any>>({});
  const [membership, setMembership] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) navigate("/entrar");
    });
  }, [navigate]);

  useEffect(() => {
    if (session && slug) loadCommunity();
  }, [session, slug]);

  const loadCommunity = async () => {
    setLoading(true);

    const { data: comm } = await supabase
      .from("communities")
      .select("*")
      .eq("slug", slug)
      .single();

    if (!comm) {
      navigate("/comunidades");
      return;
    }
    setCommunity(comm);

    // Get responsible phone, membership, profile, members in parallel
    const [{ data: responsibleProfile }, { data: myMembership }, { data: profile }, { data: members }] = await Promise.all([
      supabase.from("profiles").select("phone, full_name").eq("id", comm.responsible_user_id).single(),
      session ? supabase.from("community_members").select("*").eq("community_id", comm.id).eq("user_id", session.user.id).maybeSingle() : Promise.resolve({ data: null }),
      session ? supabase.from("profiles").select("notify_new_pools").eq("id", session.user.id).single() : Promise.resolve({ data: null }),
      supabase.from("community_members").select("id").eq("community_id", comm.id),
    ]);
    setResponsiblePhone(responsibleProfile?.phone || null);
    setResponsibleFullName(responsibleProfile?.full_name || null);
    setMembership(myMembership);
    setUserProfile(profile);
    setMemberCount(members?.length || 0);

    // Get all pools by responsible user (active + finished)
    const { data: poolsData } = await supabase
      .from("pools")
      .select("*, participants(count)")
      .eq("owner_id", comm.responsible_user_id)
      .in("status", ["active", "finished"])
      .order("created_at", { ascending: false });

    setPools(poolsData || []);

    // Fetch user's participation status for these pools
    if (poolsData && poolsData.length > 0 && session) {
      const poolIds = poolsData.map((p: any) => p.id);
      const { data: myParticipants } = await supabase
        .from("participants")
        .select("pool_id, status, payment_proof, prize_status")
        .eq("user_id", session.user.id)
        .in("pool_id", poolIds);

      const pMap: Record<string, any> = {};
      (myParticipants || []).forEach((p: any) => {
        pMap[p.pool_id] = p;
      });
      setParticipantMap(pMap);
    } else {
      setParticipantMap({});
    }

    setLoading(false);
  };

  const handleFollow = async () => {
    if (!session || !community) return;
    const notifyEnabled = userProfile?.notify_new_pools ?? false;
    const { error } = await supabase.from("community_members").insert({
      community_id: community.id,
      user_id: session.user.id,
      notify_new_pools: notifyEnabled,
    });
    if (error) {
      toast({ title: "Erro ao seguir comunidade", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Comunidade seguida! 🎉" });
    loadCommunity();
  };

  const handleUnfollow = async () => {
    if (!session || !community) return;
    if (community.is_official) {
      toast({ title: "Não é possível", description: "Você não pode deixar de seguir a comunidade oficial.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("community_members").delete().eq("community_id", community.id).eq("user_id", session.user.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Você deixou de seguir a comunidade" });
    loadCommunity();
  };

  const handleToggleNotify = async (value: boolean) => {
    if (!session || !community) return;
    if (value && !userProfile?.notify_new_pools) {
      toast({
        title: "Ative as notificações no perfil",
        description: "Para receber notificações de comunidades, ative a opção 'Novos bolões disponíveis' no seu perfil primeiro.",
        variant: "destructive",
        duration: 8000,
      });
      return;
    }
    const { error } = await supabase.from("community_members").update({ notify_new_pools: value }).eq("community_id", community.id).eq("user_id", session.user.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setMembership((prev: any) => ({ ...prev, notify_new_pools: value }));
  };

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

  if (!community) return null;

  const activePools = pools.filter(p => p.status === "active");
  const finishedPools = pools.filter(p => p.status === "finished");
  const responsibleName = community.display_responsible_name || responsibleFullName || "Organizador";
  const isFollowing = !!membership;
  const notifyEnabled = membership?.notify_new_pools ?? false;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-lg border-b border-border/50 shadow-md">
        <div className="max-w-3xl mx-auto px-3 py-2 flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => navigate("/comunidades")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {community.is_official && (
                <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] px-1.5 py-0 font-semibold shrink-0">
                  <Star className="w-3 h-3 mr-0.5" />
                  Oficial
                </Badge>
              )}
              <h1 className="font-bold text-sm truncate">{community.name}</h1>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              const url = `https://delfos.app.br/comunidade/${community.slug}`;
              if (navigator.share) {
                navigator.share({ title: community.name, text: community.description || `Confira a comunidade ${community.name} na Delfos!`, url });
              } else {
                navigator.clipboard.writeText(url);
                toast({ title: "Link copiado!", description: "Compartilhe com seus amigos." });
              }
            }}
          >
            <Share2 className="w-4 h-4" />
          </Button>
        </div>
        <div className="h-[2px] bg-gradient-to-r from-primary via-secondary to-accent" />
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-3 pt-4 pb-4 space-y-5">
        {/* Community info */}
        <div className="space-y-2">
          {community.description && (
            <p className="text-sm text-muted-foreground">{community.description}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              {responsibleName}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {memberCount} {memberCount === 1 ? "membro" : "membros"}
            </span>
          </div>
        </div>

        {/* Follow & Notify section */}
        <div className={`p-3 rounded-xl border space-y-3 transition-all duration-500 ${
          isFollowing 
            ? 'bg-muted/40 border-border/50' 
            : 'bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 border-primary/30 shadow-lg shadow-primary/5 animate-fade-in'
        }`}>
          {!isFollowing && (
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <p className="text-[11px] font-semibold text-primary uppercase tracking-wider">Comunidade aberta</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Heart className={`w-5 h-5 shrink-0 transition-all duration-300 ${isFollowing ? 'text-primary fill-primary' : 'text-primary animate-[pulse_1.5s_ease-in-out_infinite]'}`} />
            <div className="flex-1 min-w-0">
              {isFollowing ? (
                <p className="text-xs sm:text-sm text-foreground font-medium">Você segue esta comunidade</p>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-xs sm:text-sm font-semibold text-foreground">Siga e não perca nenhum bolão!</p>
                  <p className="text-[11px] text-muted-foreground">Receba alertas quando novos bolões forem criados</p>
                </div>
              )}
            </div>
            {isFollowing ? (
              !community.is_official && (
                <Button variant="outline" size="sm" className="shrink-0 h-8 text-xs" onClick={handleUnfollow}>
                  Deixar de seguir
                </Button>
              )
            ) : (
              <Button size="sm" className="shrink-0 h-8 text-xs gap-1.5 animate-scale-in shadow-md" onClick={handleFollow}>
                <Heart className="w-3.5 h-3.5" />
                Seguir
              </Button>
            )}
          </div>

          {isFollowing && (
            <div className="flex items-center gap-3 pt-2 border-t border-border/50">
              {notifyEnabled ? (
                <Bell className="w-4 h-4 text-primary shrink-0" />
              ) : (
                <BellOff className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground leading-snug">
                  {notifyEnabled
                    ? "Notificações ativas — você será avisado sobre novos bolões"
                    : "Ative as notificações para não perder nenhum bolão novo desta comunidade"}
                </p>
              </div>
              <Switch
                checked={notifyEnabled}
                onCheckedChange={handleToggleNotify}
              />
            </div>
          )}
        </div>

        {/* WhatsApp group CTA */}
        {responsiblePhone && (
          <div className="p-3 rounded-xl bg-muted/40 border border-border/50 flex items-center gap-3">
            <MessageCircle className="w-5 h-5 text-green-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm text-muted-foreground leading-snug">
                Não faz parte do grupo do WhatsApp da comunidade?
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 h-8 text-xs gap-1.5 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950"
              onClick={() => {
                const phone = responsiblePhone.replace(/\D/g, '');
                const message = encodeURIComponent(
                  `Olá ${responsibleName}! Sou membro da comunidade "${community.name}" na Delfos e gostaria de entrar no grupo do WhatsApp. Pode me adicionar?`
                );
                window.open(`https://wa.me/55${phone}?text=${message}`, '_blank');
              }}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Falar com responsável
            </Button>
          </div>
        )}

        {/* Active pools */}
        {activePools.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              ⚽ Bolões Ativos
            </h3>
            <div className="space-y-3">
              {activePools.map(pool => (
                <PoolCard
                  key={pool.id}
                  pool={pool}
                  onClick={() => navigate(`/bolao/${pool.slug}`)}
                  isUserParticipating={participantMap[pool.id]?.status === 'approved'}
                  hasPendingPayment={participantMap[pool.id]?.status === 'pending' && !participantMap[pool.id]?.payment_proof}
                  hasAwaitingApproval={participantMap[pool.id]?.status === 'pending' && !!participantMap[pool.id]?.payment_proof}
                />
              ))}
            </div>
          </section>
        )}

        {/* Finished pools - collapsible */}
        {finishedPools.length > 0 && (
          <section className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between h-9 text-muted-foreground hover:text-foreground"
              onClick={() => setShowFinished(!showFinished)}
            >
              <span className="text-xs font-medium">
                ✅ Finalizados ({finishedPools.length})
              </span>
              {showFinished ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            {showFinished && (
              <div className="space-y-3">
                {finishedPools.map(pool => {
                  const participantCount = pool.participants?.[0]?.count || 0;
                  const totalPrize = pool.prize_type === 'percentage'
                    ? (pool.entry_fee || 0) * participantCount
                    : ((pool.first_place_prize || 0) + (pool.second_place_prize || 0) + (pool.third_place_prize || 0));
                  return (
                    <PoolCard
                      key={pool.id}
                      pool={{...pool, participant_count: participantCount}}
                      onClick={() => navigate(`/bolao/${pool.slug}`)}
                      isUserParticipating={participantMap[pool.id]?.status === 'approved'}
                      totalPrize={totalPrize}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {pools.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-muted-foreground">Nenhum bolão ainda</h3>
            <p className="text-sm text-muted-foreground">Os bolões desta comunidade aparecerão aqui.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default CommunityDetail;
