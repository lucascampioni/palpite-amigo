
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Plus, Edit, X, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FootballPredictionForm from "./FootballPredictionForm";
import { PaymentProofSubmission } from "./PaymentProofSubmission";
import { InAppPaymentSubmission } from "./InAppPaymentSubmission";
import UserPredictionsSummary from "./UserPredictionsSummary";

interface UserPoolEntriesProps {
  entries: any[];
  pool: any;
  poolId: string;
  userId: string;
  isPastDeadline: boolean;
  firstMatchDate: Date | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  pixKey?: string;
  onReload: () => void;
  hasFootballMatches: boolean;
}

const UserPoolEntries = ({
  entries,
  pool,
  poolId,
  userId,
  isPastDeadline,
  firstMatchDate,
  ownerName,
  ownerPhone,
  pixKey,
  onReload,
  hasFootballMatches,
}: UserPoolEntriesProps) => {
  const { toast } = useToast();
  const [showAddMoreForm, setShowAddMoreForm] = useState(false);
  const [processingEntryId, setProcessingEntryId] = useState<string | null>(null);

  const approved = entries.filter((e) => e.status === "approved");
  const isEstabelecimento = pool?.prize_type === "estabelecimento";
  const hasEntryFee =
    !isEstabelecimento && pool?.entry_fee && parseFloat(pool.entry_fee) > 0;
  const feePerPalpite = hasEntryFee ? parseFloat(pool.entry_fee) : 0;

  const getPredictionCount = (entry: any) => {
    const match = entry.guess_value?.match(/^(\d+)/);
    return match ? parseInt(match[1]) : 1;
  };

  const cancelPendingPixForPool = async () => {
    if (pool?.payment_method !== "in_app") return;

    const { error } = await supabase.functions.invoke("asaas-cancel-pix", {
      body: { pool_id: poolId },
    });

    if (error) throw error;
  };

  const removeEntry = async (
    entry: any,
    successMessage: { title: string; description?: string }
  ) => {
    setProcessingEntryId(entry.id);

    try {
      await cancelPendingPixForPool();

      const { error: predictionsError } = await supabase
        .from("football_predictions")
        .delete()
        .eq("participant_id", entry.id);
      if (predictionsError) throw predictionsError;

      const { error: participantError } = await supabase
        .from("participants")
        .delete()
        .eq("id", entry.id);
      if (participantError) throw participantError;

      toast(successMessage);
      onReload();
    } catch (e: any) {
      toast({
        title: "Erro ao cancelar participação",
        description: e.message || "Não foi possível cancelar este palpite agora.",
        variant: "destructive",
      });
    } finally {
      setProcessingEntryId(null);
    }
  };

  const handleDeleteEntry = async (entry: any) => {
    if (
      !confirm(
        pool?.payment_method === "in_app"
          ? "Tem certeza que deseja cancelar esta participação? O QR Code PIX pendente deste bolão também será cancelado."
          : "Tem certeza que deseja cancelar esta participação? Todos os dados serão excluídos."
      )
    ) {
      return;
    }

    await removeEntry(entry, { title: "Participação cancelada" });
  };

  const handleRedoEntry = async (entry: any) => {
    if (
      !confirm(
        pool?.payment_method === "in_app"
          ? "Deseja apagar esta entrada e refazer do zero? O QR Code PIX pendente deste bolão também será cancelado."
          : "Deseja apagar esta entrada e refazer do zero? Seus palpites serão excluídos."
      )
    ) {
      return;
    }

    await removeEntry(entry, {
      title: "Entrada removida",
      description: "Refaça seu palpite.",
    });
  };

  // For estabelecimento pools: if approved but no predictions, show form
  if (isEstabelecimento) {
    const estabEntry = entries.find(
      (e) => e.status === "approved" && !e._hasPredictions
    );
    if (estabEntry) {
      return (
        <>
          <Separator />
          <FootballPredictionForm
            poolId={poolId}
            userId={userId}
            onSuccess={onReload}
            pool={pool}
            pixKey={pixKey}
            firstMatchDate={firstMatchDate}
            ownerName={ownerName || undefined}
          />
        </>
      );
    }
  }

  // Consolidated in_app payment: aggregate all pending entries without proof into a single QR
  const inAppPendingEntries =
    hasEntryFee && pool?.payment_method === "in_app"
      ? entries.filter((e) => e.status === "pending" && !e.payment_proof)
      : [];
  const inAppTotalAmount = inAppPendingEntries.reduce(
    (sum, e) => sum + feePerPalpite * getPredictionCount(e),
    0
  );
  const showConsolidatedInApp = inAppPendingEntries.length >= 2;

  return (
    <div className="space-y-4">
      {/* Summary for approved entries */}
      {approved.length > 0 && (
        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border-2 border-green-200 dark:border-green-800 text-center space-y-2">
          <p className="text-lg font-semibold text-green-700 dark:text-green-300">
            ✓ Você está participando!
          </p>
          <p className="text-sm text-muted-foreground">
            {approved.length > 1
              ? `Você tem ${approved.length} entrada(s) aprovada(s). Boa sorte! 🍀`
              : "Seu palpite está aprovado. Boa sorte! 🍀"}
          </p>
        </div>
      )}

      {/* Consolidated in-app payment card (one QR for all pending entries) */}
      {showConsolidatedInApp && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
          <p className="text-sm font-semibold">
            💳 Pagamento único — {inAppPendingEntries.length} palpites pendentes
          </p>
          <p className="text-xs text-muted-foreground">
            Para facilitar, geramos <strong>um único QR Code PIX</strong> com a soma total.
            Após o pagamento, todas as suas {inAppPendingEntries.length} entradas serão aprovadas automaticamente.
          </p>
          <InAppPaymentSubmission
            participantIds={inAppPendingEntries.map((e) => e.id)}
            poolId={poolId}
            poolTitle={pool.title}
            entryFee={inAppTotalAmount}
            onSuccess={onReload}
          />
        </div>
      )}

      {/* List each entry */}
      {entries.map((entry, index) => {
        const entryLabel =
          entries.length > 1 ? `Palpite #${index + 1}` : "Seu palpite";
        const predCount = getPredictionCount(entry);
        const entryFee = feePerPalpite * predCount;

        return (
          <Card
            key={entry.id}
            className={`border ${
              entry.status === "approved"
                ? "border-green-200 dark:border-green-800"
                : entry.status === "pending" && entry.payment_proof
                ? "border-yellow-200 dark:border-yellow-800"
                : entry.status === "pending"
                ? "border-orange-200 dark:border-orange-800"
                : "border-destructive/20"
            }`}
          >
            <CardContent className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{entryLabel}</span>
                <Badge
                  className={`text-xs ${
                    entry.status === "approved"
                      ? "bg-green-500 text-white"
                      : entry.status === "pending" && entry.payment_proof
                      ? "bg-yellow-500 text-white"
                      : entry.status === "pending"
                      ? "bg-orange-500 text-white"
                      : "bg-destructive text-destructive-foreground"
                  }`}
                >
                  {entry.status === "approved"
                    ? "✅ Aprovado"
                    : entry.status === "pending" && entry.payment_proof
                    ? "⏳ Aguardando aprovação"
                    : entry.status === "pending"
                    ? "⚠️ Pagamento pendente"
                    : "❌ Rejeitado"}
                </Badge>
              </div>

              {/* Predictions */}
              <UserPredictionsSummary
                poolId={poolId}
                participantId={entry.id}
              />

              {/* PENDING WITHOUT PROOF */}
              {entry.status === "pending" && !entry.payment_proof && (
                <>
                  {entry.rejection_reason && (
                    <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800/50">
                      <p className="text-xs font-medium text-orange-700 dark:text-orange-300">
                        ⚠️ {entry.rejection_reason}
                      </p>
                      {entry.rejection_details && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {entry.rejection_details}
                        </p>
                      )}
                    </div>
                  )}
                  {hasEntryFee && pool?.payment_method === 'in_app' ? (
                    showConsolidatedInApp ? (
                      <div className="p-2 rounded bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
                        💡 Esta entrada será paga junto com as demais no QR Code único acima.
                      </div>
                    ) : (
                      <InAppPaymentSubmission
                        participantId={entry.id}
                        poolId={poolId}
                        poolTitle={pool.title}
                        entryFee={entryFee}
                        onSuccess={onReload}
                      />
                    )
                  ) : hasEntryFee ? (
                    <PaymentProofSubmission
                      participantId={entry.id}
                      poolId={poolId}
                      poolTitle={pool.title}
                      entryFee={entryFee}
                      pixKey={pixKey}
                      firstMatchDate={firstMatchDate}
                      onSuccess={onReload}
                    />
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => handleRedoEntry(entry)}
                    >
                      <Edit className="w-3.5 h-3.5 mr-1" />
                      Refazer
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => handleDeleteEntry(entry)}
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Cancelar
                    </Button>
                  </div>
                </>
              )}

              {/* PENDING WITH PROOF */}
              {entry.status === "pending" && entry.payment_proof && (
                <p className="text-xs text-muted-foreground">
                  Seu comprovante foi enviado. Aguarde a aprovação do
                  organizador.
                  <br />
                  🔒 Caso não haja resposta até o horário do primeiro jogo, será
                  aprovado automaticamente.
                </p>
              )}

              {/* REJECTED */}
              {entry.status === "rejected" && (
                <div className="space-y-2">
                  <div className="p-2 rounded bg-destructive/10">
                    <p className="text-xs">
                      <strong>Motivo:</strong>{" "}
                      {entry.rejection_reason || "Não informado"}
                    </p>
                    {entry.rejection_details && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {entry.rejection_details}
                      </p>
                    )}
                  </div>
                  {ownerPhone && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={() => {
                        const phone = ownerPhone.replace(/\D/g, "");
                        const message = encodeURIComponent(
                          `Olá ${ownerName || ""}! Minha participação no bolão "${pool.title}" foi reprovada. Motivo: ${entry.rejection_reason || "Não informado"}. Podemos resolver?`
                        );
                        window.open(
                          `https://wa.me/55${phone}?text=${message}`,
                          "_blank"
                        );
                      }}
                    >
                      📱 Falar com o organizador
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* WhatsApp group */}
      {approved.length > 0 && pool.has_whatsapp_group && ownerPhone && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            const phone = ownerPhone.replace(/\D/g, "");
            const message = encodeURIComponent(
              `Olá ${ownerName || ""}! Estou participando do bolão "${pool.title}" e gostaria de entrar no grupo do WhatsApp.`
            );
            window.open(
              `https://wa.me/55${phone}?text=${message}`,
              "_blank"
            );
          }}
        >
          <MessageCircle className="w-4 h-4" />
          Entrar no grupo do WhatsApp
        </Button>
      )}

      {/* Add more predictions */}
      {!isPastDeadline && pool.status === "active" && (
        <>
          {!showAddMoreForm ? (
            <Button
              variant="outline"
              onClick={() => setShowAddMoreForm(true)}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Fazer mais palpites
            </Button>
          ) : (
            <FootballPredictionForm
              poolId={poolId}
              userId={userId}
              onSuccess={() => {
                setShowAddMoreForm(false);
                onReload();
              }}
              pool={pool}
              pixKey={pixKey}
              firstMatchDate={firstMatchDate}
              ownerName={ownerName || undefined}
            />
          )}
        </>
      )}
    </div>
  );
};

export default UserPoolEntries;
