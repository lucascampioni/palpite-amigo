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

const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY');
const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';

// API-Football league IDs
const COMPETITIONS: Record<string, { leagueId: number; code: string; name: string; useDateFilter: boolean; season?: number }> = {
  brasileirao: { leagueId: 71, code: 'bsa', name: 'Campeonato Brasileiro Série A', useDateFilter: true, season: 2026 },
  paulista: { leagueId: 475, code: 'pau', name: 'Campeonato Paulista', useDateFilter: true, season: 2026 },
  paulistaA2: { leagueId: 476, code: 'pa2', name: 'Campeonato Paulista A2', useDateFilter: true, season: 2026 },
  mineiro: { leagueId: 629, code: 'min', name: 'Campeonato Mineiro', useDateFilter: true, season: 2026 },
  carioca: { leagueId: 624, code: 'car', name: 'Campeonato Carioca', useDateFilter: true, season: 2026 },
  gaucho: { leagueId: 632, code: 'gau', name: 'Campeonato Gaúcho', useDateFilter: true, season: 2026 },
  cearense: { leagueId: 626, code: 'cea', name: 'Campeonato Cearense', useDateFilter: true, season: 2026 },
  paraense: { leagueId: 635, code: 'par', name: 'Campeonato Paraense', useDateFilter: true, season: 2026 },
  serieA: { leagueId: 135, code: 'ita', name: 'Serie A (Itália)', useDateFilter: true, season: 2025 },
  ligue1: { leagueId: 61, code: 'fra', name: 'Ligue 1 (França)', useDateFilter: true, season: 2025 },
  premierLeague: { leagueId: 39, code: 'pl', name: 'Premier League', useDateFilter: true, season: 2025 },
  championsLeague: { leagueId: 2, code: 'cl', name: 'UEFA Champions League', useDateFilter: true, season: 2025 },
  worldCup: { leagueId: 1, code: 'wc', name: 'Copa do Mundo 2026', useDateFilter: false, season: 2026 },
};

async function fetchFixtures(leagueId: number, season: number, useDateFilter: boolean): Promise<any[]> {
  let url: string;
  if (useDateFilter) {
    const today = new Date();
    const dateFrom = today.toISOString().split('T')[0];
    const toDate = new Date(today.getTime() + 31 * 24 * 60 * 60 * 1000);
    const dateTo = toDate.toISOString().split('T')[0];
    url = `${API_FOOTBALL_BASE}/fixtures?league=${leagueId}&season=${season}&from=${dateFrom}&to=${dateTo}`;
  } else {
    url = `${API_FOOTBALL_BASE}/fixtures?league=${leagueId}&season=${season}`;
  }

  console.log(`  📡 Fetching: ${url}`);
  const response = await fetch(url, {
    headers: { 'x-apisports-key': API_FOOTBALL_KEY! },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API-Football error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.response || [];
}

// Team name translations (English -> pt-BR) for national teams
const TEAM_NAMES_PT: Record<string, string> = {
  'Argentina': 'Argentina',
  'Australia': 'Austrália',
  'Austria': 'Áustria',
  'Belgium': 'Bélgica',
  'Bolivia': 'Bolívia',
  'Bosnia And Herzegovina': 'Bósnia e Herzegovina',
  'Bosnia and Herzegovina': 'Bósnia e Herzegovina',
  'Brazil': 'Brasil',
  'Cameroon': 'Camarões',
  'Canada': 'Canadá',
  'Chile': 'Chile',
  'China': 'China',
  'Colombia': 'Colômbia',
  'Costa Rica': 'Costa Rica',
  'Croatia': 'Croácia',
  'Czech Republic': 'República Tcheca',
  'Denmark': 'Dinamarca',
  'Ecuador': 'Equador',
  'Egypt': 'Egito',
  'England': 'Inglaterra',
  'Finland': 'Finlândia',
  'France': 'França',
  'Germany': 'Alemanha',
  'Ghana': 'Gana',
  'Greece': 'Grécia',
  'Honduras': 'Honduras',
  'Hungary': 'Hungria',
  'Iceland': 'Islândia',
  'Indonesia': 'Indonésia',
  'Iran': 'Irã',
  'Iraq': 'Iraque',
  'Ireland': 'Irlanda',
  'Israel': 'Israel',
  'Italy': 'Itália',
  'Ivory Coast': 'Costa do Marfim',
  'Jamaica': 'Jamaica',
  'Japan': 'Japão',
  'Jordan': 'Jordânia',
  'Korea Republic': 'Coreia do Sul',
  'South Korea': 'Coreia do Sul',
  'Mali': 'Mali',
  'Mexico': 'México',
  'Morocco': 'Marrocos',
  'Netherlands': 'Holanda',
  'New Zealand': 'Nova Zelândia',
  'Nigeria': 'Nigéria',
  'North Macedonia': 'Macedônia do Norte',
  'Norway': 'Noruega',
  'Oman': 'Omã',
  'Palestine': 'Palestina',
  'Panama': 'Panamá',
  'Paraguay': 'Paraguai',
  'Peru': 'Peru',
  'Poland': 'Polônia',
  'Portugal': 'Portugal',
  'Qatar': 'Catar',
  'Romania': 'Romênia',
  'Russia': 'Rússia',
  'Saudi Arabia': 'Arábia Saudita',
  'Scotland': 'Escócia',
  'Senegal': 'Senegal',
  'Serbia': 'Sérvia',
  'Slovakia': 'Eslováquia',
  'Slovenia': 'Eslovênia',
  'South Africa': 'África do Sul',
  'Spain': 'Espanha',
  'Sweden': 'Suécia',
  'Switzerland': 'Suíça',
  'Trinidad And Tobago': 'Trinidad e Tobago',
  'Trinidad and Tobago': 'Trinidad e Tobago',
  'Tunisia': 'Tunísia',
  'Turkey': 'Turquia',
  'USA': 'Estados Unidos',
  'United States': 'Estados Unidos',
  'Ukraine': 'Ucrânia',
  'Uruguay': 'Uruguai',
  'Uzbekistan': 'Uzbequistão',
  'Venezuela': 'Venezuela',
  'Wales': 'País de Gales',
  'Algeria': 'Argélia',
  'Angola': 'Angola',
  'Bahrain': 'Bahrein',
  'Burkina Faso': 'Burkina Faso',
  'Cape Verde': 'Cabo Verde',
  'Congo DR': 'RD Congo',
  'Cuba': 'Cuba',
  'Curacao': 'Curaçao',
  'El Salvador': 'El Salvador',
  'Georgia': 'Geórgia',
  'Guatemala': 'Guatemala',
  'Guinea': 'Guiné',
  'Haiti': 'Haiti',
  'Kenya': 'Quênia',
  'Kuwait': 'Kuwait',
  'Mozambique': 'Moçambique',
  'North Korea': 'Coreia do Norte',
  'Philippines': 'Filipinas',
  'Thailand': 'Tailândia',
  'United Arab Emirates': 'Emirados Árabes',
  'Vietnam': 'Vietnã',
  'Zambia': 'Zâmbia',
  'Zimbabwe': 'Zimbábue',
  'Benin': 'Benim',
  'Botswana': 'Botsuana',
  'Comoros': 'Comores',
  'Congo': 'Congo',
  'Equatorial Guinea': 'Guiné Equatorial',
  'Gabon': 'Gabão',
  'Gambia': 'Gâmbia',
  'Lesotho': 'Lesoto',
  'Liberia': 'Libéria',
  'Libya': 'Líbia',
  'Madagascar': 'Madagascar',
  'Malawi': 'Malaui',
  'Mauritania': 'Mauritânia',
  'Namibia': 'Namíbia',
  'Niger': 'Níger',
  'Rwanda': 'Ruanda',
  'Sierra Leone': 'Serra Leoa',
  'Sudan': 'Sudão',
  'Tanzania': 'Tanzânia',
  'Togo': 'Togo',
  'Uganda': 'Uganda',
  'China PR': 'China',
  'Chinese Taipei': 'Taipé Chinesa',
  'Hong Kong': 'Hong Kong',
  'India': 'Índia',
  'Kyrgyzstan': 'Quirguistão',
  'Lebanon': 'Líbano',
  'Malaysia': 'Malásia',
  'Myanmar': 'Mianmar',
  'Nepal': 'Nepal',
  'Pakistan': 'Paquistão',
  'Singapore': 'Singapura',
  'Syria': 'Síria',
  'Tajikistan': 'Tajiquistão',
  'Turkmenistan': 'Turcomenistão',
  'Yemen': 'Iêmen',
};

function translateTeamName(name: string, isWorldCup: boolean): string {
  if (!isWorldCup) return name;
  return TEAM_NAMES_PT[name] || name;
}

const STAGE_NAMES: Record<string, string> = {
  'Group Stage': 'Fase de Grupos',
  'League Stage': 'Fase de Liga',
  'League Stage - ': 'Fase de Liga',
  'Round of 16': 'Oitavas de Final',
  'Quarter-finals': 'Quartas de Final',
  'Quarter Finals': 'Quartas de Final',
  'Semi-finals': 'Semifinais',
  'Semi Finals': 'Semifinais',
  'Final': 'Final',
  'Playoffs': 'Playoff',
  'Play-offs': 'Playoff',
  '3rd Place Final': 'Disputa 3º Lugar',
  'Knockout Round Play-offs': 'Playoff',
  'Qualifying Round': 'Fase Qualificatória',
  'Preliminary Round': 'Fase Preliminar',
  '1st Round': '1ª Fase',
  '2nd Round': '2ª Fase',
  '3rd Round': '3ª Fase',
};

function translateRound(round: string): string {
  // First check for "Regular Season - N" pattern → "Rodada N"
  const regularMatch = round.match(/Regular Season - (\d+)/);
  if (regularMatch) return `Rodada ${regularMatch[1]}`;
  
  // Check for "Group X - N" pattern (e.g., "Group A - 1")
  const groupMatch = round.match(/Group ([A-Z]) - (\d+)/);
  if (groupMatch) return `Grupo ${groupMatch[1]} - Rodada ${groupMatch[2]}`;
  
  // Exact match
  if (STAGE_NAMES[round]) return STAGE_NAMES[round];
  
  // startsWith match for compound names
  for (const [key, value] of Object.entries(STAGE_NAMES)) {
    if (round.startsWith(key)) return value;
  }
  
  // If just "Regular Season" without number, return as is
  if (round === 'Regular Season') return 'Temporada Regular';
  
  return round;
}

const EXCLUDED_STATUSES = new Set(['PST', 'CANC', 'ABD', 'WO', 'AWD']);

function organizeFixtures(fixtures: any[], competitionName: string, competitionCode: string, isWorldCup = false): Championship {
  // Filter out postponed, cancelled, abandoned matches
  const validFixtures = fixtures.filter(f => {
    const status = f.fixture?.status?.short;
    return !EXCLUDED_STATUSES.has(status);
  });
  const roundsMap = new Map<string, Match[]>();

  for (const fixture of validFixtures) {
    const fixtureId = fixture.fixture?.id;
    const round = translateRound(fixture.league?.round || 'Rodada 1');
    const kickoff = fixture.fixture?.date || new Date().toISOString();

    const matchObj: Match = {
      homeTeam: translateTeamName(fixture.teams?.home?.name || 'Time Casa', isWorldCup),
      awayTeam: translateTeamName(fixture.teams?.away?.name || 'Time Visitante', isWorldCup),
      matchDate: kickoff,
      championship: competitionName,
      externalId: `apifb_${fixtureId}`,
      round,
      homeTeamCrest: fixture.teams?.home?.logo || undefined,
      awayTeamCrest: fixture.teams?.away?.logo || undefined,
    };

    if (!roundsMap.has(round)) {
      roundsMap.set(round, []);
    }
    roundsMap.get(round)!.push(matchObj);
  }

  const stageOrder = ['Fase de Grupos', 'Fase de Liga', 'Playoff', 'Oitavas de Final', 'Quartas de Final', 'Semifinais', 'Disputa 3º Lugar', 'Final'];
  const sortedRounds = Array.from(roundsMap.entries()).sort((a, b) => {
    const idxA = stageOrder.indexOf(a[0]);
    const idxB = stageOrder.indexOf(b[0]);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    const numA = parseInt(a[0].replace('Rodada ', ''));
    const numB = parseInt(b[0].replace('Rodada ', ''));
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a[0].localeCompare(b[0]);
  });

  const rounds: Round[] = sortedRounds.map(([roundName, matches], index) => ({
    number: index + 1,
    name: roundName,
    matches: matches.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime()),
  }));

  return { id: competitionCode, name: competitionName, rounds };
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

    if (!API_FOOTBALL_KEY) {
      return new Response(JSON.stringify({ 
        error: 'API_FOOTBALL_KEY not configured',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('=== Starting fetch-ge-matches (API-Football) ===');
    const championships: Championship[] = [];
    for (const [key, comp] of Object.entries(COMPETITIONS)) {
      try {
        const season = comp.season || new Date().getFullYear();
        console.log(`📡 Fetching ${comp.name} (league ${comp.leagueId}, season ${season})...`);
        const fixtures = await fetchFixtures(comp.leagueId, season, comp.useDateFilter);
        console.log(`📊 Got ${fixtures.length} fixtures for ${comp.name}`);

        if (fixtures.length > 0) {
          const champ = organizeFixtures(fixtures, comp.name, comp.code, key === 'worldCup');
          championships.push(champ);
        }
      } catch (error) {
        console.error(`❌ Error fetching ${comp.name}:`, error instanceof Error ? error.message : error);
      }
    }

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
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
