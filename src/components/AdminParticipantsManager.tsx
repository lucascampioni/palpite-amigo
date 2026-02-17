import { useState } from "react";
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
  onSuccess?: () => void;
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
  onSuccess,
}: AdminParticipantsManagerProps) => {
  const { toast } = useToast();
  const [processing, setProcessing] = useState<string | null>(null);
  const [approvedOpen, setApprovedOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(true);
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingParticipant, setRejectingParticipant] = useState<Participant | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionDetails, setRejectionDetails] = useState("");

  const approved = participants.filter(p => p.status === "approved");
  const pending = participants.filter(p => p.status === "pending");
  const rejected = participants.filter(p => p.status === "rejected");

  const handleApprove = async (participantId: string) => {
    setProcessing(participantId);
    try {
      const { error } = await supabase
        .from("participants")
        .update({ status: "approved", rejection_reason: null, rejection_details: null })
        .eq("id", participantId);
      if (error) throw error;
      toast({ title: "Participante aprovado!", description: "O participante agora pode fazer seus palpites." });
      onSuccess?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao aprovar", description: error.message });
    } finally {
      setProcessing(null);
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
      setRejectDialogOpen(false);
      setRejectingParticipant(null);
      onSuccess?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao rejeitar", description: error.message });
    } finally {
      setProcessing(null);
    }
  };

  const viewProof = async (paymentProof: string) => {
    try {
      const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(paymentProof, 3600);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } catch (error: any) {
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
              <Badge variant="secondary" className="text-xs">
                ✅ {approved.length} aprovado(s)
              </Badge>
              {pending.length > 0 && (
                <Badge className="text-xs bg-orange-500 hover:bg-orange-600">
                  ⏳ {pending.length} pendente(s)
                </Badge>
              )}
              {rejected.length > 0 && (
                <Badge variant="destructive" className="text-xs">
                  ❌ {rejected.length} rejeitado(s)
                </Badge>
              )}
            </div>
          </div>

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
                {approved.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-card border text-sm">
                    <span className="font-medium truncate">{p.participant_name}</span>
                    {p.guess_value && (
                      <Badge variant="outline" className="text-xs ml-2 shrink-0">{p.guess_value}</Badge>
                    )}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Pending List */}
          {pending.length > 0 && (
            <Collapsible open={pendingOpen} onOpenChange={setPendingOpen}>
              <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-lg bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-950 transition-colors">
                <span className="text-sm font-medium text-orange-700 dark:text-orange-400 flex items-center gap-2">
                  ⏳ Pendentes ({pending.length})
                </span>
                {pendingOpen ? <ChevronUp className="w-4 h-4 text-orange-600" /> : <ChevronDown className="w-4 h-4 text-orange-600" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {pending.map((p) => (
                  <div key={p.id} className="p-3 rounded-lg bg-card border space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{p.participant_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(p.created_at).toLocaleDateString("pt-BR")}
                          {!p.payment_proof && " · ⚠️ Sem comprovante"}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {p.payment_proof && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => viewProof(p.payment_proof!)}
                          className="flex-1 h-8 text-xs"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Comprovante
                        </Button>
                      )}
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleApprove(p.id)}
                        disabled={processing === p.id}
                        className="flex-1 h-8 text-xs"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Aprovar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openRejectDialog(p)}
                        disabled={processing === p.id}
                        className="flex-1 h-8 text-xs"
                      >
                        <X className="w-3.5 h-3.5 mr-1" />
                        Rejeitar
                      </Button>
                    </div>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Rejected List */}
          {rejected.length > 0 && (
            <Collapsible open={rejectedOpen} onOpenChange={setRejectedOpen}>
              <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-950 transition-colors">
                <span className="text-sm font-medium text-red-700 dark:text-red-400 flex items-center gap-2">
                  ❌ Rejeitados ({rejected.length})
                </span>
                {rejectedOpen ? <ChevronUp className="w-4 h-4 text-red-600" /> : <ChevronDown className="w-4 h-4 text-red-600" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {rejected.map((p) => (
                  <div key={p.id} className="p-3 rounded-lg bg-card border space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{p.participant_name}</p>
                        {p.rejection_reason && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            Motivo: {p.rejection_reason}
                          </p>
                        )}
                      </div>
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

          {approved.length === 0 && pending.length === 0 && rejected.length === 0 && (
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
    </>
  );
};
