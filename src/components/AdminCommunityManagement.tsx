import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Users, Pencil, X, Check, ChevronUp, Bell, Search } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface Props {
  onRefresh: () => void;
}

const AdminCommunityManagement = ({ onRefresh }: Props) => {
  const { toast } = useToast();
  const [communities, setCommunities] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [communityOwners, setCommunityOwners] = useState<Record<string, string[]>>({});
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newOwnerIds, setNewOwnerIds] = useState<string[]>([]);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newOwnerSearch, setNewOwnerSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", owner_ids: [] as string[], display_responsible_name: "" });
  const [editOwnerSearch, setEditOwnerSearch] = useState("");
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

    // Load ALL users from profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .order("full_name", { ascending: true })
      .range(0, 9999);
    setAllUsers(profiles || []);

    // Load extra owners per community
    const { data: extraOwners } = await supabase
      .from("community_owners")
      .select("community_id, user_id");

    const ownersMap: Record<string, string[]> = {};
    (comms || []).forEach((c: any) => {
      ownersMap[c.id] = c.responsible_user_id ? [c.responsible_user_id] : [];
    });
    (extraOwners || []).forEach((o: any) => {
      if (!ownersMap[o.community_id]) ownersMap[o.community_id] = [];
      if (!ownersMap[o.community_id].includes(o.user_id)) {
        ownersMap[o.community_id].push(o.user_id);
      }
    });
    setCommunityOwners(ownersMap);
  };

  const toggleNewOwner = (userId: string) => {
    setNewOwnerIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const toggleEditOwner = (userId: string) => {
    setEditForm(f => ({
      ...f,
      owner_ids: f.owner_ids.includes(userId) ? f.owner_ids.filter(id => id !== userId) : [...f.owner_ids, userId],
    }));
  };

  const filteredNewUsers = useMemo(() => {
    const q = newOwnerSearch.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter(u => (u.full_name || "").toLowerCase().includes(q) || (u.phone || "").includes(q));
  }, [allUsers, newOwnerSearch]);

  const filteredEditUsers = useMemo(() => {
    const q = editOwnerSearch.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter(u => (u.full_name || "").toLowerCase().includes(q) || (u.phone || "").includes(q));
  }, [allUsers, editOwnerSearch]);

  const persistOwners = async (communityId: string, ownerIds: string[]) => {
    const primary = ownerIds[0];
    if (primary) {
      await supabase.from("communities").update({ responsible_user_id: primary }).eq("id", communityId);
    }
    // Reset extras
    await supabase.from("community_owners").delete().eq("community_id", communityId);
    const extras = ownerIds.slice(1);
    if (extras.length > 0) {
      await supabase.from("community_owners").insert(extras.map(uid => ({ community_id: communityId, user_id: uid })));
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || newOwnerIds.length === 0) {
      toast({ title: "Preencha o nome e selecione ao menos um responsável", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { data: created, error } = await supabase.from("communities").insert({
      name: newName.trim(),
      description: newDescription.trim() || null,
      responsible_user_id: newOwnerIds[0],
      display_responsible_name: newDisplayName.trim() || null,
      created_by: user!.id,
    }).select("id").single();

    if (error || !created) {
      setLoading(false);
      toast({ title: "Erro ao criar comunidade", description: error?.message, variant: "destructive" });
      return;
    }

    const extras = newOwnerIds.slice(1);
    if (extras.length > 0) {
      await supabase.from("community_owners").insert(extras.map(uid => ({ community_id: created.id, user_id: uid })));
    }

    setLoading(false);
    toast({ title: "Comunidade criada! 🎉" });
    setNewName("");
    setNewDescription("");
    setNewOwnerIds([]);
    setNewDisplayName("");
    setNewOwnerSearch("");
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
      owner_ids: communityOwners[c.id] || (c.responsible_user_id ? [c.responsible_user_id] : []),
      display_responsible_name: c.display_responsible_name || "",
    });
    setEditOwnerSearch("");
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
    if (!editingId || !editForm.name.trim() || editForm.owner_ids.length === 0) {
      toast({ title: "Preencha o nome e selecione ao menos um responsável", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("communities").update({
      name: editForm.name.trim(),
      description: editForm.description.trim() || null,
      responsible_user_id: editForm.owner_ids[0],
      display_responsible_name: editForm.display_responsible_name.trim() || null,
    }).eq("id", editingId);

    if (error) {
      setSaving(false);
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    // Update extras
    await supabase.from("community_owners").delete().eq("community_id", editingId);
    const extras = editForm.owner_ids.slice(1);
    if (extras.length > 0) {
      await supabase.from("community_owners").insert(extras.map(uid => ({ community_id: editingId, user_id: uid })));
    }

    setSaving(false);
    toast({ title: "Comunidade atualizada! ✅" });
    setEditingId(null);
    loadData();
    onRefresh();
  };

  const userById = (id: string) => allUsers.find(u => u.id === id);

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
            <Label>Responsáveis (selecione um ou mais)</Label>
            {newOwnerIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1 mb-2">
                {newOwnerIds.map((uid, idx) => {
                  const u = userById(uid);
                  return (
                    <Badge key={uid} variant="secondary" className="text-xs gap-1">
                      {idx === 0 && <span className="text-primary">★</span>}
                      {u?.full_name || "Usuário"}
                      <button onClick={() => toggleNewOwner(uid)} className="ml-1 hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar usuário..."
                value={newOwnerSearch}
                onChange={e => setNewOwnerSearch(e.target.value)}
              />
            </div>
            <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded-md divide-y divide-border/50">
              {filteredNewUsers.slice(0, 100).map(u => (
                <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/60 text-sm">
                  <Checkbox checked={newOwnerIds.includes(u.id)} onCheckedChange={() => toggleNewOwner(u.id)} />
                  <span className="flex-1 truncate">{u.full_name}</span>
                  {u.phone && <span className="text-xs text-muted-foreground">{u.phone}</span>}
                </label>
              ))}
              {filteredNewUsers.length === 0 && (
                <p className="p-2 text-xs text-muted-foreground text-center">Nenhum usuário</p>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">★ O primeiro selecionado será o responsável principal.</p>
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
                      <Label className="text-xs">Responsáveis</Label>
                      {editForm.owner_ids.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 mb-2">
                          {editForm.owner_ids.map((uid, idx) => {
                            const u = userById(uid);
                            return (
                              <Badge key={uid} variant="secondary" className="text-xs gap-1">
                                {idx === 0 && <span className="text-primary">★</span>}
                                {u?.full_name || "Usuário"}
                                <button onClick={() => toggleEditOwner(uid)} className="ml-1 hover:text-destructive">
                                  <X className="w-3 h-3" />
                                </button>
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                        <Input
                          className="pl-8 h-9"
                          placeholder="Buscar usuário..."
                          value={editOwnerSearch}
                          onChange={e => setEditOwnerSearch(e.target.value)}
                        />
                      </div>
                      <div className="mt-2 max-h-40 overflow-y-auto border border-border rounded-md divide-y divide-border/50">
                        {filteredEditUsers.slice(0, 100).map(u => (
                          <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/60 text-sm">
                            <Checkbox checked={editForm.owner_ids.includes(u.id)} onCheckedChange={() => toggleEditOwner(u.id)} />
                            <span className="flex-1 truncate">{u.full_name}</span>
                            {u.phone && <span className="text-xs text-muted-foreground">{u.phone}</span>}
                          </label>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">★ Primeiro = responsável principal.</p>
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
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{c.name} {c.is_official && "⭐"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.display_responsible_name || (communityOwners[c.id] || []).map(uid => userById(uid)?.full_name).filter(Boolean).join(", ") || "Sem responsável"}
                    </p>
                    {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
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
