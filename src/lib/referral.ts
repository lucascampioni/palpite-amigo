// Helpers para captura/leitura/limpeza de referral por bolão
const key = (poolId: string) => `referral_${poolId}`;
const slugKey = (slug: string) => `referral_slug_${slug}`;

export const captureReferral = (poolId: string, refUserId: string) => {
  if (!poolId || !refUserId) return;
  try {
    localStorage.setItem(key(poolId), refUserId);
  } catch {}
};

// Captura por slug — usada quando ainda não temos o poolId resolvido
// (ex.: antes do login, antes do fetch do bolão)
export const captureReferralBySlug = (slug: string, refUserId: string) => {
  if (!slug || !refUserId) return;
  try {
    localStorage.setItem(slugKey(slug), refUserId);
  } catch {}
};

// Migra a chave por slug para a chave por poolId quando o pool resolve
export const migrateReferralFromSlug = (slug: string, poolId: string) => {
  if (!slug || !poolId) return;
  try {
    const existing = localStorage.getItem(key(poolId));
    if (existing) {
      localStorage.removeItem(slugKey(slug));
      return;
    }
    const fromSlug = localStorage.getItem(slugKey(slug));
    if (fromSlug) {
      localStorage.setItem(key(poolId), fromSlug);
      localStorage.removeItem(slugKey(slug));
    }
  } catch {}
};

export const getReferral = (poolId: string): string | null => {
  try {
    return localStorage.getItem(key(poolId));
  } catch {
    return null;
  }
};

export const clearReferral = (poolId: string) => {
  try {
    localStorage.removeItem(key(poolId));
  } catch {}
};
