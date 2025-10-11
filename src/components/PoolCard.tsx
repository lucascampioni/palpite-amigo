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
  };
  onClick: () => void;
}

const PoolCard = ({ pool, onClick }: PoolCardProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-primary text-primary-foreground";
      case "finished":
        return "bg-secondary text-secondary-foreground";
      case "draft":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active":
        return "Ativo";
      case "finished":
        return "Finalizado";
      case "draft":
        return "Rascunho";
      case "closed":
        return "Fechado";
      default:
        return status;
    }
  };

const getTypeIcon = (type: string) => {
    return "⚽";
  };

  const isExpired = isPast(new Date(pool.deadline)) && pool.status === "active";

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-2 hover:border-primary/50",
        isExpired && "opacity-75"
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
          <Badge className={getStatusColor(pool.status)}>
            {getStatusText(pool.status)}
          </Badge>
        </div>
        <CardDescription className="line-clamp-2">{pool.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4" />
          <span>Prazo: {format(new Date(pool.deadline), "dd 'de' MMMM, HH:mm", { locale: ptBR })}</span>
        </div>
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
