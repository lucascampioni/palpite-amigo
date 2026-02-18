import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PixKeyType = "cpf" | "phone" | "email" | "random";

interface PixKeyInputProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  label?: string;
  adminNote?: boolean;
}

const formatCPF = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const detectKeyType = (value: string): PixKeyType | "" => {
  if (!value) return "";
  const clean = value.replace(/\D/g, "");
  if (value.includes("@")) return "email";
  if (clean.length === 11 && value.includes("(")) return "phone";
  if (clean.length === 11 && (value.includes(".") || value.includes("-"))) return "cpf";
  if (/^[a-f0-9-]{32,36}$/i.test(value)) return "random";
  return "";
};

export const PixKeyInput = ({ value, onChange, required, label, adminNote }: PixKeyInputProps) => {
  const [keyType, setKeyType] = useState<PixKeyType | "">(() => detectKeyType(value));

  useEffect(() => {
    if (value && !keyType) {
      setKeyType(detectKeyType(value));
    }
  }, [value]);

  const handleTypeChange = (type: PixKeyType) => {
    setKeyType(type);
    onChange("");
  };

  const handleValueChange = (raw: string) => {
    if (keyType === "cpf") {
      onChange(formatCPF(raw));
    } else if (keyType === "phone") {
      onChange(formatPhone(raw));
    } else {
      onChange(raw);
    }
  };

  const getPlaceholder = () => {
    switch (keyType) {
      case "cpf": return "000.000.000-00";
      case "phone": return "(11) 99999-9999";
      case "email": return "seu@email.com";
      case "random": return "Cole sua chave aleatória";
      default: return "Selecione o tipo acima";
    }
  };

  const getMaxLength = () => {
    switch (keyType) {
      case "cpf": return 14;
      case "phone": return 15;
      case "email": return 100;
      case "random": return 36;
      default: return 100;
    }
  };

  const getInputType = () => {
    if (keyType === "email") return "email";
    return "text";
  };

  return (
    <div className="space-y-3">
      <Label>{label || "Chave PIX"} {required ? "*" : ""}</Label>
      
      <Select value={keyType} onValueChange={(v) => handleTypeChange(v as PixKeyType)}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione o tipo da chave PIX" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="cpf">📋 CPF</SelectItem>
          <SelectItem value="phone">📱 Telefone</SelectItem>
          <SelectItem value="email">📧 E-mail</SelectItem>
          <SelectItem value="random">🔑 Chave aleatória</SelectItem>
        </SelectContent>
      </Select>

      {keyType && (
        <Input
          name="pix_key"
          type={getInputType()}
          value={value}
          onChange={(e) => handleValueChange(e.target.value)}
          placeholder={getPlaceholder()}
          maxLength={getMaxLength()}
          required={required}
          inputMode={keyType === "cpf" || keyType === "phone" ? "numeric" : undefined}
        />
      )}

      {adminNote && (
        <p className="text-xs text-muted-foreground">
          * Obrigatório se houver valor de entrada
        </p>
      )}
    </div>
  );
};
