import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const pub = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const priv = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:contato@delfos.app.br';
    if (!pub || !priv) throw new Error('VAPID keys not configured');

    const auth = req.headers.get('Authorization');
    if (!auth) throw new Error('Not authenticated');
    const { data: { user } } = await createClient(url, anon).auth.getUser(auth.replace('Bearer ', ''));
    if (!user) throw new Error('Not authenticated');

    // Only admins can broadcast
    const supabase = createClient(url, service);
    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    const isAdmin = roles?.some(r => r.role === 'admin') || user.email === 'lukas.campioni@gmail.com';

    const body = await req.json().catch(() => ({}));
    const title = body.title || 'Delfos';
    const message = body.body || 'Notificação de teste 🎉';
    const targetUrl = body.url || '/';
    const onlyMe = body.onlyMe === true || !isAdmin;

    let q = supabase.from('push_subscriptions').select('*');
    if (onlyMe) q = q.eq('user_id', user.id);
    const { data: subs, error } = await q;
    if (error) throw error;
    if (!subs?.length) throw new Error('No subscriptions found');

    webpush.setVapidDetails(subject, pub, priv);

    const payload = JSON.stringify({ title, body: message, url: targetUrl });
    const results = await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        return { id: s.id, ok: true };
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        }
        return { id: s.id, ok: false, error: err?.body || err?.message || String(err), status };
      }
    }));

    const sent = results.filter(r => r.ok).length;
    return new Response(JSON.stringify({ success: true, sent, total: subs.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
