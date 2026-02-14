import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, ChevronDown, ChevronUp, User, Clock, Trophy, AlertTriangle, PartyPopper } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Participant {
  id: string;
  participant_name: string;
  user_id: string;
  phone?: string | null;
  status: string;
}

interface MessageTemplate {
  id: string;
  label: string;
  icon: React.ReactNode;
  getMessage: (participantName: string, poolTitle: string, extra?: Record<string, any>) => string;
  category: "lembrete" | "resultado" | "pagamento";
}

interface WhatsAppMessagePanelProps {
  poolTitle: string;
  participants: Participant[];
  poolDeadline: string;
  ranking?: { participant_id: string; participant_name: string; total_points: number }[];
  phones: Record<string, string>; // userId -> phone
}

const messageTemplates: MessageTemplate[] = [
  {
    id: "deadline_30min",
    label: "Palpites encerram em 30min",
    icon: <Clock className="w-4 h-4" />,
    getMessage: (name, pool) =>
      `Olá ${name}! ⏰\n\nOs palpites do bolão "${pool}" se encerram em *30 minutos*!\n\nCorra para fazer seus palpites antes que o prazo acabe! 🏃‍♂️⚽`,
    category: "lembrete",
  },
  {
    id: "deadline_1h",
    label: "Palpites encerram em 1 hora",
    icon: <Clock className="w-4 h-4" />,
    getMessage: (name, pool) =>
      `Olá ${name}! ⏰\n\nOs palpites do bolão "${pool}" se encerram em *1 hora*!\n\nNão perca o prazo! Faça seus palpites agora. ⚽`,
    category: "lembrete",
  },
  {
    id: "reminder_join",
    label: "Lembrete para participar",
    icon: <AlertTriangle className="w-4 h-4" />,
    getMessage: (name, pool) =>
      `Olá ${name}! 👋\n\nVocê ainda não enviou seus palpites no bolão "${pool}"!\n\nParticipe antes que o prazo acabe! 🎯⚽`,
    category: "lembrete",
  },
  {
    id: "position_update",
    label: "Atualização de posição",
    icon: <Trophy className="w-4 h-4" />,
    getMessage: (name, pool, extra) =>
      `Olá ${name}! 📊\n\nAtualização do bolão "${pool}":\n\nVocê está na *${extra?.position || "?"}ª posição* com *${extra?.points || 0} pontos*!\n\n${extra?.position && extra.position <= 3 ? "Continue assim! Você está no pódio! 🏆" : "Ainda dá tempo de subir no ranking! 💪"}`,
    category: "resultado",
  },
  {
    id: "pool_finished",
    label: "Bolão finalizado",
    icon: <PartyPopper className="w-4 h-4" />,
    getMessage: (name, pool) =>
      `Olá ${name}! 🎉\n\nO bolão "${pool}" foi *finalizado*!\n\nAcesse o app para ver o resultado final e o ranking completo! 🏆📊`,
    category: "resultado",
  },
  {
    id: "winner_congrats",
    label: "Parabéns ao vencedor",
    icon: <Trophy className="w-4 h-4" />,
    getMessage: (name, pool) =>
      `Parabéns ${name}! 🏆🎉\n\nVocê venceu o bolão "${pool}"!\n\nEnvie sua chave PIX no app para receber o prêmio! 💰`,
    category: "resultado",
  },
  {
    id: "send_pix",
    label: "Enviar chave PIX",
    icon: <Send className="w-4 h-4" />,
    getMessage: (name, pool) =>
      `Olá ${name}! 💰\n\nVocê ganhou no bolão "${pool}"!\n\nPor favor, envie sua *chave PIX* no app para receber o prêmio. Estamos aguardando! 🙏`,
    category: "pagamento",
  },
  {
    id: "payment_pending",
    label: "Pagamento pendente (taxa)",
    icon: <AlertTriangle className="w-4 h-4" />,
    getMessage: (name, pool) =>
      `Olá ${name}! 💳\n\nSeu pagamento da taxa de participação do bolão "${pool}" ainda está *pendente*.\n\nEnvie o comprovante no app para ser aprovado! 📱`,
    category: "pagamento",
  },
];

const categoryLabels = {
  lembrete: "📢 Lembretes",
  resultado: "🏆 Resultados",
  pagamento: "💰 Pagamentos",
};

const WhatsAppMessagePanel = ({ poolTitle, participants, poolDeadline, ranking, phones }: WhatsAppMessagePanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const approvedParticipants = participants.filter(p => p.status === "approved");

  const openWhatsApp = (phone: string, message: string) => {
    const digits = phone.replace(/\D/g, "");
    const phoneWithCountry = digits.startsWith("55") ? digits : `55${digits}`;
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${phoneWithCountry}?text=${encoded}`, "_blank");
  };

  const getParticipantRankInfo = (participantId: string) => {
    if (!ranking) return null;
    const index = ranking.findIndex(r => r.participant_id === participantId);
    if (index === -1) return null;
    return { position: index + 1, points: ranking[index].total_points };
  };

  const getMessageForParticipant = (template: MessageTemplate, participant: Participant) => {
    const rankInfo = getParticipantRankInfo(participant.id);
    return template.getMessage(participant.participant_name, poolTitle, rankInfo ? { position: rankInfo.position, points: rankInfo.points } : {});
  };

  const participantsWithPhone = approvedParticipants.filter(p => phones[p.user_id]);

  const categories = ["lembrete", "resultado", "pagamento"] as const;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-2 border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-500/10">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <CardTitle className="text-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                Mensagens WhatsApp
                <Badge variant="secondary" className="text-xs">
                  {participantsWithPhone.length} com telefone
                </Badge>
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {participantsWithPhone.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum participante aprovado tem telefone cadastrado.
              </p>
            ) : (
              <>
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

                {/* Participant List with Send Buttons */}
                {selectedTemplate && (
                  <div className="space-y-2 mt-4">
                    <p className="text-sm font-medium">Enviar para:</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {participantsWithPhone.map(participant => {
                        const template = messageTemplates.find(t => t.id === selectedTemplate)!;
                        const phone = phones[participant.user_id];
                        const rankInfo = getParticipantRankInfo(participant.id);

                        return (
                          <div
                            key={participant.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm font-medium truncate">{participant.participant_name}</span>
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
                              onClick={() => openWhatsApp(phone, getMessageForParticipant(template, participant))}
                            >
                              <MessageCircle className="w-4 h-4 mr-1" />
                              Enviar
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default WhatsAppMessagePanel;
