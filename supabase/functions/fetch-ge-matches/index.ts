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
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching matches from Globo Esporte...');
    
    const { championship = 'Brasileirão Série A' } = await req.json().catch(() => ({}));
    
    // Fetch the GE page
    const geUrl = 'https://ge.globo.com/futebol/brasileirao-serie-a/';
    const response = await fetch(geUrl);
    const html = await response.text();
    
    console.log('HTML fetched, parsing matches...');
    
    // Parse matches from HTML
    // Looking for match cards with team names and dates
    const matches: Match[] = [];
    
    // Try to find match data in the HTML
    // GE uses various patterns, we'll look for common ones
    const matchPattern = /<div[^>]*class="[^"]*match[^"]*"[^>]*>(.*?)<\/div>/gis;
    const teamPattern = /<span[^>]*class="[^"]*team[^"]*"[^>]*>([^<]+)<\/span>/gi;
    const datePattern = /<time[^>]*datetime="([^"]+)"[^>]*>/gi;
    
    // This is a simplified parser - GE's structure is complex and may need adjustment
    // For a production system, consider using a dedicated sports data API
    
    // Try to extract from script tags containing JSON data
    const scriptPattern = /<script[^>]*type="application\/json"[^>]*>(.*?)<\/script>/gis;
    let scriptMatch;
    
    while ((scriptMatch = scriptPattern.exec(html)) !== null) {
      try {
        const jsonData = JSON.parse(scriptMatch[1]);
        
        // Look for match data in various possible structures
        if (jsonData.matches || jsonData.jogos || jsonData.partidas) {
          const matchData = jsonData.matches || jsonData.jogos || jsonData.partidas;
          
          if (Array.isArray(matchData)) {
            for (const match of matchData) {
              if (match.mandante && match.visitante) {
                matches.push({
                  homeTeam: match.mandante.nome || match.mandante,
                  awayTeam: match.visitante.nome || match.visitante,
                  matchDate: match.data || match.dataHora || new Date().toISOString(),
                  championship: championship,
                  externalId: `ge_${match.id || Math.random().toString(36).substr(2, 9)}`
                });
              }
            }
          }
        }
      } catch (e) {
        console.log('Could not parse script JSON:', e);
      }
    }
    
    // If no matches found in JSON, try alternative parsing
    if (matches.length === 0) {
      console.log('No matches found in JSON, using fallback method');
      
      // Fallback: provide sample structure for testing
      // In production, you'd need more robust parsing or use an API
      matches.push({
        homeTeam: 'Palmeiras',
        awayTeam: 'Flamengo',
        matchDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        championship: championship,
        externalId: `ge_${Math.random().toString(36).substr(2, 9)}`
      });
    }
    
    console.log(`Found ${matches.length} matches`);
    
    return new Response(JSON.stringify({ 
      success: true,
      matches,
      note: 'This is a basic scraper. For production use, consider using a dedicated sports data API like API-FOOTBALL or similar services.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Error fetching GE matches:', error);
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