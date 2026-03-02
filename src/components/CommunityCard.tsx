import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Users, Bell, BellOff, Star, UserCheck, ChevronRight, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommunityCardProps {
  community: any;
  membership: any;
  memberCount: number;
  poolCount: number;
  responsibleName?: string;
  userNotifyEnabled: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  onToggleNotify: (value: boolean) => void;
  onClick: () => void;
}

const CommunityCard = ({
  community,
  membership,
  memberCount,
  poolCount,
  responsibleName: responsibleNameProp,
  userNotifyEnabled,
  onFollow,
  onUnfollow,
  onToggleNotify,
  onClick,
}: CommunityCardProps) => {
  const isFollowing = !!membership;
  const notifyActive = membership?.notify_new_pools ?? false;
  const [animateNotify, setAnimateNotify] = useState(false);

  const handleFollowClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFollowing) {
      if (community.is_official) return;
      onUnfollow();
    } else {
      onFollow();
    }
  };

  const handleNotifyChange = (checked: boolean) => {
    onToggleNotify(checked);
    if (checked) {
      setAnimateNotify(true);
      setTimeout(() => setAnimateNotify(false), 1500);
    }
  };

  const responsibleName = responsibleNameProp || community.display_responsible_name || "Organizador";

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all duration-200 cursor-pointer hover:shadow-lg border",
        community.is_official
          ? "border-primary/30 bg-gradient-to-br from-primary/5 to-secondary/5 shadow-md"
          : "hover:border-primary/20"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {community.is_official && (
                <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] px-1.5 py-0 font-semibold">
                  <Star className="w-3 h-3 mr-0.5" />
                  Oficial
                </Badge>
              )}
              <h3 className="font-bold text-base truncate">{community.name}</h3>
            </div>

            {community.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{community.description}</p>
            )}

            <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5" />
                {responsibleName}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {memberCount} {memberCount === 1 ? "membro" : "membros"}
              </span>
              {poolCount > 0 ? (
                <span className="flex items-center gap-1.5 text-primary font-semibold">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                  {poolCount} {poolCount === 1 ? "bolão disponível" : "bolões disponíveis"}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" />
                  Nenhum bolão aberto
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <Button
              size="sm"
              variant={isFollowing ? "outline" : "default"}
              className={cn(
                "rounded-full text-xs h-8 px-3",
                isFollowing && "border-primary/50 text-primary hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50",
                community.is_official && isFollowing && "pointer-events-none opacity-70"
              )}
              onClick={handleFollowClick}
            >
              {isFollowing ? "Seguindo" : "Seguir"}
            </Button>

            {isFollowing && (
              <label
                className={cn(
                  "flex items-center gap-1.5 text-[11px] cursor-pointer transition-all duration-500",
                  animateNotify && "scale-110",
                  notifyActive ? "text-primary font-semibold" : "text-muted-foreground"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={notifyActive}
                  onCheckedChange={(checked) => handleNotifyChange(!!checked)}
                  className={cn(
                    "h-4 w-4 transition-all duration-500",
                    animateNotify && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  )}
                />
                {notifyActive ? (
                  <Bell className="w-3 h-3" />
                ) : (
                  <BellOff className="w-3 h-3" />
                )}
                <span>Notificar</span>
              </label>
            )}
          </div>
        </div>

        <div className="flex justify-end mt-2">
          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
            Ver bolões <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default CommunityCard;
