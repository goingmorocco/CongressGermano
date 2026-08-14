// Supabase Edge Function: send-conversion
// Sends a server-side "Lead" event to Meta's Conversions API whenever a new row
// is inserted into the `registrations` table, via a database trigger.
//
// This is the ONLY source of Lead events for this site — the browser-side
// Meta Pixel has been removed. `event_id` (the registration's UUID) is kept
// stable so retries/re-sends don't get double-counted.
//
// Match quality: alongside hashed email/phone, we send `fbc` (which ad click
// drove the visit, from the fbclid URL param) and `fbp` (a first-party
// browser identifier) that the site's own JS now captures into cookies and
// stores on the registrations row, since there's no pixel to set these
// automatically. This is what keeps Meta's lead detection/attribution accurate
// without a client-side pixel.
//
// SETUP:
// 1. Supabase Dashboard -> Edge Functions -> New function -> name it exactly
//    "send-conversion" -> paste this code in -> Deploy.
// 2. Turn OFF "Verify JWT" and "Verify JWT with legacy secret" in this function's
//    Settings tab (same as we did for send-confirmation).
// 3. Add a secret: Edge Functions -> send-conversion -> Secrets ->
//      META_CAPI_TOKEN = <your Conversions API access token from Events Manager>
//    (optional, only while testing) META_TEST_EVENT_CODE = <code from the
//    Test Events tab in Events Manager -- remove this once you confirm it works,
//    so real events aren't marked as test traffic in production>
// 4. Run add-capi-columns.sql once in the Supabase SQL editor so the
//    `registrations` table has fbc/fbp/user_agent columns for this function to read.
// 5. Create the database trigger (see the SQL provided separately) so this
//    function actually gets called on every new sign-up.

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const META_PIXEL_ID = "1015814088117647";
const META_CAPI_TOKEN = Deno.env.get("META_CAPI_TOKEN") || "";
const META_TEST_EVENT_CODE = Deno.env.get("META_TEST_EVENT_CODE") || "";
const GRAPH_API_VERSION = "v26.0";
const SITE_URL = "https://karrierebrueckekongress.com/";

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req: Request) => {
  try {
    const payload = await req.json();
    const record = payload.record || payload;

    if (!record || !record.email) {
      return new Response(JSON.stringify({ error: "No record or email in payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!META_CAPI_TOKEN) {
      return new Response(JSON.stringify({ error: "META_CAPI_TOKEN secret not set" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const hashedEmail = await sha256(record.email);
    const cleanedPhone = record.phone ? record.phone.replace(/[^0-9]/g, "") : "";
    const hashedPhone = cleanedPhone ? await sha256(cleanedPhone) : null;

    const userData: Record<string, unknown> = { em: [hashedEmail] };
    if (hashedPhone) userData.ph = [hashedPhone];

    // These come from the site's JS capturing fbclid/cookies at signup time
    // and storing them on the row (no pixel is present to set them for us).
    if (record.fbc) userData.fbc = record.fbc;
    if (record.fbp) userData.fbp = record.fbp;
    if (record.user_agent) userData.client_user_agent = record.user_agent;

    const eventTime = record.created_at
      ? Math.floor(new Date(record.created_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    const eventData = {
      event_name: "Lead",
      event_time: eventTime,
      event_id: record.id,
      action_source: "website",
      event_source_url: SITE_URL,
      user_data: userData,
      custom_data: {
        content_name: record.plan || "",
        value: record.plan_price || 0,
        currency: "EUR",
      },
    };

    const body: Record<string, unknown> = { data: [eventData] };
    if (META_TEST_EVENT_CODE) body.test_event_code = META_TEST_EVENT_CODE;

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${META_PIXEL_ID}/events?access_token=${META_CAPI_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const data = await res.json();

    return new Response(JSON.stringify({ ok: res.ok, data }), {
      status: res.ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
