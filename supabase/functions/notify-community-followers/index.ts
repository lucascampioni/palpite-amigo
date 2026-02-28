import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Filter: only users who also have notify_new_pools = true in their profile AND have a phone
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, phone, notify_new_pools')
      .in('id', uniqueUserIds)
      .eq('notify_new_pools', true)
      .not('phone', 'is', null);

    if (!profiles || profiles.length === 0) {
      await supabase.from('pools').update({ community_notified: true }).eq('id', pool_id);
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No eligible members with phone and notifications enabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Exclude the pool owner from receiving the notification
    const eligibleProfiles = profiles.filter(p => p.id !== user.id);

    if (eligibleProfiles.length === 0) {
      await supabase.from('pools').update({ community_notified: true }).eq('id', pool_id);
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No other eligible members to notify' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build message
    const poolLink = `https://delfos.app.br/bolao/${pool.slug || pool.id}`;
    const message = `⚽ *Novo bolão disponível!*\n\n` +
      `O bolão *${pool.title}* está valendo! 🎉\n\n` +
      `Acesse agora e faça seu palpite:\n${poolLink}\n\n` +
      `🔕 Ajuste suas notificações no site quando quiser.`;

    // Send via Z-API
    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      throw new Error('Z-API credentials not configured');
    }

    const results: { phone: string; success: boolean; error?: string }[] = [];

    for (const profile of eligibleProfiles) {
      const digits = profile.phone!.replace(/\D/g, '');
      const phoneWithCountry = digits.startsWith('55') ? digits : `55${digits}`;

      try {
        const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (ZAPI_CLIENT_TOKEN) headers['Client-Token'] = ZAPI_CLIENT_TOKEN;

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ phone: phoneWithCountry, message }),
        });

        const data = await response.json();
        if (!response.ok) {
          results.push({ phone: phoneWithCountry, success: false, error: data?.message || `HTTP ${response.status}` });
        } else {
          results.push({ phone: phoneWithCountry, success: true });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        results.push({ phone: phoneWithCountry, success: false, error: errorMsg });
      }

      // Delay between messages
      if (eligibleProfiles.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Mark pool as community_notified
    await supabase.from('pools').update({ community_notified: true }).eq('id', pool_id);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({ success: true, sent: successCount, failed: failCount, total: eligibleProfiles.length }),
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
