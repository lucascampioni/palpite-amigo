import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Trophy, Users, Clock, MapPin } from "lucide-react";
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
  totalPrize?: number | null;
  communityName?: string | null;
  responsibleName?: string | null;
}

const PoolCard = ({ pool, onClick, isUserParticipating = false, hasWonPrize = false, prizeReceived = false, hasPendingPayment = false, hasAwaitingApproval = false, totalPrize, communityName, responsibleName }: PoolCardProps) => {
  const isExpired = isPast(new Date(pool.deadline));
  const isInProgress = pool.status === "active" && isExpired && isUserParticipating;

  const getStatusColor = (status: string) => {
    if (status === "cancelled") {
      return "bg-destructive text-destructive-foreground";
    }
    if (isUserParticipating && status === "active") {
      return "bg-primary text-primary-foreground";
    }
    if (status === "active") {
      return "bg-accent text-accent-foreground";
    }
    if (status === "finished") {
      return "bg-muted text-muted-foreground";
    }
    return "bg-muted text-muted-foreground";
  };

  const getStatusText = (status: string) => {
    if (status === "cancelled") {
      return "🚫 Cancelado";
    }
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
        "border border-border/60 hover:border-primary/50 relative overflow-hidden",
        "bg-card backdrop-blur-sm"
      )}
      onClick={onClick}
    >
      {/* Gradient top accent bar */}
      <div className="h-1 bg-gradient-to-r from-primary via-secondary to-accent" />
      
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
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
              <Badge className="bg-gradient-to-r from-secondary to-secondary/80 text-secondary-foreground font-semibold shadow-lg">
                🏆 Premiado
              </Badge>
            )}
            {prizeReceived && (
              <Badge className="bg-primary text-primary-foreground font-semibold shadow-lg">
                ✅ Prêmio Recebido
              </Badge>
            )}
            {hasPendingPayment && (
              <Badge className="bg-gradient-to-r from-secondary to-secondary/80 text-secondary-foreground font-semibold shadow-lg animate-pulse">
                ⚠️ Pagamento Pendente
              </Badge>
            )}
            {hasAwaitingApproval && (
              <Badge className="bg-gradient-to-r from-secondary/80 to-secondary text-secondary-foreground font-semibold shadow-lg">
                ⏳ Pendente Aprovação
              </Badge>
            )}
            {pool.entry_fee && pool.entry_fee > 0 ? (
              <Badge variant="secondary" className="bg-secondary/15 text-secondary font-semibold shadow-sm border border-secondary/30">
                💰 R$ {pool.entry_fee.toFixed(2).replace('.', ',')}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-2 border-primary/40 text-primary font-semibold shadow-sm bg-primary/5">
                ✨ Gratuito
              </Badge>
            )}
          </div>
          
          {/* Ícone e título em uma linha */}
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center group-hover:scale-105 transition-transform duration-500 shadow-md border border-primary/10">
                <span className="text-4xl">{getTypeIcon(pool.pool_type)}</span>
              </div>
              {pool.is_official && (
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gradient-to-br from-secondary to-secondary/80 flex items-center justify-center shadow-lg animate-pulse">
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
        {communityName && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 text-primary/60 flex-shrink-0" />
            <span className="truncate">
              <span className="font-medium text-foreground/70">{communityName}</span>
              {responsibleName && (
                <span> · por {responsibleName}</span>
              )}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2 relative pt-0">
        {pool.status === "cancelled" ? (
          <div className="flex items-center gap-2 text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-xl border border-destructive/20">
            <Clock className="w-5 h-5 text-destructive" />
            <span>Cancelado — todos os jogos foram adiados</span>
          </div>
        ) : pool.status === "finished" && pool.finished_at ? (
          <div className="flex items-center gap-2 text-sm font-medium text-foreground/80 bg-muted/50 p-3 rounded-xl border border-border/50">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <span>Finalizado em: {format(new Date(pool.finished_at), "dd 'de' MMMM, HH:mm", { locale: ptBR })}</span>
          </div>
        ) : pool.status === "active" && (
          <div className="flex items-center gap-2 text-sm font-medium text-foreground/80 bg-primary/5 p-3 rounded-xl border border-primary/15">
            <Calendar className="w-5 h-5 text-primary" />
            <span>Prazo: {format(new Date(pool.deadline), "dd 'de' MMMM, HH:mm", { locale: ptBR })}</span>
          </div>
        )}
        {pool.participant_count !== undefined && (
          <div className="flex items-center gap-2 text-sm font-medium text-foreground/80 bg-accent/5 p-3 rounded-xl border border-accent/15">
            <Users className="w-5 h-5 text-accent" />
            <span>{pool.participant_count} participante(s)</span>
          </div>
        )}
        {pool.status === "finished" && totalPrize != null && totalPrize > 0 && (
          <div className="flex items-center gap-2 text-sm font-semibold text-secondary bg-secondary/10 p-3 rounded-xl border border-secondary/20">
            <Trophy className="w-5 h-5 text-secondary" />
            <span>Premiação total: R$ {totalPrize.toFixed(2).replace('.', ',')}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PoolCard;
