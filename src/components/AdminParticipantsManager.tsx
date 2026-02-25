import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Eye, ChevronDown, ChevronUp, Users } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Participant {
  id: string;
  participant_name: string;
  payment_proof: string | null;
  created_at: string;
  status: string;
  guess_value?: string;
  rejection_reason?: string | null;
  rejection_details?: string | null;
}

interface AdminParticipantsManagerProps {
  poolId: string;
  participants: Participant[];
  onParticipantUpdate: (id: string, changes: Partial<Participant>) => void;
  onSuccess?: () => void;
  entryFee?: number | null;
  firstMatchDate?: Date | null;
}

const REJECTION_REASONS = [
  { value: "payment_not_identified", label: "Pagamento não identificado" },
  { value: "wrong_value", label: "Valor incorreto" },
  { value: "wrong_pix_key", label: "PIX enviado para chave errada" },
  { value: "duplicate", label: "Participação duplicada" },
  { value: "other", label: "Outro motivo" },
];

export const AdminParticipantsManager = ({
  poolId,
  participants,
  onParticipantUpdate,
  onSuccess,
  entryFee,
  firstMatchDate,
}: AdminParticipantsManagerProps) => {
  const { toast } = useToast();
  const [processing, setProcessing] = useState<string | null>(null);
  const [approvedOpen, setApprovedOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingParticipant, setRejectingParticipant] = useState<Participant | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionDetails, setRejectionDetails] = useState("");
  const [approveWarningOpen, setApproveWarningOpen] = useState(false);
  const [approvingParticipantId, setApprovingParticipantId] = useState<string | null>(null);
  const [predictionCounts, setPredictionCounts] = useState<Record<string, number>>({});

  const approved = participants.filter(p => p.status === "approved");
  const pending = participants.filter(p => p.status === "pending");
  const rejected = participants.filter(p => p.status === "rejected");
  const fee = entryFee ? parseFloat(String(entryFee)) : 0;

  // After the first match starts, pending without proof are definitively blocked
  const firstMatchStarted = firstMatchDate ? new Date() >= firstMatchDate : false;
  const definitelyRejected = firstMatchStarted 
    ? pending.filter(p => !p.payment_proof) 
    : [];
  const actualPending = firstMatchStarted 
    ? pending.filter(p => !!p.payment_proof) 
    : pending;

  // Load prediction set counts for all participants
  useEffect(() => {
    const loadPredictionCounts = async () => {
      const ids = participants.map(p => p.id);
      if (ids.length === 0) return;
      const { data } = await supabase
        .from("football_predictions")
        .select("participant_id, prediction_set")
        .in("participant_id", ids);
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((row: any) => {
          const ps = row.prediction_set || 1;
          counts[row.participant_id] = Math.max(counts[row.participant_id] || 0, ps);
        });
        setPredictionCounts(counts);
      }
    };
    loadPredictionCounts();
  }, [participants]);

  // Auto-reject participants without proof once first match starts
  useEffect(() => {
    const autoReject = async () => {
      if (!firstMatchStarted || definitelyRejected.length === 0) return;
      const idsToReject = definitelyRejected.map(p => p.id);
      const { error } = await supabase
        .from("participants")
        .update({
          status: "rejected" as any,
          rejection_reason: "Prazo expirado",
          rejection_details: "Não enviou comprovante de pagamento antes do início dos jogos.",
        })
        .in("id", idsToReject)
        .eq("status", "pending" as any);
      if (!error) {
        idsToReject.forEach(id => {
          onParticipantUpdate(id, {
            status: "rejected",
            rejection_reason: "Prazo expirado",
            rejection_details: "Não enviou comprovante de pagamento antes do início dos jogos.",
          });
        });
      }
    };
    autoReject();
  }, [firstMatchStarted]);

  const handleApproveClick = (participant: Participant) => {
    if (!participant.payment_proof) {
      setApprovingParticipantId(participant.id);
      setApproveWarningOpen(true);
    } else {
      handleApprove(participant.id);
    }
  };

  const handleApprove = async (participantId: string) => {
    // Block approval if first match started and participant has no proof
    const participant = participants.find(p => p.id === participantId);
    if (firstMatchStarted && participant && !participant.payment_proof) {
      toast({
        variant: "destructive",
        title: "Aprovação bloqueada",
        description: "O primeiro jogo já começou. Participantes sem comprovante não podem mais ser aprovados.",
      });
      return;
    }

    setProcessing(participantId);
    try {
      const { error } = await supabase
        .from("participants")
        .update({ status: "approved", rejection_reason: null, rejection_details: null })
        .eq("id", participantId);
      if (error) throw error;
      toast({ title: "Participante aprovado!" });
      onParticipantUpdate(participantId, { status: "approved", rejection_reason: null, rejection_details: null });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao aprovar", description: error.message });
    } finally {
      setProcessing(null);
      setApproveWarningOpen(false);
      setApprovingParticipantId(null);
    }
  };

  const openRejectDialog = (participant: Participant) => {
    setRejectingParticipant(participant);
    setRejectionReason("");
    setRejectionDetails("");
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectingParticipant) return;
    if (!rejectionReason) {
      toast({ variant: "destructive", title: "Selecione um motivo", description: "É obrigatório selecionar o motivo da reprovação." });
      return;
    }
    if (!rejectionDetails.trim()) {
      toast({ variant: "destructive", title: "Detalhes obrigatórios", description: "É obrigatório descrever mais detalhes sobre o motivo." });
      return;
    }

    setProcessing(rejectingParticipant.id);
    try {
      const reasonLabel = REJECTION_REASONS.find(r => r.value === rejectionReason)?.label || rejectionReason;
      const isPaymentIssue = rejectionReason === "payment_not_identified";
      const newStatus = isPaymentIssue ? "pending" : "rejected";
      const updateData: any = {
        status: newStatus,
        rejection_reason: reasonLabel,
        rejection_details: rejectionDetails.trim(),
      };
      if (isPaymentIssue) updateData.payment_proof = null;

      const { error } = await supabase
        .from("participants")
        .update(updateData)
        .eq("id", rejectingParticipant.id);
      if (error) throw error;

      toast({
        title: isPaymentIssue ? "Pagamento recusado" : "Participante rejeitado",
        description: isPaymentIssue ? "O participante poderá enviar um novo comprovante." : "O participante foi informado do motivo.",
      });
      onParticipantUpdate(rejectingParticipant.id, updateData);
      setRejectDialogOpen(false);
      setRejectingParticipant(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao rejeitar", description: error.message });
    } finally {
      setProcessing(null);
    }
  };

  const viewProof = async (paymentProof: string) => {
    const newWindow = window.open("", "_blank");
    try {
      const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(paymentProof, 3600);
      if (data?.signedUrl && newWindow) {
        newWindow.location.href = data.signedUrl;
      } else {
        newWindow?.close();
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível gerar o link do comprovante." });
      }
    } catch (error: any) {
      newWindow?.close();
      toast({ variant: "destructive", title: "Erro ao visualizar comprovante", description: error.message });
    }
  };

  return (
    <>
      <Card className="border">
        <CardContent className="p-4 space-y-3">
          {/* Summary header */}
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-primary" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">Participantes</span>
              <span className="text-xs text-muted-foreground">
                {approved.length} aprovado(s){actualPending.length > 0 && ` · ${actualPending.length} pendente(s)`}{(rejected.length + definitelyRejected.length) > 0 && ` · ${rejected.length + definitelyRejected.length} rejeitado(s)`}
              </span>
            </div>
          </div>

          {/* Pending List */}
          {actualPending.length > 0 && (
            <Collapsible open={pendingOpen} onOpenChange={setPendingOpen}>
              <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-lg bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-950 transition-colors">
                <span className="text-sm font-medium text-orange-700 dark:text-orange-400 flex items-center gap-2">
                  ⏳ Pendentes ({actualPending.length})
                </span>
                {pendingOpen ? <ChevronUp className="w-4 h-4 text-orange-600" /> : <ChevronDown className="w-4 h-4 text-orange-600" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1">
                {actualPending.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-card border text-sm gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium truncate block">{p.participant_name}</span>
                      {predictionCounts[p.id] && predictionCounts[p.id] > 1 && (
                        <span className="text-[11px] font-semibold text-primary">
                          {predictionCounts[p.id]} palpites{fee > 0 ? ` · R$ ${(fee * predictionCounts[p.id]).toFixed(2).replace('.', ',')}` : ''}
                        </span>
                      )}
                      {predictionCounts[p.id] && predictionCounts[p.id] === 1 && fee > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          1 palpite · R$ {fee.toFixed(2).replace('.', ',')}
                        </span>
                      )}
                      {p.payment_proof ? (
                        <span className="text-[11px] text-blue-500 dark:text-blue-400">✅ Comprovante enviado</span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">⏳ Sem comprovante</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {p.payment_proof && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => viewProof(p.payment_proof!)}
                          className="h-7 w-7"
                          title="Ver comprovante"
                        >
                          <Eye className="w-4 h-4 text-blue-500" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleApproveClick(p)}
                        disabled={processing === p.id}
                        className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                        title="Aprovar"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      {p.payment_proof && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openRejectDialog(p)}
                          disabled={processing === p.id}
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Rejeitar"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Approved List */}
          {approved.length > 0 && (
            <Collapsible open={approvedOpen} onOpenChange={setApprovedOpen}>
              <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-950 transition-colors">
                <span className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-2">
                  ✅ Aprovados ({approved.length})
                </span>
                {approvedOpen ? <ChevronUp className="w-4 h-4 text-green-600" /> : <ChevronDown className="w-4 h-4 text-green-600" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1">
                {approved.map((p) => {
                  const count = predictionCounts[p.id] || 1;
                  const totalValue = fee > 0 ? fee * count : 0;
                  return (
                    <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-card border text-sm">
                      <span className="font-medium truncate">{p.participant_name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {p.payment_proof && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => viewProof(p.payment_proof!)}
                            className="h-7 w-7"
                            title="Ver comprovante"
                          >
                            <Eye className="w-4 h-4 text-blue-500" />
                          </Button>
                        )}
                        <Badge variant="outline" className="text-xs ml-2 shrink-0">
                          {count} {count === 1 ? 'palpite' : 'palpites'}
                          {totalValue > 0 ? ` · R$ ${totalValue.toFixed(2).replace('.', ',')}` : ''}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Rejected List (includes definitively rejected) */}
          {(rejected.length + definitelyRejected.length) > 0 && (
            <Collapsible open={rejectedOpen} onOpenChange={setRejectedOpen}>
              <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-950 transition-colors">
                <span className="text-sm font-medium text-red-700 dark:text-red-400 flex items-center gap-2">
                  ❌ Rejeitados ({rejected.length + definitelyRejected.length})
                </span>
                {rejectedOpen ? <ChevronUp className="w-4 h-4 text-red-600" /> : <ChevronDown className="w-4 h-4 text-red-600" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {/* Definitively rejected (no proof + match started) */}
                {definitelyRejected.map((p) => (
                  <div key={p.id} className="p-3 rounded-lg bg-card border space-y-1">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.participant_name}</p>
                      <p className="text-[11px] text-destructive">
                        🚫 Reprovado — não enviou comprovante antes do início dos jogos
                      </p>
                    </div>
                  </div>
                ))}
                {/* Manually rejected */}
                {rejected.map((p) => (
                  <div key={p.id} className="p-3 rounded-lg bg-card border space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{p.participant_name}</p>
                        {p.rejection_reason && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            Motivo: {p.rejection_reason}
                          </p>
                        )}
                        {p.rejection_details && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            {p.rejection_details}
                          </p>
                        )}
                      </div>
                      {p.payment_proof && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => viewProof(p.payment_proof!)}
                          className="h-7 w-7 shrink-0"
                          title="Ver comprovante"
                        >
                          <Eye className="w-4 h-4 text-blue-500" />
                        </Button>
                      )}
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleApprove(p.id)}
                      disabled={processing === p.id}
                      className="w-full h-8 text-xs"
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Aprovar Participação
                    </Button>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {approved.length === 0 && actualPending.length === 0 && rejected.length === 0 && definitelyRejected.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              Nenhum participante ainda.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Rejection Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar participação</DialogTitle>
            <DialogDescription>
              Informe o motivo da reprovação de <strong>{rejectingParticipant?.participant_name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo da reprovação *</Label>
              <Select value={rejectionReason} onValueChange={setRejectionReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {REJECTION_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Detalhes *</Label>
              <Textarea
                placeholder="Descreva mais detalhes..."
                value={rejectionDetails}
                onChange={(e) => setRejectionDetails(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">{rejectionDetails.length}/500</p>
            </div>
            {rejectionReason === "payment_not_identified" && (
              <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30 text-sm">
                <p className="font-medium text-orange-600 dark:text-orange-400">⚠️ Pagamento não identificado</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  O participante voltará ao status "Pagamento Pendente" e poderá enviar um novo comprovante.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRejectConfirm} disabled={processing === rejectingParticipant?.id}>
              Confirmar Reprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve without proof warning */}
      <Dialog open={approveWarningOpen} onOpenChange={setApproveWarningOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>⚠️ Aprovar sem comprovante</DialogTitle>
            <DialogDescription>
              Este participante ainda não enviou o comprovante de pagamento. Tem certeza que deseja aprová-lo mesmo assim?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setApproveWarningOpen(false); setApprovingParticipantId(null); }}>Cancelar</Button>
            <Button onClick={() => approvingParticipantId && handleApprove(approvingParticipantId)} disabled={processing === approvingParticipantId}>
              Sim, aprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
