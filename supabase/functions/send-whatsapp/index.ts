import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SendMessageRequest {
  phone: string;
  message: string;
}

interface BulkSendRequest {
  messages: SendMessageRequest[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      throw new Error('Z-API credentials not configured');
    }

    const body = await req.json();
    const isBulk = Array.isArray(body.messages);

    const messages: SendMessageRequest[] = isBulk ? body.messages : [{ phone: body.phone, message: body.message }];

    if (!messages.length) {
      throw new Error('No messages provided');
    }

    const results: { phone: string; success: boolean; error?: string }[] = [];

    for (const msg of messages) {
      const digits = msg.phone.replace(/\D/g, '');
      const phoneWithCountry = digits.startsWith('55') ? digits : `55${digits}`;

      try {
        const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (ZAPI_CLIENT_TOKEN) {
          headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone: phoneWithCountry,
            message: msg.message,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error(`Z-API error for ${phoneWithCountry}:`, data);
          results.push({ phone: phoneWithCountry, success: false, error: data?.message || `HTTP ${response.status}` });
        } else {
          results.push({ phone: phoneWithCountry, success: true });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Error sending to ${phoneWithCountry}:`, errorMsg);
        results.push({ phone: phoneWithCountry, success: false, error: errorMsg });
      }

      // Small delay between messages to avoid rate limiting
      if (messages.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({ success: failCount === 0, results, successCount, failCount }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('send-whatsapp error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
