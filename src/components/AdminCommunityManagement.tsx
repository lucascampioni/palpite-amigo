import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Users } from "lucide-react";

interface Props {
  onRefresh: () => void;
}

const AdminCommunityManagement = ({ onRefresh }: Props) => {
  const { toast } = useToast();
  const [communities, setCommunities] = useState<any[]>([]);
  const [eligibleUsers, setEligibleUsers] = useState<any[]>([]);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newResponsibleId, setNewResponsibleId] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: comms } = await supabase
      .from("communities")
      .select("*")
      .order("is_official", { ascending: false })
      .order("created_at", { ascending: true });
    setCommunities(comms || []);

    // Get users who can create pools (admin or pool_creator roles)
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "pool_creator"]);

    if (roles && roles.length > 0) {
      const userIds = [...new Set(roles.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      setEligibleUsers(profiles || []);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newResponsibleId) {
      toast({ title: "Preencha o nome e selecione o responsável", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("communities").insert({
      name: newName.trim(),
      description: newDescription.trim() || null,
      responsible_user_id: newResponsibleId,
      display_responsible_name: newDisplayName.trim() || null,
      created_by: user!.id,
    });

    setLoading(false);

    if (error) {
      toast({ title: "Erro ao criar comunidade", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Comunidade criada! 🎉" });
    setNewName("");
    setNewDescription("");
    setNewResponsibleId("");
    setNewDisplayName("");
    loadData();
    onRefresh();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir a comunidade "${name}"?`)) return;

    const { error } = await supabase.from("communities").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Comunidade excluída" });
    loadData();
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Criar Comunidade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nome da Comunidade</Label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Bolões do João" />
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Input value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Descrição breve..." />
          </div>
          <div>
            <Label>Responsável (criador de bolões)</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={newResponsibleId}
              onChange={e => setNewResponsibleId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {eligibleUsers.map(u => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Nome de exibição do responsável (opcional)</Label>
            <Input value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} placeholder="Ex: Equipe Delfos" />
          </div>
          <Button onClick={handleCreate} disabled={loading} className="w-full">
            {loading ? "Criando..." : "Criar Comunidade"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5" />
            Comunidades Existentes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {communities.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="font-semibold text-sm">{c.name} {c.is_official && "⭐"}</p>
                <p className="text-xs text-muted-foreground">{c.display_responsible_name || "Sem nome de exibição"}</p>
              </div>
              {!c.is_official && (
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id, c.name)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
          {communities.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma comunidade criada</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminCommunityManagement;
