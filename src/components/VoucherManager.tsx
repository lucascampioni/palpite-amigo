import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Trash2, CheckCircle, UserPlus, AlertCircle, Clock, FileCheck } from "lucide-react";
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
  const [predictionStatus, setPredictionStatus] = useState<Record<string, 'no_predictions' | 'has_predictions'>>({});
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

      // Load names and prediction status for linked users
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

        // Check prediction status for each participant
        const { data: participants } = await supabase
          .from("participants")
          .select("id, user_id")
          .eq("pool_id", poolId)
          .in("user_id", userIds)
          .eq("status", "approved");

        if (participants && participants.length > 0) {
          const participantIds = participants.map(p => p.id);
          const { data: predictions } = await supabase
            .from("football_predictions")
            .select("participant_id")
            .in("participant_id", participantIds);

          const predMap: Record<string, 'no_predictions' | 'has_predictions'> = {};
          const predParticipantIds = new Set(predictions?.map(p => p.participant_id) || []);
          
          participants.forEach(p => {
            predMap[p.user_id] = predParticipantIds.has(p.id) ? 'has_predictions' : 'no_predictions';
          });
          setPredictionStatus(predMap);
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

    // Check if phone already has a voucher for this pool
    const { data: existingVoucher } = await supabase
      .from("pool_vouchers")
      .select("id")
      .eq("pool_id", poolId)
      .eq("phone", digits)
      .maybeSingle();

    if (existingVoucher) {
      toast({
        variant: "destructive",
        title: "Já adicionado",
        description: "Este número já foi adicionado a este bolão.",
      });
      setAdding(false);
      return;
    }

    // Try to find user by phone
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .eq("phone", digits)
      .maybeSingle();

    const hasAccount = !!profile;

    // If user exists, check if already a participant
    if (hasAccount) {
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
    }

    // Create voucher entry
    const { data: voucherData, error: voucherError } = await supabase
      .from("pool_vouchers")
      .insert({
        pool_id: poolId,
        code: `PHONE-${Date.now()}`,
        phone: digits,
        prediction_sets: predictionSets,
        used_by: hasAccount ? profile.id : null,
        used_at: hasAccount ? new Date().toISOString() : null,
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

    // If user has account, create approved participant immediately
    if (hasAccount) {
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
        await supabase.from("pool_vouchers").delete().eq("id", voucherData.id);
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Erro ao adicionar participante. Tente novamente.",
        });
        setAdding(false);
        return;
      }
    }

    // Send WhatsApp notification
    const poolUrl = `https://delfos.app.br/bolao/${poolSlug || poolId}`;
    const setsLabel = predictionSets > 1 ? `${predictionSets} palpites` : '1 palpite';
    const message = hasAccount
      ? `🎉 *Delfos - Você está no bolão!*\n\n` +
        `Você foi inscrito no bolão *"${poolTitle}"* com *${setsLabel}*.\n\n` +
        `👉 Acesse agora e faça seus palpites:\n${poolUrl}\n\n` +
        `Boa sorte! 🍀`
      : `🎉 *Delfos - Você foi inscrito em um bolão!*\n\n` +
        `Você foi adicionado ao bolão *"${poolTitle}"* com *${setsLabel}*.\n\n` +
        `📲 Crie sua conta no Delfos para fazer seus palpites:\n${poolUrl}\n\n` +
        `Ao se cadastrar com este número, você já estará automaticamente no bolão! 🍀`;

    try {
      await supabase.functions.invoke("send-whatsapp", {
        body: { phone: digits, message },
      });
    } catch (err) {
      console.error("WhatsApp notification failed:", err);
    }

    // Update local state
    setEntries(prev => [voucherData as VoucherEntry, ...prev]);
    if (hasAccount) {
      setUserNames(prev => ({ ...prev, [profile.id]: profile.full_name }));
      setPredictionStatus(prev => ({ ...prev, [profile.id]: 'no_predictions' }));
    }
    setPhone("");
    setPredictionSets(1);

    toast({
      title: hasAccount ? "Participante adicionado! ✅" : "Convite enviado! 📲",
      description: hasAccount
        ? `${profile.full_name} foi inscrito com ${setsLabel} e notificado via WhatsApp.`
        : `WhatsApp enviado para ${formatPhone(digits)}. Ao se cadastrar, a pessoa entrará automaticamente no bolão com ${setsLabel}.`,
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

  const getStatusInfo = (entry: VoucherEntry) => {
    if (!entry.used_by) {
      return { icon: <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />, label: "Aguardando cadastro", color: "text-amber-600" };
    }
    const status = predictionStatus[entry.used_by];
    if (status === 'has_predictions') {
      return { icon: <FileCheck className="w-4 h-4 text-green-600 flex-shrink-0" />, label: "Palpite feito ✓", color: "text-green-600" };
    }
    return { icon: <Clock className="w-4 h-4 text-blue-500 flex-shrink-0" />, label: "Pendente palpite", color: "text-blue-600" };
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Ticket className="w-5 h-5 text-primary" />
            Participantes do Bolão
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[0.6rem] sm:text-xs px-1.5">
              {totalEntries} inscrito{totalEntries !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="secondary" className="text-[0.6rem] sm:text-xs px-1.5">
              {totalPredictionSets} palpite{totalPredictionSets !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Adicione participantes pelo telefone. Notificação automática via WhatsApp.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Phone input + prediction sets - responsive layout */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs sm:text-sm">Telefone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(11) 99999-9999"
                disabled={isPastCutoff}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs sm:text-sm">Palpites</Label>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setPredictionSets(Math.max(1, predictionSets - 1))}
                  disabled={predictionSets <= 1 || isPastCutoff}
                >
                  -
                </Button>
                <span className="font-bold text-base w-6 text-center">{predictionSets}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setPredictionSets(predictionSets + 1)}
                  disabled={predictionSets >= 10 || isPastCutoff}
                >
                  +
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={handleAddParticipant}
          disabled={adding || isPastCutoff || !phone.trim()}
          className="w-full"
          size="sm"
        >
          <UserPlus className="w-4 h-4 mr-1.5" />
          {adding ? "Adicionando..." : `Adicionar (${predictionSets} palpite${predictionSets > 1 ? 's' : ''})`}
        </Button>

        {isPastCutoff ? (
          <p className="text-xs text-center text-destructive font-medium">
            ⏰ O prazo para adicionar participantes encerrou (30 min antes do prazo de palpites).
          </p>
        ) : cutoffTime && (
          <p className="text-xs text-center text-muted-foreground">
            ⏰ Até <strong>{format(cutoffTime, "dd/MM 'às' HH:mm", { locale: ptBR })}</strong>
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-2">Carregando...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">
            Nenhum participante adicionado ainda.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {entries.map(entry => {
              const statusInfo = getStatusInfo(entry);
              const isLinked = !!entry.used_by;
              return (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between gap-2 p-2 sm:p-2.5 rounded-lg border ${
                    isLinked && predictionStatus[entry.used_by!] === 'has_predictions'
                      ? "bg-green-500/5 border-green-500/20"
                      : isLinked
                      ? "bg-blue-500/5 border-blue-500/20"
                      : "bg-muted/50 border-dashed border-muted-foreground/30"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {statusInfo.icon}
                      <span className="font-medium text-xs sm:text-sm truncate">
                        {isLinked && userNames[entry.used_by!] ? userNames[entry.used_by!] : formatPhone(entry.phone || '')}
                      </span>
                      <Badge variant="outline" className="text-[0.55rem] sm:text-[0.6rem] px-1 py-0">
                        {entry.prediction_sets}x
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={`text-[0.6rem] font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <span className="text-[0.55rem] text-muted-foreground">
                        · {format(new Date(entry.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                      {isLinked && (
                        <span className="text-[0.55rem] text-muted-foreground">
                          · 📱 {formatPhone(entry.phone || '')}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 sm:h-8 sm:w-8 text-destructive hover:text-destructive flex-shrink-0"
                    onClick={() => handleDeleteEntry(entry)}
                    title="Remover"
                  >
                    <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VoucherManager;
