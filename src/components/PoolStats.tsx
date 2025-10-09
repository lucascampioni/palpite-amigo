import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Users, CheckCircle, Clock } from "lucide-react";

interface PoolStatsProps {
  myPoolsCount: number;
  activePoolsCount: number;
  finishedPoolsCount: number;
  pendingApprovalsCount: number;
}

const PoolStats = ({
  myPoolsCount,
  activePoolsCount,
  finishedPoolsCount,
  pendingApprovalsCount,
}: PoolStatsProps) => {
  const stats = [
    {
      label: "Meus Bolões",
      value: myPoolsCount,
      icon: Trophy,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Bolões Ativos",
      value: activePoolsCount,
      icon: Clock,
      color: "text-secondary",
      bgColor: "bg-secondary/10",
    },
    {
      label: "Finalizados",
      value: finishedPoolsCount,
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-900/20",
    },
    {
      label: "Aprovações Pendentes",
      value: pendingApprovalsCount,
      icon: Users,
      color: "text-orange-600",
      bgColor: "bg-orange-100 dark:bg-orange-900/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PoolStats;
