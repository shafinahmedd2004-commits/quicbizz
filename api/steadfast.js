// api/steadfast.js — Vercel Serverless Function
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

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { path, method = 'POST', body, api_key, secret_key } = req.body || {};

  if (!path)       return res.status(400).json({ error: 'Missing: path' });
  if (!api_key)    return res.status(400).json({ error: 'Missing: api_key' });
  if (!secret_key) return res.status(400).json({ error: 'Missing: secret_key' });

  if (!ALLOWED.some(p => path.startsWith(p))) {
    return res.status(403).json({ error: 'Endpoint not allowed: ' + path });
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
      return res.status(sfRes.status).json({
        error: `Steadfast returned non-JSON (HTTP ${sfRes.status})`,
        detail: clean || rawText.slice(0, 200),
      });
    }
    return res.status(sfRes.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
}
