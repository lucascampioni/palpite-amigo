import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface MaskedPixKeyProps {
  pixKey: string;
  pixKeyType: string;
  participantId: string;
  poolId: string;
}

const maskPixKey = (key: string, type: string): string => {
  if (!key) return "";
  
  switch (type) {
    case "email":
      const [user, domain] = key.split("@");
      if (user && domain) {
        return `${"*".repeat(Math.max(user.length - 2, 1))}${user.slice(-2)}@${domain}`;
      }
      return key;
    
    case "phone":
      if (key.length >= 4) {
        return `${"*".repeat(key.length - 4)}${key.slice(-4)}`;
      }
      return key;
    
    case "cpf":
    case "cnpj":
      if (key.length >= 4) {
        return `${"*".repeat(key.length - 4)}${key.slice(-4)}`;
      }
      return key;
    
    case "random":
      if (key.length >= 8) {
        return `${key.slice(0, 4)}${"*".repeat(key.length - 8)}${key.slice(-4)}`;
      }
      return key;
    
    default:
      return key;
  }
};

export function MaskedPixKey({ pixKey, pixKeyType, participantId, poolId }: MaskedPixKeyProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { toast } = useToast();

  const handleReveal = async () => {
    setShowConfirmDialog(false);
    setIsRevealed(true);

    // Log the access
    try {
      await supabase.from("pix_key_access_logs").insert({
        participant_id: participantId,
        pool_id: poolId,
        accessed_by: (await supabase.auth.getUser()).data.user?.id,
      });
    } catch (error) {
      console.error("Error logging PIX key access:", error);
    }

    toast({
      title: "Chave PIX revelada",
      description: "O acesso foi registrado nos logs de auditoria.",
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pixKey);
      toast({
        title: "Copiado!",
        description: "Chave PIX copiada para a área de transferência",
      });
    } catch (error) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar a chave PIX",
        variant: "destructive",
      });
    }
  };

  const displayKey = isRevealed ? pixKey : maskPixKey(pixKey, pixKeyType);
  const typeLabel = {
    email: "E-mail",
    phone: "Telefone",
    cpf: "CPF",
    cnpj: "CNPJ",
    random: "Aleatória"
  }[pixKeyType] || pixKeyType;

  return (
    <>
      <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-1">Chave PIX ({typeLabel})</p>
          <p className="font-mono text-sm">{displayKey}</p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => isRevealed ? setIsRevealed(false) : setShowConfirmDialog(true)}
            title={isRevealed ? "Ocultar chave" : "Revelar chave"}
          >
            {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          {isRevealed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              title="Copiar chave"
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revelar Chave PIX?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação será registrada nos logs de auditoria. A chave PIX completa será exibida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReveal}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
