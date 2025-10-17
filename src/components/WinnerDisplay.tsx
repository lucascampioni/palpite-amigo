import { Trophy, Award } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface WinnerDisplayProps {
  winners: any[];
  resultValue?: string;
  measurementUnit?: string;
}

const WinnerDisplay = ({ winners, resultValue, measurementUnit }: WinnerDisplayProps) => {
  const isMultipleWinners = winners.length > 1;

  return (
    <Card className="border-2 border-secondary bg-gradient-to-br from-secondary/10 to-secondary/5">
      <CardContent className="p-6">
        <div className="flex items-center gap-4 mb-3">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-secondary to-secondary/80 flex items-center justify-center shadow-lg flex-shrink-0">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Award className="w-4 h-4 text-secondary" />
              <span className="text-sm font-semibold text-secondary uppercase tracking-wide">
                {isMultipleWinners ? 'Vencedores' : 'Vencedor'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="space-y-3">
          {winners.map((winner, index) => (
            <div key={winner.id || index} className={index > 0 ? "pt-3 border-t border-secondary/20" : ""}>
              <h3 className="text-xl font-bold mb-2">{winner.participant_name}</h3>
              {winner.total_points !== undefined && (
                <Badge variant="default">
                  {winner.total_points} pontos
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default WinnerDisplay;
