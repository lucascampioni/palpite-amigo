import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Plus, Trash2, CheckCircle, UserPlus, AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface VoucherEntry {
  id: string;
  phone: string;
  used_by: string | null;
  created_at: string;
  prediction_sets: number;
}

interface VoucherManagerProps {
  poolId: string;
  poolTitle: string;
  poolSlug?: string;
  deadline?: string;
}

const VoucherManager = ({ poolId, poolTitle, poolSlug, deadline }: VoucherManagerProps) => {
  const { toast } = useToast();
  const [entries, setEntries] = useState<VoucherEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [predictionSets, setPredictionSets] = useState(1);
  const [phone, setPhone] = useState("");

  // Entry cutoff: 30 minutes before deadline
  const cutoffTime = deadline ? new Date(new Date(deadline).getTime() - 30 * 60 * 1000) : null;
  const isPastCutoff = cutoffTime ? new Date() >= cutoffTime : false;

  useEffect(() => {
    loadEntries();
  }, [poolId]);

  const loadEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pool_vouchers")
      .select("*")
      .eq("pool_id", poolId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setEntries(data as VoucherEntry[]);

      // Load names for linked users
      const userIds = data.filter(v => v.used_by).map(v => v.used_by!);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);

        if (profiles) {
          const nameMap: Record<string, string> = {};
          profiles.forEach(p => { nameMap[p.id] = p.full_name; });
          setUserNames(nameMap);
        }
      }
    }
    setLoading(false);
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleAddParticipant = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      toast({
        variant: "destructive",
        title: "Telefone inválido",
        description: "Insira um número de telefone válido com DDD.",
      });
      return;
    }

    setAdding(true);

    // Find user by phone
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .eq("phone", digits)
      .maybeSingle();

    if (profileError || !profile) {
      toast({
        variant: "destructive",
        title: "Usuário não encontrado",
        description: "Nenhuma conta cadastrada com este número. A pessoa precisa criar uma conta no Delfos primeiro.",
      });
      setAdding(false);
      return;
    }

    // Check if already registered in this pool
    const { data: existingParticipant } = await supabase
      .from("participants")
      .select("id")
      .eq("pool_id", poolId)
      .eq("user_id", profile.id)
      .maybeSingle();

    if (existingParticipant) {
      toast({
        variant: "destructive",
        title: "Já cadastrado",
        description: `${profile.full_name} já está inscrito neste bolão.`,
      });
      setAdding(false);
      return;
    }

    // Create voucher entry (to track prediction_sets)
    const { data: voucherData, error: voucherError } = await supabase
      .from("pool_vouchers")
      .insert({
        pool_id: poolId,
        code: `PHONE-${Date.now()}`, // Internal reference, not shown
        phone: digits,
        prediction_sets: predictionSets,
        used_by: profile.id,
        used_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (voucherError) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao registrar entrada. Tente novamente.",
      });
      setAdding(false);
      return;
    }

    // Create approved participant
    const { error: participantError } = await supabase
      .from("participants")
      .insert({
        pool_id: poolId,
        user_id: profile.id,
        participant_name: profile.full_name,
        guess_value: "voucher",
        status: "approved",
      });

    if (participantError) {
      // Rollback voucher
      await supabase.from("pool_vouchers").delete().eq("id", voucherData.id);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao adicionar participante. Tente novamente.",
      });
      setAdding(false);
      return;
    }

    // Send WhatsApp notification
    const poolUrl = `https://app-delfos.lovable.app/bolao/${poolSlug || poolId}`;
    const setsLabel = predictionSets > 1 ? `${predictionSets} palpites` : '1 palpite';
    const message = `🎉 *Delfos - Você está no bolão!*\n\n` +
      `Você foi inscrito no bolão *"${poolTitle}"* com *${setsLabel}*.\n\n` +
      `👉 Acesse agora e faça seus palpites:\n${poolUrl}\n\n` +
      `Boa sorte! 🍀`;

    try {
      await supabase.functions.invoke("send-whatsapp", {
        body: { phone: digits, message },
      });
    } catch (err) {
      console.error("WhatsApp notification failed:", err);
      // Don't fail the whole operation if WhatsApp fails
    }

    // Update local state
    setEntries(prev => [voucherData as VoucherEntry, ...prev]);
    setUserNames(prev => ({ ...prev, [profile.id]: profile.full_name }));
    setPhone("");
    setPredictionSets(1);

    toast({
      title: "Participante adicionado! ✅",
      description: `${profile.full_name} foi inscrito com ${setsLabel} e notificado via WhatsApp.`,
    });
    setAdding(false);
  };

  const handleDeleteEntry = async (entry: VoucherEntry) => {
    if (!confirm("Remover este participante do bolão?")) return;

    // Delete participant
    if (entry.used_by) {
      await supabase
        .from("participants")
        .delete()
        .eq("pool_id", poolId)
        .eq("user_id", entry.used_by);
    }

    // Delete voucher entry
    const { error } = await supabase
      .from("pool_vouchers")
      .delete()
      .eq("id", entry.id);

    if (!error) {
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      toast({ title: "Participante removido" });
    }
  };

  const totalEntries = entries.length;
  const totalPredictionSets = entries.reduce((sum, e) => sum + e.prediction_sets, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Ticket className="w-5 h-5 text-primary" />
            Participantes do Bolão
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {totalEntries} inscrito{totalEntries !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {totalPredictionSets} palpite{totalPredictionSets !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Adicione participantes pelo número de telefone. Eles serão notificados automaticamente via WhatsApp.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Phone input */}
        <div className="space-y-2">
          <Label className="text-sm">Telefone do participante</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            placeholder="(11) 99999-9999"
            disabled={isPastCutoff}
          />
        </div>

        {/* Prediction sets selector */}
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
          <Label className="text-sm font-medium whitespace-nowrap">Qtd. de palpites:</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPredictionSets(Math.max(1, predictionSets - 1))}
              disabled={predictionSets <= 1 || isPastCutoff}
            >
              -
            </Button>
            <span className="font-bold text-lg w-8 text-center">{predictionSets}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPredictionSets(predictionSets + 1)}
              disabled={predictionSets >= 10 || isPastCutoff}
            >
              +
            </Button>
          </div>
        </div>

        <Button
          onClick={handleAddParticipant}
          disabled={adding || isPastCutoff || !phone.trim()}
          className="w-full"
          size="sm"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          {adding ? "Adicionando..." : `Adicionar Participante (${predictionSets} palpite${predictionSets > 1 ? 's' : ''})`}
        </Button>

        {isPastCutoff ? (
          <p className="text-xs text-center text-destructive font-medium">
            ⏰ O prazo para adicionar participantes encerrou (30 min antes do prazo de palpites).
          </p>
        ) : cutoffTime && (
          <p className="text-xs text-center text-muted-foreground">
            ⏰ Você pode adicionar participantes até <strong>{format(cutoffTime, "dd/MM 'às' HH:mm", { locale: ptBR })}</strong>
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-2">Carregando...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">
            Nenhum participante adicionado ainda.
          </p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {entries.map(entry => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-primary/5 border-primary/20"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="font-medium text-sm truncate">
                      {entry.used_by && userNames[entry.used_by] ? userNames[entry.used_by] : entry.phone}
                    </span>
                    <Badge variant="outline" className="text-[0.6rem] px-1.5 py-0">
                      {entry.prediction_sets} palpite{entry.prediction_sets > 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <p className="text-[0.6rem] text-muted-foreground mt-0.5">
                    {entry.phone ? `📱 ${formatPhone(entry.phone)}` : ''} · {format(new Date(entry.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteEntry(entry)}
                    title="Remover participante"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VoucherManager;