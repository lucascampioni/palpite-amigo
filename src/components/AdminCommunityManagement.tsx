import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Users, Pencil, X, Check, ChevronUp, Bell } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", responsible_user_id: "", display_responsible_name: "" });
  const [saving, setSaving] = useState(false);
  const [expandedMembers, setExpandedMembers] = useState<string | null>(null);
  const [membersData, setMembersData] = useState<Record<string, any[]>>({});
  const [loadingMembers, setLoadingMembers] = useState(false);

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

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setEditForm({
      name: c.name || "",
      description: c.description || "",
      responsible_user_id: c.responsible_user_id || "",
      display_responsible_name: c.display_responsible_name || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const toggleMembers = async (communityId: string) => {
    if (expandedMembers === communityId) {
      setExpandedMembers(null);
      return;
    }
    setExpandedMembers(communityId);
    if (membersData[communityId]) return;

    setLoadingMembers(true);
    const { data: members } = await supabase
      .from("community_members")
      .select("user_id, created_at, notify_new_pools")
      .eq("community_id", communityId);

    if (members && members.length > 0) {
      const userIds = members.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", userIds);

      const profileMap: Record<string, any> = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p; });

      const enriched = members.map(m => ({
        ...m,
        full_name: profileMap[m.user_id]?.full_name || "Sem nome",
        phone: profileMap[m.user_id]?.phone || null,
      }));
      setMembersData(prev => ({ ...prev, [communityId]: enriched }));
    } else {
      setMembersData(prev => ({ ...prev, [communityId]: [] }));
    }
    setLoadingMembers(false);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.name.trim() || !editForm.responsible_user_id) {
      toast({ title: "Preencha o nome e selecione o responsável", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("communities").update({
      name: editForm.name.trim(),
      description: editForm.description.trim() || null,
      responsible_user_id: editForm.responsible_user_id,
      display_responsible_name: editForm.display_responsible_name.trim() || null,
    }).eq("id", editingId);

    setSaving(false);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Comunidade atualizada! ✅" });
    setEditingId(null);
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
            <div key={c.id} className="p-3 rounded-lg bg-muted/50 space-y-3">
              {editingId === c.id ? (
                <>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">Nome</Label>
                      <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Descrição</Label>
                      <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Responsável</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={editForm.responsible_user_id}
                        onChange={e => setEditForm(f => ({ ...f, responsible_user_id: e.target.value }))}
                      >
                        <option value="">Selecione...</option>
                        {eligibleUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.full_name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Nome de exibição</Label>
                      <Input value={editForm.display_responsible_name} onChange={e => setEditForm(f => ({ ...f, display_responsible_name: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={cancelEdit} disabled={saving}>
                      <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                    </Button>
                    <Button size="sm" className="h-8 text-xs" onClick={handleSaveEdit} disabled={saving}>
                      <Check className="w-3.5 h-3.5 mr-1" /> {saving ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{c.name} {c.is_official && "⭐"}</p>
                    <p className="text-xs text-muted-foreground">{c.display_responsible_name || eligibleUsers.find(u => u.id === c.responsible_user_id)?.full_name || "Sem responsável"}</p>
                    {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleMembers(c.id)} title="Ver membros">
                      <Users className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(c)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {!c.is_official && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id, c.name)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Members list */}
              {expandedMembers === c.id && (
                <div className="mt-2 pt-2 border-t border-border/50 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      Membros ({membersData[c.id]?.length ?? "..."})
                    </p>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setExpandedMembers(null)}>
                      <ChevronUp className="w-3 h-3" />
                    </Button>
                  </div>
                  {loadingMembers && !membersData[c.id] ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">Carregando...</p>
                  ) : membersData[c.id]?.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">Nenhum membro</p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {(membersData[c.id] || []).map((member, idx) => (
                        <div key={idx} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/60 text-xs">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                              {member.full_name?.charAt(0)?.toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{member.full_name}</p>
                          </div>
                          {member.phone && (
                            <span className="text-muted-foreground text-[10px] shrink-0">{member.phone}</span>
                          )}
                          {member.notify_new_pools && (
                            <span title="Notificações ativas" className="text-primary"><Bell className="w-3 h-3" /></span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
