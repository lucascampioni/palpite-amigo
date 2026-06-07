// Shared anti-ban / throttling layer for Z-API WhatsApp sends.
// All jobs that send WhatsApp messages MUST use sendWhatsAppThrottled.

export type ThrottleClient = {
  from: (table: string) => any;
};

export const RATE_LIMITS = {
  perMinute: 1,
  perHour: 6,
  perDay: 35,
};

export const CIRCUIT_BREAKER = {
  threshold: 1,
  pauseMinutes: 12 * 60,
};

export const DELAY_MS = { min: 8 * 60_000, max: 18 * 60_000 };

// Business-hours window in America/Sao_Paulo (UTC-3, no DST currently).
const BIZ_START_HOUR = 8;
const BIZ_END_HOUR = 21; // inclusive of 21:00, exclusive of 22:00

export function nowInSaoPaulo(): Date {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
}

export function isWithinBusinessHours(): boolean {
  const h = nowInSaoPaulo().getHours();
  return h >= BIZ_START_HOUR && h < BIZ_END_HOUR + 1;
}

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomDelayMs(): number {
  return Math.floor(Math.random() * (DELAY_MS.max - DELAY_MS.min + 1)) + DELAY_MS.min;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function checkCircuitBreaker(supabase: ThrottleClient): Promise<{ open: boolean; until?: string }> {
  const { data } = await supabase.from('whatsapp_circuit_state').select('paused_until').eq('id', 1).maybeSingle();
  if (data?.paused_until && new Date(data.paused_until).getTime() > Date.now()) {
    return { open: true, until: data.paused_until };
  }
  return { open: false };
}

export async function checkRateLimits(supabase: ThrottleClient): Promise<{ allowed: boolean; reason?: string }> {
  const now = Date.now();
  const minAgo = new Date(now - 60_000).toISOString();
  const hourAgo = new Date(now - 60 * 60_000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60_000).toISOString();

  const [{ count: cMin }, { count: cHour }, { count: cDay }] = await Promise.all([
    supabase.from('whatsapp_send_log').select('id', { count: 'exact', head: true }).eq('success', true).gte('sent_at', minAgo),
    supabase.from('whatsapp_send_log').select('id', { count: 'exact', head: true }).eq('success', true).gte('sent_at', hourAgo),
    supabase.from('whatsapp_send_log').select('id', { count: 'exact', head: true }).eq('success', true).gte('sent_at', dayAgo),
  ]);

  if ((cMin ?? 0) >= RATE_LIMITS.perMinute) return { allowed: false, reason: `rate_limit_minute (${cMin}/${RATE_LIMITS.perMinute})` };
  if ((cHour ?? 0) >= RATE_LIMITS.perHour) return { allowed: false, reason: `rate_limit_hour (${cHour}/${RATE_LIMITS.perHour})` };
  if ((cDay ?? 0) >= RATE_LIMITS.perDay) return { allowed: false, reason: `rate_limit_day (${cDay}/${RATE_LIMITS.perDay})` };
  return { allowed: true };
}

async function recordResult(
  supabase: ThrottleClient,
  phone: string,
  messageType: string,
  success: boolean,
  error?: string,
) {
  await supabase.from('whatsapp_send_log').insert({ phone, message_type: messageType, success, error: error ?? null });

  // Update circuit breaker
  const { data } = await supabase.from('whatsapp_circuit_state').select('consecutive_failures').eq('id', 1).maybeSingle();
  const current = data?.consecutive_failures ?? 0;
  if (success) {
    if (current !== 0) {
      await supabase.from('whatsapp_circuit_state').update({ consecutive_failures: 0, paused_until: null, updated_at: new Date().toISOString() }).eq('id', 1);
    }
  } else {
    const next = current + 1;
    const patch: any = { consecutive_failures: next, updated_at: new Date().toISOString() };
    if (next >= CIRCUIT_BREAKER.threshold) {
      patch.paused_until = new Date(Date.now() + CIRCUIT_BREAKER.pauseMinutes * 60_000).toISOString();
      patch.consecutive_failures = 0;
      console.error(`[anti-ban] Circuit breaker OPEN: pausing all sends for ${CIRCUIT_BREAKER.pauseMinutes}min until ${patch.paused_until}`);
    }
    await supabase.from('whatsapp_circuit_state').update(patch).eq('id', 1);
  }
}

export type ZapiCreds = {
  instanceId: string;
  token: string;
  clientToken?: string;
};

export type SendOptions = {
  messageType: string;
  /** Restrict to 8-21h BRT — queue (skip) if outside window. OTP and time-sensitive should be false. */
  respectBusinessHours?: boolean;
  /** Skip rate-limit enforcement (use for OTP). Circuit breaker is always respected. */
  bypassThrottle?: boolean;
};

export type SendOutcome =
  | { sent: true }
  | { sent: false; reason: 'circuit_open' | 'rate_limited' | 'outside_hours' | 'zapi_disconnected' | 'duplicate_recent' | 'error'; error?: string };

async function pauseCircuit(supabase: ThrottleClient, minutes: number, reason: string) {
  const pausedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
  await supabase
    .from('whatsapp_circuit_state')
    .update({ consecutive_failures: 0, paused_until: pausedUntil, updated_at: new Date().toISOString() })
    .eq('id', 1);
  console.error(`[anti-ban] Circuit breaker OPEN: ${reason}; pausing all sends until ${pausedUntil}`);
}

async function checkZapiConnection(creds: ZapiCreds): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.z-api.io/instances/${creds.instanceId}/token/${creds.token}/status`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (creds.clientToken) headers['Client-Token'] = creds.clientToken;
  const res = await fetch(url, { method: 'GET', headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.message || data?.error || `status_http_${res.status}` };
  if (data?.connected === false || data?.smartphoneConnected === false) {
    return { ok: false, error: data?.error || 'zapi_not_connected' };
  }
  return { ok: true };
}

async function doSend(creds: ZapiCreds, phone: string, message: string): Promise<{ success: boolean; error?: string }> {
  const digits = phone.replace(/\D/g, '');
  const phoneWithCountry = digits.startsWith('55') ? digits : `55${digits}`;
  try {
    const status = await checkZapiConnection(creds);
    if (!status.ok) return { success: false, error: status.error || 'zapi_disconnected' };

    const url = `https://api.z-api.io/instances/${creds.instanceId}/token/${creds.token}/send-text`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (creds.clientToken) headers['Client-Token'] = creds.clientToken;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ phone: phoneWithCountry, message }) });
    const data = await res.json().catch(() => ({}));
    const apiError = data?.error || data?.message || data?.errorMessage;
    if (!res.ok || apiError) return { success: false, error: apiError || `HTTP ${res.status}` };
    if (!data?.messageId && !data?.id && !data?.zaapId) {
      return { success: false, error: `zapi_unconfirmed_response:${JSON.stringify(data).slice(0, 240)}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

/**
 * Send a WhatsApp message with all anti-ban protections.
 * Caller is responsible for adding a randomDelayMs() delay BETWEEN sends in a loop.
 */
export async function sendWhatsAppThrottled(
  supabase: ThrottleClient,
  creds: ZapiCreds,
  phone: string,
  message: string,
  opts: SendOptions,
): Promise<SendOutcome> {
  const cb = await checkCircuitBreaker(supabase);
  if (cb.open) {
    console.warn(`[anti-ban] circuit open until ${cb.until}; skipping ${opts.messageType} to ${phone}`);
    return { sent: false, reason: 'circuit_open' };
  }

  if (!opts.bypassThrottle) {
    if (opts.messageType.startsWith('broadcast_')) {
      const digits = phone.replace(/\D/g, '');
      const phoneWithCountry = digits.startsWith('55') ? digits : `55${digits}`;
      const recentCutoff = new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString();
      const { count } = await supabase
        .from('whatsapp_send_log')
        .select('id', { count: 'exact', head: true })
        .in('phone', [digits, phoneWithCountry])
        .eq('message_type', opts.messageType)
        .eq('success', true)
        .gte('sent_at', recentCutoff);
      if ((count ?? 0) > 0) {
        console.warn(`[anti-ban] duplicate recent broadcast skipped for ${phone}`);
        return { sent: false, reason: 'duplicate_recent' };
      }
    }
    if (opts.respectBusinessHours && !isWithinBusinessHours()) {
      console.log(`[anti-ban] outside 8h-21h BRT; queuing ${opts.messageType} to ${phone}`);
      return { sent: false, reason: 'outside_hours' };
    }
    const rl = await checkRateLimits(supabase);
    if (!rl.allowed) {
      console.warn(`[anti-ban] ${rl.reason}; skipping ${opts.messageType} to ${phone}`);
      return { sent: false, reason: 'rate_limited' };
    }
  }

  const result = await doSend(creds, phone, message);
  await recordResult(supabase, phone, opts.messageType, result.success, result.error);
  if (!result.success) {
    const normalized = (result.error || '').toLowerCase();
    const disconnected = normalized.includes('not connected') || normalized.includes('not_connected') || normalized.includes('disconnected');
    if (disconnected) {
      await pauseCircuit(supabase, CIRCUIT_BREAKER.pauseMinutes, result.error || 'zapi_disconnected');
      return { sent: false, reason: 'zapi_disconnected', error: result.error };
    }
    return { sent: false, reason: 'error', error: result.error };
  }
  return { sent: true };
}
