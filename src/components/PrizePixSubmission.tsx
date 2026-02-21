import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Medal } from "lucide-react";
import { PixKeyInput } from "@/components/PixKeyInput";

interface PrizePixSubmissionProps {
  participantId: string;
  poolTitle: string;
  prizeAmount: number;
  placement: number;
  isTied?: boolean;
  tiedWithCount?: number;
  totalPrizes?: { first: number; second: number; third: number };
  onSuccess?: () => void;
}

export const PrizePixSubmission = ({ 
  participantId, 
  poolTitle, 
  prizeAmount, 
  placement, 
  isTied = false, 
  tiedWithCount = 0,
  totalPrizes,
  onSuccess 
}: PrizePixSubmissionProps) => {
  const [pixKey, setPixKey] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profilePixKey, setProfilePixKey] = useState<string | null>(null);
  const [profilePixKeyType, setProfilePixKeyType] = useState<string | null>(null);
  const [pixSource, setPixSource] = useState<'profile' | 'custom' | null>(null);
  const [savePixToProfile, setSavePixToProfile] = useState(false);
  const [replaceProfilePix, setReplaceProfilePix] = useState(false);

  // Load profile PIX key
  useEffect(() => {
    const loadProfilePix = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("pix_key, pix_key_type")
        .eq("id", user.id)
        .single();
      if (profile?.pix_key && profile?.pix_key_type) {
        setProfilePixKey(profile.pix_key);
        setProfilePixKeyType(profile.pix_key_type);
        // Auto-select profile key
        setPixSource('profile');
        setPixKey(profile.pix_key);
      }
    };
    loadProfilePix();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pixKey.trim()) {
      toast.error("Por favor, preencha a chave PIX");
      return;
    }

    if (!termsAccepted) {
      toast.error("Você precisa aceitar os termos para continuar");
      return;
    }

    const sanitizedPixKey = pixKey.trim().slice(0, 255);

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("participants")
        .update({
          prize_pix_key: sanitizedPixKey,
          prize_pix_key_type: pixSource === 'profile' ? profilePixKeyType : null,
          prize_status: "pix_submitted",
          prize_submitted_at: new Date().toISOString(),
        })
        .eq("id", participantId);

      if (error) throw error;

      // Save to profile if requested
      if ((pixSource === 'custom' && !profilePixKey && savePixToProfile) ||
          (pixSource === 'custom' && profilePixKey && replaceProfilePix)) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Detect key type from the PixKeyInput format
          const detectType = (val: string) => {
            if (val.includes("@")) return "email";
            const clean = val.replace(/\D/g, "");
            if (clean.length === 11 && val.includes("(")) return "phone";
            if (clean.length === 11 && (val.includes(".") || val.includes("-"))) return "cpf";
            if (clean.length === 14 && val.includes("/")) return "cnpj";
            if (/^[a-f0-9-]{32,36}$/i.test(val)) return "random";
            return null;
          };
          const detectedType = detectType(sanitizedPixKey);
          if (detectedType) {
            await supabase
              .from("profiles")
              .update({ pix_key: sanitizedPixKey, pix_key_type: detectedType })
              .eq("id", user.id);
          }
        }
      }

      toast.success("Chave PIX enviada com sucesso!");
      onSuccess?.();
    } catch (error) {
      console.error("Error submitting PIX key:", error);
      toast.error("Erro ao enviar chave PIX. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPlacementText = () => {
    const placementName = placement === 1 ? "1º lugar" : placement === 2 ? "2º lugar" : "3º lugar";
    
    if (isTied && tiedWithCount > 0) {
      return `${placementName} (empatado com ${tiedWithCount} ${tiedWithCount === 1 ? 'pessoa' : 'pessoas'})`;
    }
    
    return placementName;
  };

  const getDetailedExplanation = () => {
    if (!isTied || !totalPrizes) return null;

    const totalTied = tiedWithCount + 1;
    const placementName = placement === 1 ? "1º" : placement === 2 ? "2º" : "3º";
    
    const prizes = [totalPrizes.first, totalPrizes.second, totalPrizes.third];
    let involvedPositions: string[] = [];
    let summedPrizes = 0;
    
    for (let i = placement - 1; i < placement - 1 + totalTied && i < 3; i++) {
      if (prizes[i] > 0) {
        involvedPositions.push(i === 0 ? "1º" : i === 1 ? "2º" : "3º");
        summedPrizes += prizes[i];
      }
    }

    if (involvedPositions.length === 0) return null;

    return (
      <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/50 rounded-md border border-blue-200 dark:border-blue-800">
        <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">
          💡 Como seu prêmio foi calculado:
        </p>
        <p className="text-xs text-blue-800 dark:text-blue-200">
          {totalTied} {totalTied === 1 ? 'pessoa empatou' : 'pessoas empataram'} em {placementName} lugar. 
          Os prêmios de {involvedPositions.join(' e ')} lugar ({involvedPositions.map((pos, idx) => 
            `${pos}: R$ ${prizes[placement - 1 + idx].toFixed(2).replace('.', ',')}`
          ).join(', ')}) foram somados (R$ {summedPrizes.toFixed(2).replace('.', ',')}) e divididos igualmente entre os {totalTied} vencedores, 
          resultando em R$ {prizeAmount.toFixed(2).replace('.', ',')} para cada um.
        </p>
      </div>
    );
  };

  return (
    <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-600" />
          🎉 Parabéns! Você Ganhou!
        </CardTitle>
        <CardDescription>
          Informe sua chave PIX para receber o prêmio do bolão "{poolTitle}"
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 p-4 bg-white dark:bg-gray-900 rounded-lg border-2 border-yellow-300 dark:border-yellow-700">
          <div className="flex items-center gap-3 mb-2">
            <Medal className="w-6 h-6 text-yellow-600" />
            <h3 className="font-bold text-lg">Seu Prêmio</h3>
          </div>
          <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-500 mb-2">
            R$ {prizeAmount.toFixed(2).replace('.', ',')}
          </p>
          <p className="text-sm text-muted-foreground">
            Conquistado por ter ficado em <span className="font-semibold">{getPlacementText()}</span>
          </p>
          {getDetailedExplanation()}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <Label className="text-base">🔑 Chave PIX para receber o prêmio</Label>

            {profilePixKey ? (
              <div className="space-y-3">
                {/* Profile key - highlighted */}
                <button
                  type="button"
                  onClick={() => {
                    setPixSource('profile');
                    setPixKey(profilePixKey);
                    setReplaceProfilePix(false);
                  }}
                  className={`w-full py-3 px-4 rounded-lg border-2 text-left transition-colors ${
                    pixSource === 'profile'
                      ? 'border-primary bg-primary/10'
                      : 'border-muted hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm">✅ Usar chave do perfil</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {profilePixKeyType && (
                          <span className="inline-block bg-primary/15 text-primary rounded px-1.5 py-0.5 text-[11px] font-medium uppercase mr-1.5">
                            {profilePixKeyType}
                          </span>
                        )}
                        <span className="break-all">{profilePixKey}</span>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                      pixSource === 'profile' ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                    }`} />
                  </div>
                </button>

                {/* Custom key - subtle */}
                <button
                  type="button"
                  onClick={() => {
                    setPixSource('custom');
                    setPixKey("");
                    setReplaceProfilePix(false);
                  }}
                  className={`w-full py-2.5 px-4 rounded-lg border text-left transition-colors ${
                    pixSource === 'custom'
                      ? 'border-primary bg-primary/10'
                      : 'border-dashed border-muted-foreground/30 hover:border-muted-foreground/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">Usar outra chave</div>
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                      pixSource === 'custom' ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                    }`} />
                  </div>
                </button>

                {pixSource === 'custom' && (
                  <div className="space-y-3">
                    <PixKeyInput
                      value={pixKey}
                      onChange={setPixKey}
                      required
                      label=""
                    />
                    {pixKey.trim() && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="replace-profile-pix-prize"
                          checked={replaceProfilePix}
                          onCheckedChange={(checked) => setReplaceProfilePix(checked === true)}
                        />
                        <label htmlFor="replace-profile-pix-prize" className="text-sm text-muted-foreground cursor-pointer">
                          Substituir minha chave PIX do perfil por esta nova
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <PixKeyInput
                  value={pixKey}
                  onChange={(val) => {
                    setPixKey(val);
                    setPixSource('custom');
                  }}
                  required
                  label=""
                />
                {pixKey.trim() && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="save-pix-to-profile-prize"
                      checked={savePixToProfile}
                      onCheckedChange={(checked) => setSavePixToProfile(checked === true)}
                    />
                    <label htmlFor="save-pix-to-profile-prize" className="text-sm text-muted-foreground cursor-pointer">
                      Salvar esta chave PIX no meu perfil
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3 p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-start gap-3">
              <Checkbox 
                id="terms" 
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
              />
              <div className="flex-1">
                <Label 
                  htmlFor="terms" 
                  className="text-sm cursor-pointer leading-relaxed"
                >
                  Declaro que a chave PIX informada está correta e autorizo o uso desta informação exclusivamente para receber o pagamento do prêmio. Estou ciente de que a chave será utilizada apenas para este fim e que o organizador do bolão não se responsabiliza por erros na informação fornecida.
                </Label>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={isSubmitting || !termsAccepted || !pixKey.trim()} className="w-full">
            {isSubmitting ? "Enviando..." : "Enviar Chave PIX"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
