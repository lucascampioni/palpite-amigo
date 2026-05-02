import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function Terms() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Termos de Uso – Delfos";
  }, []);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6 py-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Termos de Uso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-muted-foreground">
            <p>
              Bem-vindo ao Delfos. Ao utilizar nossa plataforma você concorda com os
              termos descritos abaixo. Leia com atenção antes de criar uma conta ou
              participar de qualquer bolão.
            </p>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                1. Sobre o serviço
              </h2>
              <p>
                O Delfos é uma plataforma para criação, gestão e participação em bolões
                esportivos. Permitimos que organizadores definam regras, recebam
                inscrições, registrem palpites, apurem resultados e enviem
                notificações aos participantes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                2. Cadastro e conta
              </h2>
              <p>
                Para utilizar o Delfos é necessário criar uma conta com informações
                verdadeiras e atualizadas. Você é responsável por manter a
                confidencialidade da sua senha e por todas as atividades realizadas em
                sua conta.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                3. Uso adequado
              </h2>
              <p>
                Não é permitido utilizar a plataforma para fins ilegais, fraudes,
                disseminação de spam, ofensa a terceiros ou qualquer atividade que
                viole leis aplicáveis. Reservamo-nos o direito de suspender contas que
                descumpram estas regras.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                4. Bolões e pagamentos
              </h2>
              <p>
                Os valores de entrada e premiação são definidos pelos próprios
                organizadores. O Delfos atua como ferramenta de gestão e não se
                responsabiliza pela transferência financeira entre participantes e
                organizadores, salvo quando explicitamente indicado.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                5. Comunicações
              </h2>
              <p>
                Ao se cadastrar, você poderá receber notificações operacionais
                (lembretes de prazo, confirmações de pagamento, resultados) por e-mail
                e/ou WhatsApp, necessárias ao funcionamento da plataforma. Mensagens
                de marketing dependem de opt-in explícito.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                6. Propriedade intelectual
              </h2>
              <p>
                Todo o conteúdo, marca, layout e código do Delfos pertencem aos seus
                titulares e são protegidos por leis de propriedade intelectual. É
                proibida a reprodução sem autorização.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                7. Limitação de responsabilidade
              </h2>
              <p>
                O Delfos não garante disponibilidade ininterrupta do serviço e não se
                responsabiliza por perdas decorrentes de falhas técnicas, atrasos de
                terceiros (provedores de pagamento, mensageria, dados esportivos) ou
                uso indevido por parte dos usuários.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                8. Alterações
              </h2>
              <p>
                Estes termos podem ser atualizados a qualquer momento. Mudanças
                relevantes serão comunicadas pela plataforma ou por e-mail.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                9. Contato
              </h2>
              <p>
                Em caso de dúvidas sobre estes termos, entre em contato pelo e-mail{" "}
                <a
                  href="mailto:contato@delfos.app.br"
                  className="text-primary hover:underline"
                >
                  contato@delfos.app.br
                </a>
                .
              </p>
            </section>

            <div className="pt-4 border-t">
              <p className="text-sm">
                Última atualização: {new Date().toLocaleDateString("pt-BR")}
              </p>
              <p className="text-sm mt-2">
                Veja também nossa{" "}
                <Link to="/politica-de-privacidade" className="text-primary hover:underline">
                  Política de Privacidade
                </Link>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
