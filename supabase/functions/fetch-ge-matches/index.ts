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

const STAGE_NAMES: Record<string, string> = {
  'Group Stage': 'Fase de Grupos',
  'League Stage': 'Fase de Liga',
  'League Stage - ': 'Fase de Liga',
  'Round of 16': 'Oitavas de Final',
  'Quarter-finals': 'Quartas de Final',
  'Semi-finals': 'Semifinais',
  'Final': 'Final',
  'Playoffs': 'Playoff',
  'Play-offs': 'Playoff',
  '3rd Place Final': 'Disputa 3º Lugar',
  'Knockout Round Play-offs': 'Playoff',
  'Regular Season': 'Temporada Regular',
};

function translateRound(round: string): string {
  // Check exact match first
  if (STAGE_NAMES[round]) return STAGE_NAMES[round];
  // Check prefix match
  for (const [key, value] of Object.entries(STAGE_NAMES)) {
    if (round.startsWith(key)) return value;
  }
  // Check if it's "Regular Season - X"
  const regularMatch = round.match(/Regular Season - (\d+)/);
  if (regularMatch) return `Rodada ${regularMatch[1]}`;
  return round;
}

function organizeFixtures(fixtures: any[], competitionName: string, competitionCode: string): Championship {
  const roundsMap = new Map<string, Match[]>();

  for (const fixture of fixtures) {
    const fixtureId = fixture.fixture?.id;
    const round = translateRound(fixture.league?.round || 'Rodada 1');
    const kickoff = fixture.fixture?.date || new Date().toISOString();

    const matchObj: Match = {
      homeTeam: fixture.teams?.home?.name || 'Time Casa',
      awayTeam: fixture.teams?.away?.name || 'Time Visitante',
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
          const champ = organizeFixtures(fixtures, comp.name, comp.code);
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
