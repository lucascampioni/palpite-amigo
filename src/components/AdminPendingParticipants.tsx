import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Eye, Clock } from "lucide-react";

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

export const AdminPendingParticipants = ({
  poolId,
  participants,
  onSuccess
}: AdminPendingParticipantsProps) => {
  const { toast } = useToast();
  const [processing, setProcessing] = useState<string | null>(null);

  const handleApprove = async (participantId: string) => {
    setProcessing(participantId);
    
    try {
      const { error } = await supabase
        .from('participants')
        .update({ status: 'approved' })
        .eq('id', participantId);

      if (error) throw error;

      toast({
        title: "Participante aprovado!",
        description: "O participante agora pode fazer seus palpites.",
      });

      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Error approving participant:', error);
      toast({
        variant: "destructive",
        title: "Erro ao aprovar",
        description: error.message,
      });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (participantId: string) => {
    setProcessing(participantId);
    
    try {
      const { error } = await supabase
        .from('participants')
        .update({ status: 'rejected' })
        .eq('id', participantId);

      if (error) throw error;

      toast({
        title: "Participante rejeitado",
        description: "O participante foi removido do bolão.",
      });

      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Error rejecting participant:', error);
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
        .from('payment-proofs')
        .createSignedUrl(paymentProof, 3600); // 1 hour expiry

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error: any) {
      console.error('Error viewing proof:', error);
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
                  Solicitado em {new Date(participant.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <Badge variant="outline" className="text-orange-500 border-orange-500">
                Pendente
              </Badge>
            </div>

            {participant.payment_proof && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => viewProof(participant.payment_proof!)}
                className="w-full"
              >
                <Eye className="w-4 h-4 mr-2" />
                Ver Comprovante
              </Button>
            )}

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
                onClick={() => handleReject(participant.id)}
                disabled={processing === participant.id}
                className="flex-1"
              >
                <X className="w-4 h-4 mr-2" />
                Rejeitar
              </Button>
            </div>

            {!participant.payment_proof && (
              <p className="text-xs text-muted-foreground text-center">
                ⚠️ Comprovante ainda não enviado
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
