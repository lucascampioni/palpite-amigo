import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Percent } from "lucide-react";

const AdminPlatformSettings = () => {
  const [feePercent, setFeePercent] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "delfos_fee_percent")
      .maybeSingle();
    if (!error && data) setFeePercent(String(data.value));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const n = Number(feePercent);
    if (isNaN(n) || n < 0 || n > 50) {
      toast({ title: "Valor inválido", description: "A taxa deve estar entre 0 e 50%.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("platform_settings")
      .update({ value: n, updated_by: user?.id })
      .eq("key", "delfos_fee_percent");
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Taxa atualizada", description: `Nova taxa Delfos: ${n}%` });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5" /> Taxa Delfos
          </CardTitle>
          <CardDescription>
            % retida pela Delfos sobre o total arrecadado em bolões com pagamento dentro do app.
            Aplicada antes do cálculo dos prêmios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : (
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
              </div>
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
