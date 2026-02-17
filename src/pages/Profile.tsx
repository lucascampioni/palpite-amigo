import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Users, Award, ArrowLeft, Mail, Calendar, Camera, Phone, Lock, Pencil, Loader2, MessageCircle, Bell, Shield } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import AdminUserManagement from "@/components/AdminUserManagement";
import AdminPoolManagement from "@/components/AdminPoolManagement";

const Profile = () => {
  const navigate = useNavigate();
  const { data: userRole } = useUserRole();
  const [stats, setStats] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [memberSince, setMemberSince] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Edit states
  const [editingPhone, setEditingPhone] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [notifyPoolUpdates, setNotifyPoolUpdates] = useState(true);
  const [notifyNewPools, setNotifyNewPools] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUserEmail(user.email || "");
    
    setMemberSince(new Date(user.created_at).toLocaleDateString('pt-BR'));

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    setProfile(profileData);
    setPhone(profileData?.phone || "");
    setNotifyPoolUpdates(profileData?.notify_pool_updates ?? true);
    setNotifyNewPools(profileData?.notify_new_pools ?? true);

    let { data: statsData } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!statsData) {
      const { data: newStats } = await supabase
        .from('user_stats')
        .insert({ user_id: user.id })
        .select()
        .single();
      statsData = newStats;
    }

    setStats(statsData);
    setLoading(false);
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: "Erro", description: "Selecione um arquivo de imagem.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Erro", description: "A imagem deve ter no máximo 2MB.", variant: "destructive" });
      return;
    }

    setUploadingAvatar(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const avatarUrl = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfile((prev: any) => ({ ...prev, avatar_url: avatarUrl }));
      toast({ title: "Sucesso", description: "Foto de perfil atualizada!" });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message || "Erro ao enviar foto.", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSavePhone = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!/^\d{10,11}$/.test(cleanPhone)) {
      toast({ title: "Erro", description: "Telefone inválido. Use 10 ou 11 dígitos.", variant: "destructive" });
      return;
    }
    setSavingPhone(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if phone already exists
      const { data: checkData } = await supabase.functions.invoke("check-phone-exists", {
        body: { phone: cleanPhone },
      });
      if (checkData?.exists) {
        toast({ title: "Erro", description: "Este telefone já está cadastrado por outro usuário.", variant: "destructive" });
        setSavingPhone(false);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ phone: cleanPhone, phone_verified: false })
        .eq('id', user.id);

      if (error) throw error;

      setProfile((prev: any) => ({ ...prev, phone: cleanPhone, phone_verified: false }));
      setEditingPhone(false);
      toast({ title: "Telefone atualizado", description: "Você precisa verificar o novo número via WhatsApp." });
      navigate("/whatsapp-verification");
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setSavingPhone(false);
    }
  };


  const handleSavePassword = async () => {
    if (newPassword.length < 8) {
      toast({ title: "Erro", description: "A senha deve ter no mínimo 8 caracteres.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast({ title: "Sucesso", description: "Senha alterada com sucesso!" });
      setEditingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background p-4">
        <div className="max-w-4xl mx-auto pt-8 space-y-6">
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Bolões Participados",
      value: stats?.total_pools_joined || 0,
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
    },
    {
      label: "Vitórias",
      value: stats?.total_wins || 0,
      icon: Trophy,
      color: "text-yellow-600",
      bgColor: "bg-yellow-100 dark:bg-yellow-900/20",
    },
    {
      label: "Pontos Totais",
      value: stats?.total_points || 0,
      icon: Award,
      color: "text-purple-600",
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
    },
  ];

  const avatarUrl = profile?.avatar_url;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background p-4">
      <div className="max-w-4xl mx-auto pt-8 pb-16 space-y-6">
        {/* Back Button */}
        <Button 
          variant="ghost" 
          onClick={() => navigate("/")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para Início
        </Button>

        {/* Profile Header with Avatar Upload */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative group">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Foto de perfil"
                    className="w-20 h-20 rounded-full object-cover shadow-lg"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-3xl font-bold text-primary-foreground shadow-lg">
                    {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
              <div className="flex-1">
                <CardTitle className="text-3xl mb-2">{profile?.full_name || 'Usuário'}</CardTitle>
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    <span>{userEmail}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>Membro desde {memberSince}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Edit Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              Editar Informações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Email (não editável) */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Mail className="w-4 h-4 text-muted-foreground" />
                Email
              </Label>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{userEmail}</span>
              </div>
            </div>

            <Separator />

            {/* Phone */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Phone className="w-4 h-4 text-muted-foreground" />
                Telefone
              </Label>
              {editingPhone ? (
                <div className="flex gap-2">
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                  <Button onClick={handleSavePhone} disabled={savingPhone} size="sm">
                    {savingPhone ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setEditingPhone(false); setPhone(profile?.phone || ""); }}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{profile?.phone || "Não informado"}</span>
                  <Button variant="outline" size="sm" onClick={() => setEditingPhone(true)}>
                    <Pencil className="w-3 h-3 mr-1" /> Alterar
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Password */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Lock className="w-4 h-4 text-muted-foreground" />
                Senha
              </Label>
              {editingPassword ? (
                <div className="space-y-3">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nova senha (mín. 8 caracteres)"
                  />
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirmar nova senha"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleSavePassword} disabled={savingPassword} size="sm">
                      {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "Alterar Senha"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setEditingPassword(false); setNewPassword(""); setConfirmPassword(""); }}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">••••••••</span>
                  <Button variant="outline" size="sm" onClick={() => setEditingPassword(true)}>
                    <Pencil className="w-3 h-3 mr-1" /> Alterar
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Notificações WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Atualizações dos bolões</p>
                <p className="text-xs text-muted-foreground">Receber notificações sobre resultados, posição e pagamentos dos bolões que participo</p>
              </div>
              <Switch
                checked={notifyPoolUpdates}
                onCheckedChange={async (checked) => {
                  setNotifyPoolUpdates(checked);
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) {
                    await supabase.from('profiles').update({ notify_pool_updates: checked }).eq('id', user.id);
                  }
                }}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Novos bolões disponíveis</p>
                <p className="text-xs text-muted-foreground">Receber divulgação de novos bolões na plataforma</p>
              </div>
              <Switch
                checked={notifyNewPools}
                onCheckedChange={async (checked) => {
                  setNotifyNewPools(checked);
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) {
                    await supabase.from('profiles').update({ notify_new_pools: checked }).eq('id', user.id);
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Admin Panel */}
        {userRole?.isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-accent" />
                Painel Administrativo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="users" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="users">Usuários</TabsTrigger>
                  <TabsTrigger value="pools">Bolões</TabsTrigger>
                  <TabsTrigger value="other">Outros</TabsTrigger>
                </TabsList>
                <TabsContent value="users" className="mt-4">
                  <AdminUserManagement />
                </TabsContent>
                <TabsContent value="pools" className="mt-4">
                  <AdminPoolManagement />
                </TabsContent>
                <TabsContent value="other" className="mt-4">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 h-12 rounded-xl"
                    onClick={() => navigate("/whatsapp-requests")}
                  >
                    <MessageCircle className="w-5 h-5 text-accent" />
                    Solicitações WhatsApp
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className={`w-12 h-12 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 ${stat.color}`} />
                    </div>
                    <div>
                      <p className="text-3xl font-bold">{stat.value}</p>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Achievement Badges */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-secondary" />
              Conquistas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {stats?.total_wins >= 1 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-100 dark:bg-yellow-900/20">
                  <Trophy className="w-8 h-8 text-yellow-600" />
                  <div>
                    <p className="font-semibold text-sm">Primeira Vitória</p>
                    <p className="text-xs text-muted-foreground">Ganhe seu primeiro bolão</p>
                  </div>
                </div>
              )}
              {stats?.total_wins >= 5 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-100 dark:bg-yellow-900/20">
                  <Trophy className="w-8 h-8 text-yellow-600" />
                  <div>
                    <p className="font-semibold text-sm">Campeão</p>
                    <p className="text-xs text-muted-foreground">Vença 5 bolões</p>
                  </div>
                </div>
              )}
            </div>
            {stats?.total_wins === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Participe de bolões para desbloquear conquistas! 🏆
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
