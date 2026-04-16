import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, Send, AlertCircle, Copy } from "lucide-react";

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
  created_at: string;
  pool_title?: string;
  recipient_name?: string;
}

const statusBadge = (s: string) => {
  switch (s) {
    case "pending_approval": return <Badge variant="secondary">Aguardando aprovação</Badge>;
    case "approved": return <Badge className="bg-blue-600 text-white">Aprovado</Badge>;
    case "sent": return <Badge className="bg-green-600 text-white">Enviado</Badge>;
    case "failed": return <Badge variant="destructive">Falhou</Badge>;
    default: return <Badge variant="outline">{s}</Badge>;
  }
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
        .limit(200);
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
      const { error } = await supabase.functions.invoke("mp-execute-payout", { body: { payout_id: id } });
      if (error) throw error;
      toast({ title: "Aprovado", description: "Payout aprovado. Execute a transferência no painel Mercado Pago." });
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
      const { error } = await supabase.functions.invoke("mp-execute-payout", { body: { payout_id: id, mark_only: true } });
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

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (payouts.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Nenhum repasse pendente.</p>;
  }

  return (
    <div className="space-y-3">
      {payouts.map((p) => (
        <Card key={p.id}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{p.recipient_name}</p>
                <p className="text-xs text-muted-foreground">Bolão: {p.pool_title}</p>
                <p className="text-xs text-muted-foreground capitalize">Tipo: {p.recipient_type}</p>
                {p.notes && <p className="text-xs text-muted-foreground italic mt-1">{p.notes}</p>}
              </div>
              <div className="text-right">
                <p className="font-bold text-base">{formatBRL(p.amount)}</p>
                {statusBadge(p.status)}
              </div>
            </div>

            {p.pix_key ? (
              <div className="flex items-center gap-2 p-2 bg-muted rounded text-xs">
                <span className="text-muted-foreground">PIX ({p.pix_key_type}):</span>
                <code className="flex-1 font-mono break-all">{p.pix_key}</code>
                <Button size="sm" variant="ghost" onClick={() => copyPix(p.pix_key!)}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            ) : p.recipient_type !== "platform" ? (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-3 h-3" />
                Destinatário sem chave PIX cadastrada
              </div>
            ) : null}

            {p.status === "pending_approval" && (
              <div className="flex gap-2 pt-2">
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

            {p.status === "approved" && (
              <Button size="sm" variant="secondary" disabled={actionId === p.id} onClick={() => markSent(p.id)}>
                <Send className="w-3 h-3 mr-1" />
                Marcar como enviado
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AdminPayoutsManagement;
