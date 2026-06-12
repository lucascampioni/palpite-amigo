import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Copy, Link2, Loader2, Plus, Search, Trash2, Users, Eye } from "lucide-react";

interface PartnerLinkRow {
  id: string;
  slug: string;
  label: string | null;
  active: boolean;
  click_count: number;
  signup_count: number;
  partner_user_id: string;
  partner_name: string | null;
  partner_phone: string | null;
  created_at: string;
}

interface UserResult { id: string; full_name: string; email: string; phone: string | null; }

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const baseUrl = () => {
  if (typeof window === "undefined") return "https://delfos.app.br";
  const host = window.location.host;
  if (host.includes("delfos.app.br")) return "https://delfos.app.br";
  return window.location.origin;
};

const AdminPartnerLinks = () => {
  const [rows, setRows] = useState<PartnerLinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // create form state
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<UserResult | null>(null);
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");

  // signups dialog
  const [signupsFor, setSignupsFor] = useState<PartnerLinkRow | null>(null);
  const [signups, setSignups] = useState<any[]>([]);
  const [signupsLoading, setSignupsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_partner_links_with_stats");
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else setRows((data as PartnerLinkRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const doSearch = async () => {
    if (search.trim().length < 2) return;
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-actions", {
        body: { action: "list_users", search: search.trim(), page: 1, limit: 10 },
      });
      if (error) throw error;
      setSearchResults((data?.users || []) as UserResult[]);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const pickUser = (u: UserResult) => {
    setSelected(u);
    if (!slug) setSlug(slugify(u.full_name));
    if (!label) setLabel(u.full_name);
  };

  const createLink = async () => {
    if (!selected) { toast({ title: "Selecione um parceiro", variant: "destructive" }); return; }
    const finalSlug = slugify(slug || selected.full_name);
    if (finalSlug.length < 2) { toast({ title: "Slug inválido", variant: "destructive" }); return; }
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("partner_links").insert({
      slug: finalSlug,
      partner_user_id: selected.id,
      label: label || selected.full_name,
      created_by: user?.id ?? null,
    });
    setCreating(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Link criado!", description: `${baseUrl()}/p/${finalSlug}` });
    setOpen(false);
    setSelected(null); setSlug(""); setLabel(""); setSearch(""); setSearchResults([]);
    load();
  };

  const toggleActive = async (row: PartnerLinkRow) => {
    const { error } = await supabase.from("partner_links")
      .update({ active: !row.active }).eq("id", row.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else load();
  };

  const remove = async (row: PartnerLinkRow) => {
    const { error } = await supabase.from("partner_links").delete().eq("id", row.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Link excluído" }); load(); }
  };

  const copy = async (s: string) => {
    const url = `${baseUrl()}/p/${s}`;
    try { await navigator.clipboard.writeText(url); toast({ title: "Link copiado!" }); }
    catch { toast({ title: "Erro ao copiar", variant: "destructive" }); }
  };

  const openSignups = async (row: PartnerLinkRow) => {
    setSignupsFor(row);
    setSignupsLoading(true);
    setSignups([]);
    const { data, error } = await supabase.rpc("get_partner_link_signups", { p_slug: row.slug });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else setSignups(data || []);
    setSignupsLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Crie links no formato <code className="text-primary">/p/parceiro</code> e acompanhe quantos usuários se cadastraram através de cada parceiro.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4" /> Novo link</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Criar link de parceiro</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>1. Buscar usuário parceiro</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nome, email ou telefone"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && doSearch()}
                  />
                  <Button onClick={doSearch} size="icon" variant="outline" disabled={searching}>
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                {searchResults.length > 0 && (
                  <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                    {searchResults.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => pickUser(u)}
                        className={`w-full text-left p-2 text-xs hover:bg-muted ${selected?.id === u.id ? "bg-primary/10" : ""}`}
                      >
                        <div className="font-medium">{u.full_name}</div>
                        <div className="text-muted-foreground">{u.email} · {u.phone || "sem fone"}</div>
                      </button>
                    ))}
                  </div>
                )}
                {selected && (
                  <Badge variant="secondary" className="text-xs">Parceiro: {selected.full_name}</Badge>
                )}
              </div>

              <div className="space-y-2">
                <Label>2. Slug do link (URL)</Label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">{baseUrl()}/p/</span>
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(slugify(e.target.value))}
                    placeholder="joao-silva"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>3. Apelido interno (opcional)</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: João - Bar do Centro" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={createLink} disabled={creating}>
                {creating && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Criar link
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Nenhum link criado ainda.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link2 className="w-4 h-4 text-primary shrink-0" />
                      <code className="text-sm font-semibold text-primary truncate">/p/{row.slug}</code>
                      {!row.active && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                    </div>
                    {row.label && <p className="text-xs text-muted-foreground mt-1">{row.label}</p>}
                    <p className="text-xs mt-1">
                      Parceiro: <span className="font-medium">{row.partner_name || "—"}</span>
                      {row.partner_phone && <span className="text-muted-foreground"> · {row.partner_phone}</span>}
                    </p>
                  </div>
                  <div className="flex gap-3 text-center">
                    <div>
                      <div className="text-2xl font-bold text-primary">{row.signup_count}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">Cadastros</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-muted-foreground">{row.click_count}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">Cliques</div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => copy(row.slug)}>
                    <Copy className="w-3 h-3 mr-1" /> Copiar link
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => openSignups(row)}>
                    <Users className="w-3 h-3 mr-1" /> Ver cadastros
                  </Button>
                  <Button size="sm" variant={row.active ? "secondary" : "default"} className="text-xs" onClick={() => toggleActive(row)}>
                    <Eye className="w-3 h-3 mr-1" /> {row.active ? "Desativar" : "Ativar"}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" className="text-xs">
                        <Trash2 className="w-3 h-3 mr-1" /> Excluir
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir link?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O link <strong>/p/{row.slug}</strong> deixará de funcionar. Os cadastros já atribuídos serão mantidos.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(row)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!signupsFor} onOpenChange={(o) => !o && setSignupsFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cadastros via /p/{signupsFor?.slug}</DialogTitle>
          </DialogHeader>
          {signupsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : signups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum cadastro ainda.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y">
              {signups.map((s) => (
                <div key={s.user_id} className="py-2 text-sm">
                  <div className="font-medium">{s.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.phone || "sem telefone"} · {new Date(s.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPartnerLinks;
