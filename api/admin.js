// api/admin.js — Vercel Serverless Function
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kgbktrsdricudjbksnud.supabase.co';
const anonClient  = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const adminClient = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid or expired session' });

  const { data: staffRec } = await adminClient
    .from('staff').select('role, is_active').eq('email', user.email).single();

  if (!staffRec || !staffRec.is_active) return res.status(403).json({ error: 'Not authorized as staff' });

  const { action, ...payload } = req.body || {};

  try {
    let result;
    switch (action) {

      case 'getClients': {
        const { data, error } = await adminClient.from('clients').select('*').order('name');
        result = { data, error }; break;
      }
      case 'getOrders': {
        const { clientId } = payload;
        let q = adminClient.from('orders').select('*').order('created_at', { ascending: false });
        if (clientId) q = q.eq('client_id', clientId);
        const { data, error } = await q;
        result = { data, error }; break;
      }
      case 'updateOrderStatus': {
        const { orderId, status } = payload;
        const { data, error } = await adminClient.from('orders').update({ status }).eq('id', orderId);
        result = { data, error }; break;
      }
      case 'getStaff': {
        if (staffRec.role !== 'superadmin') return res.status(403).json({ error: 'Superadmin only' });
        const { data, error } = await adminClient.from('staff').select('*').order('name');
        result = { data, error }; break;
      }
      case 'updateStaff': {
        if (staffRec.role !== 'superadmin') return res.status(403).json({ error: 'Superadmin only' });
        const { staffId, updates } = payload;
        const { data, error } = await adminClient.from('staff').update(updates).eq('id', staffId);
        result = { data, error }; break;
      }
      case 'getProducts': {
        const { clientId } = payload;
        let q = adminClient.from('products').select('*');
        if (clientId) q = q.eq('client_id', clientId);
        const { data, error } = await q;
        result = { data, error }; break;
      }
      case 'upsertProduct': {
        const { product } = payload;
        const { data, error } = await adminClient.from('products').upsert(product);
        result = { data, error }; break;
      }
      case 'deleteProduct': {
        const { productId } = payload;
        const { data, error } = await adminClient.from('products').delete().eq('id', productId);
        result = { data, error }; break;
      }
      case 'getAIConfig': {
        const { clientId } = payload;
        const { data, error } = await adminClient
          .from('ai_configs').select('*').eq('client_id', clientId).maybeSingle();
        result = { data, error }; break;
      }
      case 'saveAIConfig': {
        const { config } = payload;
        const { data, error } = await adminClient.from('ai_configs').upsert(config);
        result = { data, error }; break;
      }
      case 'getAuditLog': {
        const { data, error } = await adminClient
          .from('audit_log').select('*,staff(name)')
          .order('created_at', { ascending: false }).limit(50);
        result = { data, error }; break;
      }
      case 'getAnalytics': {
        const { clientId } = payload;
        const [orders, conversations] = await Promise.all([
          adminClient.from('orders').select('id,total,created_at,status').eq('client_id', clientId),
          adminClient.from('conversations').select('id,created_at').eq('client_id', clientId),
        ]);
        result = { orders: orders.data, conversations: conversations.data }; break;
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('Admin function error:', err);
    return res.status(500).json({ error: err.message });
  }
}
