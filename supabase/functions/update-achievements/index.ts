// supabase/functions/update-achievements/index.ts
// Minimal Edge Function - returns success immediately

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Return success immediately - no database operations
  return new Response(
    JSON.stringify({
      success: true,
      newUnlocks: [],
      message: 'Achievement update skipped (minimal mode)',
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
