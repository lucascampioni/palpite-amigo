import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { MessageCircle, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import delfosLogo from "@/assets/delfos-logo.png";

const WhatsAppVerification = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [phone, setPhone] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const checkVerification = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone, phone_verified")
      .eq("id", session.user.id)
      .single();

    if (profile?.phone_verified) {
      navigate("/");
      return;
    }

    if (profile?.phone) {
      setPhone(profile.phone);
    }
  }, [navigate]);

  useEffect(() => {
    checkVerification();
  }, [checkVerification]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const sendOTP = async () => {
    if (!phone) {
      toast({ variant: "destructive", title: "Erro", description: "Telefone não encontrado no perfil." });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-otp", {
        body: { phone },
      });

      if (error) throw error;

      if (data?.success) {
        setCodeSent(true);
        setCooldown(60);
        toast({ title: "Código enviado!", description: "Verifique seu WhatsApp." });
      } else {
        throw new Error(data?.error || "Erro ao enviar código");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar código";
      toast({ variant: "destructive", title: "Erro", description: msg });
    }
    setSending(false);
  };

  const verifyOTP = async () => {
    if (code.length !== 6) return;

    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-whatsapp-otp", {
        body: { code },
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: "Verificado!", description: "Seu WhatsApp foi verificado com sucesso." });
        navigate("/");
      } else {
        throw new Error(data?.error || "Código inválido");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao verificar código";
      toast({ variant: "destructive", title: "Erro", description: msg });
      setCode("");
    }
    setVerifying(false);
  };

  const formatPhone = (p: string) => {
    const digits = p.replace(/\D/g, '');
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return p;
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-muted to-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 space-y-4">
          <div className="inline-flex items-center justify-center mb-2">
            <img src={delfosLogo} alt="Delfos" className="h-20 sm:h-28 w-auto drop-shadow-lg" />
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Verificar WhatsApp</CardTitle>
            <CardDescription>
              Precisamos verificar seu número de WhatsApp para continuar
            </CardDescription>
            {phone && (
              <p className="text-sm font-medium text-foreground mt-2">{formatPhone(phone)}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!codeSent ? (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">
                      Enviaremos um código de 6 dígitos para o seu WhatsApp
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">
                      O código expira em 10 minutos
                    </p>
                  </div>
                </div>

                <Button onClick={sendOTP} className="w-full" disabled={sending}>
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando código...
                    </>
                  ) : (
                    <>
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Enviar código via WhatsApp
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-center text-muted-foreground">
                  Digite o código de 6 dígitos enviado para seu WhatsApp
                </p>

                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={code} onChange={setCode}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <Button
                  onClick={verifyOTP}
                  className="w-full"
                  disabled={verifying || code.length !== 6}
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    "Verificar código"
                  )}
                </Button>

                <div className="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={sendOTP}
                    disabled={sending || cooldown > 0}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
                  </Button>
                </div>
              </div>
            )}

            <Button
              variant="ghost"
              className="w-full"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/auth");
              }}
            >
              Sair e voltar para login
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default WhatsAppVerification;
