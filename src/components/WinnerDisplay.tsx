import { Trophy, Award } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface WinnerDisplayProps {
  winner: any;
  resultValue: string;
  measurementUnit: string;
}

const WinnerDisplay = ({ winner, resultValue, measurementUnit }: WinnerDisplayProps) => {
  const getUnitLabel = () => {
    switch (measurementUnit) {
      case "kg":
        return "kg";
      case "cm":
        return "cm";
      case "reais":
        return "R$";
      default:
        return "";
    }
  };

  return (
    <Card className="border-2 border-secondary bg-gradient-to-br from-secondary/10 to-secondary/5">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-secondary to-secondary/80 flex items-center justify-center shadow-lg">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Award className="w-4 h-4 text-secondary" />
              <span className="text-sm font-semibold text-secondary uppercase tracking-wide">
                Vencedor
              </span>
            </div>
            <h3 className="text-2xl font-bold mb-1">{winner.participant_name}</h3>
            <div className="flex gap-2">
              <Badge variant="outline">
                Palpite: {winner.guess_value} {getUnitLabel()}
              </Badge>
              <Badge variant="secondary">
                Resultado: {resultValue} {getUnitLabel()}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WinnerDisplay;
