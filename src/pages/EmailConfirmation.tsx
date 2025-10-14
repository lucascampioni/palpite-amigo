import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, CheckCircle, Loader2 } from "lucide-react";
import chutaiLogo from "@/assets/chutai-logo.png";

const EmailConfirmation = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email');
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/");
      }
    };
    checkUser();
  }, [navigate]);

  const handleResendEmail = async () => {
    if (!email) return;
    
    setIsResending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
    });

    if (error) {
      console.error('Error resending email:', error);
    } else {
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 3000);
    }
    setIsResending(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-muted to-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 space-y-4">
          <div className="inline-flex items-center justify-center mb-2">
            <img src={chutaiLogo} alt="Chutaí" className="h-32 w-auto" />
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Verifique seu email</CardTitle>
            <CardDescription>
              Enviamos um link de confirmação para
            </CardDescription>
            {email && (
              <p className="text-sm font-medium text-foreground mt-2">{email}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  Clique no link do email para confirmar sua conta
                </p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  Verifique sua caixa de spam se não receber o email
                </p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  O link é válido por 24 horas
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-center text-muted-foreground">
                Não recebeu o email?
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleResendEmail}
                disabled={isResending || !email}
              >
                {isResending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Reenviando...
                  </>
                ) : resendSuccess ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Email reenviado!
                  </>
                ) : (
                  'Reenviar email de confirmação'
                )}
              </Button>
            </div>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/auth")}
            >
              Voltar para login
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmailConfirmation;
