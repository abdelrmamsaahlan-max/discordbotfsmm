const http = require('http');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');

const TRACKED = new Set((process.env.STEAL_EGG_TRACKED_RARITIES || 'DIVINE,ETERNAL,SECRET')
  .split(',').map(x => x.trim().toUpperCase()).filter(Boolean));
const CHANNEL_ID = process.env.STEAL_EGG_ALERT_CHANNEL_ID || process.env.EGG_TRACKER_CHANNEL_ID || '';
const ROLE_ID = process.env.STEAL_EGG_ALERT_ROLE_ID || '';
const SOURCE_URL = process.env.STEAL_EGG_SOURCE_URL || '';
const SOURCE_API_KEY = process.env.STEAL_EGG_SOURCE_API_KEY || '';
const WEBHOOK_PORT = Number(process.env.STEAL_EGG_WEBHOOK_PORT || process.env.EGG_TRACKER_PORT || 3000);
const WEBHOOK_SECRET = process.env.STEAL_EGG_WEBHOOK_SECRET || process.env.EGG_TRACKER_WEBHOOK_SECRET || '';
const POLL_MS = Math.max(2000, Number(process.env.STEAL_EGG_POLL_INTERVAL_MS || 5000));
const ENABLED = !['0','false','off','no'].includes(String(process.env.STEAL_EGG_TRACKER_ENABLED || 'true').toLowerCase());

let clientRef = null;
let state = {
  running: false, source: 'not configured', sourceOnline: false,
  lastEventAt: null, lastSourceSuccessAt: null, lastAlertAt: null,
  alerts: 0, duplicates: 0, errors: 0, totalEvents: 0, rareEvents: 0,
  byRarity: {}, lastSpawn: null
};
let timer = null;
let webhookServer = null;
let polling = false;
let getStore = null;
let markDirty = null;

function clean(v, n = 500) {
  return String(v ?? '').replace(/@everyone|@here/gi, '@ mention')
    .replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, n);
}
function rarity(v) {
  const r = clean(v, 40).toUpperCase();
  return r || null;
}
function unix(v) {
  const d = v == null ? new Date() : new Date(v);
  const n = d.getTime();
  return Number.isFinite(n) ? Math.floor(n / 1000) : null;
}
function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = rarity(raw.rarity || raw.tier);
  const egg = clean(raw.eggName || raw.egg || raw.egg_name || raw.name, 120);
  const item = clean(raw.itemName || raw.item || raw.spawn || raw.reward || raw.content || '', 160);
  const location = clean(raw.location || raw.area || raw.zone || '', 120);
  const spawnedAt = unix(raw.spawnedAt || raw.spawned_at || raw.timestamp || raw.time);
  if (!r || !egg || !spawnedAt) return null;
  const id = clean(raw.id || raw.eventId || raw.event_id ||
    crypto.createHash('sha256').update([egg,item,r,location,spawnedAt].join('|')).digest('hex'), 128);
  return {
    id, eggName: egg, itemName: item || null, rarity: r, location: location || null,
    spawnedAt, detectedAt: Math.floor(Date.now()/1000),
    expiresAt: unix(raw.expiresAt || raw.expires_at),
    value: raw.value ?? raw.moneyPerSecond ?? raw.money_per_second ?? null,
    imageUrl: clean(raw.imageUrl || raw.image_url || '', 1000) || null,
    source: clean(raw.source || 'external-feed', 80),
    rawData: raw
  };
}
function store() {
  return typeof getStore === 'function' ? getStore() : null;
}
function seen(id) {
  const s = store();
  return !!(s && s.stealEggTracker && s.stealEggTracker.processed && s.stealEggTracker.processed[id]);
}
function remember(event, alertMessageId) {
  const s = store();
  if (!s) return;
  s.stealEggTracker ||= { processed: {}, recent: [], stats: {} };
  s.stealEggTracker.processed[event.id] = Date.now();
  s.stealEggTracker.recent = [event, ...(s.stealEggTracker.recent || [])].slice(0, 50);
  s.stealEggTracker.stats = state;
  if (alertMessageId) s.stealEggTracker.processed[event.id] = { at: Date.now(), alertMessageId };
  if (typeof markDirty === 'function') markDirty();
}
function prune() {
  const s = store();
  if (!s?.stealEggTracker?.processed) return;
  const cutoff = Date.now() - 7 * 86400000;
  for (const [id,v] of Object.entries(s.stealEggTracker.processed)) {
    const at = typeof v === 'object' ? v.at : v;
    if (at < cutoff) delete s.stealEggTracker.processed[id];
  }
}
function signatureOk(req, raw) {
  if (!WEBHOOK_SECRET) return true;
  const got = String(req.headers['x-steal-egg-signature'] || '');
  const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
async function sendAlert(event, test = false) {
  if (!clientRef || !CHANNEL_ID) throw new Error('Alert channel is not configured');
  const channel = await clientRef.channels.fetch(CHANNEL_ID);
  if (!channel?.isTextBased()) throw new Error('Alert channel is not text based');
  const colors = { DIVINE: 0xf59e0b, ETERNAL: 0x8b5cf6, SECRET: 0x22c55e };
  const fields = [
    { name: '💎 Rarity', value: event.rarity, inline: true },
    { name: '🥚 Egg', value: event.eggName, inline: true }
  ];
  if (event.itemName) fields.push({ name: '🎁 Spawn', value: event.itemName, inline: true });
  if (event.location) fields.push({ name: '📍 Location', value: event.location, inline: true });
  if (event.value != null && String(event.value).trim()) fields.push({ name: '💰 Value', value: clean(event.value,120), inline: true });
  fields.push({ name: '⏰ Spawned', value: `<t:${event.spawnedAt}:F>\n<t:${event.spawnedAt}:R>`, inline: true });
  fields.push({ name: '🔎 Detected', value: `<t:${event.detectedAt}:R>`, inline: true });
  if (event.expiresAt) fields.push({ name: '⏳ Expires', value: `<t:${event.expiresAt}:R>`, inline: true });
  const embed = new EmbedBuilder()
    .setTitle(test ? '🧪 TEST — ' + event.rarity + ' SPAWN' : '🥚 ' + event.rarity + ' SPAWN DETECTED')
    .addFields(fields)
    .setColor(colors[event.rarity] || 0x5865f2)
    .setFooter({ text: 'Steal an Egg Tracker • Automatic Spawn Detection' })
    .setTimestamp();
  if (event.imageUrl && /^https?:\/\//i.test(event.imageUrl)) embed.setThumbnail(event.imageUrl);
  const content = ROLE_ID && !test ? `<@&${ROLE_ID}>` : undefined;
  const msg = await channel.send({ content, allowedMentions: ROLE_ID && !test ? { roles: [ROLE_ID] } : { parse: [] }, embeds: [embed] });
  return msg;
}
async function processEvent(raw) {
  state.totalEvents++;
  const event = normalize(raw);
  if (!event || !TRACKED.has(event.rarity)) return { ok: true, ignored: true };
  state.rareEvents++;
  state.byRarity[event.rarity] = (state.byRarity[event.rarity] || 0) + 1;
  state.lastEventAt = Date.now();
  state.lastSpawn = event;
  if (seen(event.id)) { state.duplicates++; return { ok: true, deduped: true }; }
  const msg = await sendAlert(event);
  remember(event, msg.id);
  state.alerts++;
  state.lastAlertAt = Date.now();
  return { ok: true, alerted: true, event };
}
async function fetchFeed() {
  if (!SOURCE_URL) return null;
  const headers = { accept: 'application/json' };
  if (SOURCE_API_KEY) headers.authorization = 'Bearer ' + SOURCE_API_KEY;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(POLL_MS - 250, 10000));
  try {
    const res = await fetch(SOURCE_URL, { headers, signal: controller.signal });
    if (!res.ok) throw new Error('source HTTP ' + res.status);
    const body = await res.json();
    state.lastSourceSuccessAt = Date.now();
    state.sourceOnline = true;
    return Array.isArray(body) ? body : (body.events || body.data || body.spawns || [body]);
  } finally { clearTimeout(timeout); }
}
async function poll() {
  if (polling || !SOURCE_URL || !ENABLED) return;
  polling = true;
  try {
    const events = await fetchFeed() || [];
    for (const raw of events) await processEvent(raw);
  } catch (e) {
    state.sourceOnline = false; state.errors++;
    console.error('[STEAL EGG TRACKER]', e.message);
  } finally { polling = false; }
}
function startWebhook() {
  if (webhookServer) return;
  webhookServer = http.createServer((req,res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, {'content-type':'application/json'});
      return res.end(JSON.stringify(status()));
    }
    if (req.method !== 'POST' || req.url !== '/api/steal-egg/spawn') {
      res.writeHead(404); return res.end('Not found');
    }
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size <= 100000) chunks.push(c); });
    req.on('end', async () => {
      try {
        const raw = Buffer.concat(chunks);
        if (size > 100000) throw new Error('Payload too large');
        if (!signatureOk(req, raw)) { res.writeHead(401); return res.end('Invalid signature'); }
        const body = JSON.parse(raw.toString('utf8'));
        const list = Array.isArray(body) ? body : (body.events || [body]);
        const results = [];
        for (const item of list) results.push(await processEvent(item));
        res.writeHead(200, {'content-type':'application/json'});
        res.end(JSON.stringify({ok:true, results}));
      } catch (e) {
        state.errors++; console.error('[STEAL EGG TRACKER]', e.message);
        res.writeHead(400, {'content-type':'application/json'});
        res.end(JSON.stringify({ok:false,error:e.message}));
      }
    });
  });
  webhookServer.listen(WEBHOOK_PORT, '0.0.0.0', () =>
    console.log('[STEAL EGG TRACKER] webhook listening on ' + WEBHOOK_PORT));
}
function start(client, options = {}) {
  if (state.running || !ENABLED) return;
  clientRef = client; getStore = options.getStore; markDirty = options.markDirty;
  state.running = true;
  state.source = SOURCE_URL ? 'http-feed' : 'not configured';
  startWebhook();
  if (SOURCE_URL) { poll(); timer = setInterval(poll, POLL_MS); }
  else console.warn('[STEAL EGG TRACKER] No live source configured; tracker is ready but not live.');
}
function stop() {
  if (timer) clearInterval(timer);
  if (webhookServer) webhookServer.close();
  timer = null; webhookServer = null; state.running = false;
}
function status() {
  return {...state, trackedRarities:[...TRACKED], pollIntervalMs:POLL_MS, sourceConfigured:!!SOURCE_URL};
}
async function test() {
  const event = { id:'test-'+Date.now(), eggName:'Test Egg', itemName:'Test Rare Item', rarity:[...TRACKED][0] || 'SECRET', location:'Test Area', spawnedAt:Math.floor(Date.now()/1000), detectedAt:Math.floor(Date.now()/1000), value:'TEST ONLY', source:'test' };
  return sendAlert(event, true);
}
function recent() {
  return store()?.stealEggTracker?.recent || [];
}
module.exports = { start, stop, status, processEvent, test, recent };
