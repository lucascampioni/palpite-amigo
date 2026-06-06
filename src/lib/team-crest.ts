/**
 * Proxy para escudos de times.
 *
 * Muitos navegadores com extensões de privacidade (uBlock Origin, AdGuard,
 * Brave Shields) bloqueiam requisições para `media.api-sports.io` porque o
 * domínio aparece em listas de bloqueio de rastreadores. Isso fazia com que as
 * logos dos times não aparecessem para parte dos usuários.
 *
 * Roteamos via `wsrv.nl` (proxy de imagens gratuito, baseado no Sharp/libvips)
 * que serve as imagens a partir de um domínio "neutro" e adiciona cache + CDN.
 */
export function proxyCrest(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  // já é proxy ou data URI — não toca
  if (url.startsWith("data:") || url.includes("wsrv.nl")) return url;
  // só aplica para http(s)
  if (!/^https?:\/\//i.test(url)) return url;
  try {
    // remove protocolo (wsrv.nl aceita sem)
    const stripped = url.replace(/^https?:\/\//i, "");
    return `https://wsrv.nl/?url=${encodeURIComponent(stripped)}&output=png&n=-1`;
  } catch {
    return url;
  }
}
