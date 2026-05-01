import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, Send, AlertCircle, Copy, Trophy } from "lucide-react";

interface Payout {
  id: string;
  pool_id: string;
  recipient_user_id: string | null;
  recipient_type: string;
  pix_key: string | null;
  pix_key_type: string | null;
  amount: number;
  status: string;
  notes: string | null;
  failure_reason?: string | null;
  created_at: string;
  pool_title?: string;
  recipient_name?: string;
}

const statusBadge = (s: string) => {
  switch (s) {
    case "pending_approval": return <Badge variant="secondary" className="text-[10px]">Aguardando</Badge>;
    case "approved": return <Badge className="bg-blue-600 text-white text-[10px]">Aprovado</Badge>;
    case "sent": return <Badge className="bg-green-600 text-white text-[10px]">Enviado</Badge>;
    case "failed": return <Badge variant="destructive" className="text-[10px]">Falhou</Badge>;
    default: return <Badge variant="outline" className="text-[10px]">{s}</Badge>;
  }
};

const recipientLabel = (t: string) => {
  if (t === "platform") return "Delfos (taxa)";
  if (t === "winner") return "Vencedor";
  if (t === "organizer") return "Organizador";
  return t;
};

const formatBRL = (n: number) => `R$ ${Number(n).toFixed(2).replace(".", ",")}`;

const AdminPayoutsManagement = () => {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pool_payouts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const poolIds = [...new Set((data || []).map((p) => p.pool_id))];
      const userIds = [...new Set((data || []).map((p) => p.recipient_user_id).filter(Boolean) as string[])];

      const [{ data: pools }, { data: profiles }] = await Promise.all([
        supabase.from("pools").select("id, title").in("id", poolIds.length ? poolIds : ["00000000-0000-0000-0000-000000000000"]),
        supabase.from("profiles").select("id, full_name").in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
      ]);

      const enriched = (data || []).map((p) => ({
        ...p,
        pool_title: pools?.find((pl) => pl.id === p.pool_id)?.title || "—",
        recipient_name: p.recipient_user_id
          ? profiles?.find((pr) => pr.id === p.recipient_user_id)?.full_name || "—"
          : "Delfos (plataforma)",
      }));

      setPayouts(enriched as Payout[]);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approvePayout = async (id: string) => {
    setActionId(id);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-execute-payout", { body: { payout_id: id } });
      if (error) throw error;
      if (data?.success === false) {
        toast({
          title: "Pagamento automático indisponível",
          description: data?.error || "Faça a transferência manual e depois marque como enviado.",
          variant: "destructive",
        });
        load();
        return;
      }
      toast({ title: "PIX enviado", description: data?.message || "Pagamento automático executado com sucesso." });
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

  const markSent = async (id: string) => {
    setActionId(id);
    try {
      const { error } = await supabase.functions.invoke("asaas-execute-payout", { body: { payout_id: id, mark_only: true } });
      if (error) throw error;
      toast({ title: "Marcado como enviado" });
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

  const copyPix = async (key: string) => {
    await navigator.clipboard.writeText(key);
    toast({ title: "Chave PIX copiada" });
  };

  // Group by pool
  const grouped = useMemo(() => {
    const map = new Map<string, { pool_id: string; pool_title: string; items: Payout[]; total: number; pending: number }>();
    for (const p of payouts) {
      const key = p.pool_id;
      if (!map.has(key)) {
        map.set(key, { pool_id: p.pool_id, pool_title: p.pool_title || "—", items: [], total: 0, pending: 0 });
      }
      const g = map.get(key)!;
      g.items.push(p);
      g.total += Number(p.amount);
      if (p.status === "pending_approval" || p.status === "approved" || p.status === "failed") g.pending += 1;
    }
    return Array.from(map.values());
  }, [payouts]);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (grouped.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Nenhum repasse pendente.</p>;
  }

  const defaultOpen = grouped.filter((g) => g.pending > 0).map((g) => g.pool_id);

  return (
    <Accordion type="multiple" defaultValue={defaultOpen} className="space-y-2">
      {grouped.map((g) => (
        <AccordionItem key={g.pool_id} value={g.pool_id} className="border rounded-lg bg-card">
          <AccordionTrigger className="px-3 py-2 hover:no-underline">
            <div className="flex flex-col items-start gap-1 min-w-0 flex-1 text-left pr-2">
              <div className="flex items-center gap-2 min-w-0 w-full">
                <Trophy className="w-4 h-4 text-primary shrink-0" />
                <span className="font-medium text-sm truncate">{g.pool_title}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">{g.items.length} repasse{g.items.length > 1 ? "s" : ""}</span>
                <span className="text-xs font-semibold">{formatBRL(g.total)}</span>
                {g.pending > 0 && (
                  <Badge variant="secondary" className="text-[10px]">{g.pending} pendente{g.pending > 1 ? "s" : ""}</Badge>
                )}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-2 pb-2">
            <div className="space-y-2">
              {g.items.map((p) => (
                <Card key={p.id} className="border-muted">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{recipientLabel(p.recipient_type)}</Badge>
                          {statusBadge(p.status)}
                        </div>
                        <p className="font-medium text-sm mt-1 break-words">{p.recipient_name}</p>
                        {p.notes && <p className="text-xs text-muted-foreground italic mt-0.5 break-words">{p.notes}</p>}
                      </div>
                      <p className="font-bold text-base whitespace-nowrap">{formatBRL(p.amount)}</p>
                    </div>

                    {p.pix_key ? (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded text-xs">
                        <span className="text-muted-foreground shrink-0">PIX ({p.pix_key_type}):</span>
                        <code className="flex-1 font-mono break-all min-w-0">{p.pix_key}</code>
                        <Button size="sm" variant="ghost" className="shrink-0 h-7 w-7 p-0" onClick={() => copyPix(p.pix_key!)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : p.recipient_type !== "platform" ? (
                      <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        Destinatário sem chave PIX cadastrada
                      </div>
                    ) : null}

                    {p.status === "pending_approval" && (
                      <div className="flex gap-2 pt-1 flex-wrap">
                        <Button size="sm" disabled={actionId === p.id} onClick={() => approvePayout(p.id)}>
                          {actionId === p.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                          Aprovar
                        </Button>
                        <Button size="sm" variant="secondary" disabled={actionId === p.id} onClick={() => markSent(p.id)}>
                          <Send className="w-3 h-3 mr-1" />
                          Já paguei
                        </Button>
                      </div>
                    )}

                    {(p.status === "approved" || p.status === "failed") && (
                      <div className="space-y-2 pt-1">
                        {p.failure_reason && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 break-words">{p.failure_reason}</p>
                        )}
                        <Button size="sm" variant="secondary" disabled={actionId === p.id} onClick={() => markSent(p.id)}>
                          <Send className="w-3 h-3 mr-1" />
                          Marcar como enviado
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};

export default AdminPayoutsManagement;
