import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Percent } from "lucide-react";

type FeeType = "percent" | "fixed";

const AdminPlatformSettings = () => {
  const [feeType, setFeeType] = useState<FeeType>("percent");
  const [feePercent, setFeePercent] = useState<string>("0");
  const [feePercentMin, setFeePercentMin] = useState<string>("0");
  const [feeFixed, setFeeFixed] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["delfos_fee_percent", "delfos_fee_fixed", "delfos_fee_type", "delfos_fee_percent_min"]);
    for (const row of data || []) {
      if (row.key === "delfos_fee_percent") setFeePercent(String(row.value ?? 0));
      if (row.key === "delfos_fee_fixed") setFeeFixed(String(row.value ?? 0));
      if (row.key === "delfos_fee_percent_min") setFeePercentMin(String(row.value ?? 0));
      if (row.key === "delfos_fee_type") setFeeType((row.value === "fixed" ? "fixed" : "percent") as FeeType);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (feeType === "percent") {
      const n = Number(feePercent);
      if (isNaN(n) || n < 0 || n > 50) {
        toast({ title: "Valor inválido", description: "A taxa em % deve estar entre 0 e 50.", variant: "destructive" });
        return;
      }
      const min = Number(feePercentMin);
      if (isNaN(min) || min < 0 || min > 1000) {
        toast({ title: "Valor inválido", description: "O valor mínimo deve estar entre R$ 0 e R$ 1000.", variant: "destructive" });
        return;
      }
    } else {
      const n = Number(feeFixed);
      if (isNaN(n) || n < 0 || n > 1000) {
        toast({ title: "Valor inválido", description: "A taxa fixa deve estar entre R$ 0 e R$ 1000.", variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const updates = [
      { key: "delfos_fee_type", value: feeType },
      { key: "delfos_fee_percent", value: Number(feePercent) || 0 },
      { key: "delfos_fee_percent_min", value: Number(feePercentMin) || 0 },
      { key: "delfos_fee_fixed", value: Number(feeFixed) || 0 },
    ];

    let hasError = false;
    for (const upd of updates) {
      const { error } = await supabase
        .from("platform_settings")
        .update({ value: upd.value as any, updated_by: user?.id })
        .eq("key", upd.key);
      if (error) { hasError = true; toast({ title: "Erro", description: error.message, variant: "destructive" }); break; }
    }

    setSaving(false);
    if (!hasError) {
      const desc = feeType === "percent"
        ? `Cobrança em ${Number(feePercent)}% por palpite.`
        : `Cobrança fixa de R$ ${Number(feeFixed).toFixed(2).replace(".", ",")} por palpite.`;
      toast({ title: "Taxa atualizada", description: desc });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5" /> Taxa do app
          </CardTitle>
          <CardDescription>
            Cobrada do participante <strong>por cima</strong> do valor de cada palpite no momento do PIX.
            Esse valor não entra na premiação nem na comissão do organizador — vai direto para a manutenção do app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <div className="space-y-2">
                <Label>Tipo de cobrança</Label>
                <RadioGroup
                  value={feeType}
                  onValueChange={(v) => setFeeType(v as FeeType)}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  <label
                    htmlFor="fee-type-percent"
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      feeType === "percent" ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
                    }`}
                  >
                    <RadioGroupItem value="percent" id="fee-type-percent" className="mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold">Percentual (%)</div>
                      <div className="text-xs text-muted-foreground">
                        Calcula a taxa em cima do valor da entrada. Ex: entrada R$ 10 + 15% = R$ 1,50.
                      </div>
                    </div>
                  </label>
                  <label
                    htmlFor="fee-type-fixed"
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      feeType === "fixed" ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
                    }`}
                  >
                    <RadioGroupItem value="fixed" id="fee-type-fixed" className="mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold">Valor fixo (R$)</div>
                      <div className="text-xs text-muted-foreground">
                        Cobra um valor fixo por palpite, independente da entrada. Ex: R$ 2,00 por palpite.
                      </div>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {feeType === "percent" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fee">Taxa (%)</Label>
                    <Input
                      id="fee"
                      type="number"
                      min={0}
                      max={50}
                      step={0.1}
                      value={feePercent}
                      onChange={(e) => setFeePercent(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Exemplo: entrada R$ 10 + taxa {Number(feePercent) || 0}% = participante paga R$ {(10 + 10 * (Number(feePercent) || 0) / 100).toFixed(2).replace(".", ",")}.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fee-min">Valor mínimo por palpite (R$)</Label>
                    <Input
                      id="fee-min"
                      type="number"
                      min={0}
                      max={1000}
                      step={0.01}
                      value={feePercentMin}
                      onChange={(e) => setFeePercentMin(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Garante que a taxa nunca fique abaixo desse valor por palpite. Ex: taxa {Number(feePercent) || 0}% com mínimo R$ {(Number(feePercentMin) || 0).toFixed(2).replace(".", ",")} → numa entrada de R$ 10, a taxa cobrada será R$ {Math.max(10 * (Number(feePercent) || 0) / 100, Number(feePercentMin) || 0).toFixed(2).replace(".", ",")}.
                      Deixe em 0 para não aplicar mínimo.
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="fee-fixed">Valor fixo por palpite (R$)</Label>
                  <Input
                    id="fee-fixed"
                    type="number"
                    min={0}
                    max={1000}
                    step={0.01}
                    value={feeFixed}
                    onChange={(e) => setFeeFixed(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Exemplo: entrada R$ 10 + taxa fixa R$ {(Number(feeFixed) || 0).toFixed(2).replace(".", ",")} = participante paga R$ {(10 + (Number(feeFixed) || 0)).toFixed(2).replace(".", ",")} por palpite.
                    Para 2 palpites, a taxa é cobrada 2 vezes.
                  </p>
                </div>
              )}

              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPlatformSettings;
