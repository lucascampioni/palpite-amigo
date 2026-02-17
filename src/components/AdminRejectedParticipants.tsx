import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, XCircle } from "lucide-react";

interface RejectedParticipant {
  id: string;
  participant_name: string;
  rejection_reason: string | null;
  rejection_details: string | null;
  created_at: string;
}

interface AdminRejectedParticipantsProps {
  poolId: string;
  participants: RejectedParticipant[];
  onSuccess?: () => void;
}

export const AdminRejectedParticipants = ({
  poolId,
  participants,
  onSuccess,
}: AdminRejectedParticipantsProps) => {
  const { toast } = useToast();
  const [processing, setProcessing] = useState<string | null>(null);

  const handleApprove = async (participantId: string) => {
    setProcessing(participantId);

    try {
      const { error } = await supabase
        .from("participants")
        .update({
          status: "approved" as any,
          rejection_reason: null,
          rejection_details: null,
        })
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

  if (participants.length === 0) {
    return null;
  }

  return (
    <Card className="border-2 border-destructive/20">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <XCircle className="w-5 h-5 text-destructive" />
          Participações Reprovadas ({participants.length})
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
                  Reprovado em{" "}
                  {new Date(participant.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <Badge
                variant="outline"
                className="text-destructive border-destructive"
              >
                Reprovado
              </Badge>
            </div>

            {participant.rejection_reason && (
              <div className="text-sm space-y-1 p-3 rounded-lg bg-destructive/5 border border-destructive/10">
                <p><strong>Motivo:</strong> {participant.rejection_reason}</p>
                {participant.rejection_details && (
                  <p className="text-muted-foreground">{participant.rejection_details}</p>
                )}
              </div>
            )}

            <Button
              variant="default"
              size="sm"
              onClick={() => handleApprove(participant.id)}
              disabled={processing === participant.id}
              className="w-full"
            >
              <Check className="w-4 h-4 mr-2" />
              Aprovar Participação
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
