import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Search, Trash2, Shield, ShieldOff, Loader2, ChevronLeft, ChevronRight, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface UserItem {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  phone_verified: boolean;
  created_at: string;
  roles: string[];
}

const AdminUserManagement = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const limit = 10;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-actions", {
        body: { action: "list_users", search: search || undefined, page, limit },
      });
      if (error) throw error;
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSearch = () => {
    setPage(1);
    loadUsers();
  };

  const toggleRole = async (userId: string, role: string, hasRole: boolean) => {
    setActionLoading(`role-${userId}-${role}`);
    try {
      const { error } = await supabase.functions.invoke("admin-actions", {
        body: {
          action: "update_role",
          user_id: userId,
          role,
          roleAction: hasRole ? "remove" : "add",
        },
      });
      if (error) throw error;
      toast({ title: "Sucesso", description: `Permissão ${hasRole ? "removida" : "adicionada"}!` });
      loadUsers();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const deleteUser = async (userId: string) => {
    setActionLoading(`delete-${userId}`);
    try {
      const { error } = await supabase.functions.invoke("admin-actions", {
        body: { action: "delete_user", user_id: userId },
      });
      if (error) throw error;
      toast({ title: "Sucesso", description: "Usuário excluído!" });
      loadUsers();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const impersonateUser = async (userId: string, userName: string) => {
    setActionLoading(`impersonate-${userId}`);
    try {
      // Save admin session info before switching
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession) {
        localStorage.setItem("admin_impersonating", JSON.stringify({
          adminUserId: currentSession.user.id,
          adminEmail: currentSession.user.email,
          targetUserName: userName,
        }));
      }

      const { data, error } = await supabase.functions.invoke("admin-actions", {
        body: { action: "impersonate_user", user_id: userId },
      });
      if (error) throw error;

      // Use the token_hash to verify OTP and get a session
      const { error: otpError } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: data.token_hash,
      });
      if (otpError) throw otpError;

      toast({ title: "Sucesso", description: `Logado como ${userName}` });
      navigate("/");
    } catch (e: any) {
      localStorage.removeItem("admin_impersonating");
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin": return <Badge variant="destructive" className="text-xs">Admin</Badge>;
      case "pool_creator": return <Badge className="text-xs bg-accent text-accent-foreground">Organizador</Badge>;
      case "estabelecimento": return <Badge className="text-xs bg-amber-600 text-white">Estabelecimento</Badge>;
      default: return <Badge variant="secondary" className="text-xs">Usuário</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Buscar por nome ou telefone..."
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
      ) : users.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Nenhum usuário encontrado.</p>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <Card key={user.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{user.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.phone || "Sem telefone"}
                      {user.phone_verified && " ✅"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Desde {new Date(user.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {user.roles.length === 0 && getRoleBadge("user")}
                    {user.roles.map((r) => (
                      <span key={r}>{getRoleBadge(r)}</span>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={user.roles.includes("admin") ? "secondary" : "outline"}
                    onClick={() => toggleRole(user.id, "admin", user.roles.includes("admin"))}
                    disabled={actionLoading === `role-${user.id}-admin`}
                    className="text-xs"
                  >
                    {actionLoading === `role-${user.id}-admin` ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : user.roles.includes("admin") ? (
                      <ShieldOff className="w-3 h-3 mr-1" />
                    ) : (
                      <Shield className="w-3 h-3 mr-1" />
                    )}
                    {user.roles.includes("admin") ? "Remover Admin" : "Tornar Admin"}
                  </Button>

                  <Button
                    size="sm"
                    variant={user.roles.includes("pool_creator") ? "secondary" : "outline"}
                    onClick={() => toggleRole(user.id, "pool_creator", user.roles.includes("pool_creator"))}
                    disabled={actionLoading === `role-${user.id}-pool_creator`}
                    className="text-xs"
                  >
                    {actionLoading === `role-${user.id}-pool_creator` ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : user.roles.includes("pool_creator") ? (
                      <ShieldOff className="w-3 h-3 mr-1" />
                    ) : (
                      <Shield className="w-3 h-3 mr-1" />
                    )}
                    {user.roles.includes("pool_creator") ? "Remover Organizador" : "Tornar Organizador"}
                  </Button>

                  <Button
                    size="sm"
                    variant={user.roles.includes("estabelecimento") ? "secondary" : "outline"}
                    onClick={() => toggleRole(user.id, "estabelecimento", user.roles.includes("estabelecimento"))}
                    disabled={actionLoading === `role-${user.id}-estabelecimento`}
                    className="text-xs"
                  >
                    {actionLoading === `role-${user.id}-estabelecimento` ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : user.roles.includes("estabelecimento") ? (
                      <ShieldOff className="w-3 h-3 mr-1" />
                    ) : (
                      <Shield className="w-3 h-3 mr-1" />
                    )}
                    {user.roles.includes("estabelecimento") ? "Remover Estabelecimento" : "Tornar Estabelecimento"}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => impersonateUser(user.id, user.full_name)}
                    disabled={actionLoading === `impersonate-${user.id}`}
                    className="text-xs border-primary/50 text-primary hover:bg-primary/10"
                  >
                    {actionLoading === `impersonate-${user.id}` ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : (
                      <LogIn className="w-3 h-3 mr-1" />
                    )}
                    Entrar como
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={actionLoading === `delete-${user.id}`}
                        className="text-xs"
                      >
                        {actionLoading === `delete-${user.id}` ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Trash2 className="w-3 h-3 mr-1" />
                        )}
                        Excluir
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação é irreversível. O usuário <strong>{user.full_name}</strong> e todos os seus dados serão permanentemente excluídos.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteUser(user.id)}>
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
            {page} de {totalPages} ({total} usuários)
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

export default AdminUserManagement;
