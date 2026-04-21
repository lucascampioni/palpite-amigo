import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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
  const [cpf, setCpf] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    const digits = onlyDigits(cpf);
    if (!isValidCpf(digits)) {
      setError("CPF inválido. Verifique e tente novamente.");
      return;
    }
    setError(null);
    onConfirm(digits);
    setCpf("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Informe seu CPF</DialogTitle>
          <DialogDescription>
            O CPF é exigido pela operadora de pagamento (Asaas) para gerar a cobrança PIX. Não armazenamos seu CPF.
          </DialogDescription>
        </DialogHeader>

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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={onlyDigits(cpf).length !== 11}>
            Confirmar e gerar PIX
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CpfPromptDialog;
