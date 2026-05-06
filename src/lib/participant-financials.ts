// Helpers para lidar com os campos financeiros sensíveis de participantes,
// que agora vivem em uma tabela separada com RLS estrita.

import { supabase } from "@/integrations/supabase/client";

export const FINANCIAL_FIELDS = [
  "payment_proof",
  "participant_pix_key",
  "pix_key_type",
  "pix_consent",
  "prize_pix_key",
  "prize_pix_key_type",
  "prize_proof_url",
] as const;
export type FinancialField = (typeof FINANCIAL_FIELDS)[number];

// Select fragmento pra incluir financeiros relacionados quando ler participants
export const PARTICIPANT_FINANCIALS_SELECT = `participant_financials(payment_proof, participant_pix_key, pix_key_type, pix_consent, prize_pix_key, prize_pix_key_type, prize_proof_url)`;

const emptyFinancials = {
  payment_proof: null as string | null,
  participant_pix_key: null as string | null,
  pix_key_type: null as string | null,
  pix_consent: false,
  prize_pix_key: null as string | null,
  prize_pix_key_type: null as string | null,
  prize_proof_url: null as string | null,
};

export function flattenFinancialsRow<T extends Record<string, any>>(row: T | null | undefined): T {
  if (!row) return row as T;
  const raw: any = (row as any).participant_financials;
  const f: any = Array.isArray(raw) ? raw[0] : raw;
  const { participant_financials, ...rest } = row as any;
  return { ...rest, ...emptyFinancials, ...(f || {}) } as T;
}

export function flattenFinancials<T extends Record<string, any>>(rows: T[] | null | undefined): T[] {
  if (!rows) return [] as T[];
  return rows.map((r) => flattenFinancialsRow(r));
}

export async function upsertParticipantFinancials(args: {
  participant_id: string;
  pool_id: string;
  user_id: string;
  data: Partial<Record<FinancialField, any>>;
}) {
  // Primeiro tenta update
  const { data: existing } = await supabase
    .from("participant_financials")
    .select("id")
    .eq("participant_id", args.participant_id)
    .limit(1);

  if (existing && existing.length > 0) {
    return supabase
      .from("participant_financials")
      .update({ ...args.data })
      .eq("participant_id", args.participant_id);
  }

  return supabase.from("participant_financials").insert({
    participant_id: args.participant_id,
    pool_id: args.pool_id,
    user_id: args.user_id,
    ...args.data,
  });
}
