/**
 * Cloudflare Worker — Airtable proxy
 *
 * Environment variables to set in the Cloudflare dashboard (Workers > Settings > Variables):
 *   AIRTABLE_TOKEN      — your Airtable Personal Access Token
 *   AIRTABLE_BASE_ID    — e.g. appXXXXXXXXXXXXXX
 *   AIRTABLE_TABLE_NAME — exact table name as it appears in Airtable
 *   ALLOWED_ORIGIN      — your GitHub Pages URL, e.g. https://yourusername.github.io
 */

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const formBaseUrl = `${env.ALLOWED_ORIGIN}/initiative-form/`;

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // ── GET /prefill?id=recXXXXXX ──────────────────────────────────
    // Fetches the Airtable record and redirects to the form with all
    // prefill values encoded as URL parameters.
    if (request.method === 'GET' && url.pathname === '/prefill') {
      const recordId = url.searchParams.get('id');
      if (!recordId) {
        return new Response('Missing ?id parameter', { status: 400 });
      }

      const atRes = await fetch(
        `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE_NAME)}/${recordId}`,
        { headers: { 'Authorization': `Bearer ${env.AIRTABLE_TOKEN}` } }
      );

      if (!atRes.ok) {
        const err = await atRes.json().catch(() => ({}));
        return new Response(JSON.stringify({ error: 'Record not found', detail: err }), {
          status: atRes.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { fields } = await atRes.json();

      // Map Airtable field names → URL param keys
      const paramMap = {
        'SCPO Owner':         'scpo_owner',
        'SCPT Owner':         'scpt_owner',
        'Annual Target':      'annual_target',
        'Measure of Success': 'measure_of_success',
        'FY26 Q3 Update':     'fy26_q3_update',
        'FY26 Q4 Update':     'fy26_q4_update',
      };

      const params = new URLSearchParams();
      for (const [airtableField, paramKey] of Object.entries(paramMap)) {
        if (fields[airtableField] != null) {
          params.set(paramKey, fields[airtableField]);
        }
      }

      return Response.redirect(`${formBaseUrl}?${params.toString()}`, 302);
    }

    // Only accept POST to /submit
    if (request.method !== 'POST' || url.pathname !== '/submit') {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    let fields;
    try {
      fields = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate required fields
    const required = ['SCPO Owner', 'SCPT Owner', 'Initiative Health'];
    for (const key of required) {
      if (!fields[key]) {
        return new Response(JSON.stringify({ error: `Missing required field: ${key}` }), {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Forward to Airtable
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE_NAME)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      }
    );

    const data = await airtableRes.json();

    return new Response(JSON.stringify(data), {
      status: airtableRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};
