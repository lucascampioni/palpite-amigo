import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Match {
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  championship: string;
  externalId: string;
  round: string;
  homeTeamCrest?: string;
  awayTeamCrest?: string;
}

interface Round {
  number: number;
  name: string;
  matches: Match[];
}

interface Championship {
  id: string;
  name: string;
  rounds: Round[];
}

const FOOTBALL_DATA_KEY = Deno.env.get('FOOTBALL_DATA_API_KEY');
const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY');
const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';

// API-Football leagues (PRIMARY source)
const AF_COMPETITIONS: { leagueId: number; code: string; name: string; season: number; fetchAll?: boolean }[] = [
  { leagueId: 71, code: 'bsa', name: 'Campeonato Brasileiro Série A', season: 2025 },
  { leagueId: 39, code: 'pl', name: 'Premier League', season: 2025 },
  { leagueId: 2, code: 'cl', name: 'UEFA Champions League', season: 2025 },
  { leagueId: 61, code: 'fra', name: 'Ligue 1 (França)', season: 2025 },
  { leagueId: 135, code: 'ita', name: 'Serie A (Itália)', season: 2025 },
  { leagueId: 475, code: 'pau', name: 'Campeonato Paulista', season: 2026 },
  { leagueId: 476, code: 'pa2', name: 'Campeonato Paulista A2', season: 2026 },
  { leagueId: 629, code: 'min', name: 'Campeonato Mineiro', season: 2026 },
  { leagueId: 624, code: 'car', name: 'Campeonato Carioca', season: 2026 },
  { leagueId: 632, code: 'gau', name: 'Campeonato Gaúcho', season: 2026 },
  { leagueId: 626, code: 'cea', name: 'Campeonato Cearense', season: 2026 },
  { leagueId: 635, code: 'par', name: 'Campeonato Paraense', season: 2026 },
  { leagueId: 1, code: 'wc', name: 'Copa do Mundo 2026', season: 2026, fetchAll: true },
  { leagueId: 10, code: 'fri', name: 'Amistosos Internacionais', season: 2026 },
];

// Football-Data.org competitions (FALLBACK only if AF fails)
const FD_COMPETITIONS: { id: number; code: string; name: string }[] = [
  { id: 2013, code: 'bsa', name: 'Campeonato Brasileiro Série A' },
  { id: 2021, code: 'pl', name: 'Premier League' },
  { id: 2001, code: 'cl', name: 'UEFA Champions League' },
  { id: 2015, code: 'fra', name: 'Ligue 1 (França)' },
  { id: 2019, code: 'ita', name: 'Serie A (Itália)' },
];

// Team name translations
const TEAM_NAMES_PT: Record<string, string> = {
  'CA Paranaense': 'Athletico-PR',
  'Atletico Paranaense': 'Athletico-PR',
  'SC Corinthians Paulista': 'Corinthians',
  'Corinthians SP': 'Corinthians',
  'SE Palmeiras': 'Palmeiras',
  'Palmeiras SP': 'Palmeiras',
  'São Paulo FC': 'São Paulo',
  'Sao Paulo': 'São Paulo',
  'Santos FC': 'Santos',
  'CR Flamengo': 'Flamengo',
  'Flamengo RJ': 'Flamengo',
  'Fluminense FC': 'Fluminense',
  'Fluminense RJ': 'Fluminense',
  'CR Vasco da Gama': 'Vasco',
  'Vasco DA Gama': 'Vasco',
  'Botafogo FR': 'Botafogo',
  'Botafogo RJ': 'Botafogo',
  'SC Internacional': 'Internacional',
  'Internacional RS': 'Internacional',
  'Grêmio FBPA': 'Grêmio',
  'Gremio RS': 'Grêmio',
  'Clube Atlético Mineiro': 'Atlético-MG',
  'Atletico Mineiro': 'Atlético-MG',
  'Atletico-MG': 'Atlético-MG',
  'Cruzeiro EC': 'Cruzeiro',
  'Cruzeiro MG': 'Cruzeiro',
  'EC Bahia': 'Bahia',
  'Bahia BA': 'Bahia',
  'EC Vitória': 'Vitória',
  'Vitoria BA': 'Vitória',
  'Sport Club do Recife': 'Sport',
  'Sport Recife': 'Sport',
  'Fortaleza EC': 'Fortaleza',
  'Fortaleza CE': 'Fortaleza',
  'Ceará SC': 'Ceará',
  'Ceara SC': 'Ceará',
  'RB Bragantino': 'Bragantino',
  'Red Bull Bragantino': 'Bragantino',
  'Juventude RS': 'Juventude',
  'EC Juventude': 'Juventude',
  'Cuiabá EC': 'Cuiabá',
  'Cuiaba MT': 'Cuiabá',
  'Coritiba FC': 'Coritiba',
  'Coritiba PR': 'Coritiba',
  'Goiás EC': 'Goiás',
  'Goias GO': 'Goiás',
  'Associação Chapecoense de Futebol': 'Chapecoense',
  'Chapecoense SC': 'Chapecoense',
  'AC Goianiense': 'Atlético-GO',
  'Atletico Goianiense': 'Atlético-GO',
  'América MG': 'América-MG',
  'America MG': 'América-MG',
  'Grêmio Novorizontino': 'Novorizontino',
  'Novorizontino SP': 'Novorizontino',
  'Mirassol FC': 'Mirassol',
  'Mirassol SP': 'Mirassol',
  'Ceará Sporting Club': 'Ceará',
  'Paysandu SC': 'Paysandu',
  'Paysandu PA': 'Paysandu',
  'Clube do Remo': 'Remo',
  'Remo PA': 'Remo',
  'Náutico': 'Náutico',
  'Nautico PE': 'Náutico',
  // National teams / Countries (comprehensive)
  'Afghanistan': 'Afeganistão',
  'Albania': 'Albânia',
  'Algeria': 'Argélia',
  'Andorra': 'Andorra',
  'Angola': 'Angola',
  'Antigua and Barbuda': 'Antígua e Barbuda',
  'Argentina': 'Argentina',
  'Armenia': 'Armênia',
  'Australia': 'Austrália',
  'Austria': 'Áustria',
  'Azerbaijan': 'Azerbaijão',
  'Bahrain': 'Bahrein',
  'Bangladesh': 'Bangladesh',
  'Barbados': 'Barbados',
  'Belarus': 'Bielorrússia',
  'Belgium': 'Bélgica',
  'Belize': 'Belize',
  'Benin': 'Benim',
  'Bermuda': 'Bermudas',
  'Bolivia': 'Bolívia',
  'Bosnia and Herzegovina': 'Bósnia e Herzegovina',
  'Bosnia & Herzegovina': 'Bósnia e Herzegovina',
  'Botswana': 'Botsuana',
  'Brazil': 'Brasil',
  'Bulgaria': 'Bulgária',
  'Burkina Faso': 'Burkina Faso',
  'Burundi': 'Burundi',
  'Cambodia': 'Camboja',
  'Cameroon': 'Camarões',
  'Canada': 'Canadá',
  'Cape Verde': 'Cabo Verde',
  'Cape Verde Islands': 'Cabo Verde',
  'Central African Republic': 'República Centro-Africana',
  'Chad': 'Chade',
  'Chile': 'Chile',
  'China': 'China',
  'China PR': 'China',
  'Chinese Taipei': 'Taiwan',
  'Colombia': 'Colômbia',
  'Comoros': 'Comores',
  'Congo': 'Congo',
  'Congo DR': 'RD Congo',
  'Costa Rica': 'Costa Rica',
  'Croatia': 'Croácia',
  'Cuba': 'Cuba',
  'Curacao': 'Curaçao',
  'Cyprus': 'Chipre',
  'Czech Republic': 'República Tcheca',
  'Czechia': 'República Tcheca',
  'Denmark': 'Dinamarca',
  'Djibouti': 'Djibuti',
  'Dominican Republic': 'República Dominicana',
  'Ecuador': 'Equador',
  'Egypt': 'Egito',
  'El Salvador': 'El Salvador',
  'England': 'Inglaterra',
  'Equatorial Guinea': 'Guiné Equatorial',
  'Eritrea': 'Eritreia',
  'Estonia': 'Estônia',
  'Eswatini': 'Eswatini',
  'Ethiopia': 'Etiópia',
  'Faroe Islands': 'Ilhas Faroé',
  'Fiji': 'Fiji',
  'Finland': 'Finlândia',
  'France': 'França',
  'Gabon': 'Gabão',
  'Gambia': 'Gâmbia',
  'Georgia': 'Geórgia',
  'Germany': 'Alemanha',
  'Ghana': 'Gana',
  'Gibraltar': 'Gibraltar',
  'Greece': 'Grécia',
  'Grenada': 'Granada',
  'Guatemala': 'Guatemala',
  'Guinea': 'Guiné',
  'Guinea-Bissau': 'Guiné-Bissau',
  'Guyana': 'Guiana',
  'Haiti': 'Haiti',
  'Honduras': 'Honduras',
  'Hong Kong': 'Hong Kong',
  'Hungary': 'Hungria',
  'Iceland': 'Islândia',
  'India': 'Índia',
  'Indonesia': 'Indonésia',
  'Iran': 'Irã',
  'Iraq': 'Iraque',
  'Ireland': 'Irlanda',
  'Republic of Ireland': 'Irlanda',
  'Israel': 'Israel',
  'Italy': 'Itália',
  'Ivory Coast': 'Costa do Marfim',
  "Cote D'Ivoire": 'Costa do Marfim',
  'Jamaica': 'Jamaica',
  'Japan': 'Japão',
  'Jordan': 'Jordânia',
  'Kazakhstan': 'Cazaquistão',
  'Kenya': 'Quênia',
  'Korea Republic': 'Coreia do Sul',
  'South Korea': 'Coreia do Sul',
  'Korea DPR': 'Coreia do Norte',
  'North Korea': 'Coreia do Norte',
  'Kosovo': 'Kosovo',
  'Kuwait': 'Kuwait',
  'Kyrgyzstan': 'Quirguistão',
  'Laos': 'Laos',
  'Latvia': 'Letônia',
  'Lebanon': 'Líbano',
  'Lesotho': 'Lesoto',
  'Liberia': 'Libéria',
  'Libya': 'Líbia',
  'Liechtenstein': 'Liechtenstein',
  'Lithuania': 'Lituânia',
  'Luxembourg': 'Luxemburgo',
  'Madagascar': 'Madagáscar',
  'Malawi': 'Malawi',
  'Malaysia': 'Malásia',
  'Maldives': 'Maldivas',
  'Mali': 'Mali',
  'Malta': 'Malta',
  'Mauritania': 'Mauritânia',
  'Mauritius': 'Maurício',
  'Mexico': 'México',
  'Moldova': 'Moldávia',
  'Mongolia': 'Mongólia',
  'Montenegro': 'Montenegro',
  'Morocco': 'Marrocos',
  'Mozambique': 'Moçambique',
  'Myanmar': 'Mianmar',
  'Namibia': 'Namíbia',
  'Nepal': 'Nepal',
  'Netherlands': 'Holanda',
  'New Caledonia': 'Nova Caledônia',
  'New Zealand': 'Nova Zelândia',
  'Nicaragua': 'Nicarágua',
  'Niger': 'Níger',
  'Nigeria': 'Nigéria',
  'North Macedonia': 'Macedônia do Norte',
  'Northern Ireland': 'Irlanda do Norte',
  'Norway': 'Noruega',
  'Oman': 'Omã',
  'Pakistan': 'Paquistão',
  'Palestine': 'Palestina',
  'Panama': 'Panamá',
  'Papua New Guinea': 'Papua Nova Guiné',
  'Paraguay': 'Paraguai',
  'Peru': 'Peru',
  'Philippines': 'Filipinas',
  'Poland': 'Polônia',
  'Portugal': 'Portugal',
  'Puerto Rico': 'Porto Rico',
  'Qatar': 'Catar',
  'Romania': 'Romênia',
  'Russia': 'Rússia',
  'Rwanda': 'Ruanda',
  'Saudi Arabia': 'Arábia Saudita',
  'Scotland': 'Escócia',
  'Senegal': 'Senegal',
  'Serbia': 'Sérvia',
  'Sierra Leone': 'Serra Leoa',
  'Singapore': 'Singapura',
  'Slovakia': 'Eslováquia',
  'Slovenia': 'Eslovênia',
  'Solomon Islands': 'Ilhas Salomão',
  'Somalia': 'Somália',
  'South Africa': 'África do Sul',
  'South Sudan': 'Sudão do Sul',
  'Spain': 'Espanha',
  'Sri Lanka': 'Sri Lanka',
  'Sudan': 'Sudão',
  'Suriname': 'Suriname',
  'Sweden': 'Suécia',
  'Switzerland': 'Suíça',
  'Syria': 'Síria',
  'Tahiti': 'Taiti',
  'Taiwan': 'Taiwan',
  'Tajikistan': 'Tajiquistão',
  'Tanzania': 'Tanzânia',
  'Thailand': 'Tailândia',
  'Togo': 'Togo',
  'Trinidad and Tobago': 'Trinidad e Tobago',
  'Trinidad And Tobago': 'Trinidad e Tobago',
  'Tunisia': 'Tunísia',
  'Turkey': 'Turquia',
  'Turkmenistan': 'Turcomenistão',
  'Uganda': 'Uganda',
  'Ukraine': 'Ucrânia',
  'United Arab Emirates': 'Emirados Árabes',
  'UAE': 'Emirados Árabes',
  'USA': 'Estados Unidos',
  'United States': 'Estados Unidos',
  'Uruguay': 'Uruguai',
  'Uzbekistan': 'Uzbequistão',
  'Vanuatu': 'Vanuatu',
  'Venezuela': 'Venezuela',
  'Vietnam': 'Vietnã',
  'Wales': 'País de Gales',
  'Yemen': 'Iêmen',
  'Zambia': 'Zâmbia',
  'Zimbabwe': 'Zimbábue',
};

function translateTeamName(name: string): string {
  return TEAM_NAMES_PT[name] || name;
}

function translateRoundAF(round: string): string {
  const regularMatch = round.match(/Regular Season - (\d+)/);
  if (regularMatch) return `Rodada ${regularMatch[1]}`;
  const groupMatch = round.match(/Group ([A-Z]) - (\d+)/);
  if (groupMatch) return `Grupo ${groupMatch[1]} - Rodada ${groupMatch[2]}`;
  const STAGE_NAMES: Record<string, string> = {
    'Group Stage': 'Fase de Grupos',
    'League Stage': 'Fase de Liga',
    'Round of 16': 'Oitavas de Final',
    'Quarter-finals': 'Quartas de Final',
    'Semi-finals': 'Semifinais',
    'Final': 'Final',
    '3rd Place Final': 'Disputa 3º Lugar',
    'Regular Season': 'Temporada Regular',
    'Friendly': 'Amistoso',
  };
  for (const [key, value] of Object.entries(STAGE_NAMES)) {
    if (round.startsWith(key)) return value;
  }
  return round;
}

function translateStage(stage: string, matchday: number | null): string {
  const STAGES: Record<string, string> = {
    'REGULAR_SEASON': matchday ? `Rodada ${matchday}` : 'Temporada Regular',
    'GROUP_STAGE': 'Fase de Grupos',
    'LEAGUE_STAGE': 'Fase de Liga',
    'ROUND_OF_16': 'Oitavas de Final',
    'QUARTER_FINALS': 'Quartas de Final',
    'SEMI_FINALS': 'Semifinais',
    'FINAL': 'Final',
    'THIRD_PLACE': 'Disputa 3º Lugar',
    'PLAYOFF': 'Playoff',
    'LAST_16': 'Oitavas de Final',
    'LAST_32': 'Fase de 32',
  };
  return STAGES[stage] || (matchday ? `Rodada ${matchday}` : stage);
}

const EXCLUDED_AF_STATUSES = new Set(['PST', 'CANC', 'ABD', 'WO', 'AWD', 'FT', 'AET', 'PEN']);
const EXCLUDED_FD_STATUSES = new Set(['POSTPONED', 'CANCELLED', 'SUSPENDED', 'FINISHED']);

// ── API-Football fetcher (PRIMARY) ──
async function fetchFromAPIFootball(): Promise<Championship[]> {
  if (!API_FOOTBALL_KEY) {
    console.log('⚠️ API_FOOTBALL_KEY not set, skipping API-Football');
    return [];
  }

  // Quick status check
  try {
    const statusResp = await fetch(`${API_FOOTBALL_BASE}/status`, {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
    });
    const statusData = await statusResp.json();
    if (statusData.errors?.access) {
      console.log('⚠️ API-Football account issue, skipping');
      return [];
    }
    console.log(`📊 API-Football requests today: ${statusData.response?.requests?.current || '?'}/${statusData.response?.requests?.limit_day || '?'}`);
  } catch {
    console.log('⚠️ Could not check API-Football status');
    return [];
  }

  const championships: Championship[] = [];
  const today = new Date();
  const dateFrom = today.toISOString().split('T')[0];
  const toDate = new Date(today.getTime() + 31 * 86400000);
  const dateTo = toDate.toISOString().split('T')[0];

  // Fetch all leagues in parallel (batches of 5 to avoid overwhelming)
  const batchSize = 5;
  for (let i = 0; i < AF_COMPETITIONS.length; i += batchSize) {
    const batch = AF_COMPETITIONS.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (comp) => {
        const url = comp.fetchAll
          ? `${API_FOOTBALL_BASE}/fixtures?league=${comp.leagueId}&season=${comp.season}`
          : `${API_FOOTBALL_BASE}/fixtures?league=${comp.leagueId}&season=${comp.season}&from=${dateFrom}&to=${dateTo}`;

        console.log(`  📡 AF: league=${comp.leagueId} (${comp.name})`);
        const resp = await fetch(url, {
          headers: { 'x-apisports-key': API_FOOTBALL_KEY },
        });

        if (!resp.ok) {
          console.error(`  ❌ AF error ${resp.status} for ${comp.name}`);
          return null;
        }

        const data = await resp.json();
        if (data.errors && Object.keys(data.errors).length > 0) {
          console.error(`  ❌ AF API error for ${comp.name}:`, JSON.stringify(data.errors));
          return null;
        }

        const fixtures = data.response || [];
        if (fixtures.length === 0) return null;

        const roundsMap = new Map<string, Match[]>();
        for (const f of fixtures) {
          const status = f.fixture?.status?.short;
          if (EXCLUDED_AF_STATUSES.has(status)) continue;

          // Filter out youth teams for friendlies
          if (comp.code === 'fri') {
            const homeName = f.teams?.home?.name || '';
            const awayName = f.teams?.away?.name || '';
            const youthPattern = /\b(U\d{2}|U-\d{2}|Sub[\s-]?\d{2}|Under[\s-]?\d{2}|Olympic|Olympique)\b/i;
            if (youthPattern.test(homeName) || youthPattern.test(awayName)) continue;
          }

          // Only include scheduled/not-started matches
          if (!['NS', 'TBD', 'SCH'].includes(status) && status !== null) continue;

          const round = translateRoundAF(f.league?.round || 'Rodada 1');
          const matchObj: Match = {
            homeTeam: translateTeamName(f.teams?.home?.name || 'TBD'),
            awayTeam: translateTeamName(f.teams?.away?.name || 'TBD'),
            matchDate: f.fixture?.date || new Date().toISOString(),
            championship: comp.name,
            externalId: `apifb_${f.fixture?.id}`,
            round,
            homeTeamCrest: f.teams?.home?.logo || undefined,
            awayTeamCrest: f.teams?.away?.logo || undefined,
          };
          if (!roundsMap.has(round)) roundsMap.set(round, []);
          roundsMap.get(round)!.push(matchObj);
        }

        if (roundsMap.size > 0) {
          const rounds = buildRounds(roundsMap);
          console.log(`  ✅ ${comp.name}: ${rounds.reduce((s, r) => s + r.matches.length, 0)} matches`);
          return { id: comp.code, name: comp.name, rounds } as Championship;
        }
        return null;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        championships.push(result.value);
      }
    }
  }

  return championships;
}

// ── Football-Data.org fetcher (FALLBACK) ──
async function fetchFromFootballData(existingCodes: Set<string>): Promise<Championship[]> {
  if (!FOOTBALL_DATA_KEY) return [];

  const championships: Championship[] = [];
  const today = new Date();
  // Only fetch competitions not already covered by AF
  const compsToFetch = FD_COMPETITIONS.filter(c => !existingCodes.has(c.code));
  if (compsToFetch.length === 0) {
    console.log('📋 FD: All competitions already covered by API-Football');
    return [];
  }

  for (const comp of compsToFetch) {
    try {
      const roundsMap = new Map<string, Match[]>();
      for (let offset = 0; offset < 31; offset += 10) {
        const from = new Date(today.getTime() + offset * 86400000);
        const to = new Date(today.getTime() + Math.min(offset + 10, 31) * 86400000);
        const dateFrom = from.toISOString().split('T')[0];
        const dateTo = to.toISOString().split('T')[0];

        const url = `${FOOTBALL_DATA_BASE}/competitions/${comp.id}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED,TIMED`;
        const resp = await fetch(url, {
          headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
        });

        if (resp.status === 429) {
          console.log('  ⏳ FD rate limited, skipping remaining windows');
          break;
        }
        if (!resp.ok) continue;

        const data = await resp.json();
        for (const m of (data.matches || [])) {
          if (EXCLUDED_FD_STATUSES.has(m.status)) continue;
          const round = translateStage(m.stage || 'REGULAR_SEASON', m.matchday);
          const matchObj: Match = {
            homeTeam: translateTeamName(m.homeTeam?.name || 'TBD'),
            awayTeam: translateTeamName(m.awayTeam?.name || 'TBD'),
            matchDate: m.utcDate,
            championship: comp.name,
            externalId: `fd_${m.id}`,
            round,
            homeTeamCrest: m.homeTeam?.crest || undefined,
            awayTeamCrest: m.awayTeam?.crest || undefined,
          };
          if (!roundsMap.has(round)) roundsMap.set(round, []);
          const existing = roundsMap.get(round)!;
          if (!existing.some(e => e.externalId === matchObj.externalId)) {
            existing.push(matchObj);
          }
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      if (roundsMap.size > 0) {
        const rounds = buildRounds(roundsMap);
        championships.push({ id: comp.code, name: comp.name, rounds });
        console.log(`  ✅ FD ${comp.name}: ${rounds.reduce((s, r) => s + r.matches.length, 0)} matches`);
      }
    } catch (err) {
      console.error(`❌ FD error ${comp.name}:`, err instanceof Error ? err.message : err);
    }
  }

  return championships;
}

function buildRounds(roundsMap: Map<string, Match[]>): Round[] {
  const stageOrder = ['Amistoso', 'Fase de Grupos', 'Fase de Liga', 'Playoff', 'Oitavas de Final', 'Quartas de Final', 'Semifinais', 'Disputa 3º Lugar', 'Final'];

  const sorted = Array.from(roundsMap.entries()).sort((a, b) => {
    const idxA = stageOrder.indexOf(a[0]);
    const idxB = stageOrder.indexOf(b[0]);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    const numA = parseInt(a[0].replace('Rodada ', ''));
    const numB = parseInt(b[0].replace('Rodada ', ''));
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a[0].localeCompare(b[0]);
  });

  return sorted.map(([name, matches], i) => ({
    number: i + 1,
    name,
    matches: matches.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime()),
  }));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', success: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!FOOTBALL_DATA_KEY && !API_FOOTBALL_KEY) {
      return new Response(JSON.stringify({ error: 'No API keys configured', success: false }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('=== Starting fetch-ge-matches ===');

    // 1. PRIMARY: API-Football (fast, parallel fetches)
    const afChampionships = await fetchFromAPIFootball();
    console.log(`📋 API-Football: ${afChampionships.length} championships`);

    // 2. FALLBACK: Football-Data.org (only for leagues AF didn't cover)
    const coveredCodes = new Set(afChampionships.map(c => c.id));
    const fdChampionships = await fetchFromFootballData(coveredCodes);
    console.log(`📋 Football-Data.org fallback: ${fdChampionships.length} championships`);

    // Merge
    const champMap = new Map<string, Championship>();
    for (const c of afChampionships) champMap.set(c.id, c);
    for (const c of fdChampionships) {
      if (!champMap.has(c.id)) champMap.set(c.id, c);
    }

    const championships = Array.from(champMap.values());
    console.log(`📋 Total: ${championships.length} championships`);

    return new Response(JSON.stringify({
      success: true,
      championships,
      message: championships.length === 0 ? 'No upcoming matches found.' : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ FATAL ERROR:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
