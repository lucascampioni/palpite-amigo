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

const CURRENT_SEASON = new Date().getFullYear(); // Adjust this based on current year

async function fetchFixtures(leagueId: number, season: number = CURRENT_SEASON): Promise<any[]> {
  if (!API_FOOTBALL_KEY) {
    throw new Error('API_FOOTBALL_KEY not configured');
  }

  console.log(`  📞 Calling API-FOOTBALL for league ${leagueId}, season ${season}`);

  const today = new Date();
  const from = today.toISOString().split('T')[0];
  const toDate = new Date(today.getTime() + 31 * 24 * 60 * 60 * 1000);
  const to = toDate.toISOString().split('T')[0];

  let url = `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${season}&from=${from}&to=${to}`;
  console.log(`  🔗 URL (date range): ${url}`);

  let response = await fetch(url, {
    headers: {
      'x-rapidapi-host': 'v3.football.api-sports.io',
      'x-rapidapi-key': API_FOOTBALL_KEY,
    },
  });

  console.log(`  📡 Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`  ❌ API error response: ${errorText}`);
    throw new Error(`API Football error: ${response.status} - ${errorText}`);
  }

  let data = await response.json();
  console.log(`  ✅ API response received (date range)`);
  console.log(`  📊 Response structure:`, JSON.stringify(data, null, 2).substring(0, 500));

  let fixtures = data.response || [];
  console.log(`  ✅ Extracted ${fixtures.length} fixtures from response`);

  if (fixtures.length === 0) {
    console.log('  ⚠️ No fixtures found in date range. Falling back to next=50');
    url = `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${season}&next=50`;
    console.log(`  🔗 URL (fallback next): ${url}`);

    response = await fetch(url, {
      headers: {
        'x-rapidapi-host': 'v3.football.api-sports.io',
        'x-rapidapi-key': API_FOOTBALL_KEY,
      },
    });

    console.log(`  📡 Response status (fallback): ${response.status}`);

    if (!response.ok) {
      const errorText2 = await response.text();
      console.error(`  ❌ API error response (fallback): ${errorText2}`);
      throw new Error(`API Football error: ${response.status} - ${errorText2}`);
    }

    data = await response.json();
    fixtures = data.response || [];
    console.log(`  ✅ Extracted ${fixtures.length} fixtures from fallback response`);
  }

  return fixtures;
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
    console.log('=== Starting fetch-ge-matches ===');
    console.log('Fetching matches from API-FOOTBALL...');

    if (!API_FOOTBALL_KEY) {
      console.error('❌ API_FOOTBALL_KEY not found');
      return new Response(JSON.stringify({ 
        error: 'API key not configured. Please add API_FOOTBALL_KEY in secrets.',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ API key found');
    const championships: Championship[] = [];

    // Fetch Brasileirão Série A
    try {
      console.log('📡 Fetching Brasileirão Série A (League 71)...');
      const brasileiraoFixtures = await fetchFixtures(LEAGUES.brasileirao);
      console.log(`📊 Received ${brasileiraoFixtures.length} fixtures for Brasileirão`);
      
      if (brasileiraoFixtures.length > 0) {
        const brasileiraoChamp = organizeFixturesByRound(
          brasileiraoFixtures,
          'Brasileirão Série A',
          'brasileirao-serie-a'
        );
        championships.push(brasileiraoChamp);
        console.log(`✅ Organized into ${brasileiraoChamp.rounds.length} rounds`);
      }
    } catch (error) {
      console.error('❌ Error fetching Brasileirão:', error);
      console.error('Error details:', error instanceof Error ? error.message : String(error));
    }

    // Fetch Copa do Brasil
    try {
      console.log('📡 Fetching Copa do Brasil (League 73)...');
      const copaFixtures = await fetchFixtures(LEAGUES.copa_brasil);
      console.log(`📊 Received ${copaFixtures.length} fixtures for Copa do Brasil`);
      
      if (copaFixtures.length > 0) {
        const copaChamp = organizeFixturesByRound(
          copaFixtures,
          'Copa do Brasil',
          'copa-do-brasil'
        );
        championships.push(copaChamp);
        console.log(`✅ Organized into ${copaChamp.rounds.length} rounds`);
      }
    } catch (error) {
      console.error('❌ Error fetching Copa do Brasil:', error);
      console.error('Error details:', error instanceof Error ? error.message : String(error));
    }

    console.log(`\n📋 Total championships: ${championships.length}`);
    championships.forEach(champ => {
      console.log(`  - ${champ.name}: ${champ.rounds.length} rounds`);
      champ.rounds.forEach(round => {
        console.log(`    - ${round.name}: ${round.matches.length} matches`);
      });
    });

    if (championships.length === 0) {
      console.log('⚠️ No championships found');
      return new Response(JSON.stringify({ 
        success: true,
        championships: [],
        message: 'No upcoming matches found for the selected competitions.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ Returning ${championships.length} championships with matches`);

    return new Response(JSON.stringify({ 
      success: true,
      championships,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('❌ FATAL ERROR in fetch-ge-matches:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
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