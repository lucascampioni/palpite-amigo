import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Trophy, Users, Clock } from "lucide-react";
import { format, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PoolCardProps {
  pool: {
    id: string;
    title: string;
    description: string;
    pool_type: string;
    status: string;
    deadline: string;
    finished_at?: string | null;
    participant_count?: number;
    is_official?: boolean;
    entry_fee?: number | null;
  };
  onClick: () => void;
  isUserParticipating?: boolean;
  hasWonPrize?: boolean;
  prizeReceived?: boolean;
  hasPendingPayment?: boolean;
  hasAwaitingApproval?: boolean;
}

const PoolCard = ({ pool, onClick, isUserParticipating = false, hasWonPrize = false, prizeReceived = false, hasPendingPayment = false, hasAwaitingApproval = false }: PoolCardProps) => {
  const isExpired = isPast(new Date(pool.deadline));
  const isInProgress = pool.status === "active" && isExpired && isUserParticipating;

  const getStatusColor = (status: string) => {
    if (isUserParticipating && status === "active") {
      return "bg-blue-500 text-white";
    }
    if (status === "active") {
      return "bg-green-500 text-white";
    }
    if (status === "finished") {
      return "bg-gray-500 text-white";
    }
    return "bg-muted text-muted-foreground";
  };

  const getStatusText = (status: string) => {
    if (isUserParticipating && status === "active") {
      return "Participando";
    }
    if (status === "active") {
      return "Disponível";
    }
    if (status === "finished") {
      return "Finalizado";
    }
    return status;
  };

const getTypeIcon = (type: string) => {
    return "⚽";
  };

  return (
    <Card
      className={cn(
        "group cursor-pointer transition-all duration-500 hover:shadow-xl hover:-translate-y-1",
        "border hover:border-primary/40 relative overflow-hidden",
        "bg-gradient-to-br from-card to-card/50 backdrop-blur-sm"
      )}
      onClick={onClick}
    >
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <CardHeader className="relative pb-3">
        <div className="flex flex-col gap-3">
          {/* Badges no topo alinhadas à direita */}
          <div className="flex gap-2 flex-wrap justify-end">
            {!hasPendingPayment && !hasAwaitingApproval && (
              <Badge className={cn(getStatusColor(pool.status), "shadow-sm font-medium")}>
                {getStatusText(pool.status)}
              </Badge>
            )}
            {hasWonPrize && (
              <Badge className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-white font-semibold shadow-lg border-2 border-yellow-300">
                🏆 Premiado
              </Badge>
            )}
            {prizeReceived && (
              <Badge className="bg-gradient-to-r from-green-500 to-green-700 text-white font-semibold shadow-lg border-2 border-green-300">
                ✅ Prêmio Recebido
              </Badge>
            )}
            {hasPendingPayment && (
              <Badge className="bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold shadow-lg border-2 border-orange-300 animate-pulse">
                ⚠️ Pagamento Pendente
              </Badge>
            )}
            {hasAwaitingApproval && (
              <Badge className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white font-semibold shadow-lg border-2 border-yellow-300">
                ⏳ Pendente Aprovação
              </Badge>
            )}
            {pool.entry_fee && pool.entry_fee > 0 ? (
              <Badge variant="secondary" className="bg-gradient-to-r from-secondary/20 to-accent/20 text-primary font-semibold shadow-sm border border-secondary/30">
                💰 R$ {pool.entry_fee.toFixed(2).replace('.', ',')}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-2 border-accent/50 text-accent font-semibold shadow-sm bg-accent/5">
                ✨ Gratuito
              </Badge>
            )}
          </div>
          
          {/* Ícone e título em uma linha */}
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center group-hover:scale-105 transition-transform duration-500 shadow-md">
                <span className="text-4xl">{getTypeIcon(pool.pool_type)}</span>
              </div>
              {pool.is_official && (
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gradient-to-br from-secondary via-yellow-400 to-accent flex items-center justify-center shadow-lg animate-pulse">
                  <span className="text-sm">⭐</span>
                </div>
              )}
            </div>
            <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors duration-300 flex-1">
              {pool.title}
            </CardTitle>
          </div>
        </div>
        <CardDescription className="line-clamp-2 mt-3 text-base">{pool.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 relative pt-0">
        {pool.status === "finished" && pool.finished_at ? (
          <div className="flex items-center gap-2 text-sm font-medium text-foreground/80 bg-gradient-to-r from-muted/60 to-muted/30 p-3 rounded-xl border border-border/50">
            <Clock className="w-5 h-5 text-gray-500" />
            <span>Finalizado em: {format(new Date(pool.finished_at), "dd 'de' MMMM, HH:mm", { locale: ptBR })}</span>
          </div>
        ) : pool.status === "active" && (
          <div className="flex items-center gap-2 text-sm font-medium text-foreground/80 bg-gradient-to-r from-muted/60 to-muted/30 p-3 rounded-xl border border-border/50">
            <Calendar className="w-5 h-5 text-primary" />
            <span>Prazo: {format(new Date(pool.deadline), "dd 'de' MMMM, HH:mm", { locale: ptBR })}</span>
          </div>
        )}
        {pool.participant_count !== undefined && (
          <div className="flex items-center gap-2 text-sm font-medium text-foreground/80 bg-gradient-to-r from-muted/60 to-muted/30 p-3 rounded-xl border border-border/50">
            <Users className="w-5 h-5 text-accent" />
            <span>{pool.participant_count} participante(s)</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PoolCard;
