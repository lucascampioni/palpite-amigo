// Helpers para captura/leitura/limpeza de referral por bolão
const key = (poolId: string) => `referral_${poolId}`;

export const captureReferral = (poolId: string, refUserId: string) => {
  if (!poolId || !refUserId) return;
  try {
    localStorage.setItem(key(poolId), refUserId);
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
