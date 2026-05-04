import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share, Plus, Smartphone } from "lucide-react";

const STORAGE_KEY = "delfos_install_prompt_dismissed_v1";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  // @ts-expect-error iOS Safari
  window.navigator.standalone === true;

const detectPlatform = () => {
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isAndroid = /Android/.test(ua);
  return { isIOS, isAndroid };
};

export default function InstallAppDialog() {
  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const { isIOS, isAndroid } = detectPlatform();

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    const t = setTimeout(() => setOpen(true), 800);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? dismiss() : setOpen(o))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Smartphone className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Instale o app Delfos</DialogTitle>
          <DialogDescription className="text-center">
            Acesse mais rápido pela tela inicial do seu celular, em tela cheia e sem barra do navegador.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {deferred && (
            <Button onClick={install} className="w-full" size="lg">
              <Download className="mr-2 h-4 w-4" />
              Instalar agora
            </Button>
          )}

          {isIOS && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <p className="font-medium">No iPhone (Safari):</p>
              <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
                <li>Toque em <Share className="inline h-4 w-4 mx-1" /> <strong>Compartilhar</strong></li>
                <li>Escolha <strong>Adicionar à Tela de Início</strong> <Plus className="inline h-4 w-4 mx-1" /></li>
                <li>Confirme em <strong>Adicionar</strong></li>
              </ol>
            </div>
          )}

          {isAndroid && !deferred && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <p className="font-medium">No Android (Chrome):</p>
              <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
                <li>Toque no menu <strong>⋮</strong> no canto superior direito</li>
                <li>Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong></li>
              </ol>
            </div>
          )}

          {!isIOS && !isAndroid && !deferred && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-muted-foreground">
              Abra o Delfos no seu celular para instalar como app.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={dismiss} className="w-full">
            Agora não
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
