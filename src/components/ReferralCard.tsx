import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Copy, Share2, Gift, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReferralCardProps {
  poolId: string;
  poolSlug: string;
  poolTitle: string;
  userId: string;
}

const ReferralCard = ({ poolId, poolTitle, userId }: ReferralCardProps) => {
  const { toast } = useToast();
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, rewarded: 0, used: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: eligData }, { data: profile }] = await Promise.all([
        supabase.rpc("is_pool_referral_eligible", { p_pool_id: poolId }),
        supabase.from("profiles").select("referral_code").eq("id", userId).maybeSingle(),
      ]);
      if (cancelled) return;
      setEligible(!!eligData);
      setCode((profile as any)?.referral_code || null);
      if (eligData) {
        const { data: refs } = await supabase
          .from("pool_referrals")
          .select("status, reward_participant_id")
          .eq("pool_id", poolId)
          .eq("referrer_user_id", userId);
        if (refs) {
          const rewardedRefs = refs.filter((r: any) => r.status === "rewarded");
          const rewardParticipantIds = rewardedRefs
            .map((r: any) => r.reward_participant_id)
            .filter(Boolean);
          let usedCount = 0;
          if (rewardParticipantIds.length > 0) {
            const { data: preds } = await supabase
              .from("football_predictions")
              .select("participant_id")
              .in("participant_id", rewardParticipantIds);
            if (preds) {
              const usedSet = new Set(preds.map((p: any) => p.participant_id));
              usedCount = usedSet.size;
            }
          }
          setStats({
            total: refs.length,
            rewarded: rewardedRefs.length,
            used: usedCount,
          });
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [poolId, userId]);

  if (loading || !eligible || !code) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: "Código copiado!", description: "Compartilhe com seus amigos." });
    } catch {
      toast({ variant: "destructive", title: "Erro ao copiar" });
    }
  };

  const handleShare = async () => {
    const text = `🎯 Vem participar do bolão "${poolTitle}" comigo na Delfos!\n\nUse meu código de indicação ao fazer o palpite: *${code}*\n\nhttps://delfos.app.br`;
    if (navigator.share) {
      try {
        await navigator.share({ title: poolTitle, text });
        return;
      } catch {}
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-primary/40 bg-gradient-to-br from-primary/15 via-accent/10 to-secondary/15 p-5 shadow-lg">
      <div className="absolute -top-6 -right-6 opacity-20">
        <Gift className="w-32 h-32 text-primary" />
      </div>
      <div className="relative space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">Indique e ganhe um palpite grátis!</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Compartilhe seu <strong>código de indicação</strong>. Quando um amigo digitar
          ele ao fazer o palpite e a inscrição for aprovada,
          você ganha <strong className="text-primary">+1 palpite grátis</strong> automaticamente. Sem limite!
        </p>

        <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-background/80 border-2 border-dashed border-primary/40">
          <code className="text-2xl font-bold tracking-[0.3em] font-mono text-primary">{code}</code>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleCopy} variant="outline" size="sm" className="flex-1">
            <Copy className="w-4 h-4" />
            Copiar código
          </Button>
          <Button onClick={handleShare} size="sm" className="flex-1">
            <Share2 className="w-4 h-4" />
            Compartilhar
          </Button>
        </div>

        {stats.total > 0 && (
          <div className="text-xs text-center pt-2 border-t border-primary/20 space-y-1">
            <div>
              <span className="font-semibold text-primary">{stats.rewarded}</span> palpite(s) grátis ganho(s) ·{" "}
              <span className="font-semibold text-green-600 dark:text-green-400">{stats.used}</span> usado(s) ·{" "}
              <span className="font-semibold">{Math.max(stats.rewarded - stats.used, 0)}</span> disponível(is)
            </div>
            <div className="text-muted-foreground">
              {stats.total} indicação(ões) no total
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReferralCard;
