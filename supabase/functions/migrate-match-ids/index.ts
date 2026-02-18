import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY');
const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('🔄 Starting match ID migration (fd_ → apifb_)...');

    if (!API_FOOTBALL_KEY) {
      throw new Error('API_FOOTBALL_KEY not configured');
    }

    // Find all matches with fd_ external IDs
    const { data: fdMatches, error } = await supabase
      .from('football_matches')
      .select('id, external_id, home_team, away_team, match_date, championship, pool_id')
      .like('external_id', 'fd_%');

    if (error) throw error;
    if (!fdMatches || fdMatches.length === 0) {
      console.log('✅ No fd_ matches to migrate.');
      return new Response(JSON.stringify({ success: true, migrated: 0, message: 'No matches to migrate' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📊 Found ${fdMatches.length} matches with fd_ IDs to migrate`);

    // Group matches by date to minimize API calls
    const dateSet = new Set<string>();
    for (const m of fdMatches) {
      const date = new Date(m.match_date).toISOString().split('T')[0];
      dateSet.add(date);
    }

    // Fetch API-Football fixtures for each date
    const apiFixturesByDate = new Map<string, any[]>();
    let requestCount = 0;

    for (const date of dateSet) {
      console.log(`📡 Fetching API-Football fixtures for date ${date}...`);
      const response = await fetch(
        `${API_FOOTBALL_BASE}/fixtures?date=${date}`,
        { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
      );

      if (!response.ok) {
        console.error(`❌ API error for date ${date}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const fixtures = data.response || [];
      apiFixturesByDate.set(date, fixtures);
      requestCount++;
      console.log(`📊 Got ${fixtures.length} fixtures for ${date}`);
      
      // Log Champions League fixtures for debugging
      const clFixtures = fixtures.filter((f: any) => f.league?.name?.includes('Champions') || f.league?.id === 2);
      if (clFixtures.length > 0) {
        console.log(`🏆 Champions League fixtures found:`);
        for (const f of clFixtures) {
          console.log(`  - ${f.teams?.home?.name} vs ${f.teams?.away?.name} (ID: ${f.fixture?.id})`);
        }
      }
      
      // Also log Premier League
      const plFixtures = fixtures.filter((f: any) => f.league?.id === 39);
      if (plFixtures.length > 0) {
        console.log(`⚽ Premier League fixtures found:`);
        for (const f of plFixtures) {
          console.log(`  - ${f.teams?.home?.name} vs ${f.teams?.away?.name} (ID: ${f.fixture?.id})`);
        }
      }

      // Rate limit
      if (requestCount > 0) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Match fd_ entries with API-Football fixtures by team names and date
    let migratedCount = 0;
    let failedCount = 0;

    for (const match of fdMatches) {
      const matchDate = new Date(match.match_date).toISOString().split('T')[0];
      const fixtures = apiFixturesByDate.get(matchDate) || [];

      // Try to find matching fixture by team names (fuzzy matching)
      const normalizeTeam = (name: string) => {
        return name.toLowerCase()
          .replace(/fc |afc |cf |sc |fk |rc |ac |as |ss |ssc |rcd |cd |ud |sd /gi, '')
          .replace(/\s+/g, ' ')
          .trim();
      };
      
      // Extract key words (3+ chars) for matching
      const getKeywords = (name: string) => {
        return normalizeTeam(name).split(' ').filter(w => w.length >= 3);
      };
      
      const apiMatch = fixtures.find((f: any) => {
        const apiHome = (f.teams?.home?.name || '').toLowerCase();
        const apiAway = (f.teams?.away?.name || '').toLowerCase();
        const dbHome = (match.home_team || '').toLowerCase();
        const dbAway = (match.away_team || '').toLowerCase();

        // Exact match
        if (apiHome === dbHome && apiAway === dbAway) return true;

        // Normalized match
        if (normalizeTeam(apiHome) === normalizeTeam(dbHome) && normalizeTeam(apiAway) === normalizeTeam(dbAway)) return true;

        // Keyword overlap match: at least 1 keyword from each team must match
        const dbHomeKw = getKeywords(dbHome);
        const dbAwayKw = getKeywords(dbAway);
        const apiHomeKw = getKeywords(apiHome);
        const apiAwayKw = getKeywords(apiAway);

        const homeMatch = dbHomeKw.some(w => apiHomeKw.includes(w)) || apiHomeKw.some(w => dbHomeKw.includes(w));
        const awayMatch = dbAwayKw.some(w => apiAwayKw.includes(w)) || apiAwayKw.some(w => dbAwayKw.includes(w));

        return homeMatch && awayMatch;
      });

      if (apiMatch) {
        const newExternalId = `apifb_${apiMatch.fixture.id}`;
        const { error: updateError } = await supabase
          .from('football_matches')
          .update({
            external_id: newExternalId,
            external_source: 'apifb',
            home_team_crest: apiMatch.teams?.home?.logo || match.home_team_crest,
            away_team_crest: apiMatch.teams?.away?.logo || match.away_team_crest,
            // Also update score/status if match has started
            ...(apiMatch.fixture?.status?.short !== 'NS' ? {
              home_score: apiMatch.goals?.home ?? null,
              away_score: apiMatch.goals?.away ?? null,
              status: mapApiStatus(apiMatch.fixture?.status?.short),
            } : {}),
            last_sync_at: new Date().toISOString(),
          })
          .eq('id', match.id);

        if (updateError) {
          console.error(`❌ Failed to update ${match.id}:`, updateError);
          failedCount++;
        } else {
          migratedCount++;
          console.log(`✅ Migrated: ${match.home_team} vs ${match.away_team} → ${newExternalId}`);
        }
      } else {
        console.warn(`⚠️ No API-Football match found for: ${match.home_team} vs ${match.away_team} (${matchDate})`);
        failedCount++;
      }
    }

    console.log(`🏁 Migration complete. Migrated: ${migratedCount}, Failed: ${failedCount}, API requests: ${requestCount}`);

    return new Response(JSON.stringify({
      success: true,
      total: fdMatches.length,
      migrated: migratedCount,
      failed: failedCount,
      apiRequests: requestCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Migration error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function mapApiStatus(apiStatus: string): string {
  const statusMap: Record<string, string> = {
    'NS': 'scheduled',
    'TBD': 'scheduled',
    '1H': '1H',
    'HT': 'HT',
    '2H': '2H',
    'ET': 'ET',
    'P': 'P',
    'FT': 'finished',
    'AET': 'finished',
    'PEN': 'finished',
    'BT': 'finished',
    'SUSP': 'suspended',
    'INT': 'interrupted',
    'PST': 'postponed',
    'CANC': 'cancelled',
    'ABD': 'abandoned',
    'AWD': 'finished',
    'WO': 'finished',
    'LIVE': '1H',
  };
  return statusMap[apiStatus] || 'scheduled';
}
