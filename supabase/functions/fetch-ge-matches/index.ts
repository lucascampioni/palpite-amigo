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

interface Championship {
  id: string;
  name: string;
  rounds: Round[];
}

interface Round {
  number: number;
  name: string;
  matches: Match[];
}

// Simulate real matches data (replace with actual API/scraping in production)
function getSimulatedMatches(): Championship[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  return [
    {
      id: 'brasileirao-serie-a',
      name: 'Brasileirão Série A',
      rounds: [
        {
          number: 26,
          name: 'Rodada 26',
          matches: [
            {
              homeTeam: 'Flamengo',
              awayTeam: 'Bahia',
              matchDate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
              championship: 'Brasileirão Série A',
              externalId: 'ge_flabah_26',
              round: 'Rodada 26'
            },
            {
              homeTeam: 'Palmeiras',
              awayTeam: 'Corinthians',
              matchDate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
              championship: 'Brasileirão Série A',
              externalId: 'ge_palcor_26',
              round: 'Rodada 26'
            },
            {
              homeTeam: 'São Paulo',
              awayTeam: 'Santos',
              matchDate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
              championship: 'Brasileirão Série A',
              externalId: 'ge_saoSan_26',
              round: 'Rodada 26'
            },
            {
              homeTeam: 'Internacional',
              awayTeam: 'Grêmio',
              matchDate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
              championship: 'Brasileirão Série A',
              externalId: 'ge_intgre_26',
              round: 'Rodada 26'
            },
            {
              homeTeam: 'Atlético-MG',
              awayTeam: 'Cruzeiro',
              matchDate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
              championship: 'Brasileirão Série A',
              externalId: 'ge_camcru_26',
              round: 'Rodada 26'
            },
          ]
        },
        {
          number: 27,
          name: 'Rodada 27',
          matches: [
            {
              homeTeam: 'Botafogo',
              awayTeam: 'Vasco',
              matchDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              championship: 'Brasileirão Série A',
              externalId: 'ge_botvas_27',
              round: 'Rodada 27'
            },
            {
              homeTeam: 'Fluminense',
              awayTeam: 'Flamengo',
              matchDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              championship: 'Brasileirão Série A',
              externalId: 'ge_flufla_27',
              round: 'Rodada 27'
            },
            {
              homeTeam: 'Fortaleza',
              awayTeam: 'Ceará',
              matchDate: new Date(today.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
              championship: 'Brasileirão Série A',
              externalId: 'ge_forcea_27',
              round: 'Rodada 27'
            },
            {
              homeTeam: 'Sport',
              awayTeam: 'Vitória',
              matchDate: new Date(today.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
              championship: 'Brasileirão Série A',
              externalId: 'ge_spovit_27',
              round: 'Rodada 27'
            },
          ]
        }
      ]
    },
    {
      id: 'copa-do-brasil',
      name: 'Copa do Brasil',
      rounds: [
        {
          number: 1,
          name: 'Quartas de Final - Ida',
          matches: [
            {
              homeTeam: 'Flamengo',
              awayTeam: 'Palmeiras',
              matchDate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
              championship: 'Copa do Brasil',
              externalId: 'ge_copa_flapal',
              round: 'Quartas de Final - Ida'
            },
            {
              homeTeam: 'Atlético-MG',
              awayTeam: 'São Paulo',
              matchDate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
              championship: 'Copa do Brasil',
              externalId: 'ge_copa_camsao',
              round: 'Quartas de Final - Ida'
            },
          ]
        }
      ]
    }
  ];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching matches data...');
    
    // Get simulated data organized by championship and rounds
    const championships = getSimulatedMatches();
    
    console.log(`Found ${championships.length} championships with matches`);
    
    return new Response(JSON.stringify({ 
      success: true,
      championships,
      note: 'Using simulated data. For production, integrate with a sports data API like API-FOOTBALL, FootballData.org, or similar services for real-time match data.'
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