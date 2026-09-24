const http = require('http');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');

const KNOWN_RARITIES = new Set(['COMMON','UNCOMMON','RARE','EPIC','LEGENDARY','MYTHIC','COSMIC','SECRET','ETERNAL','DIVINE']);
const TRACKED_DEFAULT = [...new Set((process.env.STEAL_EGG_TRACKED_RARITIES || 'DIVINE,ETERNAL,SECRET')
  .split(',').map(x => x.trim().toUpperCase()).filter(x => KNOWN_RARITIES.has(x)))];
const TRACKED = new Set(TRACKED_DEFAULT);
const CHANNEL_ID = process.env.STEAL_EGG_ALERT_CHANNEL_ID || process.env.EGG_TRACKER_CHANNEL_ID || '';
const ROLE_ID = process.env.STEAL_EGG_ALERT_ROLE_ID || '';
const SOURCE_URL = process.env.STEAL_EGG_SOURCE_URL || '';
const SOURCE_API_KEY = process.env.STEAL_EGG_SOURCE_API_KEY || '';
const WEBHOOK_PORT = Number(process.env.STEAL_EGG_WEBHOOK_PORT || process.env.EGG_TRACKER_PORT || 3000);
const WEBHOOK_SECRET = process.env.STEAL_EGG_WEBHOOK_SECRET || process.env.EGG_TRACKER_WEBHOOK_SECRET || '';
const POLL_MS = Math.max(2000, Number(process.env.STEAL_EGG_POLL_INTERVAL_MS || 5000));
const ENABLED = !['0','false','off','no'].includes(String(process.env.STEAL_EGG_TRACKER_ENABLED || 'true').toLowerCase());
const CATALOG_STRICT = !['0','false','off','no'].includes(String(process.env.STEAL_EGG_CATALOG_STRICT || 'true').toLowerCase());
const CATALOG = require('./steal-egg-catalog');
const STRICT = !['0','false','off','no'].includes(String(process.env.STEAL_EGG_CATALOG_STRICT || 'true').toLowerCase());
const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.STEAL_EGG_SOURCE_TIMEOUT_MS || 10000));
const RETENTION_DAYS = Math.max(1, Number(process.env.STEAL_EGG_RETENTION_DAYS || 30));
const CACHE_LIMIT = Math.max(50, Number(process.env.STEAL_EGG_CACHE_LIMIT || 1000));
const SECONDARY_SOURCE_URL = process.env.STEAL_EGG_SECONDARY_SOURCE_URL || '';
const FALLBACK_SOURCE_URL = process.env.STEAL_EGG_FALLBACK_SOURCE_URL || '';

let clientRef = null;
let state = {
  running: false, source: 'not configured', sourceOnline: false,
  lastEventAt: null, lastSourceSuccessAt: null, lastAlertAt: null,
  alerts: 0, duplicates: 0, errors: 0, totalEvents: 0, rareEvents: 0,
  failedAlerts: 0, retries: 0, byRarity: {}, lastSpawn: null,
  sourceLatencyMs: null, lastRequestAt: null, lastSourceFailureAt: null,
  startedAt: null, lastRecoveryAt: null, sourceStatus: 'offline'
};
let timer = null;
let webhookServer = null;
let polling = false;
let getStore = null;
let lastSourceError = null;
let consecutiveSourceFailures = 0;
let activeSourceIndex = 0;
const recentIds = new Map();
let alertQueue = Promise.resolve();
const inFlight = new Set();
const MAX_EVENT_AGE_SEC = Math.max(30, Number(process.env.STEAL_EGG_MAX_EVENT_AGE_SEC || 300));

let markDirty = null;

function clean(v, n = 500) {
  return String(v ?? '').replace(/@everyone|@here/gi, '@ mention')
    .replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, n);
}
function rarity(v) {
  const r = clean(v, 40).toUpperCase();
  return KNOWN_RARITIES.has(r) ? r : null;
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
  const catalog = CATALOG.find(item || egg);
  let verifiedRarity = r;
  let verificationStatus = catalog ? (catalog.disputed ? 'disputed' : 'verified') : 'unknown';
  const warnings = [];
  if (catalog) {
    if (catalog.rarity !== r) {
      warnings.push('RARITY_MISMATCH: source=' + r + ', catalog=' + catalog.rarity);
      if (CATALOG_STRICT && catalog.confidence === 'high') {
        verifiedRarity = catalog.rarity;
        verificationStatus = 'corrected';
      } else {
        verificationStatus = 'mismatch';
      }
    }
    if (location && catalog.location && CATALOG.normalizeName(location) !== CATALOG.normalizeName(catalog.location)) {
      warnings.push('LOCATION_MISMATCH: source=' + location + ', catalog=' + catalog.location);
    }
  } else if (CATALOG_STRICT) {
    warnings.push('UNKNOWN_SPECIES: not present in validation catalog');
  }
  return {
    id, eggName: egg, itemName: item || null, rarity: verifiedRarity, sourceRarity: r,
    location: location || null, spawnedAt, detectedAt: Math.floor(Date.now()/1000),
    expiresAt: unix(raw.expiresAt || raw.expires_at),
    value: raw.value ?? raw.moneyPerSecond ?? raw.money_per_second ?? null,
    imageUrl: clean(raw.imageUrl || raw.image_url || '', 1000) || null,
    source: clean(raw.source || 'external-feed', 80),
    verificationStatus, warnings,
    catalogName: catalog?.name || null,
    catalogRarity: catalog?.rarity || null,
    catalogBaseIncome: catalog?.baseIncome || null,
    catalogLocation: catalog?.location || null,
    catalogEggName: catalog?.eggName || null,
    catalogConfidence: catalog?.confidence || null,
    rawData: { id: raw.id || raw.eventId || raw.event_id || null, eggName: egg, itemName: item || null, sourceRarity: r, rarity: verifiedRarity, location: location || null, spawnedAt, expiresAt: unix(raw.expiresAt || raw.expires_at), value: raw.value ?? raw.moneyPerSecond ?? raw.money_per_second ?? null, imageUrl: clean(raw.imageUrl || raw.image_url || '', 1000) || null, source: clean(raw.source || 'external-feed', 80), verificationStatus, warnings }
  };
}
function store() {
  return typeof getStore === 'function' ? getStore() : null;
}
function seen(id) {
  if (recentIds.has(id)) return true;
  const s = store();
  return !!(s && s.stealEggTracker && s.stealEggTracker.processed && s.stealEggTracker.processed[id]);
}
function rememberCache(id) {
  recentIds.set(id, Date.now());
  while (recentIds.size > CACHE_LIMIT) recentIds.delete(recentIds.keys().next().value);
}
function enqueue(task) {
  const run = alertQueue.then(task, task);
  alertQueue = run.catch(() => {});
  return run;
}
function ensureTrackerStore() {
  const s = store(); if (!s) return null;
  s.stealEggTracker ||= { schemaVersion: 2, processed: {}, recent: [], history: [], stats: {}, config: {} };
  s.stealEggTracker.schemaVersion ||= 2;
  s.stealEggTracker.processed ||= {};
  s.stealEggTracker.recent ||= [];
  s.stealEggTracker.history ||= [];
  s.stealEggTracker.stats ||= {};
  s.stealEggTracker.config ||= {};
  return s;
}
function remember(event, alertMessageId) {
  const s = ensureTrackerStore();
  if (!s) return;
  s.stealEggTracker.processed[event.id] = Date.now();
  s.stealEggTracker.recent = [event, ...(s.stealEggTracker.recent || [])].slice(0, 100);
  s.stealEggTracker.history = [event, ...(s.stealEggTracker.history || [])].slice(0, 5000);
  s.stealEggTracker.stats = state;
  if (alertMessageId) s.stealEggTracker.processed[event.id] = { at: Date.now(), alertMessageId };
  if (typeof markDirty === 'function') markDirty();
}
function prune() {
  const s = ensureTrackerStore();
  if (!s?.stealEggTracker?.processed) return;
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  for (const [id,v] of Object.entries(s.stealEggTracker.processed)) {
    const at = typeof v === 'object' ? v.at : v;
    if (at < cutoff) delete s.stealEggTracker.processed[id];
  }
  const cutoffSec = Math.floor(cutoff / 1000);
  s.stealEggTracker.recent = (s.stealEggTracker.recent || []).filter(x => !x.spawnedAt || x.spawnedAt >= cutoffSec).slice(0, 100);
  s.stealEggTracker.history = (s.stealEggTracker.history || []).filter(x => !x.spawnedAt || x.spawnedAt >= cutoffSec).slice(0, 5000);
  if (typeof markDirty === 'function') markDirty();
}
function signatureOk(req, raw) {
  if (!WEBHOOK_SECRET) return true;
  const got = String(req.headers['x-steal-egg-signature'] || '');
  const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
async function sendAlert(event, test = false) {
  const c = trackerConfig();
  if (!clientRef || !c.channelId) throw new Error('Alert channel is not configured');
  const channel = await clientRef.channels.fetch(c.channelId);
  if (!channel?.isTextBased()) throw new Error('Alert channel is not text based');
  const colors = { DIVINE: 0xf59e0b, ETERNAL: 0x8b5cf6, SECRET: 0x22c55e };
  const fields = [
    { name: '💎 Rarity', value: event.rarity + (event.sourceRarity && event.sourceRarity !== event.rarity ? ' (corrected)' : ''), inline: true },
    { name: '🥚 Egg', value: event.eggName, inline: true }
  ];
  if (event.itemName) fields.push({ name: '🎁 Spawn', value: event.itemName, inline: true });
  if (c.location && event.location) fields.push({ name: '📍 Location', value: event.location, inline: true });
  if (event.catalogBaseIncome) fields.push({ name: '💰 Base Income', value: CATALOG.formatMoney(event.catalogBaseIncome), inline: true });
  if (event.value != null && String(event.value).trim()) fields.push({ name: '📡 Source $/s', value: clean(event.value,120), inline: true });
  if (event.verificationStatus === 'disputed' || event.verificationStatus === 'mismatch' || event.warnings?.length) {
    fields.push({ name: '⚠️ Data Check', value: clean(event.warnings?.join(' • ') || 'Public data conflict; verify in-game.', 900), inline: false });
  }
  fields.push({ name: '⏰ Spawned', value: `<t:${event.spawnedAt}:F>\n<t:${event.spawnedAt}:R>`, inline: true });
  fields.push({ name: '🔎 Detected', value: `<t:${event.detectedAt}:R>`, inline: true });
  if (c.expiration && event.expiresAt) fields.push({ name: '⏳ Expires', value: `<t:${event.expiresAt}:R>`, inline: true });
  const embed = new EmbedBuilder()
    .setTitle(test ? '🧪 TEST — ' + event.rarity + ' SPAWN' : '🥚 ' + event.rarity + ' SPAWN DETECTED')
    .addFields(fields)
    .setColor(colors[event.rarity] || 0x5865f2)
    .setFooter({ text: 'Steal an Egg Tracker • Automatic Spawn Detection' })
    .setTimestamp();
  if (c.images && event.imageUrl && /^https?:\/\//i.test(event.imageUrl)) embed.setThumbnail(event.imageUrl);
  const roleId = rarityRoleId(event.rarity);
  const content = roleId && !test ? `<@&${roleId}>` : undefined;
  const msg = await channel.send({ content, allowedMentions: roleId && !test ? { roles: [roleId] } : { parse: [] }, embeds: [embed] });
  return msg;
}

async function sendAlertWithRetry(event, test = false) {
  let delay = 500;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await sendAlert(event, test); }
    catch (e) {
      if (attempt === 3) throw e;
      state.retries++;
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * 2, 5000);
    }
  }
}

async function processEvent(raw) {
  state.totalEvents++;
  if (!state.enabled) return { ok: true, ignored: true, reason: 'disabled' };
  const event = normalize(raw);
  if (!event) return { ok: true, ignored: true };
  if (CATALOG_STRICT && event.verificationStatus === 'unknown') {
    return { ok: true, ignored: true, reason: 'unknown-species' };
  }
  if (!trackerConfig().trackedRarities.includes(event.rarity)) return { ok: true, ignored: true, reason: 'untracked-rarity' };
  state.rareEvents++;
  state.byRarity[event.rarity] = (state.byRarity[event.rarity] || 0) + 1;
  const now = Math.floor(Date.now() / 1000);
  if (event.spawnedAt > now + 60) return { ok: true, ignored: true, reason: 'future-event' };
  if (now - event.spawnedAt > MAX_EVENT_AGE_SEC) return { ok: true, ignored: true, reason: 'stale-event' };
  state.lastEventAt = Date.now();
  state.lastSpawn = event;
  if (seen(event.id)) { state.duplicates++; return { ok: true, deduped: true }; }
  if (seen(event.id)) { state.duplicates++; return { ok: true, deduped: true, event }; }
  rememberCache(event.id);
  return enqueue(async () => {
    if (seen(event.id)) { state.duplicates++; return { ok: true, deduped: true, event }; }
    try {
      const msg = await sendAlertWithRetry(event);
      remember(event, msg.id);
      state.alerts++;
      state.lastAlertAt = Date.now();
      return { ok: true, alerted: true, event, messageId: msg.id };
    } catch (e) {
      state.failedAlerts++;
      state.errors++;
      console.error('[STEAL EGG TRACKER] alert failed:', e.stack || e.message);
      return { ok: false, alertFailed: true, event, error: e.message };
    }
  });
}
async function fetchFeed(url = SOURCE_URL) {
  if (!url) return null;
  const headers = { accept: 'application/json' };
  if (SOURCE_API_KEY) headers.authorization = 'Bearer ' + SOURCE_API_KEY;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = Date.now();
  state.lastRequestAt = Date.now();
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    state.sourceLatencyMs = Date.now() - started;
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') || 0);
      if (retry > 0) await new Promise(r => setTimeout(r, Math.min(retry * 1000, 30000)));
      state.retries++;
      throw new Error('source HTTP 429');
    }
    if (!res.ok) throw new Error('source HTTP ' + res.status);
    const body = await res.json();
    state.lastSourceSuccessAt = Date.now();
    state.sourceOnline = true;
    state.sourceStatus = 'online';
    lastSourceError = null;
    return Array.isArray(body) ? body : (body.events || body.spawns || body.data || [body]);
  } finally { clearTimeout(timeout); }
}
async function poll() {
  if (polling || !state.enabled) return;
  const sources = [SOURCE_URL, SECONDARY_SOURCE_URL, FALLBACK_SOURCE_URL].filter(Boolean);
  if (!sources.length) { state.sourceStatus = 'offline'; state.sourceOnline = false; return; }
  polling = true;
  try {
    let events = null;
    for (let attempt = 0; attempt < sources.length; attempt++) {
      const index = (activeSourceIndex + attempt) % sources.length;
      try {
        events = await fetchFeed(sources[index]);
        const recovered = state.lastSourceFailureAt && state.lastSourceSuccessAt > state.lastSourceFailureAt;
        activeSourceIndex = index;
        consecutiveSourceFailures = 0;
        state.source = index === 0 ? 'primary' : index === 1 ? 'secondary' : 'fallback';
        state.sourceStatus = 'online';
        if (recovered) state.lastRecoveryAt = Date.now();
        break;
      } catch (e) {
        consecutiveSourceFailures++;
        state.errors++;
        state.lastSourceFailureAt = Date.now();
        lastSourceError = e.message;
        console.error('[STEAL EGG TRACKER] source failure:', e.message);
        if (consecutiveSourceFailures < 3) break;
      }
    }
    if (events == null) {
      state.sourceOnline = false;
      state.sourceStatus = consecutiveSourceFailures >= 3 ? 'offline' : 'degraded';
      return;
    }
    for (const raw of events || []) await processEvent(raw);
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
        const list = Array.isArray(body) ? body : (body.events || body.spawns || body.data || [body]);
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
  prune();
  clientRef = client; getStore = options.getStore; markDirty = options.markDirty;
  state.running = true;
  state.startedAt = Date.now();
  state.enabled = trackerConfig().enabled;
  state.source = SOURCE_URL ? 'primary' : 'not configured';
  startWebhook();
  if (state.enabled && (SOURCE_URL || SECONDARY_SOURCE_URL || FALLBACK_SOURCE_URL)) { poll(); timer = setInterval(poll, POLL_MS); }
  else if (state.enabled) console.warn('[STEAL EGG TRACKER] No live source configured; tracker is ready but not live.');
  else state.sourceStatus = 'disabled';
}
function stop() {
  if (timer) clearInterval(timer);
  if (webhookServer) webhookServer.close();
  timer = null; webhookServer = null; state.running = false;
}
function status() {
  const staleAfter = Math.max(POLL_MS * 3, 15000);
  const sourceOnline = state.enabled && !!state.lastSourceSuccessAt && (Date.now() - state.lastSourceSuccessAt < staleAfter);
  const c = trackerConfig();
  return {...state, sourceOnline, lastSourceError, trackedRarities:c.trackedRarities, pollIntervalMs:POLL_MS,
    sourceConfigured:!!(SOURCE_URL || SECONDARY_SOURCE_URL || FALLBACK_SOURCE_URL), maxEventAgeSec:MAX_EVENT_AGE_SEC,
    strictCatalog:STRICT, uptimeMs:state.startedAt ? Date.now()-state.startedAt : 0, sourceCount:[SOURCE_URL,SECONDARY_SOURCE_URL,FALLBACK_SOURCE_URL].filter(Boolean).length};
}
function trackerConfig() {
  const saved = store()?.stealEggTracker?.config || {};
  const tracked = saved.trackedRarities || TRACKED_DEFAULT;
  return {
    enabled: saved.enabled ?? ENABLED,
    channelId: saved.channelId ?? CHANNEL_ID,
    roleId: saved.roleId ?? ROLE_ID,
    errorChannelId: saved.errorChannelId ?? process.env.STEAL_EGG_ERROR_CHANNEL_ID ?? '',
    statsChannelId: saved.statsChannelId ?? process.env.STEAL_EGG_STATS_CHANNEL_ID ?? '',
    trackedRarities: [...new Set(tracked.map(x => String(x).toUpperCase()).filter(x => KNOWN_RARITIES.has(x)))],
    images: saved.images ?? true,
    location: saved.location ?? true,
    expiration: saved.expiration ?? true,
    style: saved.style || 'professional'
  };
}
function configure(patch) {
  const s = store();
  if (!s) return status();
  s.stealEggTracker ||= { processed:{}, recent:[], stats:{}, config:{} };
  s.stealEggTracker.config = {...trackerConfig(), ...patch};
  s.stealEggTracker.config.trackedRarities = [...new Set((s.stealEggTracker.config.trackedRarities || TRACKED_DEFAULT).map(x => String(x).toUpperCase()).filter(x => KNOWN_RARITIES.has(x)))];
  if (!s.stealEggTracker.config.trackedRarities.length) s.stealEggTracker.config.trackedRarities = TRACKED_DEFAULT;
  if (typeof markDirty === 'function') markDirty();
  return status();
}
function setEnabled(enabled) {
  configure({enabled:!!enabled});
  if (!enabled && timer) { clearInterval(timer); timer = null; }
  if (enabled && state.running && !timer && (SOURCE_URL || SECONDARY_SOURCE_URL || FALLBACK_SOURCE_URL)) {
    poll(); timer = setInterval(poll, POLL_MS);
  }
  return status();
}
function health() {
  const s = status();
  return {tracker:s.enabled ? (s.sourceStatus === 'online' ? 'online' : 'degraded') : 'disabled',
    source:s.sourceOnline ? 'online' : (s.sourceConfigured ? s.sourceStatus : 'not-configured'),
    database:store() ? 'online' : 'offline', discord:clientRef?.isReady?.() ? 'connected' : 'disconnected',
    sourceLatencyMs:s.sourceLatencyMs, lastRequestAt:s.lastRequestAt, lastEventAt:s.lastEventAt,
    lastSourceSuccessAt:s.lastSourceSuccessAt, failedAlerts:s.failedAlerts, retries:s.retries, errors:s.errors,
    memory:process.memoryUsage().rss};
}
function stats(period='all') {
  const history=store()?.stealEggTracker?.recent || [];
  const now=Date.now();
  const windows={today:86400000,'24h':86400000,'7d':604800000,'30d':2592000000,all:Infinity};
  const rows=history.filter(x => now-(x.spawnedAt*1000) <= (windows[period] ?? Infinity));
  const by={}; for(const x of rows) by[x.rarity]=(by[x.rarity]||0)+1;
  const lat=rows.map(x => Number(x.detectionLatencyMs)).filter(Number.isFinite);
  return {period,totalDetected:rows.length,divine:by.DIVINE||0,eternal:by.ETERNAL||0,secret:by.SECRET||0,
    alertsSent:state.alerts,duplicatesPrevented:state.duplicates,sourceErrors:state.errors,
    averageDetectionLatencyMs:lat.length?Math.round(lat.reduce((a,b)=>a+b,0)/lat.length):0};
}
function recent(page=1,pageSize=5) {
  const rows=store()?.stealEggTracker?.history || store()?.stealEggTracker?.recent || [];
  const totalPages=Math.max(1,Math.ceil(rows.length/pageSize));
  const p=Math.min(Math.max(1,Number(page)||1),totalPages);
  return {page:p,totalPages,total:rows.length,items:rows.slice((p-1)*pageSize,p*pageSize)};
}
function sources() {
  return [SOURCE_URL,SECONDARY_SOURCE_URL,FALLBACK_SOURCE_URL].filter(Boolean).map((url,i)=>({
    name:i===0?'primary':i===1?'secondary':'fallback',type:'http-json',active:i===activeSourceIndex,
    status:i===activeSourceIndex?state.sourceStatus:'standby',lastUpdate:state.lastSourceSuccessAt,latencyMs:state.sourceLatencyMs,errorCount:state.errors
  }));
}

async function test(testRarity = null) {
  const selected = rarity(testRarity) || trackerConfig().trackedRarities[0] || 'SECRET';
  const event = { id:'test-'+Date.now(), eggName:'Test Egg', itemName:'Test Rare Item', rarity:selected, sourceRarity:selected, location:'Test Area', spawnedAt:Math.floor(Date.now()/1000), detectedAt:Math.floor(Date.now()/1000), value:'TEST ONLY', source:'test', verificationStatus:'test', warnings:[] };
  return sendAlertWithRetry(event, true);
}
function recentPage(page=1,pageSize=5) { const rows=store()?.stealEggTracker?.recent || []; const totalPages=Math.max(1,Math.ceil(rows.length/pageSize)); const p=Math.min(Math.max(1,Number(page)||1),totalPages); return {page:p,totalPages,total:rows.length,items:rows.slice((p-1)*pageSize,p*pageSize)}; }

function catalogInfo(name) {
  const x = CATALOG.find(name);
  if (!x) return null;
  return {
    name:x.name, rarity:x.rarity, baseIncome:CATALOG.formatMoney(x.baseIncome),
    location:x.location, eggName:x.eggName, confidence:x.confidence,
    disputed:!!x.disputed, note:x.note || null
  };
}

function reload() {
  const wasRunning = state.running;
  if (timer) { clearInterval(timer); timer = null; }
  const c = trackerConfig();
  state.enabled = c.enabled;
  if (wasRunning && state.enabled && (SOURCE_URL || SECONDARY_SOURCE_URL || FALLBACK_SOURCE_URL)) {
    poll();
    timer = setInterval(poll, POLL_MS);
  }
  if (!state.enabled) state.sourceStatus = 'disabled';
  return status();
}
module.exports = { start, stop, status, health, stats, recent, recentPage, sources, test, processEvent, normalize, configure, setEnabled, reload, catalogInfo, catalog: CATALOG.entries };
