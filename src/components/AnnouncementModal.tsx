import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Users, Zap } from "lucide-react";

const ANNOUNCEMENT_KEY = "delfos_announcement_2026_05_open_beta_v1";

const AnnouncementModal = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(ANNOUNCEMENT_KEY);
    if (!seen) setOpen(true);
  }, []);

  const handleClose = () => {
    localStorage.setItem(ANNOUNCEMENT_KEY, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2">
            <Sparkles className="w-6 h-6" />
          </div>
          <DialogTitle className="text-center text-xl">Novidades no Delfos! 🎉</DialogTitle>
          <DialogDescription className="text-center">
            Após nossa fase de testes, liberamos novas funcionalidades para todo mundo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-sm">Qualquer pessoa pode criar bolões</div>
              <p className="text-sm text-muted-foreground">
                A criação de bolões está liberada para toda a comunidade — basta entrar e começar.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-sm">Pagamento 100% automático via PIX</div>
              <p className="text-sm text-muted-foreground">
                Todos os bolões agora funcionam apenas com pagamento automático no app: nada de comprovantes manuais. A inscrição é confirmada na hora e o repasse dos prêmios é feito por nós.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleClose} className="w-full">Entendi, vamos lá!</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AnnouncementModal;
