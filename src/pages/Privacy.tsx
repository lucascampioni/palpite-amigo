import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Política de Privacidade</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold mb-3">1. Coleta de Dados</h2>
              <p className="text-muted-foreground">
                Coletamos apenas as informações necessárias para o funcionamento dos bolões, incluindo:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Nome de usuário e e-mail para autenticação</li>
                <li>Chaves PIX para processamento de pagamentos dos prêmios</li>
                <li>Comprovantes de pagamento para validação de participação</li>
                <li>Palpites e previsões dos jogos</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">2. Uso de Dados</h2>
              <p className="text-muted-foreground">
                Seus dados são utilizados exclusivamente para:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Gerenciar sua participação nos bolões</li>
                <li>Processar pagamentos de entrada e prêmios</li>
                <li>Comunicar resultados e atualizações dos bolões</li>
                <li>Melhorar a experiência do usuário na plataforma</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">3. Proteção de Chaves PIX</h2>
              <p className="text-muted-foreground mb-2">
                Levamos a segurança das suas informações financeiras muito a sério:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Chaves PIX são armazenadas de forma segura em nossa base de dados</li>
                <li>Apenas o criador do bolão pode visualizar as chaves dos participantes</li>
                <li>Todas as visualizações de chaves PIX são registradas em logs de auditoria</li>
                <li>As chaves são exibidas de forma mascarada por padrão</li>
                <li>Não compartilhamos suas chaves PIX com terceiros</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">4. Compartilhamento de Dados</h2>
              <p className="text-muted-foreground">
                Não vendemos, alugamos ou compartilhamos suas informações pessoais com terceiros, 
                exceto quando:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Necessário para o funcionamento dos bolões (ex: criador vê chaves para pagamento)</li>
                <li>Exigido por lei ou ordem judicial</li>
                <li>Necessário para proteger nossos direitos legais</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">5. Seus Direitos</h2>
              <p className="text-muted-foreground mb-2">
                Você tem direito a:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Acessar seus dados pessoais armazenados</li>
                <li>Corrigir informações imprecisas</li>
                <li>Solicitar a exclusão de seus dados</li>
                <li>Revogar consentimento a qualquer momento</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">6. Retenção de Dados</h2>
              <p className="text-muted-foreground">
                Mantemos seus dados enquanto sua conta estiver ativa ou conforme necessário para 
                fornecer nossos serviços. Dados de bolões finalizados são mantidos por período 
                determinado para fins de auditoria e conformidade legal.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">7. Segurança</h2>
              <p className="text-muted-foreground">
                Implementamos medidas de segurança técnicas e organizacionais apropriadas para 
                proteger seus dados contra acesso não autorizado, alteração, divulgação ou 
                destruição.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">8. Alterações na Política</h2>
              <p className="text-muted-foreground">
                Podemos atualizar esta política periodicamente. Notificaremos você sobre 
                alterações significativas através do e-mail cadastrado ou aviso na plataforma.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">9. Contato</h2>
              <p className="text-muted-foreground">
                Para questões sobre esta política ou seus dados pessoais, entre em contato 
                através do suporte da plataforma.
              </p>
            </section>

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Última atualização: {new Date().toLocaleDateString('pt-BR')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
