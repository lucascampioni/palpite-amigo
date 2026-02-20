import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Eye, Clock } from "lucide-react";
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

interface PendingParticipant {
  id: string;
  participant_name: string;
  payment_proof: string | null;
  created_at: string;
}

interface AdminPendingParticipantsProps {
  poolId: string;
  participants: PendingParticipant[];
  onSuccess?: () => void;
}

const REJECTION_REASONS = [
  { value: "payment_not_identified", label: "Pagamento não identificado" },
  { value: "wrong_value", label: "Valor incorreto" },
  { value: "wrong_pix_key", label: "PIX enviado para chave errada" },
  { value: "duplicate", label: "Participação duplicada" },
  { value: "other", label: "Outro motivo" },
];

export const AdminPendingParticipants = ({
  poolId,
  participants,
  onSuccess,
}: AdminPendingParticipantsProps) => {
  const { toast } = useToast();
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingParticipant, setRejectingParticipant] = useState<PendingParticipant | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionDetails, setRejectionDetails] = useState("");

  const handleApprove = async (participantId: string) => {
    setProcessing(participantId);

    try {
      const { error } = await supabase
        .from("participants")
        .update({ status: "approved" })
        .eq("id", participantId);

      if (error) throw error;

      toast({
        title: "Participante aprovado!",
        description: "O participante agora pode fazer seus palpites.",
      });

      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error("Error approving participant:", error);
      toast({
        variant: "destructive",
        title: "Erro ao aprovar",
        description: error.message,
      });
    } finally {
      setProcessing(null);
    }
  };

  const openRejectDialog = (participant: PendingParticipant) => {
    setRejectingParticipant(participant);
    setRejectionReason("");
    setRejectionDetails("");
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectingParticipant) return;
    if (!rejectionReason) {
      toast({
        variant: "destructive",
        title: "Selecione um motivo",
        description: "É obrigatório selecionar o motivo da reprovação.",
      });
      return;
    }
    if (!rejectionDetails.trim()) {
      toast({
        variant: "destructive",
        title: "Detalhes obrigatórios",
        description: "É obrigatório descrever mais detalhes sobre o motivo.",
      });
      return;
    }

    setProcessing(rejectingParticipant.id);

    try {
      const reasonLabel = REJECTION_REASONS.find(r => r.value === rejectionReason)?.label || rejectionReason;

      // If payment not identified, reset to pending (awaiting new proof)
      const isPaymentIssue = rejectionReason === "payment_not_identified";
      const newStatus = isPaymentIssue ? "pending" : "rejected";

      const updateData: any = {
        status: newStatus,
        rejection_reason: reasonLabel,
        rejection_details: rejectionDetails.trim(),
      };

      // If it's a payment issue, clear the proof so they can resend
      if (isPaymentIssue) {
        updateData.payment_proof = null;
      }

      const { error } = await supabase
        .from("participants")
        .update(updateData)
        .eq("id", rejectingParticipant.id);

      if (error) throw error;

      toast({
        title: isPaymentIssue ? "Pagamento recusado" : "Participante rejeitado",
        description: isPaymentIssue
          ? "O participante poderá enviar um novo comprovante."
          : "O participante foi informado do motivo.",
      });

      setRejectDialogOpen(false);
      setRejectingParticipant(null);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error("Error rejecting participant:", error);
      toast({
        variant: "destructive",
        title: "Erro ao rejeitar",
        description: error.message,
      });
    } finally {
      setProcessing(null);
    }
  };

  const viewProof = async (paymentProof: string) => {
    try {
      const { data } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(paymentProof, 3600);

      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }
    } catch (error: any) {
      console.error("Error viewing proof:", error);
      toast({
        variant: "destructive",
        title: "Erro ao visualizar comprovante",
        description: error.message,
      });
    }
  };

  if (participants.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="border-2 border-orange-500/20">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            Participações Pendentes de Aprovação ({participants.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {participants.map((participant) => (
            <div
              key={participant.id}
              className="p-4 rounded-lg border bg-card space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{participant.participant_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Solicitado em{" "}
                    {new Date(participant.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={participant.payment_proof
                    ? "text-blue-600 border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                    : "text-orange-500 border-orange-500"
                  }
                >
                  {participant.payment_proof ? "✅ Comprovante enviado" : "⏳ Aguardando comprovante"}
                </Badge>
              </div>

              {participant.payment_proof ? (
                <>
                  <button
                    onClick={() => viewProof(participant.payment_proof!)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-blue-500/30 bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/40 transition-colors text-left"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        Ver comprovante de pagamento
                      </p>
                      <p className="text-xs text-blue-500 dark:text-blue-400">
                        Toque para visualizar o arquivo enviado
                      </p>
                    </div>
                  </button>

                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleApprove(participant.id)}
                      disabled={processing === participant.id}
                      className="flex-1"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Aprovar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openRejectDialog(participant)}
                      disabled={processing === participant.id}
                      className="flex-1"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Rejeitar
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground text-center py-1">
                    ⏳ Será rejeitado automaticamente se não enviar o comprovante no prazo
                  </p>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleApprove(participant.id)}
                    disabled={processing === participant.id}
                    className="w-full"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Aprovar mesmo assim
                  </Button>
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Rejection Reason Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar participação</DialogTitle>
            <DialogDescription>
              Informe o motivo da reprovação de{" "}
              <strong>{rejectingParticipant?.participant_name}</strong>. O
              participante será notificado.
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
                placeholder="Descreva mais detalhes sobre o motivo da reprovação..."
                value={rejectionDetails}
                onChange={(e) => setRejectionDetails(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {rejectionDetails.length}/500 caracteres
              </p>
            </div>

            {rejectionReason === "payment_not_identified" && (
              <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30 text-sm">
                <p className="font-medium text-orange-600 dark:text-orange-400">
                  ⚠️ Pagamento não identificado
                </p>
                <p className="text-muted-foreground mt-1">
                  O participante voltará ao status de "Pagamento Pendente" e
                  poderá enviar um novo comprovante.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={processing === rejectingParticipant?.id}
            >
              Confirmar Reprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
