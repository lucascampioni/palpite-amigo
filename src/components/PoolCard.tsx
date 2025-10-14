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
    participant_count?: number;
    is_official?: boolean;
    entry_fee?: number | null;
  };
  onClick: () => void;
  isUserParticipating?: boolean;
}

const PoolCard = ({ pool, onClick, isUserParticipating = false }: PoolCardProps) => {
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
        "cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-2 hover:border-primary/50"
      )}
      onClick={onClick}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="text-2xl">{getTypeIcon(pool.pool_type)}</span>
              {pool.is_official && (
                <span className="absolute -top-1 -right-1 text-sm">⭐</span>
              )}
            </div>
            <CardTitle className="text-xl">
              {pool.title}
            </CardTitle>
          </div>
          <div className="flex gap-2">
            <Badge className={getStatusColor(pool.status)}>
              {getStatusText(pool.status)}
            </Badge>
            {pool.entry_fee && pool.entry_fee > 0 ? (
              <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                R$ {pool.entry_fee.toFixed(2)}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400">
                Gratuito
              </Badge>
            )}
          </div>
        </div>
        <CardDescription className="line-clamp-2">{pool.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isUserParticipating && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>Prazo: {format(new Date(pool.deadline), "dd 'de' MMMM, HH:mm", { locale: ptBR })}</span>
          </div>
        )}
        {pool.participant_count !== undefined && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>{pool.participant_count} participante(s)</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PoolCard;
