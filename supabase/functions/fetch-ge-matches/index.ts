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

const FOOTBALL_DATA_API_KEY = Deno.env.get('FOOTBALL_DATA_API_KEY');
const BASE_URL = 'https://api.football-data.org/v4';

// Competition IDs for Brazilian competitions
const COMPETITIONS = {
  brasileirao: {
    id: 2013,
    code: 'BSA',
    name: 'Campeonato Brasileiro Série A'
  }
};

async function fetchMatches(competitionId: number): Promise<any[]> {
  if (!FOOTBALL_DATA_API_KEY) {
    throw new Error('FOOTBALL_DATA_API_KEY not configured');
  }

  console.log(`  📞 Calling football-data.org API for competition ${competitionId}`);

  const today = new Date();
  const dateFrom = today.toISOString().split('T')[0];
  const toDate = new Date(today.getTime() + 31 * 24 * 60 * 60 * 1000);
  const dateTo = toDate.toISOString().split('T')[0];

  const url = `${BASE_URL}/competitions/${competitionId}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  console.log(`  🔗 URL: ${url}`);

  const response = await fetch(url, {
    headers: {
      'X-Auth-Token': FOOTBALL_DATA_API_KEY,
    },
  });

  console.log(`  📡 Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`  ❌ API error response: ${errorText}`);
    throw new Error(`Football-Data API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`  ✅ API response received`);

  const matches = data.matches || [];
  console.log(`  ✅ Extracted ${matches.length} matches from response`);

  return matches;
}

function organizeMatchesByRound(matches: any[], competitionName: string, competitionCode: string): Championship {
  const roundsMap = new Map<string, Match[]>();

  matches.forEach((match: any) => {
    // Use matchday for Brazilian league
    const matchday = match.matchday || 1;
    const round = `Rodada ${matchday}`;
    
    const matchObj: Match = {
      homeTeam: match.homeTeam?.name || match.homeTeam?.shortName || 'Time Casa',
      awayTeam: match.awayTeam?.name || match.awayTeam?.shortName || 'Time Visitante',
      matchDate: match.utcDate || new Date().toISOString(),
      championship: competitionName,
      externalId: `fd_${match.id || Math.random()}`,
      round: round,
    };

    if (!roundsMap.has(round)) {
      roundsMap.set(round, []);
    }
    roundsMap.get(round)!.push(matchObj);
  });

  const rounds: Round[] = [];
  const sortedRounds = Array.from(roundsMap.entries()).sort((a, b) => {
    const numA = parseInt(a[0].replace('Rodada ', ''));
    const numB = parseInt(b[0].replace('Rodada ', ''));
    return numA - numB;
  });

  sortedRounds.forEach(([roundName, matches], index) => {
    rounds.push({
      number: index + 1,
      name: roundName,
      matches: matches,
    });
  });

  return {
    id: competitionCode.toLowerCase(),
    name: competitionName,
    rounds: rounds,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== Starting fetch-ge-matches ===');
    console.log('Fetching matches from football-data.org...');

    if (!FOOTBALL_DATA_API_KEY) {
      console.error('❌ FOOTBALL_DATA_API_KEY not found');
      return new Response(JSON.stringify({ 
        error: 'API key not configured. Please add FOOTBALL_DATA_API_KEY in secrets.',
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
      console.log(`📡 Fetching ${COMPETITIONS.brasileirao.name} (ID ${COMPETITIONS.brasileirao.id})...`);
      const matches = await fetchMatches(COMPETITIONS.brasileirao.id);
      console.log(`📊 Received ${matches.length} matches for Brasileirão`);
      
      if (matches.length > 0) {
        const brasileiraoChamp = organizeMatchesByRound(
          matches,
          COMPETITIONS.brasileirao.name,
          COMPETITIONS.brasileirao.code
        );
        championships.push(brasileiraoChamp);
        console.log(`✅ Organized into ${brasileiraoChamp.rounds.length} rounds`);
      }
    } catch (error) {
      console.error('❌ Error fetching Brasileirão:', error);
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
