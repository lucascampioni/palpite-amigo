import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, ChevronDown, ChevronUp, User, Clock, Trophy, AlertTriangle, PartyPopper, Megaphone } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";

interface Participant {
  id: string;
  participant_name: string;
  user_id: string;
  phone?: string | null;
  status: string;
}

interface AllUser {
  id: string;
  full_name: string;
  phone: string;
}

type TemplateCategory = "divulgacao" | "lembrete" | "resultado" | "pagamento";

interface MessageTemplate {
  id: string;
  label: string;
  icon: React.ReactNode;
  getMessage: (participantName: string, poolTitle: string, poolLink: string, extra?: Record<string, any>) => string;
  category: TemplateCategory;
  targetAllUsers?: boolean;
}

interface WhatsAppMessagePanelProps {
  poolTitle: string;
  poolId: string;
  participants: Participant[];
  poolDeadline: string;
  ranking?: { participant_id: string; participant_name: string; total_points: number }[];
  phones: Record<string, string>;
  allUsersWithPhone?: AllUser[];
  poolPrizes?: { first?: number; second?: number; third?: number };
}

const createMessageTemplates = (): MessageTemplate[] => [
  {
    id: "promote_pool",
    label: "Divulgar bolão (todos os cadastrados)",
    icon: <Megaphone className="w-4 h-4" />,
    getMessage: (name, pool, poolLink, extra) => {
      const prizes = extra?.prizes;
      const prizeText = prizes?.first
        ? `\n\n💰 *Premiação:*\n🥇 1º lugar: R$ ${prizes.first}${prizes.second ? `\n🥈 2º lugar: R$ ${prizes.second}` : ""}${prizes.third ? `\n🥉 3º lugar: R$ ${prizes.third}` : ""}`
        : "";
      return `Olá ${name}! ⚽🔥\n\nO bolão *"${pool}"* está aberto e aceitando palpites!${prizeText}\n\nFaça seus palpites e concorra aos prêmios! 🏆\n\n👉 Participe aqui: ${poolLink}`;
    },
    category: "divulgacao",
    targetAllUsers: true,
  },
  {
    id: "deadline_30min",
    label: "Palpites encerram em 30min",
    icon: <Clock className="w-4 h-4" />,
    getMessage: (name, pool, poolLink) =>
      `Olá ${name}! ⏰\n\nOs palpites do bolão "${pool}" se encerram em *30 minutos*!\n\nCorra para fazer seus palpites antes que o prazo acabe! 🏃‍♂️⚽\n\n👉 ${poolLink}`,
    category: "lembrete",
  },
  {
    id: "deadline_1h",
    label: "Palpites encerram em 1 hora",
    icon: <Clock className="w-4 h-4" />,
    getMessage: (name, pool, poolLink) =>
      `Olá ${name}! ⏰\n\nOs palpites do bolão "${pool}" se encerram em *1 hora*!\n\nNão perca o prazo! Faça seus palpites agora. ⚽\n\n👉 ${poolLink}`,
    category: "lembrete",
  },
  {
    id: "reminder_join",
    label: "Lembrete para participar",
    icon: <AlertTriangle className="w-4 h-4" />,
    getMessage: (name, pool, poolLink) =>
      `Olá ${name}! 👋\n\nVocê ainda não enviou seus palpites no bolão "${pool}"!\n\nParticipe antes que o prazo acabe! 🎯⚽\n\n👉 ${poolLink}`,
    category: "lembrete",
  },
  {
    id: "position_update",
    label: "Atualização de posição",
    icon: <Trophy className="w-4 h-4" />,
    getMessage: (name, pool, poolLink, extra) =>
      `Olá ${name}! 📊\n\nAtualização do bolão "${pool}":\n\nVocê está na *${extra?.position || "?"}ª posição* com *${extra?.points || 0} pontos*!\n\n${extra?.position && extra.position <= 3 ? "Continue assim! Você está no pódio! 🏆" : "Ainda dá tempo de subir no ranking! 💪"}\n\n👉 ${poolLink}`,
    category: "resultado",
  },
  {
    id: "pool_finished",
    label: "Bolão finalizado",
    icon: <PartyPopper className="w-4 h-4" />,
    getMessage: (name, pool, poolLink) =>
      `Olá ${name}! 🎉\n\nO bolão "${pool}" foi *finalizado*!\n\nAcesse o app para ver o resultado final e o ranking completo! 🏆📊\n\n👉 ${poolLink}`,
    category: "resultado",
  },
  {
    id: "winner_congrats",
    label: "Parabéns ao vencedor",
    icon: <Trophy className="w-4 h-4" />,
    getMessage: (name, pool, poolLink) =>
      `Parabéns ${name}! 🏆🎉\n\nVocê venceu o bolão "${pool}"!\n\nEnvie sua chave PIX no app para receber o prêmio! 💰\n\n👉 ${poolLink}`,
    category: "resultado",
  },
  {
    id: "send_pix",
    label: "Enviar chave PIX",
    icon: <Send className="w-4 h-4" />,
    getMessage: (name, pool, poolLink) =>
      `Olá ${name}! 💰\n\nVocê ganhou no bolão "${pool}"!\n\nPor favor, envie sua *chave PIX* no app para receber o prêmio. Estamos aguardando! 🙏\n\n👉 ${poolLink}`,
    category: "pagamento",
  },
  {
    id: "payment_pending",
    label: "Pagamento pendente (taxa)",
    icon: <AlertTriangle className="w-4 h-4" />,
    getMessage: (name, pool, poolLink) =>
      `Olá ${name}! 💳\n\nSeu pagamento da taxa de participação do bolão "${pool}" ainda está *pendente*.\n\nEnvie o comprovante no app para ser aprovado! 📱\n\n👉 ${poolLink}`,
    category: "pagamento",
  },
];

const categoryLabels: Record<TemplateCategory, string> = {
  divulgacao: "📣 Divulgação",
  lembrete: "📢 Lembretes",
  resultado: "🏆 Resultados",
  pagamento: "💰 Pagamentos",
};

const WhatsAppMessagePanel = ({ poolTitle, poolId, participants, poolDeadline, ranking, phones, allUsersWithPhone, poolPrizes }: WhatsAppMessagePanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const { toast } = useToast();

  const messageTemplates = createMessageTemplates();
  const poolLink = `https://palpite-amigo.lovable.app/pool/${poolId}`;
  const approvedParticipants = participants.filter(p => p.status === "approved");

  const buildWhatsAppUrl = (phone: string, message: string) => {
    const digits = phone.replace(/\D/g, "");
    const phoneWithCountry = digits.startsWith("55") ? digits : `55${digits}`;
    const encoded = encodeURIComponent(message);
    return `https://wa.me/${phoneWithCountry}?text=${encoded}`;
  };

  const sendWhatsApp = (phone: string, message: string) => {
    window.location.href = buildWhatsAppUrl(phone, message);
  };

  const getParticipantRankInfo = (participantId: string) => {
    if (!ranking) return null;
    const index = ranking.findIndex(r => r.participant_id === participantId);
    if (index === -1) return null;
    return { position: index + 1, points: ranking[index].total_points };
  };

  const getMessageForParticipant = (template: MessageTemplate, name: string, participantId?: string) => {
    const rankInfo = participantId ? getParticipantRankInfo(participantId) : null;
    const extra: Record<string, any> = {};
    if (rankInfo) {
      extra.position = rankInfo.position;
      extra.points = rankInfo.points;
    }
    if (poolPrizes) {
      extra.prizes = poolPrizes;
    }
    return template.getMessage(name, poolTitle, poolLink, extra);
  };

  const selectedTemplateObj = messageTemplates.find(t => t.id === selectedTemplate);
  const isPromoTemplate = selectedTemplateObj?.targetAllUsers;

  // For promo template: use all registered users; for others: use approved participants with phone
  const participantsWithPhone = approvedParticipants.filter(p => phones[p.user_id]);

  const currentTargetList = isPromoTemplate
    ? (allUsersWithPhone || []).map(u => ({ id: u.id, name: u.full_name, phone: u.phone, participantId: undefined as string | undefined }))
    : participantsWithPhone.map(p => ({ id: p.user_id, name: p.participant_name, phone: phones[p.user_id], participantId: p.id }));

  const sendToAll = () => {
    if (!selectedTemplateObj) return;
    const urls = currentTargetList.map(t =>
      buildWhatsAppUrl(t.phone, getMessageForParticipant(selectedTemplateObj, t.name, t.participantId))
    );

    urls.forEach((url, i) => {
      setTimeout(() => {
        window.open(url, "_blank");
      }, i * 1500);
    });

    toast({
      title: `Enviando para ${urls.length} pessoas... 📤`,
      description: "As janelas do WhatsApp serão abertas uma a uma.",
      duration: urls.length * 1500 + 2000,
    });
  };

  const totalWithPhone = isPromoTemplate ? (allUsersWithPhone?.length || 0) : participantsWithPhone.length;
  const categories: TemplateCategory[] = ["divulgacao", "lembrete", "resultado", "pagamento"];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-2 border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-500/10">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <CardTitle className="text-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                Mensagens WhatsApp
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Template Selection */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Escolha a mensagem:</p>
              {categories.map(cat => (
                <div key={cat} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{categoryLabels[cat]}</p>
                  <div className="flex flex-wrap gap-2">
                    {messageTemplates
                      .filter(t => t.category === cat)
                      .map(template => (
                        <Button
                          key={template.id}
                          variant={selectedTemplate === template.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedTemplate(selectedTemplate === template.id ? null : template.id)}
                          className="text-xs"
                        >
                          {template.icon}
                          <span className="ml-1">{template.label}</span>
                        </Button>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Target List with Send Buttons */}
            {selectedTemplate && (
              <div className="space-y-2 mt-4">
                {currentTargetList.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {isPromoTemplate
                      ? "Nenhum usuário cadastrado tem telefone."
                      : "Nenhum participante aprovado tem telefone cadastrado."}
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        Enviar para{isPromoTemplate ? " (todos os cadastrados)" : ""}:
                      </p>
                      <Button
                        size="sm"
                        onClick={sendToAll}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Send className="w-4 h-4 mr-1" />
                        Enviar para todos ({currentTargetList.length})
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {currentTargetList.map(target => {
                        const rankInfo = target.participantId ? getParticipantRankInfo(target.participantId) : null;

                        return (
                          <div
                            key={target.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm font-medium truncate">{target.name}</span>
                              {rankInfo && (
                                <Badge variant="outline" className="text-xs flex-shrink-0">
                                  {rankInfo.position}º • {rankInfo.points}pts
                                </Badge>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-shrink-0 text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-950"
                              onClick={() => sendWhatsApp(target.phone, getMessageForParticipant(selectedTemplateObj!, target.name, target.participantId))}
                            >
                              <MessageCircle className="w-4 h-4 mr-1" />
                              Enviar
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default WhatsAppMessagePanel;
