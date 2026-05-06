import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Users, Bell, CheckCircle2, Mail, MessageSquare, Settings, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import delfosLogo from "@/assets/delfos-logo.png";

const Landing = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // If already authenticated, send user straight to the app
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/app", { replace: true });
    });

    document.title = "Delfos – Plataforma de gestão de bolões";
    const meta = document.querySelector('meta[name="description"]');
    const content =
      "Delfos é a plataforma para criar, gerenciar e automatizar bolões com controle de participantes, definição de ganhadores e notificações inteligentes via WhatsApp.";
    if (meta) {
      meta.setAttribute("content", content);
    } else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = content;
      document.head.appendChild(m);
    }
    // canonical
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = "https://delfos.app.br/";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/60 backdrop-blur-sm sticky top-0 z-30 bg-background/80">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={delfosLogo} alt="Delfos" className="h-9 w-auto" />
          </div>
          <nav className="flex items-center gap-2">
            <a
              href="#sobre"
              className="hidden sm:inline-flex text-sm text-muted-foreground hover:text-foreground px-3 py-2"
            >
              Sobre
            </a>
            <a
              href="#como-funciona"
              className="hidden sm:inline-flex text-sm text-muted-foreground hover:text-foreground px-3 py-2"
            >
              Como funciona
            </a>
            <a
              href="#contato"
              className="hidden sm:inline-flex text-sm text-muted-foreground hover:text-foreground px-3 py-2"
            >
              Contato
            </a>
            <Button variant="ghost" size="sm" onClick={() => navigate("/entrar")}>
              Entrar
            </Button>
            <Button size="sm" onClick={() => navigate("/entrar?mode=signup")}>
              Criar conta
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="max-w-4xl mx-auto px-4 py-24 md:py-32 text-center">
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight mb-6">
            Bolões com seus amigos, sem complicação
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
            Crie e participe de bolões, dê seus palpites e acompanhe o ranking em tempo real — com pagamento automático via PIX e notificações no WhatsApp.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" onClick={() => navigate("/entrar?mode=signup")} className="min-w-44">
              Criar conta grátis
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/entrar")} className="min-w-44">
              Já tenho conta
            </Button>
          </div>
        </div>
      </section>

      {/* Sobre */}
      <section id="sobre" className="py-20 border-t border-border/60">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Sobre o Delfos</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              O Delfos é o jeito mais fácil de viver a emoção dos jogos junto
              com a galera: crie seu próprio bolão, entre nos bolões dos
              amigos e dispute o topo do ranking — tudo com pagamento
              automático via PIX.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: Users,
                title: "Crie e participe",
                desc:
                  "Agora qualquer pessoa pode criar bolões no Delfos. Monte o seu, convide a turma ou entre em bolões públicos da comunidade.",
              },
              {
                icon: Trophy,
                title: "Palpites e ranking",
                desc:
                  "Dê seus palpites antes dos jogos e acompanhe sua posição no ranking conforme os resultados saem.",
              },
              {
                icon: CheckCircle2,
                title: "Pagamento automático",
                desc:
                  "Todos os bolões funcionam com PIX automático no app: inscrição confirmada na hora e repasse de prêmios feito por nós.",
              },
              {
                icon: Bell,
                title: "Notificações no WhatsApp",
                desc:
                  "Receba lembretes de prazo, atualizações de resultado e avisos importantes direto no seu WhatsApp.",
              },
            ].map((f) => (
              <Card key={f.title} className="border-border/60">
                <CardContent className="p-6">
                  <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                    <f.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="py-20 border-t border-border/60 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Como funciona</h2>
            <p className="text-muted-foreground">Em três passos você está rodando.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                n: "1",
                icon: Users,
                title: "Entre em um bolão",
                desc:
                  "Encontre um bolão público ou aceite o convite dos seus amigos para participar.",
              },
              {
                n: "2",
                icon: Settings,
                title: "Faça seus palpites",
                desc:
                  "Escolha os placares dos jogos antes do prazo e confirme sua participação.",
              },
              {
                n: "3",
                icon: MessageSquare,
                title: "Acompanhe o ranking",
                desc:
                  "Receba os resultados e notificações automáticas no WhatsApp e veja sua posição em tempo real.",
              },
            ].map((s) => (
              <Card key={s.n} className="border-border/60 relative">
                <CardContent className="p-6">
                  <div className="absolute -top-3 -left-3 w-9 h-9 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center shadow-md">
                    {s.n}
                  </div>
                  <s.icon className="w-7 h-7 text-primary mb-4 mt-2" />
                  <h3 className="font-semibold mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contato */}
      <section id="contato" className="py-20 border-t border-border/60">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Contato</h2>
          <p className="text-muted-foreground mb-8">
            Dúvidas, sugestões ou parcerias? Fale com a gente.
          </p>
          <Card className="border-border/60 inline-block">
            <CardContent className="p-6 flex items-center gap-3">
              <Mail className="w-5 h-5 text-primary" />
              <a
                href="mailto:admin@delfos.app.br"
                className="font-medium hover:underline"
              >
                admin@delfos.app.br
              </a>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-10 bg-muted/20">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={delfosLogo} alt="Delfos" className="h-7 w-auto" />
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Delfos. Todos os direitos reservados.
              </span>
              <span className="text-xs text-muted-foreground">CNPJ: 66.222.130/0001-87</span>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link
              to="/termos-de-uso"
              className="text-muted-foreground hover:text-foreground"
            >
              Termos de Uso
            </Link>
            <Link
              to="/politica-de-privacidade"
              className="text-muted-foreground hover:text-foreground"
            >
              Política de Privacidade
            </Link>
            <Link
              to="/ajuda"
              className="text-muted-foreground hover:text-foreground"
            >
              Precisa de ajuda?
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
