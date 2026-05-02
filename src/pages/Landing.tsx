import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Users, Bell, CheckCircle2, Mail, MessageSquare, Settings } from "lucide-react";
import { useEffect } from "react";
import delfosLogo from "@/assets/delfos-logo.png";

const Landing = () => {
  const navigate = useNavigate();

  useEffect(() => {
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
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{ background: "var(--gradient-hero)" }}
          aria-hidden
        />
        <div className="relative max-w-6xl mx-auto px-4 py-20 md:py-28 text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Delfos – Plataforma de gestão de bolões
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-10">
            Crie, gerencie e automatize bolões com notificações inteligentes para
            participantes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" onClick={() => navigate("/entrar")} className="min-w-44">
              Entrar
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/entrar?redirect=%2Fcriar-bolao")}
              className="min-w-44"
            >
              Criar bolão
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
              Uma plataforma completa para quem organiza bolões esportivos, comunidades
              e grupos de palpites — do cadastro à premiação.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: Trophy,
                title: "Gestão de bolões",
                desc:
                  "Crie bolões personalizados de futebol com regras, prazos e premiações configuráveis.",
              },
              {
                icon: Users,
                title: "Controle de participantes",
                desc:
                  "Aprove inscrições, gerencie pagamentos e mantenha tudo organizado em um só lugar.",
              },
              {
                icon: CheckCircle2,
                title: "Definição de ganhadores",
                desc:
                  "Apuração automática de pontos e ranking, com regras claras de desempate e premiação.",
              },
              {
                icon: Bell,
                title: "Notificações automáticas",
                desc:
                  "Avisos via WhatsApp para lembrar prazos, divulgar resultados e comunicar pagamentos.",
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
                icon: Settings,
                title: "Crie seu bolão",
                desc:
                  "Escolha o campeonato, defina regras de pontuação, prazos e o valor de entrada.",
              },
              {
                n: "2",
                icon: Users,
                title: "Adicione participantes",
                desc:
                  "Compartilhe o link, aprove inscrições e acompanhe os palpites de cada participante.",
              },
              {
                n: "3",
                icon: MessageSquare,
                title: "Acompanhe e notifique",
                desc:
                  "Resultados são apurados automaticamente e participantes recebem notificações via WhatsApp.",
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
                href="mailto:contato@delfos.app.br"
                className="font-medium hover:underline"
              >
                contato@delfos.app.br
              </a>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-10 bg-muted/20">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={delfosLogo} alt="Delfos" className="h-7 w-auto" />
            <span className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Delfos. Todos os direitos reservados.
            </span>
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
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
