import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Copy, Check, Loader2, RefreshCw, CheckCircle2, AlertCircle, Save } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PixKeyInput } from "@/components/PixKeyInput";
import { CpfPromptDialog } from "@/components/CpfPromptDialog";

interface Props {
  participantId?: string;
  participantIds?: string[];
  poolId: string;
  poolTitle: string;
  entryFee: number;
  onSuccess?: () => void;
}

interface Tx {
  id: string;
  status: string;
  asaas_qr_code: string | null;
  asaas_qr_code_base64: string | null;
  asaas_invoice_url: string | null;
  expires_at: string | null;
}

export const InAppPaymentSubmission = ({ participantId, participantIds, poolId, poolTitle, entryFee, onSuccess }: Props) => {
  const ids = participantIds && participantIds.length > 0 ? participantIds : (participantId ? [participantId] : []);
  const primaryId = ids[0];
  const idsKey = ids.join(",");
  const { toast } = useToast();
  const [tx, setTx] = useState<Tx | null>(null);
  const [generating, setGenerating] = useState(false);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasProfilePix, setHasProfilePix] = useState<boolean | null>(null);
  const [profilePixKey, setProfilePixKey] = useState<string | null>(null);
  const [profilePixKeyType, setProfilePixKeyType] = useState<string | null>(null);
  const [newPixKey, setNewPixKey] = useState("");
  const [newPixKeyType, setNewPixKeyType] = useState<string>("");
  const [savingPix, setSavingPix] = useState(false);
  const [editingPix, setEditingPix] = useState(false);
  const [firstMatchDate, setFirstMatchDate] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [cancelling, setCancelling] = useState(false);
  const [cpfDialogOpen, setCpfDialogOpen] = useState(false);

  const cancelPix = async () => {
    if (!tx) return;
    if (!confirm("Tem certeza que deseja cancelar este QR Code? O código atual deixará de ser válido para pagamento.")) return;
    setCancelling(true);
    try {
      const { error } = await supabase.functions.invoke("asaas-cancel-pix", {
        body: { transaction_id: tx.id, pool_id: poolId },
      });
      if (error) throw error;
      setTx(null);
      toast({ title: "QR Code cancelado", description: "Este código PIX não é mais válido. Gere um novo se quiser pagar." });
    } catch (e: any) {
      toast({ title: "Erro ao cancelar", description: e.message, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  // Tick every 30s to keep "expired" check fresh
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Load first valid match date for this pool (payment cutoff = first match kickoff)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("football_matches")
        .select("match_date, status")
        .eq("pool_id", poolId)
        .order("match_date", { ascending: true });
      const first = (data || []).find((m: any) => !["postponed", "cancelled", "abandoned"].includes(m.status));
      if (first) setFirstMatchDate(new Date(first.match_date));
    })();
  }, [poolId]);

  const paymentClosed = !!firstMatchDate && now >= firstMatchDate;
  const formatCutoff = (d: Date) =>
    d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const saveProfilePix = async () => {
    if (!newPixKey.trim() || !newPixKeyType) {
      toast({ title: "Selecione o tipo e digite a chave PIX", variant: "destructive" });
      return;
    }
    setSavingPix(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      const { error } = await supabase
        .from("profiles")
        .update({ pix_key: newPixKey.trim(), pix_key_type: newPixKeyType })
        .eq("id", user.id);
      if (error) throw error;
      setProfilePixKey(newPixKey.trim());
      setProfilePixKeyType(newPixKeyType);
      setHasProfilePix(true);
      setEditingPix(false);
      setNewPixKey("");
      setNewPixKeyType("");
      toast({ title: "Chave PIX salva no seu perfil!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSavingPix(false);
    }
  };

  // Check user profile PIX key
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("pix_key, pix_key_type")
        .eq("id", user.id)
        .maybeSingle();
      const has = !!profile?.pix_key && profile.pix_key.trim().length > 0;
      setHasProfilePix(has);
      setProfilePixKey(profile?.pix_key ?? null);
      setProfilePixKeyType(profile?.pix_key_type ?? null);
    })();
  }, []);

  // Load existing transaction. Approved → mostra confirmação.
  // Pending → só reaproveita se cobrir EXATAMENTE os mesmos participantes solicitados
  // (evita mostrar QR antigo de 1 palpite quando o usuário agora quer pagar 2).
  useEffect(() => {
    if (ids.length === 0) return;
    (async () => {
      // 1) Approved: qualquer transação aprovada de algum desses participantes já confirma
      const { data: approved } = await supabase
        .from("pool_transactions")
        .select("id, status, asaas_qr_code, asaas_qr_code_base64, asaas_invoice_url, expires_at")
        .in("participant_id", ids)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(1);
      if (approved && approved.length > 0) {
        setTx(approved[0] as Tx);
        return;
      }

      // 2) Pending: agrupa por asaas_payment_id e só reaproveita se o grupo cobrir exatamente os mesmos ids
      const { data: pending } = await supabase
        .from("pool_transactions")
        .select("id, status, asaas_qr_code, asaas_qr_code_base64, asaas_invoice_url, expires_at, asaas_payment_id, participant_id, pool_id")
        .eq("pool_id", poolId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      const groups = new Map<string, any[]>();
      for (const row of pending || []) {
        const key = row.asaas_payment_id || row.id;
        const arr = groups.get(key) || [];
        arr.push(row);
        groups.set(key, arr);
      }
      const requestedSet = [...ids].sort().join(",");
      for (const [, rows] of groups) {
        const groupIds = rows.map((r) => r.participant_id).filter(Boolean).sort().join(",");
        if (groupIds === requestedSet) {
          setTx(rows[0] as Tx);
          return;
        }
      }
      // nenhum match exato → não exibe QR antigo; usuário deve gerar um novo
      setTx(null);
    })();
  }, [idsKey, poolId]);

  // Poll for approved status
  useEffect(() => {
    if (!tx || tx.status !== "pending") return;
    setPolling(true);
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("pool_transactions")
        .select("id, status, mp_qr_code, mp_qr_code_base64, mp_ticket_url, expires_at")
        .eq("id", tx.id)
        .maybeSingle();
      if (data) {
        setTx(data as Tx);
        if (data.status === "approved") {
          setPolling(false);
          toast({ title: "Pagamento confirmado!", description: "Você foi aprovado no bolão." });
          onSuccess?.();
        }
      }
    }, 5000);
    return () => { clearInterval(interval); setPolling(false); };
  }, [tx?.id, tx?.status]);

  const generatePix = async () => {
    if (paymentClosed) {
      toast({ title: "Pagamento encerrado", description: "O prazo para pagar este bolão já encerrou.", variant: "destructive" });
      return;
    }
    setCpfDialogOpen(true);
  };

  const generatePixWithCpf = async (cpf: string) => {
    setCpfDialogOpen(false);
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-create-pix", {
        body: { pool_id: poolId, participant_ids: ids, amount: entryFee, cpf },
      });
      if (error) throw error;
      setTx({
        id: data.transaction_id,
        status: "pending",
        mp_qr_code: data.qr_code,
        mp_qr_code_base64: data.qr_code_base64,
        mp_ticket_url: data.ticket_url,
        expires_at: data.expires_at,
      });
      toast({ title: "PIX gerado", description: firstMatchDate ? `Pague até ${formatCutoff(firstMatchDate)}.` : "Pague em até 30 minutos." });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copyPix = async () => {
    if (!tx?.mp_qr_code) return;
    await navigator.clipboard.writeText(tx.mp_qr_code);
    setCopied(true);
    toast({ title: "Código copiado" });
    setTimeout(() => setCopied(false), 2000);
  };

  if (tx?.status === "approved") {
    return (
      <Card className="border-green-500/30 bg-green-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 className="w-5 h-5" /> Pagamento confirmado
          </CardTitle>
          <CardDescription>Sua participação no bolão está aprovada.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Payment window closed (first match already started)
  if (paymentClosed && tx?.status !== "approved") {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive text-base">
            <AlertCircle className="w-5 h-5" /> Pagamento encerrado
          </CardTitle>
          <CardDescription>
            O prazo para pagar este bolão se encerrou no início do primeiro jogo
            {firstMatchDate ? ` (${formatCutoff(firstMatchDate)})` : ""}.
            Não é mais possível gerar ou pagar o PIX.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Inline PIX registration if user has no PIX key in profile
  if (hasProfilePix === false && !tx) {
    return (
      <Card className="border-2 border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            Cadastre sua chave PIX para participar
          </CardTitle>
          <CardDescription>
            Para participar de bolões com pagamento dentro do app, você precisa de uma chave PIX cadastrada.
            Caso você ganhe, é para essa chave que o prêmio será enviado automaticamente. A chave será salva no seu perfil.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <PixKeyInput
            value={newPixKey}
            onChange={setNewPixKey}
            onTypeChange={(t) => setNewPixKeyType(t)}
            label="Sua chave PIX para receber prêmios"
            required
          />
          <Button onClick={saveProfilePix} disabled={savingPix || !newPixKey.trim() || !newPixKeyType} className="w-full">
            {savingPix ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar chave PIX e continuar
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            Prefere editar depois? <Link to="/perfil" className="underline">Abrir perfil completo</Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary" />
          Pagamento via PIX (instantâneo)
        </CardTitle>
        <CardDescription>
          Pague R$ {entryFee.toFixed(2).replace(".", ",")} para confirmar sua participação em <strong>{poolTitle}</strong>.
          {firstMatchDate && (
            <span className="block mt-1 text-primary font-medium">
              ⏰ Pague até {formatCutoff(firstMatchDate)} (início do 1º jogo).
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!tx ? (
          <>
            {profilePixKey && !editingPix && (
              <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
                <div className="text-sm font-semibold text-primary">
                  ✅ Confirme onde você vai receber, caso ganhe
                </div>
                <p className="text-xs text-muted-foreground">
                  Se você for um dos vencedores, o prêmio será enviado automaticamente via PIX para a chave abaixo (cadastrada no seu perfil):
                </p>
                <div className="rounded-md bg-background border p-2.5 flex items-center gap-2 flex-wrap">
                  {profilePixKeyType && (
                    <span className="inline-block bg-primary/15 text-primary rounded px-2 py-0.5 text-[11px] font-medium uppercase">
                      {profilePixKeyType}
                    </span>
                  )}
                  <span className="font-mono text-xs break-all">{profilePixKey}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Não é essa?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setNewPixKey(profilePixKey || "");
                      setNewPixKeyType(profilePixKeyType || "");
                      setEditingPix(true);
                    }}
                    className="underline font-medium text-primary"
                  >
                    Atualizar chave PIX aqui
                  </button>
                </p>
              </div>
            )}
            {editingPix && (
              <div className="rounded-lg border-2 border-primary/40 bg-background p-3 space-y-3">
                <div className="text-sm font-semibold text-primary">Atualizar chave PIX</div>
                <PixKeyInput
                  value={newPixKey}
                  onChange={setNewPixKey}
                  onTypeChange={(t) => setNewPixKeyType(t)}
                  label="Nova chave PIX"
                  required
                />
                <div className="flex gap-2">
                  <Button
                    onClick={saveProfilePix}
                    disabled={savingPix || !newPixKey.trim() || !newPixKeyType}
                    className="flex-1"
                  >
                    {savingPix ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Salvar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setEditingPix(false); setNewPixKey(""); setNewPixKeyType(""); }}
                    disabled={savingPix}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
            <Button onClick={generatePix} disabled={generating || hasProfilePix === null || editingPix || paymentClosed} className="w-full">
              {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
              Gerar QR Code PIX
            </Button>
          </>
        ) : (
          <>
            {tx.mp_qr_code_base64 && (
              <div className="flex justify-center bg-white p-4 rounded-lg">
                <img
                  src={`data:image/png;base64,${tx.mp_qr_code_base64}`}
                  alt="QR Code PIX"
                  className="w-56 h-56"
                />
              </div>
            )}
            {tx.mp_qr_code && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">Ou copie o código PIX:</p>
                <div className="bg-background border rounded-lg p-3">
                  <p className="font-mono text-xs break-all select-all">{tx.mp_qr_code}</p>
                </div>
                <Button onClick={copyPix} variant="outline" size="sm" className="w-full">
                  {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                  {copied ? "Copiado!" : "Copiar código PIX"}
                </Button>
              </div>
            )}
            <Alert>
              <AlertDescription className="text-xs">
                {polling ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Aguardando confirmação automática do pagamento...
                  </span>
                ) : (
                  "Após o pagamento, sua participação será aprovada automaticamente."
                )}
              </AlertDescription>
            </Alert>
            <Button
              onClick={cancelPix}
              variant="outline"
              size="sm"
              disabled={cancelling}
              className="w-full text-destructive hover:text-destructive"
            >
              {cancelling ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
              Cancelar este QR Code
            </Button>
          </>
        )}
      </CardContent>
      <CpfPromptDialog open={cpfDialogOpen} onOpenChange={setCpfDialogOpen} onConfirm={generatePixWithCpf} />
    </Card>
  );
};
