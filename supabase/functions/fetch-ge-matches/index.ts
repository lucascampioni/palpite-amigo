import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

// League IDs for Brazilian competitions
const LEAGUES = {
  brasileirao: 71,  // Brasileirão Série A
  copa_brasil: 73,  // Copa do Brasil
};

async function fetchFixtures(leagueId: number, season: number = 2025): Promise<any[]> {
  if (!API_FOOTBALL_KEY) {
    throw new Error('API_FOOTBALL_KEY not configured');
  }

  const response = await fetch(
    `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${season}&next=50`,
    {
      headers: {
        'x-rapidapi-host': 'v3.football.api-sports.io',
        'x-rapidapi-key': API_FOOTBALL_KEY,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`API Football error: ${response.status}`);
  }

  const data = await response.json();
  return data.response || [];
}

function organizeFixturesByRound(fixtures: any[], leagueName: string, leagueId: string): Championship {
  const roundsMap = new Map<string, Match[]>();

  fixtures.forEach((fixture: any) => {
    const round = fixture.league?.round || 'Rodada 1';
    
    const match: Match = {
      homeTeam: fixture.teams?.home?.name || 'Time Casa',
      awayTeam: fixture.teams?.away?.name || 'Time Visitante',
      matchDate: fixture.fixture?.date || new Date().toISOString(),
      championship: leagueName,
      externalId: `apifb_${fixture.fixture?.id || Math.random()}`,
      round: round,
    };

    if (!roundsMap.has(round)) {
      roundsMap.set(round, []);
    }
    roundsMap.get(round)!.push(match);
  });

  const rounds: Round[] = [];
  let roundNumber = 1;

  roundsMap.forEach((matches, roundName) => {
    rounds.push({
      number: roundNumber++,
      name: roundName,
      matches: matches,
    });
  });

  return {
    id: leagueId,
    name: leagueName,
    rounds: rounds,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching matches from API-FOOTBALL...');

    if (!API_FOOTBALL_KEY) {
      console.error('API_FOOTBALL_KEY not found');
      return new Response(JSON.stringify({ 
        error: 'API key not configured. Please add API_FOOTBALL_KEY in secrets.',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const championships: Championship[] = [];

    // Fetch Brasileirão Série A
    try {
      console.log('Fetching Brasileirão Série A...');
      const brasileiraoFixtures = await fetchFixtures(LEAGUES.brasileirao);
      if (brasileiraoFixtures.length > 0) {
        const brasileiraoChamp = organizeFixturesByRound(
          brasileiraoFixtures,
          'Brasileirão Série A',
          'brasileirao-serie-a'
        );
        championships.push(brasileiraoChamp);
        console.log(`Found ${brasileiraoFixtures.length} matches for Brasileirão`);
      }
    } catch (error) {
      console.error('Error fetching Brasileirão:', error);
    }

    // Fetch Copa do Brasil
    try {
      console.log('Fetching Copa do Brasil...');
      const copaFixtures = await fetchFixtures(LEAGUES.copa_brasil);
      if (copaFixtures.length > 0) {
        const copaChamp = organizeFixturesByRound(
          copaFixtures,
          'Copa do Brasil',
          'copa-do-brasil'
        );
        championships.push(copaChamp);
        console.log(`Found ${copaFixtures.length} matches for Copa do Brasil`);
      }
    } catch (error) {
      console.error('Error fetching Copa do Brasil:', error);
    }

    if (championships.length === 0) {
      return new Response(JSON.stringify({ 
        success: true,
        championships: [],
        message: 'No upcoming matches found for the selected competitions.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Returning ${championships.length} championships with matches`);

    return new Response(JSON.stringify({ 
      success: true,
      championships,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Error fetching matches:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});