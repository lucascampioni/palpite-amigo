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

const FOOTBALL_DATA_API_KEY = Deno.env.get('FOOTBALL_DATA_API_KEY');
const BASE_URL = 'https://api.football-data.org/v4';

// Competition IDs for championships
const COMPETITIONS = {
  brasileirao: {
    id: 2013,
    code: 'BSA',
    name: 'Campeonato Brasileiro Série A'
  },
  premierLeague: {
    id: 2021,
    code: 'PL',
    name: 'Premier League'
  },
  championsLeague: {
    id: 2001,
    code: 'CL',
    name: 'UEFA Champions League'
  },
  worldCup: {
    id: 2000,
    code: 'WC',
    name: 'Copa do Mundo 2026'
  }
};

async function fetchMatches(competitionId: number, useDateFilter = true): Promise<any[]> {
  if (!FOOTBALL_DATA_API_KEY) {
    throw new Error('FOOTBALL_DATA_API_KEY not configured');
  }

  console.log(`  📞 Calling football-data.org API for competition ${competitionId}`);

  let url: string;
  if (useDateFilter) {
    const today = new Date();
    const dateFrom = today.toISOString().split('T')[0];
    const toDate = new Date(today.getTime() + 31 * 24 * 60 * 60 * 1000);
    const dateTo = toDate.toISOString().split('T')[0];
    url = `${BASE_URL}/competitions/${competitionId}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  } else {
    // Fetch ALL matches (no date filter) - used for World Cup
    url = `${BASE_URL}/competitions/${competitionId}/matches`;
  }
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

const TEAM_NAMES_PT: Record<string, string> = {
  'Afghanistan': 'Afeganistão', 'Albania': 'Albânia', 'Algeria': 'Argélia', 'Argentina': 'Argentina',
  'Australia': 'Austrália', 'Austria': 'Áustria', 'Belgium': 'Bélgica', 'Bolivia': 'Bolívia',
  'Bosnia and Herzegovina': 'Bósnia e Herzegovina', 'Brazil': 'Brasil', 'Cameroon': 'Camarões',
  'Canada': 'Canadá', 'Chile': 'Chile', 'China PR': 'China', 'Colombia': 'Colômbia',
  'Costa Rica': 'Costa Rica', 'Croatia': 'Croácia', 'Czech Republic': 'República Tcheca',
  'Denmark': 'Dinamarca', 'Ecuador': 'Equador', 'Egypt': 'Egito', 'England': 'Inglaterra',
  'Finland': 'Finlândia', 'France': 'França', 'Germany': 'Alemanha', 'Ghana': 'Gana',
  'Greece': 'Grécia', 'Honduras': 'Honduras', 'Hungary': 'Hungria', 'Iceland': 'Islândia',
  'Indonesia': 'Indonésia', 'Iran': 'Irã', 'Iraq': 'Iraque', 'Ireland': 'Irlanda',
  'Israel': 'Israel', 'Italy': 'Itália', 'Ivory Coast': 'Costa do Marfim',
  "Côte d'Ivoire": 'Costa do Marfim', 'Jamaica': 'Jamaica', 'Japan': 'Japão',
  'Korea Republic': 'Coreia do Sul', 'South Korea': 'Coreia do Sul',
  'Mexico': 'México', 'Morocco': 'Marrocos', 'Netherlands': 'Holanda',
  'New Zealand': 'Nova Zelândia', 'Nigeria': 'Nigéria', 'Norway': 'Noruega',
  'Panama': 'Panamá', 'Paraguay': 'Paraguai', 'Peru': 'Peru', 'Poland': 'Polônia',
  'Portugal': 'Portugal', 'Qatar': 'Catar', 'Romania': 'Romênia', 'Russia': 'Rússia',
  'Saudi Arabia': 'Arábia Saudita', 'Scotland': 'Escócia', 'Senegal': 'Senegal',
  'Serbia': 'Sérvia', 'Slovakia': 'Eslováquia', 'Slovenia': 'Eslovênia',
  'South Africa': 'África do Sul', 'Spain': 'Espanha', 'Sweden': 'Suécia',
  'Switzerland': 'Suíça', 'Tunisia': 'Tunísia', 'Turkey': 'Turquia', 'Türkiye': 'Turquia',
  'Ukraine': 'Ucrânia', 'United States': 'Estados Unidos', 'USA': 'Estados Unidos',
  'Uruguay': 'Uruguai', 'Venezuela': 'Venezuela', 'Wales': 'País de Gales',
  'Congo DR': 'RD Congo', 'DR Congo': 'RD Congo', 'Mali': 'Mali', 'Burkina Faso': 'Burkina Faso',
  'Guatemala': 'Guatemala', 'El Salvador': 'El Salvador', 'Trinidad and Tobago': 'Trinidad e Tobago',
  'Cuba': 'Cuba', 'Haiti': 'Haiti', 'Dominican Republic': 'República Dominicana',
  'Bahrain': 'Bahrein', 'Uzbekistan': 'Uzbequistão', 'Thailand': 'Tailândia',
  'Vietnam': 'Vietnã', 'Philippines': 'Filipinas', 'Palestine': 'Palestina',
  'Jordan': 'Jordânia', 'Oman': 'Omã', 'Kuwait': 'Kuwait', 'UAE': 'Emirados Árabes',
  'United Arab Emirates': 'Emirados Árabes', 'Syria': 'Síria', 'Lebanon': 'Líbano',
  'Kyrgyzstan': 'Quirguistão', 'Tajikistan': 'Tajiquistão',
};

function translateTeamName(name: string, competitionCode: string): string {
  if (competitionCode !== 'WC') return name;
  return TEAM_NAMES_PT[name] || name;
}

function organizeMatchesByRound(matches: any[], competitionName: string, competitionCode: string): Championship {
  const roundsMap = new Map<string, Match[]>();

  matches.forEach((match: any) => {
    // Use matchday for round number, or stage for World Cup
    const matchday = match.matchday || 1;
    const stage = match.stage || '';
    let round: string;
    if (competitionCode === 'WC' || competitionCode === 'CL') {
      const stageNames: Record<string, string> = {
        'GROUP_STAGE': 'Fase de Grupos',
        'LEAGUE_STAGE': 'Fase de Liga',
        'ROUND_OF_16': 'Oitavas de Final',
        'QUARTER_FINALS': 'Quartas de Final',
        'SEMI_FINALS': 'Semifinais',
        'THIRD_PLACE': 'Disputa 3º Lugar',
        'FINAL': 'Final',
        'PLAYOFF': 'Playoff',
      };
      round = stageNames[stage] || stage || `Rodada ${matchday}`;
    } else {
      round = `Rodada ${matchday}`;
    }
    
    const homeTeamRaw = match.homeTeam?.name || match.homeTeam?.shortName || 'Time Casa';
    const awayTeamRaw = match.awayTeam?.name || match.awayTeam?.shortName || 'Time Visitante';
    
    const matchObj: Match = {
      homeTeam: translateTeamName(homeTeamRaw, competitionCode),
      awayTeam: translateTeamName(awayTeamRaw, competitionCode),
      matchDate: match.utcDate || new Date().toISOString(),
      championship: competitionName,
      externalId: `fd_${match.id || Math.random()}`,
      round: round,
      homeTeamCrest: match.homeTeam?.crest || undefined,
      awayTeamCrest: match.awayTeam?.crest || undefined,
    };

    if (!roundsMap.has(round)) {
      roundsMap.set(round, []);
    }
    roundsMap.get(round)!.push(matchObj);
  });

  const rounds: Round[] = [];
  const stageOrder = ['Fase de Grupos', 'Oitavas de Final', 'Quartas de Final', 'Semifinais', 'Disputa 3º Lugar', 'Final'];
  const sortedRounds = Array.from(roundsMap.entries()).sort((a, b) => {
    const idxA = stageOrder.indexOf(a[0]);
    const idxB = stageOrder.indexOf(b[0]);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
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
    
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('❌ Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - authentication required', success: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('✅ Authenticated request');
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

    // Fetch Premier League
    try {
      console.log(`📡 Fetching ${COMPETITIONS.premierLeague.name} (ID ${COMPETITIONS.premierLeague.id})...`);
      const matches = await fetchMatches(COMPETITIONS.premierLeague.id);
      console.log(`📊 Received ${matches.length} matches for Premier League`);
      
      if (matches.length > 0) {
        const premierLeagueChamp = organizeMatchesByRound(
          matches,
          COMPETITIONS.premierLeague.name,
          COMPETITIONS.premierLeague.code
        );
        championships.push(premierLeagueChamp);
        console.log(`✅ Organized into ${premierLeagueChamp.rounds.length} rounds`);
      }
    } catch (error) {
      console.error('❌ Error fetching Premier League:', error);
      console.error('Error details:', error instanceof Error ? error.message : String(error));
    }

    // Fetch UEFA Champions League
    try {
      console.log(`📡 Fetching ${COMPETITIONS.championsLeague.name} (ID ${COMPETITIONS.championsLeague.id})...`);
      const matches = await fetchMatches(COMPETITIONS.championsLeague.id);
      console.log(`📊 Received ${matches.length} matches for Champions League`);
      
      if (matches.length > 0) {
        const clChamp = organizeMatchesByRound(
          matches,
          COMPETITIONS.championsLeague.name,
          COMPETITIONS.championsLeague.code
        );
        championships.push(clChamp);
        console.log(`✅ Organized into ${clChamp.rounds.length} rounds`);
      }
    } catch (error) {
      console.error('❌ Error fetching Champions League:', error);
      console.error('Error details:', error instanceof Error ? error.message : String(error));
    }

    try {
      console.log(`📡 Fetching ${COMPETITIONS.worldCup.name} (ID ${COMPETITIONS.worldCup.id})...`);
      const matches = await fetchMatches(COMPETITIONS.worldCup.id, false);
      console.log(`📊 Received ${matches.length} matches for Copa do Mundo`);
      
      if (matches.length > 0) {
        const worldCupChamp = organizeMatchesByRound(
          matches,
          COMPETITIONS.worldCup.name,
          COMPETITIONS.worldCup.code
        );
        championships.push(worldCupChamp);
        console.log(`✅ Organized into ${worldCupChamp.rounds.length} rounds`);
      }
    } catch (error) {
      console.error('❌ Error fetching Copa do Mundo:', error);
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
