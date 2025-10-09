import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from '@/integrations/supabase/client';

export class NotificationService {
  static async requestPermissions() {
    try {
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  static async scheduleNotification(title: string, body: string, id?: number) {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.log('Notification permission not granted');
        return;
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: id || Date.now(),
            schedule: { at: new Date(Date.now() + 1000) },
            sound: undefined,
            attachments: undefined,
            actionTypeId: '',
            extra: null,
          },
        ],
      });
    } catch (error) {
      console.error('Error scheduling notification:', error);
    }
  }

  static async notifyParticipantApproved(poolTitle: string) {
    await this.scheduleNotification(
      'Você foi aprovado! 🎉',
      `Sua participação no bolão "${poolTitle}" foi aprovada!`
    );
  }

  static async notifyNewParticipant(poolTitle: string, participantName: string) {
    await this.scheduleNotification(
      'Nova solicitação! 👥',
      `${participantName} quer participar do bolão "${poolTitle}"`
    );
  }

  static async notifyResultDeclared(poolTitle: string, isWinner: boolean) {
    if (isWinner) {
      await this.scheduleNotification(
        'Você venceu! 🏆',
        `Parabéns! Você venceu o bolão "${poolTitle}"!`
      );
    } else {
      await this.scheduleNotification(
        'Resultado declarado 📊',
        `O resultado do bolão "${poolTitle}" foi divulgado!`
      );
    }
  }

  static async setupRealtimeNotifications(userId: string) {
    // Listen for participant approvals
    supabase
      .channel('participant-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'participants',
          filter: `user_id=eq.${userId}`,
        },
        async (payload: any) => {
          if (payload.new.status === 'approved' && payload.old.status === 'pending') {
            const { data: pool } = await supabase
              .from('pools')
              .select('title')
              .eq('id', payload.new.pool_id)
              .single();
            
            if (pool) {
              await NotificationService.notifyParticipantApproved(pool.title);
            }
          }
        }
      )
      .subscribe();

    // Listen for pool results
    supabase
      .channel('pool-results')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pools',
        },
        async (payload: any) => {
          if (payload.new.status === 'finished' && payload.old.status !== 'finished') {
            // Check if user is a participant
            const { data: participation } = await supabase
              .from('participants')
              .select('*')
              .eq('pool_id', payload.new.id)
              .eq('user_id', userId)
              .eq('status', 'approved')
              .single();

            if (participation) {
              const isWinner = payload.new.winner_id === userId;
              await NotificationService.notifyResultDeclared(payload.new.title, isWinner);
            }
          }
        }
      )
      .subscribe();
  }
}
