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

    // ── GET /debug?id=recXXXXXX ───────────────────────────────────
    // Returns the raw field names and values from Airtable for a record.
    // Use this to verify exact field names. Remove or restrict in production.
    if (request.method === 'GET' && url.pathname === '/debug') {
      const recordId = url.searchParams.get('id');
      if (!recordId) return new Response('Missing ?id parameter', { status: 400 });

      const atRes = await fetch(
        `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE_NAME)}/${recordId}`,
        { headers: { 'Authorization': `Bearer ${env.AIRTABLE_TOKEN}` } }
      );

      const data = await atRes.json();
      return new Response(JSON.stringify(data, null, 2), {
        status: atRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
        'Tech Owner':         'scpt_owner',
        'Annual Target':      'annual_target',
        'Measure of Success': 'measure_of_success',
        'FY26 Q3 Update':     'fy26_q3_update',
        'FY26 Q4 Update':     'fy26_q4_update',
      };

      const params = new URLSearchParams();
      // Pass the record ID so the form can update the existing record on submit
      params.set('record_id', recordId);
      for (const [airtableField, paramKey] of Object.entries(paramMap)) {
        if (fields[airtableField] != null) {
          params.set(paramKey, fields[airtableField]);
        }
      }

      // Pass the first attachment URL and filename if present
      const attachments = fields['Attachments (from Q3 Status Bar)'];
      if (Array.isArray(attachments) && attachments.length > 0) {
        params.set('q3_attachment_url', attachments[0].url);
        params.set('q3_attachment_name', attachments[0].filename ?? 'Q3 Status Bar');
        params.set('q3_attachment_type', attachments[0].type ?? '');
      }

      return Response.redirect(`${formBaseUrl}?${params.toString()}`, 302);
    }

    // ── GET /targets ──────────────────────────────────────────────
    // Returns all unique, non-empty Annual Target values from Airtable.
    if (request.method === 'GET' && url.pathname === '/targets') {
      const targets = [];
      let offset = null;

      do {
        let atUrl = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE_NAME)}`;
        if (offset) atUrl += `?offset=${encodeURIComponent(offset)}`;

        const atRes = await fetch(atUrl, {
          headers: { 'Authorization': `Bearer ${env.AIRTABLE_TOKEN}` },
        });

        const data = await atRes.json();
        if (!atRes.ok) {
          return new Response(JSON.stringify({ error: data }), {
            status: atRes.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        for (const record of data.records ?? []) {
          const val = record.fields?.['Annual Target'];
          if (val && !targets.includes(val)) targets.push(val);
        }

        offset = data.offset ?? null;
      } while (offset);

      return new Response(JSON.stringify({ targets }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only accept POST to /submit
    if (request.method !== 'POST' || url.pathname !== '/submit') {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract record ID from payload (not a real Airtable field)
    const recordId = body._record_id;
    delete body._record_id;
    const fields = body;

    // Validate required fields
    const required = ['Initiative Health'];
    for (const key of required) {
      if (!fields[key]) {
        return new Response(JSON.stringify({ error: `Missing required field: ${key}` }), {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // PATCH existing record if record ID provided, otherwise POST a new record
    const airtableUrl = recordId
      ? `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE_NAME)}/${recordId}`
      : `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE_NAME)}`;

    const airtableRes = await fetch(airtableUrl, {
      method: recordId ? 'PATCH' : 'POST',
      headers: {
        'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    const data = await airtableRes.json();

    return new Response(JSON.stringify(data), {
      status: airtableRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};
