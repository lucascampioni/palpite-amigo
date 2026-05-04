import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';

interface SendMessageRequest {
  phone: string;
  // Free-form text (only delivered inside Twilio's 24h session window).
  message?: string;
  // Optional Content Template SID (HX...). When provided, uses Twilio Content API
  // (required for messages outside the 24h window).
  contentSid?: string;
  // Variables for the template, keyed by position: { "1": "value", "2": "value" }
  contentVariables?: Record<string, string>;
}

interface BulkSendRequest {
  messages: SendMessageRequest[];
  contentSid?: string;
  contentVariables?: Record<string, string>;
}

// Default approved template (no variables): "Venha participar dos bolões da Delfos."
const DEFAULT_CONTENT_SID = 'HXff844077144fa7023eb2c0f54d8f2982';

async function sendOne(
  lovableKey: string,
  twilioKey: string,
  fromWhatsapp: string,
  msg: SendMessageRequest,
  fallbackContentSid?: string,
  fallbackContentVariables?: Record<string, string>,
): Promise<{ phone: string; success: boolean; error?: string; sid?: string }> {
  const digits = msg.phone.replace(/\D/g, '');
  const phoneWithCountry = digits.startsWith('55') ? digits : `55${digits}`;
  const to = `whatsapp:+${phoneWithCountry}`;

  const params = new URLSearchParams();
  params.append('To', to);
  params.append('From', fromWhatsapp);

  const contentSid = msg.contentSid || fallbackContentSid;
  const contentVariables = msg.contentVariables || fallbackContentVariables;

  if (contentSid) {
    params.append('ContentSid', contentSid);
    if (contentVariables && Object.keys(contentVariables).length > 0) {
      params.append('ContentVariables', JSON.stringify(contentVariables));
    }
  } else if (msg.message) {
    // Free-form text — only works inside the 24h session window.
    params.append('Body', msg.message);
  } else {
    return { phone: phoneWithCountry, success: false, error: 'No message body or contentSid provided' };
  }

  try {
    const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'X-Connection-Api-Key': twilioKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`Twilio error for ${to}:`, data);
      return { phone: phoneWithCountry, success: false, error: data?.message || `HTTP ${response.status}` };
    }
    return { phone: phoneWithCountry, success: true, sid: data?.sid };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Error sending to ${to}:`, errorMsg);
    return { phone: phoneWithCountry, success: false, error: errorMsg };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
    if (!TWILIO_API_KEY) throw new Error('TWILIO_API_KEY is not configured (link Twilio in Connectors)');

    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');
    if (!TWILIO_PHONE_NUMBER) throw new Error('TWILIO_PHONE_NUMBER is not configured');

    // Normalize From: must be in the form whatsapp:+E164
    const fromDigits = TWILIO_PHONE_NUMBER.replace(/\D/g, '');
    const fromWhatsapp = TWILIO_PHONE_NUMBER.startsWith('whatsapp:')
      ? TWILIO_PHONE_NUMBER
      : `whatsapp:+${fromDigits}`;

    const body = await req.json() as BulkSendRequest & SendMessageRequest;
    const isBulk = Array.isArray((body as BulkSendRequest).messages);

    const messages: SendMessageRequest[] = isBulk
      ? (body as BulkSendRequest).messages
      : [{ phone: body.phone, message: body.message, contentSid: body.contentSid, contentVariables: body.contentVariables }];

    if (!messages.length) throw new Error('No messages provided');

    // If caller didn't specify a contentSid AND didn't pass a message body, use default approved template
    const fallbackContentSid = body.contentSid;
    const fallbackContentVariables = body.contentVariables;

    const results: { phone: string; success: boolean; error?: string; sid?: string }[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      // If neither template nor message provided, fall back to default approved template
      const effectiveSid = msg.contentSid || fallbackContentSid || (!msg.message ? DEFAULT_CONTENT_SID : undefined);
      const result = await sendOne(
        LOVABLE_API_KEY,
        TWILIO_API_KEY,
        fromWhatsapp,
        { ...msg, contentSid: effectiveSid },
        undefined,
        msg.contentVariables || fallbackContentVariables,
      );
      results.push(result);

      if (messages.length > 1 && i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
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
