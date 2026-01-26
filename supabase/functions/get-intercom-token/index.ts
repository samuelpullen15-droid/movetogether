// Supabase Edge Function to generate Intercom identity verification hash
// Uses native Web Crypto API for HMAC-SHA256

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Create HMAC-SHA256 hash for Intercom identity verification
async function createUserHash(userId: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(userId));

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  return hashHex;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    console.log("[get-intercom-token] Auth header present:", !!authHeader);

    if (!authHeader) {
      console.error("[get-intercom-token] Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    console.log("[get-intercom-token] Supabase URL:", supabaseUrl ? "set" : "missing");
    console.log("[get-intercom-token] Supabase Service Key:", supabaseServiceKey ? "set" : "missing");

    // Extract JWT token from Bearer header and verify with service role client
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      supabaseUrl ?? "",
      supabaseServiceKey ?? ""
    );

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    console.log("[get-intercom-token] User ID:", user?.id || "null");

    if (authError || !user) {
      console.error("[get-intercom-token] User auth error:", authError?.message || "No user");
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: authError?.message || "No user found" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the Intercom Identity Verification secret from environment
    // NOTE: This must be the Identity Verification secret from Intercom,
    // NOT the API key. Find it in: Intercom > Settings > Installation > Security
    const intercomSecret = Deno.env.get("INTERCOM_API_SECRET");
    console.log("[get-intercom-token] Intercom secret:", intercomSecret ? `set (${intercomSecret.length} chars)` : "missing");

    if (!intercomSecret) {
      console.error("[get-intercom-token] INTERCOM_API_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Intercom not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate HMAC-SHA256 hash of the user_id for Intercom identity verification
    // This hash must be generated server-side using the secret
    const userHash = await createUserHash(user.id, intercomSecret);

    console.log("[get-intercom-token] Successfully generated hash for user:", user.id);

    return new Response(
      JSON.stringify({ userHash }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[get-intercom-token] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
