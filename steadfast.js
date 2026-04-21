// netlify/functions/steadfast.js
const SF_BASE = 'https://portal.steadfast.com.bd/public/api/v1';

const ALLOWED = [
  '/get_balance',
  '/create_order',
  '/status_by_cid/',
  '/get_return_request',
  '/request_return',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };
  }

  let parsed;
  try {
    parsed = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON: ' + e.message }) };
  }

  const { path, method = 'POST', body, api_key, secret_key } = parsed;

  if (!path)       return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing: path' }) };
  if (!api_key)    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing: api_key' }) };
  if (!secret_key) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing: secret_key' }) };

  if (!ALLOWED.some(p => path.startsWith(p))) {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Endpoint not allowed: ' + path }) };
  }

  const opts = {
    method: method.toUpperCase(),
    headers: {
      'Content-Type': 'application/json',
      'Api-Key':    api_key.trim(),
      'Secret-Key': secret_key.trim(),
    },
  };

  if (body && opts.method !== 'GET') {
    opts.body = JSON.stringify(body);
  }

  try {
    const sfRes = await fetch(SF_BASE + path, opts);
    const rawText = await sfRes.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      const clean = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
      return {
        statusCode: sfRes.status,
        headers: CORS,
        body: JSON.stringify({
          error: `Steadfast returned non-JSON (HTTP ${sfRes.status})`,
          detail: clean || rawText.slice(0, 200),
        }),
      };
    }

    return { statusCode: sfRes.status, headers: CORS, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Proxy error: ' + err.message }) };
  }
};
