import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY');
const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';
const DAILY_LIMIT = 95;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('📅 Starting daily fixtures sync...');

    if (!API_FOOTBALL_KEY) {
      throw new Error('API_FOOTBALL_KEY not configured');
    }

    // Parse request body for specific league or sync all active
    let targetLeagues: { league_id: string; season: number }[] = [];
    
    try {
      const body = await req.json();
      if (body.league_id && body.season) {
        targetLeagues = [{ league_id: body.league_id, season: body.season }];
      }
    } catch {
      // No body - sync all active leagues from pools
    }

    // If no specific league requested, find active leagues from pools
    if (targetLeagues.length === 0) {
      const { data: activeMatches } = await supabase
        .from('football_matches')
        .select('championship, external_source')
        .eq('external_source', 'apifb')
        .neq('status', 'finished');

      // Extract unique league identifiers
      // We expect championship to contain league info like "71" (Brazilian Serie A)
      const leagueSet = new Set<string>();
      for (const m of activeMatches || []) {
        if (m.championship) leagueSet.add(m.championship);
      }

      const currentYear = new Date().getFullYear();
      targetLeagues = Array.from(leagueSet).map(l => ({
        league_id: l,
        season: currentYear,
      }));
    }

    if (targetLeagues.length === 0) {
      console.log('⏸️ No active leagues to sync.');
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: 'no_active_leagues',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const today = new Date().toISOString().split('T')[0];
    let totalUpdated = 0;
    let totalCreated = 0;
    let requestsMade = 0;

    for (const league of targetLeagues) {
      // Check if already synced today for this league
      const { data: control } = await supabase
        .from('api_sync_control')
        .select('*')
        .eq('sync_type', 'daily_fixtures')
        .eq('league_id', league.league_id)
        .maybeSingle();

      // Check daily global count
      const { data: globalControl } = await supabase
        .from('api_sync_control')
        .select('daily_request_count, request_count_date')
        .eq('sync_type', 'live_scores')
        .is('league_id', null)
        .single();

      let globalDailyCount = globalControl?.daily_request_count || 0;
      if (globalControl?.request_count_date !== today) {
        globalDailyCount = 0;
      }

      if (globalDailyCount >= DAILY_LIMIT) {
        console.log(`🛑 Global daily limit reached. Skipping league ${league.league_id}`);
        continue;
      }

      // Check if this league was already synced today
      if (control?.last_sync_at) {
        const lastSync = new Date(control.last_sync_at).toISOString().split('T')[0];
        if (lastSync === today) {
          console.log(`⏭️ League ${league.league_id} already synced today. Skipping.`);
          continue;
        }
      }

      // Call API-Football for this league's fixtures
      console.log(`📡 Fetching fixtures for league ${league.league_id}, season ${league.season}...`);
      const response = await fetch(
        `${API_FOOTBALL_BASE}/fixtures?league=${league.league_id}&season=${league.season}`,
        { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
      );

      if (!response.ok) {
        console.error(`❌ API error for league ${league.league_id}: ${response.status}`);
        continue;
      }

      const apiData = await response.json();
      const fixtures = apiData.response || [];
      requestsMade++;

      console.log(`📊 Got ${fixtures.length} fixtures for league ${league.league_id}`);

      // Update global request count
      await supabase
        .from('api_sync_control')
        .update({
          daily_request_count: globalDailyCount + requestsMade,
          request_count_date: today,
        })
        .eq('sync_type', 'live_scores')
        .is('league_id', null);

      // Process fixtures - update existing matches in our DB
      for (const fixture of fixtures) {
        const apiFixtureId = String(fixture.fixture?.id);
        const externalId = `apifb_${apiFixtureId}`;
        const apiStatus = fixture.fixture?.status?.short;
        const homeGoals = fixture.goals?.home;
        const awayGoals = fixture.goals?.away;
        const kickoff = fixture.fixture?.date;
        const homeTeam = fixture.teams?.home?.name;
        const awayTeam = fixture.teams?.away?.name;
        const homeCrest = fixture.teams?.home?.logo;
        const awayCrest = fixture.teams?.away?.logo;

        // Try to update existing match
        const { data: existing } = await supabase
          .from('football_matches')
          .select('id, status')
          .eq('external_id', externalId)
          .maybeSingle();

        if (existing) {
          // Update only if status or score changed
          const mappedStatus = mapApiStatus(apiStatus);
          const { error } = await supabase
            .from('football_matches')
            .update({
              status: mappedStatus,
              home_score: homeGoals,
              away_score: awayGoals,
              match_date: kickoff,
              home_team_crest: homeCrest,
              away_team_crest: awayCrest,
              last_sync_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (!error) totalUpdated++;
        }
        // Note: We don't auto-create matches - they're created when pools are set up
      }

      // Update league sync control
      if (control) {
        await supabase
          .from('api_sync_control')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', control.id);
      } else {
        await supabase
          .from('api_sync_control')
          .insert({
            sync_type: 'daily_fixtures',
            league_id: league.league_id,
            last_sync_at: new Date().toISOString(),
          });
      }

      // Rate limit delay between leagues
      if (targetLeagues.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`🏁 Daily sync complete. Updated: ${totalUpdated}, Requests: ${requestsMade}`);

    return new Response(JSON.stringify({
      success: true,
      leagues: targetLeagues.length,
      updatedMatches: totalUpdated,
      requestsMade,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('❌ Error in daily fixtures sync:', error);
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
