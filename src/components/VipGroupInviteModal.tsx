import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface VipGroupInviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  whatsappGroupLink: string;
}

const VipGroupInviteModal = ({ open, onOpenChange, userId, whatsappGroupLink }: VipGroupInviteModalProps) => {
  const handleAccept = async () => {
    await supabase
      .from("profiles")
      .update({ vip_group_accepted: true, vip_group_invited_at: new Date().toISOString() })
      .eq("id", userId);
    window.open(whatsappGroupLink, "_blank");
    onOpenChange(false);
  };

  const handleDecline = async () => {
    await supabase
      .from("profiles")
      .update({ vip_group_accepted: false, vip_group_invited_at: new Date().toISOString() })
      .eq("id", userId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-center">
        <DialogHeader className="items-center">
          <DialogTitle className="text-2xl">🎉 Você já está participando!</DialogTitle>
          <DialogDescription className="text-base leading-relaxed pt-2">
            Quer acompanhar os resultados em tempo real e receber bolões exclusivos antes de todo mundo?
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-4">
          <Button onClick={handleAccept} size="lg" className="text-base">
            🔥 Entrar no Grupo VIP
          </Button>
          <Button variant="ghost" onClick={handleDecline} className="text-muted-foreground text-sm">
            Agora não
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VipGroupInviteModal;
