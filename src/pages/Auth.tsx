import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trophy } from "lucide-react";
import { z } from "zod";
import delfosLogo from "@/assets/delfos-logo.png";

const cpfSchema = z.string()
  .regex(/^\d{11}$/, "CPF deve conter 11 dígitos")
  .refine((cpf) => {
    // Validação básica de CPF (dígitos verificadores)
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    
    let sum = 0;
    let remainder;
    
    for (let i = 1; i <= 9; i++) {
      sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    }
    
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.substring(9, 10))) return false;
    
    sum = 0;
    for (let i = 1; i <= 10; i++) {
      sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    }
    
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.substring(10, 11))) return false;
    
    return true;
  }, "CPF inválido");

const phoneSchema = z.string()
  .regex(/^\d{10,11}$/, "Telefone deve conter 10 ou 11 dígitos")
  .refine((phone) => {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10 || digits.length === 11;
  }, "Telefone inválido");

const signUpSchema = z.object({
  email: z.string().email("Email inválido").max(255, "Email muito longo"),
  password: z.string()
    .min(8, "Senha deve ter no mínimo 8 caracteres")
    .max(128, "Senha muito longa")
    .regex(/[A-Z]/, "Senha deve conter pelo menos uma letra maiúscula")
    .regex(/[a-z]/, "Senha deve conter pelo menos uma letra minúscula")
    .regex(/[0-9]/, "Senha deve conter pelo menos um número")
    .regex(/[^A-Za-z0-9]/, "Senha deve conter pelo menos um caractere especial"),
  firstName: z.string().trim().min(1, "Nome é obrigatório").max(50, "Nome muito longo"),
  lastName: z.string().trim().min(1, "Sobrenome é obrigatório").max(50, "Sobrenome muito longo"),
  birthDate: z.string().min(1, "Data de nascimento é obrigatória"),
  cpf: cpfSchema,
  phone: phoneSchema,
});

const signInSchema = z.object({
  email: z.string().email("Email inválido").max(255, "Email muito longo"),
  password: z.string().min(1, "Senha é obrigatória").max(128, "Senha muito longa"),
});

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [cpf, setCpf] = useState("");
  const [cpfError, setCpfError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  
  const redirectUrl = searchParams.get('redirect') || '/';
  
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate(redirectUrl);
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate(redirectUrl);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, redirectUrl]);

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("signup-email") as string;
    const password = formData.get("signup-password") as string;
    const confirmPassword = formData.get("confirm-password") as string;
    const firstName = formData.get("first-name") as string;
    const lastName = formData.get("last-name") as string;
    const birthDate = formData.get("birth-date") as string;
    const cpfRaw = formData.get("cpf") as string;
    const cpf = cpfRaw.replace(/\D/g, ""); // Remove formatação
    const phoneRaw = formData.get("phone") as string;
    const phone = phoneRaw.replace(/\D/g, ""); // Remove formatação
    const notifyPoolUpdates = (e.currentTarget.querySelector('#notify-pool-updates') as HTMLInputElement)?.checked ?? true;
    const notifyNewPools = (e.currentTarget.querySelector('#notify-new-pools') as HTMLInputElement)?.checked ?? true;

    // Verificar consentimento obrigatório
    if (!whatsappConsent) {
      toast({
        variant: "destructive",
        title: "Consentimento obrigatório",
        description: "Você precisa concordar em receber comunicações via WhatsApp para se cadastrar.",
      });
      setLoading(false);
      return;
    }

    // Verificar se as senhas coincidem
    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Erro de validação",
        description: "As senhas não coincidem. Por favor, verifique e tente novamente.",
      });
      setLoading(false);
      return;
    }

    // Validate input
    try {
      signUpSchema.parse({ email, password, firstName, lastName, birthDate, cpf, phone });
      
      // Check if user is 18 years or older
      const birth = new Date(birthDate);
      const today = new Date();
      const age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      const dayDiff = today.getDate() - birth.getDate();
      
      const isOldEnough = age > 18 || (age === 18 && (monthDiff > 0 || (monthDiff === 0 && dayDiff >= 0)));
      
      if (!isOldEnough) {
        toast({
          variant: "destructive",
          title: "Erro de validação",
          description: "Você precisa ter 18 anos ou mais para criar uma conta.",
        });
        setLoading(false);
        return;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Erro de validação",
          description: error.errors[0].message,
        });
        setLoading(false);
        return;
      }
    }

    // Verificar duplicidade de CPF antes de criar a conta
    try {
      const { data, error: fnError } = await supabase.functions.invoke("check-cpf-exists", {
        body: { cpf },
      });
      if (fnError) throw fnError as any;
      if (data?.exists) {
        setCpfError("CPF já cadastrado");
        toast({
          variant: "destructive",
          title: "Cadastro não permitido",
          description: "Este CPF já está cadastrado no sistema.",
        });
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error("Falha ao verificar CPF duplicado");
    }

    // Verificar duplicidade de telefone antes de criar a conta
    try {
      const { data, error: fnError } = await supabase.functions.invoke("check-phone-exists", {
        body: { phone },
      });
      if (fnError) throw fnError as any;
      if (data?.exists) {
        toast({
          variant: "destructive",
          title: "Cadastro não permitido",
          description: "Este telefone já está cadastrado no sistema.",
        });
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error("Falha ao verificar telefone duplicado");
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: `${firstName} ${lastName}`,
          first_name: firstName,
          last_name: lastName,
          cpf,
          phone,
          wants_whatsapp_group: false,
          notify_pool_updates: notifyPoolUpdates,
          notify_new_pools: notifyNewPools,
        },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    // Verifica se o e-mail já existe (Supabase não retorna erro, mas user e session serão null)
    if (!error && !data.user && !data.session) {
      toast({
        variant: "destructive",
        title: "E-mail já cadastrado",
        description: "Este e-mail já está cadastrado. Por favor, faça login ou use outro e-mail.",
      });
      setLoading(false);
      return;
    }

    // Repetição de cadastro: Supabase retorna user com identities vazio
    if (!error && data.user && Array.isArray((data.user as any).identities) && (data.user as any).identities.length === 0) {
      toast({
        variant: "destructive",
        title: "E-mail já cadastrado",
        description: "Este e-mail já está cadastrado. Por favor, faça login ou use outro e-mail.",
      });
      setLoading(false);
      return;
    }

    if (error) {
      let errorMessage = error.message;

      // Tratamento específico para email já cadastrado
      if (/user already registered|email.*already.*registered|email.*exists/i.test(error.message) || 
          error.status === 422 || 
          error.code === 'user_already_exists') {
        errorMessage = "Este e-mail já está cadastrado. Por favor, faça login ou use outro e-mail.";
      } else if (/duplicate key|cpf_hash/i.test(error.message)) {
        errorMessage = "Este CPF já está cadastrado no sistema.";
      } else if (/rate limit/i.test(error.message)) {
        errorMessage = "Muitas tentativas. Tente novamente em alguns minutos.";
      } else if (/password/i.test(error.message)) {
        errorMessage = "Senha inválida. Verifique os requisitos de segurança.";
      } else if (/database error saving new user/i.test(error.message) || error.status === 500) {
        errorMessage = "Não foi possível criar a conta agora. Verifique os dados e tente novamente.";
      }

      toast({
        variant: "destructive",
        title: "Erro ao criar conta",
        description: errorMessage,
      });
    } else {
      // Redireciona para a confirmação de e-mail
      navigate(`/email-confirmation?email=${encodeURIComponent(email)}`);
    }

    setLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("login-email") as string;
    const password = formData.get("login-password") as string;

    // Validate input
    try {
      signInSchema.parse({ email, password });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Erro de validação",
          description: error.errors[0].message,
        });
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao fazer login",
        description: error.message,
      });
    }

    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResetLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao enviar email",
        description: error.message,
      });
    } else {
      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
      });
      setForgotPasswordOpen(false);
      setResetEmail("");
    }

    setResetLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-br from-background via-primary/5 to-accent/5">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 space-y-3">
          <div className="inline-flex items-center justify-center">
            <img src={delfosLogo} alt="Delfos" className="h-24 sm:h-32 w-auto drop-shadow-lg" />
          </div>
          <p className="text-muted-foreground text-sm sm:text-base">Participe dos bolões e divirta-se com os amigos!</p>
          <div className="h-1 w-20 mx-auto rounded-full bg-gradient-to-r from-primary via-secondary to-accent" />
        </div>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar Conta</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card>
              <CardHeader>
                <CardTitle>Bem-vindo de volta!</CardTitle>
                <CardDescription>Entre com sua conta para continuar</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      name="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <Input
                      id="login-password"
                      name="login-password"
                      type="password"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                  
                  <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
                    <DialogTrigger asChild>
                      <Button variant="link" className="w-full" type="button">
                        Esqueci minha senha
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Recuperar Senha</DialogTitle>
                        <DialogDescription>
                          Digite seu email para receber um link de recuperação de senha
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="reset-email">Email</Label>
                          <Input
                            id="reset-email"
                            type="email"
                            placeholder="seu@email.com"
                            required
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                          />
                        </div>
                        <Button type="submit" className="w-full" disabled={resetLoading}>
                          {resetLoading ? "Enviando..." : "Enviar link de recuperação"}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signup">
            <Card>
              <CardHeader>
                <CardTitle>Criar nova conta</CardTitle>
                <CardDescription>Preencha os dados para começar</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="first-name">Nome</Label>
                    <Input
                      id="first-name"
                      name="first-name"
                      type="text"
                      placeholder="Seu nome"
                      required
                      maxLength={50}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last-name">Sobrenome</Label>
                    <Input
                      id="last-name"
                      name="last-name"
                      type="text"
                      placeholder="Seu sobrenome"
                      required
                      maxLength={50}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cpf">CPF</Label>
                    <Input
                      id="cpf"
                      name="cpf"
                      type="text"
                      placeholder="000.000.000-00"
                      required
                      maxLength={14}
                      value={cpf}
                      onChange={(e) => {
                        let raw = e.target.value.replace(/\D/g, "");
                        let value = raw;
                        if (raw.length <= 3) {
                          // no formatting
                        } else if (raw.length <= 6) {
                          value = raw.replace(/(\d{3})(\d{1,3})/, "$1.$2");
                        } else if (raw.length <= 9) {
                          value = raw.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
                        } else {
                          value = raw.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
                        }
                        setCpf(value);
                        const digits = raw;
                        if (digits.length === 11) {
                          const result = cpfSchema.safeParse(digits);
                          setCpfError(result.success ? null : "CPF inválido");
                        } else {
                          setCpfError(null);
                        }
                      }}
                      className={cpfError ? "border-destructive focus-visible:ring-destructive" : undefined}
                    />
                    {cpfError && (
                      <p className="text-xs text-destructive">{cpfError}</p>
                    )}
                    <p className="text-xs text-muted-foreground">Apenas um cadastro por CPF</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="birth-date">Data de nascimento</Label>
                    <Input
                      id="birth-date"
                      name="birth-date"
                      type="date"
                      required
                      max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                    />
                    <p className="text-xs text-muted-foreground">É necessário ter 18 anos ou mais</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="text"
                      placeholder="(00) 00000-0000"
                      required
                      maxLength={15}
                      value={phone}
                      onChange={(e) => {
                        let raw = e.target.value.replace(/\D/g, "");
                        let value = raw;
                        if (raw.length <= 2) {
                          // no formatting
                        } else if (raw.length <= 6) {
                          value = raw.replace(/(\d{2})(\d{1,4})/, "($1) $2");
                        } else if (raw.length <= 10) {
                          value = raw.replace(/(\d{2})(\d{4})(\d{1,4})/, "($1) $2-$3");
                        } else {
                          value = raw.replace(/(\d{2})(\d{5})(\d{1,4})/, "($1) $2-$3");
                        }
                        setPhone(value);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">Usaremos para contato sobre os bolões caso necessário</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      name="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Senha</Label>
                    <Input
                      id="signup-password"
                      name="signup-password"
                      type="password"
                      placeholder="••••••••"
                      required
                      minLength={8}
                    />
                    <p className="text-xs text-muted-foreground">
                      Mínimo 8 caracteres, incluindo maiúscula, minúscula, número e caractere especial
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirmar Senha</Label>
                    <Input
                      id="confirm-password"
                      name="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      required
                      minLength={8}
                    />
                  </div>
                   <div className="flex items-start space-x-2 p-4 border-2 rounded-lg bg-muted/30 border-primary/20">
                     <input
                       type="checkbox"
                       id="whatsapp-consent"
                       checked={whatsappConsent}
                       onChange={(e) => setWhatsappConsent(e.target.checked)}
                       className="h-4 w-4 rounded border-gray-300 mt-0.5"
                       required
                     />
                     <Label htmlFor="whatsapp-consent" className="text-sm font-normal cursor-pointer leading-relaxed">
                       Ao participar, você concorda em receber comunicações operacionais sobre seus bolões via WhatsApp (confirmações, resultados e avisos importantes). <span className="text-destructive">*</span>
                     </Label>
                   </div>
                   <div className="space-y-3 p-4 border rounded-lg bg-muted/20">
                     <p className="text-sm font-medium">Notificações WhatsApp (opcional)</p>
                     <div className="flex items-start space-x-2">
                       <input
                         type="checkbox"
                         id="notify-pool-updates"
                         defaultChecked={true}
                         className="h-4 w-4 rounded border-gray-300 mt-0.5"
                       />
                       <Label htmlFor="notify-pool-updates" className="text-sm font-normal cursor-pointer">
                         Receber atualizações dos bolões que participo (posição, resultados)
                       </Label>
                     </div>
                     <div className="flex items-start space-x-2">
                       <input
                         type="checkbox"
                         id="notify-new-pools"
                         defaultChecked={true}
                         className="h-4 w-4 rounded border-gray-300 mt-0.5"
                       />
                       <Label htmlFor="notify-new-pools" className="text-sm font-normal cursor-pointer">
                         Receber divulgação de novos bolões disponíveis
                       </Label>
                     </div>
                   </div>
                  <Button type="submit" className="w-full" disabled={loading || !!cpfError || !whatsappConsent}>
                    {loading ? "Criando conta..." : "Criar conta"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Auth;
