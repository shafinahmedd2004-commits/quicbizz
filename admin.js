// netlify/functions/admin.js — Netlify Serverless Function
// The service role key lives ONLY here, in a Netlify environment variable.
// It is never sent to the browser.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kgbktrsdricudjbksnud.supabase.co';

// Anon client — used only to verify the incoming staff JWT
const anonClient = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Admin client — uses service role key, server-side only
const adminClient = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Verify the staff's Supabase JWT token
  const authHeader = event.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing token' }) };
  }

  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired session' }) };
  }

  // Verify the user is an active staff member
  const { data: staffRec } = await adminClient
    .from('staff')
    .select('role, is_active')
    .eq('email', user.email)
    .single();

  if (!staffRec || !staffRec.is_active) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not authorized as staff' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { action, ...payload } = body;

  try {
    // ── ROUTE ACTIONS ─────────────────────────────────────────
    let result;

    switch (action) {

      case 'getClients': {
        const { data, error } = await adminClient.from('clients').select('*').order('name');
        result = { data, error };
        break;
      }

      case 'getOrders': {
        const { clientId } = payload;
        let query = adminClient.from('orders').select('*').order('created_at', { ascending: false });
        if (clientId) query = query.eq('client_id', clientId);
        const { data, error } = await query;
        result = { data, error };
        break;
      }

      case 'updateOrderStatus': {
        const { orderId, status } = payload;
        const { data, error } = await adminClient.from('orders').update({ status }).eq('id', orderId);
        result = { data, error };
        break;
      }

      case 'getStaff': {
        if (staffRec.role !== 'superadmin') {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Superadmin only' }) };
        }
        const { data, error } = await adminClient.from('staff').select('*').order('name');
        result = { data, error };
        break;
      }

      case 'updateStaff': {
        if (staffRec.role !== 'superadmin') {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Superadmin only' }) };
        }
        const { staffId, updates } = payload;
        const { data, error } = await adminClient.from('staff').update(updates).eq('id', staffId);
        result = { data, error };
        break;
      }

      case 'getProducts': {
        const { clientId } = payload;
        let query = adminClient.from('products').select('*');
        if (clientId) query = query.eq('client_id', clientId);
        const { data, error } = await query;
        result = { data, error };
        break;
      }

      case 'upsertProduct': {
        const { product } = payload;
        const { data, error } = await adminClient.from('products').upsert(product);
        result = { data, error };
        break;
      }

      case 'deleteProduct': {
        const { productId } = payload;
        const { data, error } = await adminClient.from('products').delete().eq('id', productId);
        result = { data, error };
        break;
      }

      case 'getAIConfig': {
        const { clientId } = payload;
        const { data, error } = await adminClient
          .from('ai_configs').select('*').eq('client_id', clientId).maybeSingle();
        result = { data, error };
        break;
      }

      case 'saveAIConfig': {
        const { config } = payload;
        const { data, error } = await adminClient.from('ai_configs').upsert(config);
        result = { data, error };
        break;
      }

      case 'getAuditLog': {
        const { data, error } = await adminClient
          .from('audit_log')
          .select('*,staff(name)')
          .order('created_at', { ascending: false })
          .limit(50);
        result = { data, error };
        break;
      }

      case 'getAnalytics': {
        const { clientId } = payload;
        const [orders, conversations] = await Promise.all([
          adminClient.from('orders').select('id,total,created_at,status').eq('client_id', clientId),
          adminClient.from('conversations').select('id,created_at').eq('client_id', clientId)
        ]);
        result = { orders: orders.data, conversations: conversations.data };
        break;
      }

      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    console.error('Admin function error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
