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

// Football-Data.org competitions
const FD_COMPETITIONS: { id: number; code: string; name: string }[] = [
  { id: 2013, code: 'bsa', name: 'Campeonato Brasileiro Série A' },
  { id: 2021, code: 'pl', name: 'Premier League' },
  { id: 2001, code: 'cl', name: 'UEFA Champions League' },
  { id: 2015, code: 'fra', name: 'Ligue 1 (França)' },
  { id: 2019, code: 'ita', name: 'Serie A (Itália)' },
];

// API-Football league IDs (fallback + extras not in Football-Data free tier)
const AF_COMPETITIONS: Record<string, { leagueId: number; code: string; name: string; season: number; fetchAll?: boolean }> = {
  paulista: { leagueId: 475, code: 'pau', name: 'Campeonato Paulista', season: 2026 },
  paulistaA2: { leagueId: 476, code: 'pa2', name: 'Campeonato Paulista A2', season: 2026 },
  mineiro: { leagueId: 629, code: 'min', name: 'Campeonato Mineiro', season: 2026 },
  carioca: { leagueId: 624, code: 'car', name: 'Campeonato Carioca', season: 2026 },
  gaucho: { leagueId: 632, code: 'gau', name: 'Campeonato Gaúcho', season: 2026 },
  cearense: { leagueId: 626, code: 'cea', name: 'Campeonato Cearense', season: 2026 },
  paraense: { leagueId: 635, code: 'par', name: 'Campeonato Paraense', season: 2026 },
  worldCup: { leagueId: 1, code: 'wc', name: 'Copa do Mundo 2026', season: 2026, fetchAll: true },
  friendlies: { leagueId: 10, code: 'fri', name: 'Amistosos Internacionais', season: 2026 },
};

// Team name translations for display in pt-BR
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
  // National teams
  'Argentina': 'Argentina',
  'Australia': 'Austrália',
  'Belgium': 'Bélgica',
  'Brazil': 'Brasil',
  'Cameroon': 'Camarões',
  'Canada': 'Canadá',
  'Colombia': 'Colômbia',
  'Croatia': 'Croácia',
  'Denmark': 'Dinamarca',
  'Ecuador': 'Equador',
  'Egypt': 'Egito',
  'England': 'Inglaterra',
  'France': 'França',
  'Germany': 'Alemanha',
  'Ghana': 'Gana',
  'Greece': 'Grécia',
  'Hungary': 'Hungria',
  'Iran': 'Irã',
  'Italy': 'Itália',
  'Japan': 'Japão',
  'Korea Republic': 'Coreia do Sul',
  'South Korea': 'Coreia do Sul',
  'Mexico': 'México',
  'Morocco': 'Marrocos',
  'Netherlands': 'Holanda',
  'Nigeria': 'Nigéria',
  'Norway': 'Noruega',
  'Panama': 'Panamá',
  'Paraguay': 'Paraguai',
  'Peru': 'Peru',
  'Poland': 'Polônia',
  'Portugal': 'Portugal',
  'Qatar': 'Catar',
  'Romania': 'Romênia',
  'Saudi Arabia': 'Arábia Saudita',
  'Scotland': 'Escócia',
  'Senegal': 'Senegal',
  'Serbia': 'Sérvia',
  'Spain': 'Espanha',
  'Sweden': 'Suécia',
  'Switzerland': 'Suíça',
  'Tunisia': 'Tunísia',
  'Turkey': 'Turquia',
  'USA': 'Estados Unidos',
  'United States': 'Estados Unidos',
  'Ukraine': 'Ucrânia',
  'Uruguay': 'Uruguai',
  'Venezuela': 'Venezuela',
  'Wales': 'País de Gales',
};

function translateTeamName(name: string): string {
  return TEAM_NAMES_PT[name] || name;
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
  };
  for (const [key, value] of Object.entries(STAGE_NAMES)) {
    if (round.startsWith(key)) return value;
  }
  return round;
}

const EXCLUDED_FD_STATUSES = new Set(['POSTPONED', 'CANCELLED', 'SUSPENDED']);
const EXCLUDED_AF_STATUSES = new Set(['PST', 'CANC', 'ABD', 'WO', 'AWD']);

// ── Football-Data.org fetcher ──
async function fetchFromFootballData(): Promise<Championship[]> {
  if (!FOOTBALL_DATA_KEY) {
    console.log('⚠️ FOOTBALL_DATA_API_KEY not set, skipping Football-Data.org');
    return [];
  }

  const championships: Championship[] = [];
  const today = new Date();

  for (const comp of FD_COMPETITIONS) {
    try {
      // Fetch in 10-day windows (API limit), up to 31 days ahead
      const allMatches: Match[] = [];
      const roundsMap = new Map<string, Match[]>();

      for (let offset = 0; offset < 31; offset += 10) {
        const from = new Date(today.getTime() + offset * 86400000);
        const to = new Date(today.getTime() + Math.min(offset + 10, 31) * 86400000);
        const dateFrom = from.toISOString().split('T')[0];
        const dateTo = to.toISOString().split('T')[0];

        const url = `${FOOTBALL_DATA_BASE}/competitions/${comp.id}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED,TIMED`;
        console.log(`  📡 FD: ${url}`);

        const resp = await fetch(url, {
          headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
        });

        if (resp.status === 429) {
          console.log('  ⏳ Rate limited, waiting 60s...');
          await new Promise(r => setTimeout(r, 60000));
          const retryResp = await fetch(url, {
            headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
          });
          if (!retryResp.ok) continue;
          const retryData = await retryResp.json();
          processMatches(retryData.matches || [], comp, roundsMap);
          continue;
        }

        if (!resp.ok) {
          console.error(`  ❌ FD error ${resp.status} for ${comp.name}`);
          continue;
        }

        const data = await resp.json();
        processMatches(data.matches || [], comp, roundsMap);

        // Small delay to respect rate limits (10 req/min)
        await new Promise(r => setTimeout(r, 3000));
      }

      if (roundsMap.size > 0) {
        const rounds = buildRounds(roundsMap);
        championships.push({ id: comp.code, name: comp.name, rounds });
        console.log(`  ✅ ${comp.name}: ${rounds.reduce((s, r) => s + r.matches.length, 0)} matches`);
      }
    } catch (err) {
      console.error(`❌ Error fetching ${comp.name} from FD:`, err instanceof Error ? err.message : err);
    }
  }

  return championships;
}

function processMatches(
  matches: any[],
  comp: { code: string; name: string },
  roundsMap: Map<string, Match[]>
) {
  for (const m of matches) {
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
}

// ── API-Football fetcher (for leagues not in Football-Data free tier) ──
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
      console.log('⚠️ API-Football account suspended, skipping');
      return [];
    }
  } catch {
    console.log('⚠️ Could not check API-Football status, skipping');
    return [];
  }

  const championships: Championship[] = [];
  const today = new Date();
  const dateFrom = today.toISOString().split('T')[0];
  const toDate = new Date(today.getTime() + 31 * 86400000);
  const dateTo = toDate.toISOString().split('T')[0];

  for (const [key, comp] of Object.entries(AF_COMPETITIONS)) {
    try {
      const url = key === 'worldCup'
        ? `${API_FOOTBALL_BASE}/fixtures?league=${comp.leagueId}&season=${comp.season}`
        : `${API_FOOTBALL_BASE}/fixtures?league=${comp.leagueId}&season=${comp.season}&from=${dateFrom}&to=${dateTo}`;

      console.log(`  📡 AF: ${url}`);
      const resp = await fetch(url, {
        headers: { 'x-apisports-key': API_FOOTBALL_KEY },
      });

      if (!resp.ok) continue;
      const data = await resp.json();
      const fixtures = data.response || [];

      if (fixtures.length === 0) continue;

      const roundsMap = new Map<string, Match[]>();
      for (const f of fixtures) {
        if (EXCLUDED_AF_STATUSES.has(f.fixture?.status?.short)) continue;
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
        championships.push({ id: comp.code, name: comp.name, rounds });
        console.log(`  ✅ ${comp.name}: ${rounds.reduce((s, r) => s + r.matches.length, 0)} matches`);
      }
    } catch (err) {
      console.error(`❌ Error fetching ${comp.name} from AF:`, err instanceof Error ? err.message : err);
    }
  }

  return championships;
}

function buildRounds(roundsMap: Map<string, Match[]>): Round[] {
  const stageOrder = ['Fase de Grupos', 'Fase de Liga', 'Playoff', 'Oitavas de Final', 'Quartas de Final', 'Semifinais', 'Disputa 3º Lugar', 'Final'];

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
      return new Response(JSON.stringify({
        error: 'No API keys configured',
        success: false,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('=== Starting fetch-ge-matches ===');

    // 1. Primary: Football-Data.org (BSA, PL, CL, Ligue1, SerieA)
    const fdChampionships = await fetchFromFootballData();
    console.log(`📋 Football-Data.org: ${fdChampionships.length} championships`);

    // 2. Secondary: API-Football (Estaduais, Copa do Mundo)
    const afChampionships = await fetchFromAPIFootball();
    console.log(`📋 API-Football: ${afChampionships.length} championships`);

    // Merge (avoid duplicates by code)
    const champMap = new Map<string, Championship>();
    for (const c of fdChampionships) champMap.set(c.id, c);
    for (const c of afChampionships) {
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
