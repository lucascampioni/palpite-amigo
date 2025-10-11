import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting match results sync...');

    // Get all matches from GE source that are not finished
    const { data: matches, error: fetchError } = await supabase
      .from('football_matches')
      .select('*')
      .eq('external_source', 'ge')
      .neq('status', 'finished');

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${matches?.length || 0} matches to check`);

    let updatedCount = 0;

    for (const match of matches || []) {
      try {
        // Fetch match result from GE
        // In a real implementation, you'd scrape the specific match page
        // For now, we'll check if the match date has passed
        const matchDate = new Date(match.match_date);
        const now = new Date();
        
        // If match date is in the past and no score yet, try to fetch result
        if (matchDate < now && match.home_score === null) {
          console.log(`Checking result for match: ${match.home_team} vs ${match.away_team}`);
          
          // Fetch the GE match page (simplified - you'd need the specific match URL)
          const geUrl = `https://ge.globo.com/futebol/brasileirao-serie-a/`;
          const response = await fetch(geUrl);
          const html = await response.text();
          
          // Try to find score data
          // This is highly simplified and would need proper implementation
          // based on GE's actual HTML structure
          
          // For demonstration, we'll mark old matches as finished with dummy scores
          // In production, you'd parse actual scores from the HTML/API
          const hoursSinceMatch = (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60);
          
          if (hoursSinceMatch > 2) { // Match finished if more than 2 hours ago
            // Update match with result (in production, parse actual score)
            const { error: updateError } = await supabase
              .from('football_matches')
              .update({
                status: 'finished',
                last_sync_at: new Date().toISOString()
              })
              .eq('id', match.id);

            if (!updateError) {
              updatedCount++;
              console.log(`Updated match: ${match.home_team} vs ${match.away_team}`);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing match ${match.id}:`, error);
      }
    }

    console.log(`Sync complete. Updated ${updatedCount} matches.`);

    return new Response(JSON.stringify({ 
      success: true,
      checkedMatches: matches?.length || 0,
      updatedMatches: updatedCount,
      note: 'This is a basic implementation. For production use, integrate with a reliable sports data API.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error syncing match results:', error);
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