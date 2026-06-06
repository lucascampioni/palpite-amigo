import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import webpush from "npm:web-push@3.6.7";
import {
  sendWhatsAppThrottled,
  pickRandom,
  randomDelayMs,
  sleep,
  isWithinBusinessHours,
} from "../_shared/whatsapp-throttle.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_PER_EXECUTION = 6;

// ── Message variation banks ─────────────────────────────────────────────
function firstMatchOwnerMsg(name: string, pool: string, link: string) {
  return pickRandom([
    `🎯 *Delfos*\n\nOlá ${name}! ⚽🔥\n\nOs jogos do seu bolão *"${pool}"* já começaram!\n\nAcesse o app para acompanhar os *placares ao vivo*, o *ranking em tempo real* e a premiação final! 📊🏆\n\n👉 ${link}\n\n🔕 _Ajuste suas notificações no site quando quiser._`,
    `🎯 Delfos\n\nE aí ${name}! Os jogos do seu bolão *"${pool}"* acabaram de começar! ⚽\n\nAbra o app para ver os placares ao vivo e o ranking atualizado em tempo real. 🏆\n\n${link}`,
    `⚽ *Bolão "${pool}" no ar!*\n\nOlá ${name}, os jogos começaram. Acompanhe placares e ranking direto no app:\n${link}\n\n— Delfos 🎯`,
    `🔥 ${name}, partiu acompanhar?\n\nO bolão *"${pool}"* que você organizou já está rolando. Veja os placares ao vivo e a classificação:\n${link}\n\nDelfos 🎯`,
  ]);
}
function firstMatchPlayerMsg(name: string, pool: string, link: string) {
  return pickRandom([
    `🎯 *Delfos*\n\nOlá ${name}! ⚽🔥\n\nOs palpites do bolão *"${pool}"* foram encerrados e os jogos já começaram!\n\nAcesse o app para ver a premiação final, acompanhar os *placares ao vivo* e o *ranking em tempo real*! 📊🏆\n\n👉 ${link}\n\n🔕 _Ajuste suas notificações no site quando quiser._`,
    `⚽ Bora torcer, ${name}!\n\nOs jogos do bolão *"${pool}"* começaram. Veja placares e ranking ao vivo:\n${link}\n\nDelfos 🎯`,
    `🔥 ${name}, deu o pontapé!\n\nO bolão *"${pool}"* já está rolando. Acompanhe sua posição no ranking em tempo real:\n${link}\n\n— Delfos`,
    `🎯 Delfos\n\nFala ${name}! Palpites encerrados — agora é torcer. ⚽\n\nAcompanhe os jogos do *"${pool}"* e veja como anda seu ranking: ${link}`,
  ]);
}
function cancelledMsg(name: string, pool: string, link: string) {
  return pickRandom([
    `🎯 *Delfos*\n\nOlá ${name}! 🚫\n\nO bolão *"${pool}"* foi *cancelado* porque todos os jogos foram adiados ou cancelados.\n\nSentimos muito pelo inconveniente! Fique de olho nos próximos bolões. ⚽\n\n👉 ${link}`,
    `🚫 ${name}, aviso importante: o bolão *"${pool}"* foi cancelado (os jogos foram adiados/cancelados).\n\nDesculpe o transtorno — em breve teremos novos bolões! 👉 ${link}\n\nDelfos 🎯`,
    `Delfos 🎯\n\nOlá ${name}, infelizmente o bolão *"${pool}"* foi cancelado devido ao cancelamento/adiamento dos jogos. 🚫\n\nVamos te avisar quando rolar o próximo: ${link}`,
    `⚠️ ${name}, o bolão *"${pool}"* precisou ser cancelado porque os jogos não vão acontecer.\n\nObrigado pela compreensão! Mais detalhes: ${link}\n\n— Delfos`,
  ]);
}
function finishedOwnerMsg(name: string, pool: string, link: string) {
  return pickRandom([
    `🎯 *Delfos*\n\nOlá ${name}! 🏁\n\nSeu bolão *"${pool}"* foi *finalizado* e o ranking final está definido!\n\nAcesse o app para ver a classificação completa e gerenciar a premiação! 🏆🎉\n\n👉 ${link}`,
    `🏆 ${name}, seu bolão *"${pool}"* chegou ao fim!\n\nO ranking final já está disponível. Confira e organize a premiação: ${link}\n\nDelfos 🎯`,
    `🎯 Delfos\n\n${name}, bolão encerrado! 🏁\n\n*"${pool}"* fechou o ranking final. Veja resultados e prêmios: ${link}`,
    `🏁 Fim de jogo no *"${pool}"*!\n\n${name}, o ranking final está pronto. Acesse para conferir os vencedores e a premiação: ${link}\n\n— Delfos 🎯`,
  ]);
}
function finishedPlayerMsg(name: string, pool: string, link: string) {
  return pickRandom([
    `🎯 *Delfos*\n\nOlá ${name}! 🏁\n\nO bolão *"${pool}"* foi *finalizado* e o ranking final está definido!\n\nAcesse o app para ver a classificação completa e descobrir se você foi o vencedor! 🏆🎉\n\n👉 ${link}`,
    `🏆 ${name}, deu o apito final!\n\nO bolão *"${pool}"* está encerrado. Veja onde você ficou no ranking: ${link}\n\nDelfos 🎯`,
    `🏁 Acabou! O bolão *"${pool}"* foi finalizado, ${name}.\n\nConfira o ranking completo e veja se levou prêmio: ${link}\n\n— Delfos`,
    `🎯 Delfos\n\nFala ${name}! 🏆\n\nResultado final do bolão *"${pool}"* já está no app. Bora ver? ${link}`,
  ]);
}
function voucherReminderMsg(reminder: '3h' | '30min', hasAccount: boolean, pool: string, deadline: string, link: string) {
  const urgency = reminder === '30min' ? '⚠️ *ÚLTIMO AVISO!* ' : '';
  const time = reminder === '30min' ? 'Faltam apenas *30 minutos*!' : `O prazo encerra em *${deadline}*.`;
  if (hasAccount) {
    return pickRandom([
      `${urgency}🎯 *Delfos - Lembrete!*\n\nVocê foi inscrito no bolão *"${pool}"*, mas ainda não fez seus palpites!\n\n${time}\n\n👉 Faça seus palpites agora:\n${link}\n\nNão perca! 🍀`,
      `${urgency}🎯 Delfos\n\nEi! Seus palpites no bolão *"${pool}"* ainda estão em branco. ${time}\n\nFinaliza agora: ${link}`,
      `${urgency}⏰ Lembrete do bolão *"${pool}"*: você ainda não preencheu seus palpites.\n\n${time}\n\nNão deixa pra depois 👉 ${link}\n\n— Delfos`,
      `${urgency}🍀 Sua vaga em *"${pool}"* está garantida, mas faltam seus palpites!\n\n${time}\n\nResponde rapidinho: ${link}\n\nDelfos 🎯`,
    ]);
  }
  return pickRandom([
    `${urgency}🎯 *Delfos - Lembrete!*\n\nVocê foi convidado para o bolão *"${pool}"*, mas ainda não se cadastrou!\n\n${time}\n\n📲 Crie sua conta e faça seus palpites:\n${link}\n\nNão perca! 🍀`,
    `${urgency}🎯 Delfos\n\nVocê tem um convite pro bolão *"${pool}"* esperando! ${time}\n\nCria sua conta e palpita: ${link}`,
    `${urgency}⏰ Seu convite pro bolão *"${pool}"* ainda está aberto.\n\n${time}\n\nÉ rápido — cadastre-se e palpite: ${link}\n\nDelfos 🎯`,
    `${urgency}🍀 Não perca o bolão *"${pool}"*!\n\n${time}\n\nFaça seu cadastro e envie seus palpites: ${link}\n\n— Delfos`,
  ]);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) throw new Error('Z-API credentials not configured');
    const creds = { instanceId: ZAPI_INSTANCE_ID, token: ZAPI_TOKEN, clientToken: ZAPI_CLIENT_TOKEN };

    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
    const rawSubject = Deno.env.get('VAPID_SUBJECT') || 'contato@delfos.app.br';
    const vapidSubject = rawSubject.startsWith('mailto:') || rawSubject.startsWith('http') ? rawSubject : `mailto:${rawSubject}`;
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(vapidSubject, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    }

    async function sendWebPushToUsers(userIds: string[], title: string, body: string, url: string) {
      if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || userIds.length === 0) return { sent: 0, total: 0 };
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .in('user_id', userIds);
      if (!subs || subs.length === 0) return { sent: 0, total: 0 };
      const payload = JSON.stringify({ title, body, url });
      let sent = 0;
      await Promise.all(subs.map(async (s: any) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
          sent++;
        } catch (err: any) {
          const status = err?.statusCode;
          if (status === 404 || status === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', s.id);
          }
          console.error('webpush error:', status, err?.body || err?.message);
        }
      }));
      return { sent, total: subs.length };
    }

    const results: any[] = [];
    const pushResults: any[] = [];
    let totalSent = 0;
    let aborted = false;

    // Helper: send to one recipient with throttle + delay; returns false to abort the run.
    async function sendOne(opts: { phone: string; message: string; type: string; respectBusinessHours: boolean; poolTitle: string }) {
      if (totalSent >= MAX_PER_EXECUTION) { aborted = true; return false; }
      const out = await sendWhatsAppThrottled(supabase, creds, opts.phone, opts.message, {
        messageType: opts.type, respectBusinessHours: opts.respectBusinessHours,
      });
      results.push({ type: opts.type, pool: opts.poolTitle, phone: opts.phone, ...out });
      if (out.sent) {
        totalSent++;
        await sleep(randomDelayMs());
        return true;
      }
      if (out.reason === 'circuit_open' || out.reason === 'rate_limited' || out.reason === 'outside_hours') {
        aborted = true;
        return false;
      }
      // error on a single send — continue with next recipient
      return true;
    }

    // ════════════════════════════════════════════════════════════════
    // 1. FIRST MATCH STARTED — sendable any time (player waiting for game)
    // ════════════════════════════════════════════════════════════════
    const { data: activePoolsNotNotified } = await supabase
      .from('pools').select('id, title, slug, owner_id')
      .eq('pool_type', 'football').eq('status', 'active').eq('first_match_notified', false);

    for (const pool of activePoolsNotNotified || []) {
      if (aborted) break;
      const { data: liveMatches } = await supabase
        .from('football_matches').select('id, status').eq('pool_id', pool.id)
        .in('status', ['1H', '2H', 'HT', 'ET', 'P']);
      if (!liveMatches || liveMatches.length === 0) continue;

      const poolLink = `https://delfos.app.br/bolao/${pool.slug || pool.id}`;
      const { data: participants } = await supabase
        .from('participants').select('user_id, participant_name')
        .eq('pool_id', pool.id).eq('status', 'approved');

      if (!participants || participants.length === 0) {
        await supabase.from('pools').update({ first_match_notified: true }).eq('id', pool.id);
        continue;
      }

      const userIds = participants.map(p => p.user_id);
      if (!userIds.includes(pool.owner_id)) userIds.push(pool.owner_id);
      const { data: profiles } = await supabase
        .from('profiles').select('id, phone, notify_pool_updates, full_name').in('id', userIds);

      const phoneMap: Record<string, string> = {};
      const nameMap: Record<string, string> = {};
      profiles?.forEach(p => {
        if (p.phone && p.notify_pool_updates) phoneMap[p.id] = p.phone;
        nameMap[p.id] = p.full_name;
      });

      const recipients = participants.map(p => ({ user_id: p.user_id, name: p.participant_name }));
      if (!recipients.find(r => r.user_id === pool.owner_id)) {
        recipients.push({ user_id: pool.owner_id, name: nameMap[pool.owner_id] || 'Organizador' });
      }

      for (const r of recipients) {
        if (aborted) break;
        const phone = phoneMap[r.user_id];
        if (!phone) continue;
        const isOwner = r.user_id === pool.owner_id;
        const message = isOwner ? firstMatchOwnerMsg(r.name, pool.title, poolLink) : firstMatchPlayerMsg(r.name, pool.title, poolLink);
        await sendOne({ phone, message, type: 'first_match_started', respectBusinessHours: false, poolTitle: pool.title });
      }

      const pushRes = await sendWebPushToUsers(recipients.map(r => r.user_id), '⚽ Os jogos começaram!', `O bolão "${pool.title}" começou. Acompanhe ao vivo!`, `/bolao/${pool.slug || pool.id}`);
      pushResults.push({ type: 'first_match_started', pool: pool.title, ...pushRes });

      if (!aborted) await supabase.from('pools').update({ first_match_notified: true }).eq('id', pool.id);
    }

    // ════════════════════════════════════════════════════════════════
    // 2. POOL CANCELLED — critical, sendable any time
    // ════════════════════════════════════════════════════════════════
    if (!aborted) {
      const { data: cancelledPoolsNotNotified } = await supabase
        .from('pools').select('id, title, slug, owner_id')
        .eq('pool_type', 'football').eq('status', 'cancelled').eq('cancelled_notified', false);

      for (const pool of cancelledPoolsNotNotified || []) {
        if (aborted) break;
        const poolLink = `https://delfos.app.br/bolao/${pool.slug || pool.id}`;
        const { data: participants } = await supabase
          .from('participants').select('user_id, participant_name')
          .eq('pool_id', pool.id).eq('status', 'approved');

        if (!participants || participants.length === 0) {
          await supabase.from('pools').update({ cancelled_notified: true }).eq('id', pool.id);
          continue;
        }

        const userIds = participants.map(p => p.user_id);
        if (!userIds.includes(pool.owner_id)) userIds.push(pool.owner_id);
        const { data: profiles } = await supabase
          .from('profiles').select('id, phone, notify_pool_updates, full_name').in('id', userIds);

        const phoneMap: Record<string, string> = {};
        const nameMap: Record<string, string> = {};
        profiles?.forEach(p => {
          if (p.phone && p.notify_pool_updates) phoneMap[p.id] = p.phone;
          nameMap[p.id] = p.full_name;
        });

        const recipients = participants.map(p => ({ user_id: p.user_id, name: p.participant_name }));
        if (!recipients.find(r => r.user_id === pool.owner_id)) {
          recipients.push({ user_id: pool.owner_id, name: nameMap[pool.owner_id] || 'Organizador' });
        }

        for (const r of recipients) {
          if (aborted) break;
          const phone = phoneMap[r.user_id];
          if (!phone) continue;
          await sendOne({ phone, message: cancelledMsg(r.name, pool.title, poolLink), type: 'pool_cancelled', respectBusinessHours: false, poolTitle: pool.title });
        }

        const pushRes = await sendWebPushToUsers(recipients.map(r => r.user_id), '🚫 Bolão cancelado', `O bolão "${pool.title}" foi cancelado.`, `/bolao/${pool.slug || pool.id}`);
        pushResults.push({ type: 'pool_cancelled', pool: pool.title, ...pushRes });

        if (!aborted) await supabase.from('pools').update({ cancelled_notified: true }).eq('id', pool.id);
      }
    }

    // ════════════════════════════════════════════════════════════════
    // 3. POOL FINISHED — restrict to 8h-21h BRT
    // ════════════════════════════════════════════════════════════════
    if (!aborted && isWithinBusinessHours()) {
      const { data: finishedPoolsNotNotified } = await supabase
        .from('pools').select('id, title, slug, owner_id')
        .eq('pool_type', 'football').eq('status', 'finished').eq('finished_notified', false);

      for (const pool of finishedPoolsNotNotified || []) {
        if (aborted) break;
        const poolLink = `https://delfos.app.br/bolao/${pool.slug || pool.id}`;
        const { data: participants } = await supabase
          .from('participants').select('id, user_id, participant_name')
          .eq('pool_id', pool.id).eq('status', 'approved');

        if (!participants || participants.length === 0) {
          await supabase.from('pools').update({ finished_notified: true }).eq('id', pool.id);
          continue;
        }

        const userIds = participants.map(p => p.user_id);
        if (!userIds.includes(pool.owner_id)) userIds.push(pool.owner_id);
        const { data: profiles } = await supabase
          .from('profiles').select('id, phone, notify_pool_updates, full_name').in('id', userIds);

        const phoneMap: Record<string, string> = {};
        const nameMap: Record<string, string> = {};
        profiles?.forEach(p => {
          if (p.phone && p.notify_pool_updates) phoneMap[p.id] = p.phone;
          nameMap[p.id] = p.full_name;
        });

        const recipients = participants.map(p => ({ user_id: p.user_id, name: p.participant_name }));
        if (!recipients.find(r => r.user_id === pool.owner_id)) {
          recipients.push({ user_id: pool.owner_id, name: nameMap[pool.owner_id] || 'Organizador' });
        }

        for (const r of recipients) {
          if (aborted) break;
          const phone = phoneMap[r.user_id];
          if (!phone) continue;
          const isOwner = r.user_id === pool.owner_id;
          const message = isOwner ? finishedOwnerMsg(r.name, pool.title, poolLink) : finishedPlayerMsg(r.name, pool.title, poolLink);
          await sendOne({ phone, message, type: 'pool_finished', respectBusinessHours: true, poolTitle: pool.title });
        }

        const pushRes = await sendWebPushToUsers(recipients.map(r => r.user_id), '🏆 Bolão finalizado!', `O ranking final do bolão "${pool.title}" está disponível.`, `/bolao/${pool.slug || pool.id}`);
        pushResults.push({ type: 'pool_finished', pool: pool.title, ...pushRes });

        if (!aborted) await supabase.from('pools').update({ finished_notified: true }).eq('id', pool.id);
      }
    } else if (!aborted) {
      console.log('[notify-pool-events] outside 8h-21h BRT — skipping pool_finished batch');
    }

    // ════════════════════════════════════════════════════════════════
    // 4. VOUCHER REMINDER — time-sensitive, sendable any time
    // ════════════════════════════════════════════════════════════════
    const now = new Date();
    const REMINDER_3H_MS = 3 * 60 * 60 * 1000;
    const REMINDER_30M_MS = 30 * 60 * 1000;

    if (!aborted) {
      const { data: estabelecimentoPools } = await supabase
        .from('pools').select('id, title, slug, deadline, prize_type, reminder_3h_sent, reminder_30min_sent')
        .eq('status', 'active').eq('prize_type', 'estabelecimento');

      for (const pool of estabelecimentoPools || []) {
        if (aborted) break;
        if (pool.reminder_3h_sent && pool.reminder_30min_sent) continue;

        const deadlineTime = new Date(pool.deadline).getTime();
        const timeUntilDeadline = deadlineTime - now.getTime();

        let reminderType: '3h' | '30min' | null = null;
        if (!pool.reminder_3h_sent && timeUntilDeadline <= REMINDER_3H_MS && timeUntilDeadline > REMINDER_30M_MS) {
          reminderType = '3h';
        } else if (!pool.reminder_30min_sent && timeUntilDeadline <= REMINDER_30M_MS && timeUntilDeadline > 0) {
          reminderType = '30min';
        } else if (!pool.reminder_3h_sent && timeUntilDeadline <= REMINDER_30M_MS && timeUntilDeadline > 0) {
          await supabase.from('pools').update({ reminder_3h_sent: true }).eq('id', pool.id);
          if (!pool.reminder_30min_sent) reminderType = '30min';
        }
        if (!reminderType) continue;

        const poolLink = `https://delfos.app.br/bolao/${pool.slug || pool.id}`;
        const { data: vouchers } = await supabase
          .from('pool_vouchers').select('id, phone, used_by, prediction_sets').eq('pool_id', pool.id);

        if (!vouchers || vouchers.length === 0) {
          const updateCol = reminderType === '3h' ? { reminder_3h_sent: true } : { reminder_30min_sent: true };
          await supabase.from('pools').update(updateCol).eq('id', pool.id);
          continue;
        }

        let anySkipped = false;
        for (const voucher of vouchers) {
          if (aborted) { anySkipped = true; break; }
          let needsReminder = false;
          const recipientPhone = voucher.phone;

          if (!voucher.used_by) {
            needsReminder = true;
          } else {
            const { data: participant } = await supabase
              .from('participants').select('id')
              .eq('pool_id', pool.id).eq('user_id', voucher.used_by).eq('status', 'approved').maybeSingle();
            if (participant) {
              const { count } = await supabase
                .from('football_predictions').select('id', { count: 'exact', head: true }).eq('participant_id', participant.id);
              if (!count || count === 0) needsReminder = true;
            } else {
              needsReminder = true;
            }
          }

          if (!needsReminder || !recipientPhone) continue;

          const deadlineFormatted = new Date(pool.deadline).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
          });
          const message = voucherReminderMsg(reminderType, !!voucher.used_by, pool.title, deadlineFormatted, poolLink);

          const before = totalSent;
          await sendOne({ phone: recipientPhone, message, type: `voucher_reminder_${reminderType}`, respectBusinessHours: false, poolTitle: pool.title });
          if (aborted && totalSent === before) { anySkipped = true; break; }
        }

        if (!anySkipped && !aborted) {
          const updateCol = reminderType === '3h' ? { reminder_3h_sent: true } : { reminder_30min_sent: true };
          await supabase.from('pools').update(updateCol).eq('id', pool.id);
        }
      }
    }

    console.log(`📨 Pool event notifications: ${totalSent}/${results.length} sent (aborted=${aborted})`);

    return new Response(
      JSON.stringify({ success: true, sent: totalSent, total: results.length, aborted, results, pushResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('notify-pool-events error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
