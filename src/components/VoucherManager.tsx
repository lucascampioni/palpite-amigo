import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Copy, Share2, Plus, Trash2, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Voucher {
  id: string;
  code: string;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
  prediction_sets: number;
}

interface VoucherManagerProps {
  poolId: string;
  poolTitle: string;
  poolSlug?: string;
}

const generateVoucherCode = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const VoucherManager = ({ poolId, poolTitle, poolSlug }: VoucherManagerProps) => {
  const { toast } = useToast();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [usedByNames, setUsedByNames] = useState<Record<string, string>>({});
  const [newVoucherSets, setNewVoucherSets] = useState(1);

  useEffect(() => {
    loadVouchers();
  }, [poolId]);

  const loadVouchers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pool_vouchers")
      .select("*")
      .eq("pool_id", poolId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setVouchers(data as Voucher[]);

      // Load names for used vouchers
      const usedUserIds = data.filter(v => v.used_by).map(v => v.used_by!);
      if (usedUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", usedUserIds);

        if (profiles) {
          const nameMap: Record<string, string> = {};
          profiles.forEach(p => { nameMap[p.id] = p.full_name; });
          setUsedByNames(nameMap);
        }
      }
    }
    setLoading(false);
  };

  const handleGenerateVoucher = async () => {
    setGenerating(true);
    const code = generateVoucherCode();

    const { data, error } = await supabase
      .from("pool_vouchers")
      .insert({ pool_id: poolId, code, prediction_sets: newVoucherSets })
      .select()
      .single();

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao gerar voucher. Tente novamente.",
      });
    } else if (data) {
      setVouchers(prev => [data as Voucher, ...prev]);
      toast({
        title: "Voucher gerado! 🎫",
        description: `Código: ${code} (${newVoucherSets} palpite${newVoucherSets > 1 ? 's' : ''})`,
      });
    }
    setGenerating(false);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "Código copiado!",
      description: code,
    });
  };

  const handleShareWhatsApp = (code: string) => {
    const poolUrl = `https://app-delfos.lovable.app/bolao/${poolSlug || poolId}`;
    const setsLabel = newVoucherSets > 1 ? ` (${newVoucherSets} palpites)` : '';
    const message = encodeURIComponent(
      `🎫 *Voucher para o Bolão "${poolTitle}"*\n\n` +
      `Seu código de entrada: *${code}*${setsLabel}\n\n` +
      `Para participar:\n` +
      `1️⃣ Acesse o bolão: ${poolUrl}\n` +
      `2️⃣ Insira o código do voucher\n` +
      `3️⃣ Faça seus palpites!\n\n` +
      `Boa sorte! 🍀`
    );
    window.open(`https://wa.me/?text=${message}`, "_blank");
  };

  const handleDeleteVoucher = async (voucherId: string) => {
    if (!confirm("Excluir este voucher?")) return;

    const { error } = await supabase
      .from("pool_vouchers")
      .delete()
      .eq("id", voucherId);

    if (!error) {
      setVouchers(prev => prev.filter(v => v.id !== voucherId));
      toast({ title: "Voucher excluído" });
    }
  };

  const availableCount = vouchers.filter(v => !v.used_by).length;
  const usedCount = vouchers.filter(v => v.used_by).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Ticket className="w-5 h-5 text-primary" />
            Vouchers de Entrada
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {availableCount} disponíve{availableCount !== 1 ? "is" : "l"}
            </Badge>
            {usedCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {usedCount} usado{usedCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Gere vouchers para seus clientes. Cada voucher permite a entrada de 1 participante no bolão.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          onClick={handleGenerateVoucher}
          disabled={generating}
          className="w-full"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          {generating ? "Gerando..." : "Gerar Novo Voucher"}
        </Button>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-2">Carregando...</p>
        ) : vouchers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">
            Nenhum voucher gerado ainda. Gere vouchers para compartilhar com seus clientes.
          </p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {vouchers.map(voucher => (
              <div
                key={voucher.id}
                className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border ${
                  voucher.used_by
                    ? "bg-muted/30 border-border/50"
                    : "bg-primary/5 border-primary/20"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-bold text-sm tracking-wider ${
                      voucher.used_by ? "text-muted-foreground line-through" : "text-primary"
                    }`}>
                      {voucher.code}
                    </span>
                    {voucher.used_by ? (
                      <Badge variant="secondary" className="text-[0.6rem] px-1.5 py-0">
                        <CheckCircle className="w-3 h-3 mr-0.5" />
                        Usado
                      </Badge>
                    ) : (
                      <Badge variant="default" className="text-[0.6rem] px-1.5 py-0 bg-primary/80">
                        Disponível
                      </Badge>
                    )}
                  </div>
                  {voucher.used_by && (
                    <p className="text-[0.6rem] text-muted-foreground mt-0.5">
                      {usedByNames[voucher.used_by] || "Usuário"} · {voucher.used_at ? format(new Date(voucher.used_at), "dd/MM 'às' HH:mm", { locale: ptBR }) : ""}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {!voucher.used_by && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleCopyCode(voucher.code)}
                        title="Copiar código"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-green-600 hover:text-green-700"
                        onClick={() => handleShareWhatsApp(voucher.code)}
                        title="Compartilhar via WhatsApp"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteVoucher(voucher.id)}
                        title="Excluir voucher"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VoucherManager;
