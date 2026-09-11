require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { Client, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const DATA_FILE = process.env.EXIST_DATA_FILE || path.join(__dirname, '..', 'data', 'exist-store.json');
const SOURCE = 'https://sabexistcount.com/wiki/all-brainrots';
const PRODUCT_BASE = 'https://sabexistcount.com/products/';
const SYNC_MS = 6 * 60 * 60 * 1000;

const command = new SlashCommandBuilder()
  .setName('exist')
  .setDescription('Check the current known Exist Count for a Steal a Brainrot item.')
  .addStringOption(o => o.setName('brainrot').setDescription('Brainrot name').setRequired(true).setAutocomplete(true));

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'FSMM-Exist/1.0', Accept: 'text/html,application/xhtml+xml' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpGet(new URL(res.headers.location, url).toString()));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.setTimeout(15000, () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
  });
}

function cleanHtml(s) {
  return String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function slugify(name) {
  return String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function parseRows(html) {
  const items = [];
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => cleanHtml(m[1]));
    if (cells.length < 5 || cells[0].toLowerCase() === 'brainrot') continue;
    const name = cells[0].replace(/\s+(Common|Rare|Epic|Legendary|Mythic|Brainrot God|Secret|OG|Other)$/i, '').trim();
    const rarity = cells[1] || 'Unknown';
    const income = cells[3] || 'Unknown';
    const exist = cells[4] || 'Unknown';
    if (!name || name.length > 100) continue;
    items.push({ name, rarity, income, exist, slug: slugify(name), updatedAt: Date.now() });
  }
  const unique = new Map();
  for (const item of items) unique.set(item.name.toLowerCase(), item);
  return [...unique.values()];
}

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { items: [], syncedAt: 0 }; }
}
let db = load();
if (!Array.isArray(db.items)) db.items = [];

function save() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) { console.error('[FSMM EXIST] save:', e.message); }
}

async function sync() {
  try {
    const html = await httpGet(SOURCE);
    const items = parseRows(html);
    if (!items.length) throw new Error('No Brainrots parsed from source');
    const old = new Map(db.items.map(x => [x.name.toLowerCase(), x]));
    for (const item of items) {
      const previous = old.get(item.name.toLowerCase());
      if (previous?.exist && previous.exist !== item.exist) item.previousExist = previous.exist;
    }
    db.items = items;
    db.syncedAt = Date.now();
    save();
    console.log(`[FSMM EXIST] synced ${items.length} Brainrots`);
  } catch (e) {
    console.error('[FSMM EXIST] sync failed:', e.message);
    console.log('[FSMM EXIST] keeping last known database; other bot commands are unaffected');
  }
}

async function detail(item) {
  try {
    const html = await httpGet(`${PRODUCT_BASE}${item.slug}`);
    const text = cleanHtml(html);
    const mutations = {};
    const section = text.match(/Mutations\s+Variant\s+Exist Count[\s\S]*?(?:Trivia|About|FAQ)/i)?.[0] || '';
    const matches = [...section.matchAll(/\b(Normal|Radioactive|Bloodrot|Candy|Crystal|Cursed|Default|Diamond|Galaxy|Gold|Lava|Rainbow|Yin Yang|Cyber|Divine|Phantom)\s+(\d[\d,.]*(?:K|M|B|T)?(?:\s*\([^)]*\))?|—)/gi)];
    for (const m of matches) if (!mutations[m[1]]) mutations[m[1]] = m[2];
    return mutations;
  } catch (e) {
    console.error(`[FSMM EXIST] detail ${item.name}:`, e.message);
    return {};
  }
}

function find(name) {
  const q = String(name || '').toLowerCase().trim();
  return db.items.find(x => x.name.toLowerCase() === q) || db.items.find(x => x.name.toLowerCase().includes(q));
}

function formatExist(v) {
  return String(v || 'Unknown').replace(/\s+/g, ' ').trim();
}

function buildEmbed(item, mutations) {
  const lines = [];
  for (const [name, count] of Object.entries(mutations)) {
    if (name === 'Normal' && count === item.exist) continue;
    lines.push(`${name === 'Normal' ? '⬜' : '🧬'} **${name}** — ${formatExist(count)}`);
  }
  const mutationBlock = lines.length ? `\n### Mutations\n${lines.slice(0, 12).join('\n')}` : '\n### Mutations\nNo mutation count was published for this item.';
  return new EmbedBuilder()
    .setTitle(`🧠 ${item.name}`)
    .setDescription(`**${item.rarity}** • **${item.income || 'Unknown'}**\n\n📊 **Known Exist Count:** **${formatExist(item.exist)}**${mutationBlock}`)
    .setColor(0x5865f2)
    .setFooter({ text: `FSMM Exist • Source: SABExistCount • Updated ${new Date(db.syncedAt || Date.now()).toLocaleString('en-GB')}` });
}

const originalLogin = Client.prototype.login;
Client.prototype.login = function (...args) {
  const client = this;
  if (!client.__fsmmExistAttached) {
    client.__fsmmExistAttached = true;
    client.once('clientReady', async () => {
      try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        const existing = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));
        const without = existing.filter(c => c.name !== 'exist');
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [...without, command.toJSON()] });
        console.log('[FSMM EXIST] /exist registered');
      } catch (e) { console.error('[FSMM EXIST] command registration:', e.message); }
      if (!db.items.length || Date.now() - (db.syncedAt || 0) > SYNC_MS) await sync();
      setInterval(sync, SYNC_MS).unref();
    });
    client.on('interactionCreate', async interaction => {
      try {
        if (interaction.isAutocomplete() && interaction.commandName === 'exist') {
          const q = interaction.options.getString('brainrot')?.toLowerCase() || '';
          const choices = db.items.filter(x => !q || x.name.toLowerCase().includes(q)).slice(0, 25).map(x => ({ name: `${x.name} • ${x.exist}`, value: x.name }));
          return interaction.respond(choices).catch(() => null);
        }
        if (!interaction.isChatInputCommand() || interaction.commandName !== 'exist' || !interaction.guild) return;
        await interaction.deferReply();
        const item = find(interaction.options.getString('brainrot'));
        if (!item) return interaction.editReply('❌ I could not find that Brainrot in the current FSMM database.');
        const mutations = await detail(item);
        return interaction.editReply({ embeds: [buildEmbed(item, mutations)] });
      } catch (e) {
        console.error('[FSMM EXIST] interaction:', e.message);
        if (interaction.deferred || interaction.replied) interaction.editReply('⚠️ Exist data is temporarily unavailable. The rest of FSMM is still online.').catch(() => null);
      }
    });
  }
  return originalLogin.apply(this, args);
};
