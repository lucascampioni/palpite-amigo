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
        "group cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-2",
        "border-2 hover:border-primary/50 relative overflow-hidden",
        "bg-gradient-to-br from-card via-card to-muted/20"
      )}
      onClick={onClick}
    >
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <CardHeader className="relative">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary-glow/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <span className="text-3xl">{getTypeIcon(pool.pool_type)}</span>
              </div>
              {pool.is_official && (
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg">
                  <span className="text-xs">⭐</span>
                </div>
              )}
            </div>
            <CardTitle className="text-xl group-hover:text-primary transition-colors">
              {pool.title}
            </CardTitle>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <Badge className={cn(getStatusColor(pool.status), "shadow-md")}>
              {getStatusText(pool.status)}
            </Badge>
            {pool.entry_fee && pool.entry_fee > 0 ? (
              <Badge variant="secondary" className="bg-gradient-to-r from-green-100 to-green-50 text-green-700 dark:from-green-900 dark:to-green-950 dark:text-green-300 shadow-md">
                💰 R$ {pool.entry_fee.toFixed(2)}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-2 border-green-500 text-green-600 dark:text-green-400 shadow-md bg-green-50 dark:bg-green-950/50">
                ✨ Gratuito
              </Badge>
            )}
          </div>
        </div>
        <CardDescription className="line-clamp-2 mt-2">{pool.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 relative">
        {!isUserParticipating && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-lg">
            <Calendar className="w-4 h-4 text-primary" />
            <span>Prazo: {format(new Date(pool.deadline), "dd 'de' MMMM, HH:mm", { locale: ptBR })}</span>
          </div>
        )}
        {pool.participant_count !== undefined && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-lg">
            <Users className="w-4 h-4 text-primary" />
            <span>{pool.participant_count} participante(s)</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PoolCard;
