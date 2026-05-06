// Copa do Mundo FIFA 2026 — Fase de grupos completa (48 jogos)
// Datas e horários em horário de Brasília (UTC-3), convertidos para ISO UTC.
// Fonte: olympics.com / FIFA (sorteio 05/12/2025).

export interface WorldCupMatch {
  externalId: string;
  group: string; // 'A' .. 'L'
  homeTeam: string;
  awayTeam: string;
  matchDate: string; // ISO UTC
  city: string;
  homeFlag: string; // emoji
  awayFlag: string;
}

// Mapa de bandeiras (emojis) por seleção
export const TEAM_FLAGS: Record<string, string> = {
  'México': '🇲🇽',
  'África do Sul': '🇿🇦',
  'Coreia do Sul': '🇰🇷',
  'Tchéquia': '🇨🇿',
  'Canadá': '🇨🇦',
  'Bósnia': '🇧🇦',
  'Catar': '🇶🇦',
  'Suíça': '🇨🇭',
  'Brasil': '🇧🇷',
  'Escócia': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Haiti': '🇭🇹',
  'Marrocos': '🇲🇦',
  'Austrália': '🇦🇺',
  'Estados Unidos': '🇺🇸',
  'Paraguai': '🇵🇾',
  'Turquia': '🇹🇷',
  'Alemanha': '🇩🇪',
  'Costa do Marfim': '🇨🇮',
  'Curaçao': '🇨🇼',
  'Equador': '🇪🇨',
  'Holanda': '🇳🇱',
  'Japão': '🇯🇵',
  'Suécia': '🇸🇪',
  'Tunísia': '🇹🇳',
  'Bélgica': '🇧🇪',
  'Egito': '🇪🇬',
  'Irã': '🇮🇷',
  'Nova Zelândia': '🇳🇿',
  'Arábia Saudita': '🇸🇦',
  'Cabo Verde': '🇨🇻',
  'Espanha': '🇪🇸',
  'Uruguai': '🇺🇾',
  'França': '🇫🇷',
  'Iraque': '🇮🇶',
  'Noruega': '🇳🇴',
  'Senegal': '🇸🇳',
  'Argentina': '🇦🇷',
  'Argélia': '🇩🇿',
  'Jordânia': '🇯🇴',
  'Áustria': '🇦🇹',
  'Colômbia': '🇨🇴',
  'RD Congo': '🇨🇩',
  'Portugal': '🇵🇹',
  'Uzbequistão': '🇺🇿',
  'Croácia': '🇭🇷',
  'Gana': '🇬🇭',
  'Inglaterra': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Panamá': '🇵🇦',
};

// Códigos ISO 3166-1 alpha-2 (ou subdivisão) usados pra renderizar bandeiras como imagem (flagcdn).
// Necessário porque emojis de bandeira não renderizam no Windows (Chrome/Edge).
export const TEAM_FLAG_CODES: Record<string, string> = {
  'México': 'mx',
  'África do Sul': 'za',
  'Coreia do Sul': 'kr',
  'Tchéquia': 'cz',
  'Canadá': 'ca',
  'Bósnia': 'ba',
  'Catar': 'qa',
  'Suíça': 'ch',
  'Brasil': 'br',
  'Escócia': 'gb-sct',
  'Haiti': 'ht',
  'Marrocos': 'ma',
  'Austrália': 'au',
  'Estados Unidos': 'us',
  'Paraguai': 'py',
  'Turquia': 'tr',
  'Alemanha': 'de',
  'Costa do Marfim': 'ci',
  'Curaçao': 'cw',
  'Equador': 'ec',
  'Holanda': 'nl',
  'Japão': 'jp',
  'Suécia': 'se',
  'Tunísia': 'tn',
  'Bélgica': 'be',
  'Egito': 'eg',
  'Irã': 'ir',
  'Nova Zelândia': 'nz',
  'Arábia Saudita': 'sa',
  'Cabo Verde': 'cv',
  'Espanha': 'es',
  'Uruguai': 'uy',
  'França': 'fr',
  'Iraque': 'iq',
  'Noruega': 'no',
  'Senegal': 'sn',
  'Argentina': 'ar',
  'Argélia': 'dz',
  'Jordânia': 'jo',
  'Áustria': 'at',
  'Colômbia': 'co',
  'RD Congo': 'cd',
  'Portugal': 'pt',
  'Uzbequistão': 'uz',
  'Croácia': 'hr',
  'Gana': 'gh',
  'Inglaterra': 'gb-eng',
  'Panamá': 'pa',
};

export const getFlagUrl = (team: string): string | null => {
  const code = TEAM_FLAG_CODES[team.trim()];
  return code ? `https://flagcdn.com/w40/${code}.png` : null;
};

// Helper: cria ISO UTC a partir de horário de Brasília (BRT = UTC-3)
const brt = (yyyy: number, mm: number, dd: number, hh: number, min = 0): string => {
  // Adiciona 3h pra converter BRT->UTC
  const date = new Date(Date.UTC(yyyy, mm - 1, dd, hh + 3, min, 0));
  return date.toISOString();
};

const m = (
  group: string,
  home: string,
  away: string,
  date: string,
  city: string,
): WorldCupMatch => ({
  externalId: `wc2026_${group}_${home}_${away}_${date}`.replace(/\s+/g, '_'),
  group,
  homeTeam: home,
  awayTeam: away,
  matchDate: date,
  city,
  homeFlag: TEAM_FLAGS[home] || '🏳️',
  awayFlag: TEAM_FLAGS[away] || '🏳️',
});

export const WORLD_CUP_2026_MATCHES: WorldCupMatch[] = [
  // ============ GRUPO A ============
  m('A', 'México', 'África do Sul', brt(2026, 6, 11, 16), 'Cidade do México'),
  m('A', 'Coreia do Sul', 'Tchéquia', brt(2026, 6, 11, 23), 'Guadalajara'),
  m('A', 'Tchéquia', 'África do Sul', brt(2026, 6, 18, 13), 'Atlanta'),
  m('A', 'México', 'Coreia do Sul', brt(2026, 6, 18, 22), 'Guadalajara'),
  m('A', 'Tchéquia', 'México', brt(2026, 6, 24, 22), 'Cidade do México'),
  m('A', 'África do Sul', 'Coreia do Sul', brt(2026, 6, 24, 22), 'Monterrey'),

  // ============ GRUPO B ============
  m('B', 'Canadá', 'Bósnia', brt(2026, 6, 12, 16), 'Toronto'),
  m('B', 'Catar', 'Suíça', brt(2026, 6, 13, 16), 'San Francisco'),
  m('B', 'Suíça', 'Bósnia', brt(2026, 6, 18, 16), 'Los Angeles'),
  m('B', 'Canadá', 'Catar', brt(2026, 6, 18, 19), 'Vancouver'),
  m('B', 'Suíça', 'Canadá', brt(2026, 6, 24, 16), 'Vancouver'),
  m('B', 'Bósnia', 'Catar', brt(2026, 6, 24, 16), 'Seattle'),

  // ============ GRUPO C ============
  m('C', 'Brasil', 'Marrocos', brt(2026, 6, 13, 19), 'Nova York/Nova Jersey'),
  m('C', 'Haiti', 'Escócia', brt(2026, 6, 13, 22), 'Boston'),
  m('C', 'Escócia', 'Marrocos', brt(2026, 6, 19, 19), 'Boston'),
  m('C', 'Brasil', 'Haiti', brt(2026, 6, 19, 21, 30), 'Filadélfia'),
  m('C', 'Escócia', 'Brasil', brt(2026, 6, 24, 19), 'Miami'),
  m('C', 'Marrocos', 'Haiti', brt(2026, 6, 24, 19), 'Atlanta'),

  // ============ GRUPO D ============
  m('D', 'Estados Unidos', 'Paraguai', brt(2026, 6, 12, 22), 'Los Angeles'),
  m('D', 'Austrália', 'Turquia', brt(2026, 6, 13, 1), 'Vancouver'),
  m('D', 'Turquia', 'Paraguai', brt(2026, 6, 19, 1), 'San Francisco'),
  m('D', 'Estados Unidos', 'Austrália', brt(2026, 6, 19, 16), 'Seattle'),
  m('D', 'Turquia', 'Estados Unidos', brt(2026, 6, 25, 23), 'Los Angeles'),
  m('D', 'Paraguai', 'Austrália', brt(2026, 6, 25, 23), 'San Francisco'),

  // ============ GRUPO E ============
  m('E', 'Alemanha', 'Curaçao', brt(2026, 6, 14, 14), 'Houston'),
  m('E', 'Costa do Marfim', 'Equador', brt(2026, 6, 14, 20), 'Filadélfia'),
  m('E', 'Alemanha', 'Costa do Marfim', brt(2026, 6, 20, 17), 'Toronto'),
  m('E', 'Equador', 'Curaçao', brt(2026, 6, 20, 21), 'Kansas City'),
  m('E', 'Equador', 'Alemanha', brt(2026, 6, 25, 17), 'Nova York/Nova Jersey'),
  m('E', 'Curaçao', 'Costa do Marfim', brt(2026, 6, 25, 17), 'Filadélfia'),

  // ============ GRUPO F ============
  m('F', 'Holanda', 'Japão', brt(2026, 6, 14, 17), 'Dallas'),
  m('F', 'Suécia', 'Tunísia', brt(2026, 6, 14, 23), 'Monterrey'),
  m('F', 'Holanda', 'Suécia', brt(2026, 6, 20, 14), 'Houston'),
  m('F', 'Tunísia', 'Japão', brt(2026, 6, 20, 1), 'Monterrey'),
  m('F', 'Japão', 'Suécia', brt(2026, 6, 25, 20), 'Dallas'),
  m('F', 'Tunísia', 'Holanda', brt(2026, 6, 25, 20), 'Kansas City'),

  // ============ GRUPO G ============
  m('G', 'Bélgica', 'Egito', brt(2026, 6, 15, 16), 'Seattle'),
  m('G', 'Irã', 'Nova Zelândia', brt(2026, 6, 15, 22), 'Los Angeles'),
  m('G', 'Bélgica', 'Irã', brt(2026, 6, 21, 16), 'Los Angeles'),
  m('G', 'Nova Zelândia', 'Egito', brt(2026, 6, 21, 22), 'Vancouver'),
  m('G', 'Egito', 'Irã', brt(2026, 6, 26, 0), 'Seattle'),
  m('G', 'Nova Zelândia', 'Bélgica', brt(2026, 6, 26, 0), 'Vancouver'),

  // ============ GRUPO H ============
  m('H', 'Espanha', 'Cabo Verde', brt(2026, 6, 15, 13), 'Atlanta'),
  m('H', 'Arábia Saudita', 'Uruguai', brt(2026, 6, 15, 19), 'Miami'),
  m('H', 'Espanha', 'Arábia Saudita', brt(2026, 6, 21, 13), 'Atlanta'),
  m('H', 'Uruguai', 'Cabo Verde', brt(2026, 6, 21, 19), 'Miami'),
  m('H', 'Cabo Verde', 'Arábia Saudita', brt(2026, 6, 26, 21), 'Houston'),
  m('H', 'Uruguai', 'Espanha', brt(2026, 6, 26, 21), 'Guadalajara'),

  // ============ GRUPO I ============
  m('I', 'França', 'Senegal', brt(2026, 6, 16, 16), 'Nova York/Nova Jersey'),
  m('I', 'Iraque', 'Noruega', brt(2026, 6, 16, 19), 'Boston'),
  m('I', 'França', 'Iraque', brt(2026, 6, 22, 18), 'Filadélfia'),
  m('I', 'Noruega', 'Senegal', brt(2026, 6, 22, 21), 'Nova York/Nova Jersey'),
  m('I', 'Noruega', 'França', brt(2026, 6, 26, 16), 'Boston'),
  m('I', 'Senegal', 'Iraque', brt(2026, 6, 26, 16), 'Toronto'),

  // ============ GRUPO J ============
  m('J', 'Argentina', 'Argélia', brt(2026, 6, 16, 22), 'Kansas City'),
  m('J', 'Áustria', 'Jordânia', brt(2026, 6, 17, 1), 'San Francisco'),
  m('J', 'Argentina', 'Áustria', brt(2026, 6, 22, 14), 'Dallas'),
  m('J', 'Jordânia', 'Argélia', brt(2026, 6, 23, 0), 'San Francisco'),
  m('J', 'Argélia', 'Áustria', brt(2026, 6, 27, 23), 'Kansas City'),
  m('J', 'Jordânia', 'Argentina', brt(2026, 6, 27, 23), 'Dallas'),

  // ============ GRUPO K ============
  m('K', 'Portugal', 'RD Congo', brt(2026, 6, 17, 14), 'Houston'),
  m('K', 'Uzbequistão', 'Colômbia', brt(2026, 6, 17, 23), 'Cidade do México'),
  m('K', 'Portugal', 'Uzbequistão', brt(2026, 6, 23, 14), 'Houston'),
  m('K', 'Colômbia', 'RD Congo', brt(2026, 6, 23, 23), 'Guadalajara'),
  m('K', 'Colômbia', 'Portugal', brt(2026, 6, 27, 20, 30), 'Miami'),
  m('K', 'RD Congo', 'Uzbequistão', brt(2026, 6, 27, 20, 30), 'Atlanta'),

  // ============ GRUPO L ============
  m('L', 'Inglaterra', 'Croácia', brt(2026, 6, 17, 17), 'Dallas'),
  m('L', 'Gana', 'Panamá', brt(2026, 6, 17, 20), 'Toronto'),
  m('L', 'Inglaterra', 'Gana', brt(2026, 6, 23, 17), 'Boston'),
  m('L', 'Panamá', 'Croácia', brt(2026, 6, 23, 20), 'Toronto'),
  m('L', 'Panamá', 'Inglaterra', brt(2026, 6, 27, 18), 'Nova York/Nova Jersey'),
  m('L', 'Croácia', 'Gana', brt(2026, 6, 27, 19), 'Filadélfia'),
];

// Championship label usado nos jogos — permite o form detectar e ativar a UI especial
export const WORLD_CUP_2026_CHAMPIONSHIP_PREFIX = 'Copa do Mundo 2026';

export const isWorldCupMatch = (championship?: string | null): boolean => {
  return !!championship && championship.startsWith(WORLD_CUP_2026_CHAMPIONSHIP_PREFIX);
};

// Total de jogos da fase de grupos da Copa do Mundo 2026
export const WORLD_CUP_2026_GROUP_STAGE_COUNT = WORLD_CUP_2026_MATCHES.length;

// Retorna true só se TODOS os jogos da fase de grupos da Copa estão presentes na lista
export const hasAllWorldCupGroupMatches = (
  items: { championship?: string | null }[],
): boolean => {
  const wcCount = items.filter((i) => isWorldCupMatch(i.championship)).length;
  return wcCount >= WORLD_CUP_2026_GROUP_STAGE_COUNT;
};

export const extractGroup = (championship?: string | null): string | null => {
  if (!championship) return null;
  const match = championship.match(/Grupo ([A-L])/);
  return match ? match[1] : null;
};
