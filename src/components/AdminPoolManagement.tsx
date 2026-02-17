import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Search, Trash2, ExternalLink, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

interface PoolItem {
  id: string;
  title: string;
  status: string;
  pool_type: string;
  entry_fee: number | null;
  created_at: string;
  owner_name: string;
}

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  closed: "Fechado",
  finished: "Finalizado",
};

const statusColors: Record<string, string> = {
  draft: "secondary",
  active: "default",
  closed: "outline",
  finished: "destructive",
};

const AdminPoolManagement = () => {
  const navigate = useNavigate();
  const [pools, setPools] = useState<PoolItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const limit = 10;

  const loadPools = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-actions", {
        body: { action: "list_pools", search: search || undefined, page, limit },
      });
      if (error) throw error;
      setPools(data.pools || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    loadPools();
  }, [loadPools]);

  const handleSearch = () => {
    setPage(1);
    loadPools();
  };

  const updateStatus = async (poolId: string, status: string) => {
    setActionLoading(`status-${poolId}`);
    try {
      const { error } = await supabase.functions.invoke("admin-actions", {
        body: { action: "update_pool_status", pool_id: poolId, status },
      });
      if (error) throw error;
      toast({ title: "Sucesso", description: "Status atualizado!" });
      loadPools();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const deletePool = async (poolId: string) => {
    setActionLoading(`delete-${poolId}`);
    try {
      const { error } = await supabase.functions.invoke("admin-actions", {
        body: { action: "delete_pool", pool_id: poolId },
      });
      if (error) throw error;
      toast({ title: "Sucesso", description: "Bolão excluído!" });
      loadPools();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Buscar por título..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1"
        />
        <Button onClick={handleSearch} size="icon" variant="outline">
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : pools.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Nenhum bolão encontrado.</p>
      ) : (
        <div className="space-y-3">
          {pools.map((pool) => (
            <Card key={pool.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{pool.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Criado por {pool.owner_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(pool.created_at).toLocaleDateString("pt-BR")} • {pool.pool_type === "football" ? "Futebol" : "Personalizado"}
                      {pool.entry_fee ? ` • R$ ${pool.entry_fee}` : " • Gratuito"}
                    </p>
                  </div>
                  <Badge variant={statusColors[pool.status] as any || "secondary"} className="text-xs shrink-0">
                    {statusLabels[pool.status] || pool.status}
                  </Badge>
                </div>

                <Separator />

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={pool.status}
                    onValueChange={(value) => updateStatus(pool.id, value)}
                    disabled={actionLoading === `status-${pool.id}`}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Rascunho</SelectItem>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="closed">Fechado</SelectItem>
                      <SelectItem value="finished">Finalizado</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => navigate(`/pool/${pool.id}`)}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Ver
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={actionLoading === `delete-${pool.id}`}
                        className="text-xs"
                      >
                        {actionLoading === `delete-${pool.id}` ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Trash2 className="w-3 h-3 mr-1" />
                        )}
                        Excluir
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir bolão?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação é irreversível. O bolão <strong>{pool.title}</strong> e todos os participantes/palpites serão permanentemente excluídos.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deletePool(pool.id)}>
                          Confirmar Exclusão
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} de {totalPages} ({total} bolões)
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default AdminPoolManagement;
