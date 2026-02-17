import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, ChevronDown, ChevronUp, User, Clock, Trophy, AlertTriangle, PartyPopper, Megaphone, Loader2, CheckCircle2, XCircle, Copy, Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
  isAdmin?: boolean;
  poolPrizes?: { first?: number; second?: number; third?: number };
}

const createMessageTemplates = (): MessageTemplate[] => [
  {
    id: "promote_pool",
    label: "Divulgar bolão (todos)",
    icon: <Megaphone className="w-4 h-4" />,
    getMessage: (name, pool, poolLink, extra) => {
      const prizes = extra?.prizes;
      const prizeText = prizes?.first
        ? `\n\n💰 *Premiação:*\n🥇 1º lugar: R$ ${prizes.first}${prizes.second ? `\n🥈 2º lugar: R$ ${prizes.second}` : ""}${prizes.third ? `\n🥉 3º lugar: R$ ${prizes.third}` : ""}`
        : "";
      return `🎯 *Palpite Amigo*\n\nOlá ${name}! ⚽🔥\n\nO bolão *"${pool}"* está aberto e aceitando palpites!${prizeText}\n\nFaça seus palpites e concorra aos prêmios! 🏆\n\n👉 Participe aqui: ${poolLink}`;
    },
    category: "divulgacao",
    targetAllUsers: true,
  },
  {
    id: "deadline_30min",
    label: "Encerra em 30min",
    icon: <Clock className="w-4 h-4" />,
    getMessage: (name, pool, poolLink) =>
      `🎯 *Palpite Amigo*\n\nOlá ${name}! ⏰\n\nOs palpites do bolão "${pool}" se encerram em *30 minutos*!\n\nCorra para fazer seus palpites antes que o prazo acabe! 🏃‍♂️⚽\n\n👉 ${poolLink}`,
    category: "lembrete",
  },
  {
    id: "deadline_1h",
    label: "Encerra em 1 hora",
    icon: <Clock className="w-4 h-4" />,
    getMessage: (name, pool, poolLink) =>
      `🎯 *Palpite Amigo*\n\nOlá ${name}! ⏰\n\nOs palpites do bolão "${pool}" se encerram em *1 hora*!\n\nNão perca o prazo! Faça seus palpites agora. ⚽\n\n👉 ${poolLink}`,
    category: "lembrete",
  },
  {
    id: "reminder_join",
    label: "Lembrete participar",
    icon: <AlertTriangle className="w-4 h-4" />,
    getMessage: (name, pool, poolLink) =>
      `🎯 *Palpite Amigo*\n\nOlá ${name}! 👋\n\nVocê ainda não enviou seus palpites no bolão "${pool}"!\n\nParticipe antes que o prazo acabe! 🎯⚽\n\n👉 ${poolLink}`,
    category: "lembrete",
  },
  {
    id: "position_update",
    label: "Atualização posição",
    icon: <Trophy className="w-4 h-4" />,
    getMessage: (name, pool, poolLink, extra) =>
      `🎯 *Palpite Amigo*\n\nOlá ${name}! 📊\n\nAtualização do bolão "${pool}":\n\nVocê está na *${extra?.position || "?"}ª posição* com *${extra?.points || 0} pontos*!\n\n${extra?.position && extra.position <= 3 ? "Continue assim! Você está no pódio! 🏆" : "Ainda dá tempo de subir no ranking! 💪"}\n\n👉 ${poolLink}`,
    category: "resultado",
  },
  {
    id: "pool_finished",
    label: "Bolão finalizado",
    icon: <PartyPopper className="w-4 h-4" />,
    getMessage: (name, pool, poolLink) =>
      `🎯 *Palpite Amigo*\n\nOlá ${name}! 🎉\n\nO bolão "${pool}" foi *finalizado*!\n\nAcesse o app para ver o resultado final e o ranking completo! 🏆📊\n\n👉 ${poolLink}`,
    category: "resultado",
  },
  {
    id: "winner_congrats",
    label: "Parabéns vencedor",
    icon: <Trophy className="w-4 h-4" />,
    getMessage: (name, pool, poolLink) =>
      `🎯 *Palpite Amigo*\n\nParabéns ${name}! 🏆🎉\n\nVocê venceu o bolão "${pool}"!\n\nEnvie sua chave PIX no app para receber o prêmio! 💰\n\n👉 ${poolLink}`,
    category: "resultado",
  },
  {
    id: "send_pix",
    label: "Enviar chave PIX",
    icon: <Send className="w-4 h-4" />,
    getMessage: (name, pool, poolLink) =>
      `🎯 *Palpite Amigo*\n\nOlá ${name}! 💰\n\nVocê ganhou no bolão "${pool}"!\n\nPor favor, envie sua *chave PIX* no app para receber o prêmio. Estamos aguardando! 🙏\n\n👉 ${poolLink}`,
    category: "pagamento",
  },
  {
    id: "payment_pending",
    label: "Pagamento pendente",
    icon: <AlertTriangle className="w-4 h-4" />,
    getMessage: (name, pool, poolLink) =>
      `🎯 *Palpite Amigo*\n\nOlá ${name}! 💳\n\nSeu pagamento da taxa de participação do bolão "${pool}" ainda está *pendente*.\n\nEnvie o comprovante no app para ser aprovado! 📱\n\n👉 ${poolLink}`,
    category: "pagamento",
  },
];

const categoryLabels: Record<TemplateCategory, string> = {
  divulgacao: "📣 Divulgação",
  lembrete: "📢 Lembretes",
  resultado: "🏆 Resultados",
  pagamento: "💰 Pagamentos",
};

type SendStatus = "idle" | "sending" | "success" | "error";

const WhatsAppMessagePanel = ({ poolTitle, poolId, participants, poolDeadline, ranking, phones, allUsersWithPhone, isAdmin = false, poolPrizes }: WhatsAppMessagePanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [individualStatus, setIndividualStatus] = useState<Record<string, SendStatus>>({});
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null);
  const { toast } = useToast();

  const messageTemplates = createMessageTemplates();
  const poolLink = `https://palpiteamigo.com.br/pool/${poolId}`;
  const approvedParticipants = participants.filter(p => p.status === "approved");

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

  const sendViaApi = async (phone: string, message: string) => {
    const { data, error } = await supabase.functions.invoke("send-whatsapp", {
      body: { phone, message },
    });
    if (error) throw error;
    if (data && !data.success) throw new Error(data.error || "Falha ao enviar");
    return data;
  };

  const sendToOne = async (targetId: string, phone: string, message: string) => {
    setIndividualStatus(prev => ({ ...prev, [targetId]: "sending" }));
    try {
      await sendViaApi(phone, message);
      setIndividualStatus(prev => ({ ...prev, [targetId]: "success" }));
    } catch (err) {
      setIndividualStatus(prev => ({ ...prev, [targetId]: "error" }));
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ variant: "destructive", title: "Erro ao enviar", description: errorMsg });
    }
  };

  const selectedTemplateObj = messageTemplates.find(t => t.id === selectedTemplate);
  const isPromoTemplate = selectedTemplateObj?.targetAllUsers;
  // For non-admin (pool creators), filter out promo template since they can't send to all users
  const availableTemplates = isAdmin
    ? messageTemplates
    : messageTemplates.filter(t => !t.targetAllUsers);

  const participantsWithPhone = approvedParticipants.filter(p => phones[p.user_id]);

  const currentTargetList = isPromoTemplate
    ? (allUsersWithPhone || []).map(u => ({ id: u.id, name: u.full_name, phone: u.phone, participantId: undefined as string | undefined }))
    : participantsWithPhone.map(p => ({ id: p.user_id, name: p.participant_name, phone: phones[p.user_id], participantId: p.id }));

  const handleCopyMessage = (templateObj: MessageTemplate) => {
    const message = getMessageForParticipant(templateObj, "", undefined)
      .replace("Olá ! ", "Olá! ")
      .replace("Parabéns ! ", "Parabéns! ");
    navigator.clipboard.writeText(message);
    setCopiedTemplate(templateObj.id);
    toast({ title: "Mensagem copiada!", description: "Cole no seu grupo do WhatsApp." });
    setTimeout(() => setCopiedTemplate(null), 2000);
  };

  const sendToAll = async () => {
    if (!selectedTemplateObj || sendingAll) return;
    setSendingAll(true);

    const messages = currentTargetList.map(t => ({
      phone: t.phone,
      message: getMessageForParticipant(selectedTemplateObj, t.name, t.participantId),
    }));

    // Mark all as sending
    const allSending: Record<string, SendStatus> = {};
    currentTargetList.forEach(t => { allSending[t.id] = "sending"; });
    setIndividualStatus(prev => ({ ...prev, ...allSending }));

    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { messages },
      });

      if (error) throw error;

      // Update individual statuses from results
      if (data?.results) {
        const statusUpdate: Record<string, SendStatus> = {};
        data.results.forEach((r: any, i: number) => {
          if (i < currentTargetList.length) {
            statusUpdate[currentTargetList[i].id] = r.success ? "success" : "error";
          }
        });
        setIndividualStatus(prev => ({ ...prev, ...statusUpdate }));
      }

      toast({
        title: `✅ Envio concluído`,
        description: `${data?.successCount || 0} enviado(s), ${data?.failCount || 0} falha(s)`,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ variant: "destructive", title: "Erro no envio em massa", description: errorMsg });
      // Mark all as error
      const allError: Record<string, SendStatus> = {};
      currentTargetList.forEach(t => { allError[t.id] = "error"; });
      setIndividualStatus(prev => ({ ...prev, ...allError }));
    } finally {
      setSendingAll(false);
    }
  };

  const categories: TemplateCategory[] = ["divulgacao", "lembrete", "resultado", "pagamento"];

  const getStatusIcon = (id: string) => {
    const status = individualStatus[id];
    if (status === "sending") return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
    if (status === "success") return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    if (status === "error") return <XCircle className="w-4 h-4 text-destructive" />;
    return null;
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-2 border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-500/10">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <CardTitle className="text-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                Mensagens WhatsApp
                {isAdmin && <Badge variant="outline" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">API</Badge>}
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
              {categories.map(cat => {
                const templatesInCat = availableTemplates.filter(t => t.category === cat);
                if (templatesInCat.length === 0) return null;
                return (
                  <div key={cat} className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">{categoryLabels[cat]}</p>
                    <div className="flex flex-wrap gap-2">
                      {templatesInCat.map(template => (
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
                );
              })}
            </div>

            {/* Copy mode for non-admin (pool creators) */}
            {selectedTemplate && selectedTemplateObj && !isAdmin && (
              <div className="space-y-3 mt-4">
                <p className="text-sm font-medium">Prévia da mensagem:</p>
                <Textarea
                  readOnly
                  value={getMessageForParticipant(selectedTemplateObj, "", undefined)
                    .replace("Olá ! ", "Olá! ")
                    .replace("Parabéns ! ", "Parabéns! ")}
                  className="min-h-[160px] text-sm"
                />
                <Button
                  onClick={() => handleCopyMessage(selectedTemplateObj)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  {copiedTemplate === selectedTemplateObj.id ? (
                    <>
                      <Check className="w-4 h-4 mr-1" />
                      Copiada!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      Copiar mensagem
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Cole a mensagem no seu grupo do WhatsApp
                </p>
              </div>
            )}

            {/* API send mode for admin */}
            {selectedTemplate && isAdmin && (
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
                        Enviar para{isPromoTemplate ? " (todos)" : ""}:
                      </p>
                      <Button
                        size="sm"
                        onClick={sendToAll}
                        disabled={sendingAll}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {sendingAll ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4 mr-1" />
                        )}
                        {sendingAll ? "Enviando..." : `Enviar para todos (${currentTargetList.length})`}
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {currentTargetList.map(target => {
                        const rankInfo = target.participantId ? getParticipantRankInfo(target.participantId) : null;
                        const status = individualStatus[target.id];

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
                              {getStatusIcon(target.id)}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-shrink-0 text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-950"
                              disabled={status === "sending" || sendingAll}
                              onClick={() =>
                                sendToOne(
                                  target.id,
                                  target.phone,
                                  getMessageForParticipant(selectedTemplateObj!, target.name, target.participantId)
                                )
                              }
                            >
                              {status === "sending" ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <MessageCircle className="w-4 h-4 mr-1" />
                                  Enviar
                                </>
                              )}
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
