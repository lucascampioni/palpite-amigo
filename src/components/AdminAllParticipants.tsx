import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, ChevronLeft, ChevronRight, Eye, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ParticipantItem {
  id: string;
  participant_name: string;
  status: string;
  payment_proof: string | null;
  created_at: string;
  pool_id: string;
  pool_title: string;
  pool_slug: string;
  pool_status: string;
  pool_owner_name: string;
  rejection_reason: string | null;
  rejection_details: string | null;
  guess_value: string;
}

const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "⏳ Pendentes" },
  { value: "approved", label: "✅ Aprovados" },
  { value: "rejected", label: "❌ Rejeitados" },
];

const AdminAllParticipants = () => {
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<ParticipantItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 30;

  const loadParticipants = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-actions", {
        body: { action: "list_all_participants", status: statusFilter, page, limit },
      });
      if (error) throw error;
      setParticipants(data.participants || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    loadParticipants();
  }, [loadParticipants]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const viewProof = async (paymentProof: string) => {
    const newWindow = window.open("", "_blank");
    try {
      const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(paymentProof, 3600);
      if (data?.signedUrl && newWindow) {
        newWindow.location.href = data.signedUrl;
      } else {
        newWindow?.close();
      }
    } catch {
      newWindow?.close();
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-orange-600 border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-[10px]">Pendente</Badge>;
      case "approved":
        return <Badge variant="outline" className="text-green-600 border-green-500 bg-green-50 dark:bg-green-950/30 text-[10px]">Aprovado</Badge>;
      case "rejected":
        return <Badge variant="outline" className="text-destructive border-destructive bg-destructive/10 text-[10px]">Rejeitado</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  const totalPages = Math.ceil(total / limit);

  // Group by pool
  const grouped: Record<string, { pool: { title: string; slug: string; status: string; owner_name: string }; items: ParticipantItem[] }> = {};
  participants.forEach((p) => {
    if (!grouped[p.pool_id]) {
      grouped[p.pool_id] = {
        pool: { title: p.pool_title, slug: p.pool_slug, status: p.pool_status, owner_name: p.pool_owner_name },
        items: [],
      };
    }
    grouped[p.pool_id].items.push(p);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{total} resultado(s)</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : participants.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Nenhum participante encontrado.</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([poolId, { pool, items }]) => (
            <Card key={poolId} className="overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{pool.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Criador: {pool.owner_name} · {items.length} participante(s) nesta página
                  </p>
                </div>
                {pool.slug && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => navigate(`/bolao/${pool.slug}`)}
                    title="Ir para o bolão"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <CardContent className="p-0 divide-y">
                {items.map((p) => (
                  <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{p.participant_name}</span>
                        {statusBadge(p.status)}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString("pt-BR")}
                        {p.payment_proof && " · 📎 Comprovante"}
                      </p>
                      {p.rejection_reason && (
                        <p className="text-[11px] text-destructive mt-0.5">
                          Motivo: {p.rejection_reason}
                          {p.rejection_details && ` — ${p.rejection_details}`}
                        </p>
                      )}
                    </div>
                    {p.payment_proof && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => viewProof(p.payment_proof!)}
                        title="Ver comprovante"
                      >
                        <Eye className="w-4 h-4 text-blue-500" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default AdminAllParticipants;
