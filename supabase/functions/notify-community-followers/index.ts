import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Not authenticated');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!).auth.getUser(token);
    if (authError || !user) throw new Error('Not authenticated');

    const { pool_id } = await req.json();
    if (!pool_id) throw new Error('pool_id is required');

    // Get pool data and verify ownership
    const { data: pool, error: poolError } = await supabase
      .from('pools')
      .select('id, title, slug, owner_id, community_notified, status')
      .eq('id', pool_id)
      .single();

    if (poolError || !pool) throw new Error('Pool not found');
    if (pool.owner_id !== user.id) throw new Error('Only the pool owner can send this notification');
    if (pool.community_notified) throw new Error('Notification already sent for this pool');
    if (pool.status !== 'active') throw new Error('Pool must be active');

    // Find communities where this user is the responsible
    const { data: communities } = await supabase
      .from('communities')
      .select('id, name')
      .eq('responsible_user_id', user.id);

    if (!communities || communities.length === 0) {
      throw new Error('No communities found for this user');
    }

    const communityIds = communities.map(c => c.id);

    // Get community members with notify_new_pools enabled
    const { data: members } = await supabase
      .from('community_members')
      .select('user_id, notify_new_pools')
      .in('community_id', communityIds)
      .eq('notify_new_pools', true);

    if (!members || members.length === 0) {
      // Mark as notified even if no one to notify
      await supabase.from('pools').update({ community_notified: true }).eq('id', pool_id);
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No eligible members to notify' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get unique user IDs
    const uniqueUserIds = [...new Set(members.map(m => m.user_id))];

    // For WhatsApp: filter only users who also have notify_new_pools = true in their profile AND have a phone
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, phone, notify_new_pools')
      .in('id', uniqueUserIds)
      .eq('notify_new_pools', true)
      .not('phone', 'is', null);

    // Exclude the pool owner from receiving the notification
    const eligibleProfiles = (profiles || []).filter(p => p.id !== user.id);

    const results: { phone: string; success: boolean; error?: string }[] = [];

    if (eligibleProfiles.length > 0) {

    // Send via Twilio WhatsApp (approved template — no variables)
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
    if (!TWILIO_API_KEY) throw new Error('TWILIO_API_KEY is not configured');
    if (!TWILIO_PHONE_NUMBER) throw new Error('TWILIO_PHONE_NUMBER is not configured');

    const fromDigits = TWILIO_PHONE_NUMBER.replace(/\D/g, '');
    const fromWhatsapp = TWILIO_PHONE_NUMBER.startsWith('whatsapp:')
      ? TWILIO_PHONE_NUMBER
      : `whatsapp:+${fromDigits}`;

    // Approved template content SID — "Venha participar dos bolões da Delfos."
    const CONTENT_SID = 'HXff844077144fa7023eb2c0f54d8f2982';
    const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';


    for (const profile of eligibleProfiles) {
      const digits = profile.phone!.replace(/\D/g, '');
      const phoneWithCountry = digits.startsWith('55') ? digits : `55${digits}`;
      const to = `whatsapp:+${phoneWithCountry}`;

      const params = new URLSearchParams();
      params.append('To', to);
      params.append('From', fromWhatsapp);
      params.append('ContentSid', CONTENT_SID);

      try {
        const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'X-Connection-Api-Key': TWILIO_API_KEY,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });

        const data = await response.json();
        if (!response.ok) {
          console.error(`Twilio error for ${to}:`, data);
          results.push({ phone: phoneWithCountry, success: false, error: data?.message || `HTTP ${response.status}` });
        } else {
          results.push({ phone: phoneWithCountry, success: true });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        results.push({ phone: phoneWithCountry, success: false, error: errorMsg });
      }

      if (eligibleProfiles.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    } // end if eligibleProfiles.length > 0

    // Send web push to ALL community members with notify_new_pools enabled (regardless of phone)
    let pushSent = 0;
    let pushTotal = 0;
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
    const rawSubject = Deno.env.get('VAPID_SUBJECT') || 'contato@delfos.app.br';
    const vapidSubject = rawSubject.startsWith('mailto:') || rawSubject.startsWith('http') ? rawSubject : `mailto:${rawSubject}`;
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      try {
        webpush.setVapidDetails(vapidSubject, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
        const { data: pushProfiles } = await supabase
          .from('profiles')
          .select('id')
          .in('id', uniqueUserIds)
          .eq('notify_new_pools', true);
        const pushUserIds = (pushProfiles || []).map(p => p.id).filter(id => id !== user.id);
        if (pushUserIds.length > 0) {
          const { data: subs } = await supabase
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .in('user_id', pushUserIds);
          if (subs && subs.length > 0) {
            pushTotal = subs.length;
            const payload = JSON.stringify({
              title: '🎯 Novo bolão disponível!',
              body: `"${pool.title}" acaba de ser publicado. Participe!`,
              url: `/bolao/${pool.slug || pool.id}`,
            });
            await Promise.all(subs.map(async (s: any) => {
              try {
                await webpush.sendNotification(
                  { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                  payload,
                );
                pushSent++;
              } catch (err: any) {
                const status = err?.statusCode;
                if (status === 404 || status === 410) {
                  await supabase.from('push_subscriptions').delete().eq('id', s.id);
                }
              }
            }));
          }
        }
      } catch (err) {
        console.error('webpush dispatch error:', err);
      }
    }

    // Mark pool as community_notified
    await supabase.from('pools').update({ community_notified: true }).eq('id', pool_id);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({ success: true, sent: successCount, failed: failCount, total: eligibleProfiles.length, push: { sent: pushSent, total: pushTotal } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('notify-community-followers error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
