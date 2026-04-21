import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (cpf: string) => void;
}

const onlyDigits = (s: string) => s.replace(/\D/g, "");
const formatCpf = (s: string) => {
  const d = onlyDigits(s).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};
const maskCpf = (cpf: string) => {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return formatCpf(cpf);
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
};

const isValidCpf = (cpf: string) => {
  const d = onlyDigits(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev >= 10) rev = 0;
  if (rev !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev >= 10) rev = 0;
  return rev === parseInt(d[10]);
};

export const CpfPromptDialog = ({ open, onOpenChange, onConfirm }: Props) => {
  const [savedCpf, setSavedCpf] = useState<string | null>(null);
  const [useOther, setUseOther] = useState(false);
  const [cpf, setCpf] = useState("");
  const [save, setSave] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("cpf").eq("id", user.id).maybeSingle();
      const c = data?.cpf ? onlyDigits(data.cpf) : null;
      setSavedCpf(c && c.length === 11 ? c : null);
      setUseOther(false);
      setCpf("");
      setError(null);
    })();
  }, [open]);

  const handleConfirm = async () => {
    let digits: string;
    if (savedCpf && !useOther) {
      digits = savedCpf;
    } else {
      digits = onlyDigits(cpf);
      if (!isValidCpf(digits)) {
        setError("CPF inválido. Verifique e tente novamente.");
        return;
      }
      if (save) {
        setLoading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from("profiles").update({ cpf: digits }).eq("id", user.id);
          }
        } finally {
          setLoading(false);
        }
      }
    }
    setError(null);
    onConfirm(digits);
    setCpf("");
  };

  const showInput = !savedCpf || useOther;
  const canConfirm = showInput ? onlyDigits(cpf).length === 11 : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>CPF do pagador</DialogTitle>
          <DialogDescription>
            O CPF é exigido pela operadora de pagamento (Asaas) para gerar a cobrança PIX.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {savedCpf && !useOther && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs text-muted-foreground">CPF salvo no seu perfil</p>
              <p className="font-mono text-sm">{maskCpf(savedCpf)}</p>
              <Button variant="link" size="sm" className="px-0 h-auto" onClick={() => setUseOther(true)}>
                Usar outro CPF para este pagamento
              </Button>
            </div>
          )}

          {showInput && (
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={formatCpf(cpf)}
                onChange={(e) => setCpf(e.target.value)}
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex items-center gap-2 pt-1">
                <Checkbox id="save-cpf" checked={save} onCheckedChange={(v) => setSave(!!v)} />
                <Label htmlFor="save-cpf" className="text-sm font-normal cursor-pointer">
                  Salvar este CPF no meu perfil para próximas vezes
                </Label>
              </div>
              {savedCpf && (
                <Button variant="link" size="sm" className="px-0 h-auto" onClick={() => setUseOther(false)}>
                  Voltar a usar o CPF salvo
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || loading}>
            Confirmar e gerar PIX
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CpfPromptDialog;
