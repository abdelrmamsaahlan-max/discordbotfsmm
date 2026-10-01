const fs = require('fs');
const path = require('path');
const { Client, REST, Routes, SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const TOKEN = String(process.env.DISCORD_TOKEN || '').trim();
const CLIENT_ID = String(process.env.CLIENT_ID || '').trim();
const GUILD_ID = String(process.env.GUILD_ID || '').trim();
const DATA_FILE = path.resolve(process.env.GROWTH_DATA_FILE || path.join(__dirname, '..', 'data', 'growth.json'));
const ENABLED = String(process.env.GROWTH_ENGINE_ENABLED || 'true').toLowerCase() === 'true';
const INTERVAL_MS = Math.max(1, Number(process.env.GROWTH_INTERVAL_HOURS || 6)) * 60 * 60 * 1000;
const DAILY_CAP = Math.max(1, Number(process.env.GROWTH_DAILY_CAP || 4));
const INVITE_CHANNEL_ID = String(process.env.GROWTH_INVITE_CHANNEL_ID || '').trim();
const SOURCES = ['general', 'tiktok', 'youtube', 'reddit', 'partner'];

function clean(v, n) {
  return String(v == null ? '' : v)
    .replace(/@everyone|@here/gi, '@ mention')
    .replace(/[\\u0000-\\u001F\\u007F]/g, ' ')
    .trim()
    .slice(0, n || 1000);
}

function loadState() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { version: 1, invites: {}, joins: [], sent: [], paused: false, inviteSnapshot: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      version: 1,
      invites: parsed.invites && typeof parsed.invites === 'object' ? parsed.invites : {},
      joins: Array.isArray(parsed.joins) ? parsed.joins.slice(-5000) : [],
      sent: Array.isArray(parsed.sent) ? parsed.sent.slice(-1000) : [],
      paused: parsed.paused === true,
      inviteSnapshot: parsed.inviteSnapshot && typeof parsed.inviteSnapshot === 'object' ? parsed.inviteSnapshot : {}
    };
  } catch (error) {
    console.warn('[GROWTH] State load failed:', error.message);
    return { version: 1, invites: {}, joins: [], sent: [], paused: false, inviteSnapshot: {} };
  }
}

let state = loadState();

function saveState() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  } catch (error) {
    console.warn('[GROWTH] State save failed:', error.message);
  }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function campaignCopy(invite) {
  const variants = [
    '🎮 **FSMM — Roblox Community**\\nLive Roblox updates, trading, events, giveaways and an active community.\\n\\nJoin: ' + invite,
    'Looking for a Roblox community that actually has useful stuff going on? **FSMM** has trading, events, giveaways and live game tracking.\\n\\n' + invite,
    'Roblox players 👀 **FSMM** is open. Trade, hang out, join events and keep up with live rare-egg activity.\\n\\n' + invite
  ];
  return variants[state.sent.length % variants.length];
}

function parseTargets() {
  try {
    const parsed = JSON.parse(process.env.GROWTH_WEBHOOKS_JSON || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(function(x) {
        return x && /^https:\\/\\/discord(?:app)?\\.com\\/api\\/webhooks\\//i.test(String(x.url || ''));
      })
      .map(function(x) {
        return { name: clean(x.name || 'Partner', 80), url: String(x.url) };
      })
      .slice(0, 50);
  } catch (error) {
    console.warn('[GROWTH] GROWTH_WEBHOOKS_JSON invalid:', error.message);
    return [];
  }
}

async function getTargetInvite(client, source) {
  if (!INVITE_CHANNEL_ID) return null;
  const channel = await client.channels.fetch(INVITE_CHANNEL_ID).catch(function() { return null; });
  if (!channel || !channel.isTextBased() || !channel.createInvite) return null;

  const key = String(source || 'general').toLowerCase();
  if (state.invites[key] && state.invites[key].code) {
    return 'https://discord.gg/' + state.invites[key].code;
  }

  try {
    const invite = await channel.createInvite({
      maxAge: 0,
      maxUses: 0,
      unique: true,
      reason: 'FSMM Growth Engine: ' + key + ' campaign'
    });
    state.invites[key] = {
      code: invite.code,
      createdAt: Date.now(),
      source: key,
      uses: 0
    };
    saveState();
    return 'https://discord.gg/' + invite.code;
  } catch (error) {
    console.warn('[GROWTH] Invite creation failed:', error.message);
    return null;
  }
}

async function snapshotInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const snap = {};
    for (const invite of invites.values()) {
      snap[invite.code] = Number(invite.uses || 0);
    }
    return snap;
  } catch (error) {
    console.warn('[GROWTH] Invite snapshot unavailable:', error.message);
    return null;
  }
}

function detectUsedInvite(before, after) {
  if (!before || !after) return null;
  let best = null;
  for (const code of Object.keys(after)) {
    const delta = Number(after[code] || 0) - Number(before[code] || 0);
    if (delta > 0 && (!best || delta > best.delta)) best = { code: code, delta: delta };
  }
  return best ? best.code : null;
}

function joinSourceFromCode(code) {
  for (const source of Object.keys(state.invites)) {
    if (state.invites[source] && state.invites[source].code === code) return source;
  }
  return code ? 'tracked-unknown' : 'unknown';
}

function joinStats(source) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rows = state.joins.filter(function(x) { return x.at >= cutoff; });
  return source ? rows.filter(function(x) { return x.source === source; }).length : rows.length;
}

async function deliverWebhook(url, content) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'FSMM Growth',
      content: content,
      allowed_mentions: { parse: [] }
    })
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
}

async function runCampaign(client) {
  if (!ENABLED || state.paused) return;

  const targets = parseTargets();
  if (!targets.length) {
    console.log('[GROWTH] No approved partner webhooks configured; engine is ready.');
    return;
  }

  const sentToday = state.sent.filter(function(x) { return x.day === todayKey(); });
  if (sentToday.length >= DAILY_CAP) return;

  const invite = await getTargetInvite(client, 'partner');
  if (!invite) {
    console.log('[GROWTH] Partner delivery skipped: GROWTH_INVITE_CHANNEL_ID is not configured.');
    return;
  }

  let remaining = DAILY_CAP - sentToday.length;
  for (const target of targets) {
    if (remaining <= 0) break;
    if (sentToday.some(function(x) { return x.target === target.name; })) continue;

    try {
      await deliverWebhook(target.url, campaignCopy(invite));
      state.sent.push({ day: todayKey(), at: Date.now(), target: target.name });
      state.sent = state.sent.slice(-1000);
      remaining -= 1;
      saveState();
      console.log('[GROWTH] Campaign delivered to approved target:', target.name);
    } catch (error) {
      console.warn('[GROWTH] Delivery failed for ' + target.name + ':', error.message);
    }
  }
}

function growthCommand() {
  return new SlashCommandBuilder()
    .setName('growth')
    .setDescription('FSMM growth engine and referral analytics.')
    .addSubcommand(function(s) { return s.setName('status').setDescription('Show growth engine status.'); })
    .addSubcommand(function(s) {
      return s.setName('invite').setDescription('Get a tracked invite link.')
        .addStringOption(function(o) {
          return o.setName('source').setDescription('Campaign source.').setRequired(true)
            .addChoices(
              { name: 'General', value: 'general' },
              { name: 'TikTok', value: 'tiktok' },
              { name: 'YouTube', value: 'youtube' },
              { name: 'Reddit', value: 'reddit' },
              { name: 'Partner', value: 'partner' }
            );
        });
    })
    .addSubcommand(function(s) { return s.setName('stats').setDescription('Show join attribution by campaign.'); })
    .addSubcommand(function(s) { return s.setName('post').setDescription('Send the next campaign to approved partner targets.'); })
    .addSubcommand(function(s) { return s.setName('pause').setDescription('Pause automatic growth posting.'); })
    .addSubcommand(function(s) { return s.setName('resume').setDescription('Resume automatic growth posting.'); })
    .toJSON();
}

async function registerGrowthCommand() {
  if (!TOKEN || !CLIENT_ID || !GUILD_ID) return;
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const existing = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));
    const filtered = (Array.isArray(existing) ? existing : []).filter(function(x) { return x.name !== 'growth'; });
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: filtered.concat([growthCommand()])
    });
    console.log('[GROWTH] /growth registered.');
  } catch (error) {
    console.warn('[GROWTH] Command registration failed:', error.message);
  }
}

function attach(client) {
  if (client.__fsmmGrowthAttached) return;
  client.__fsmmGrowthAttached = true;

  client.once('clientReady', async function() {
    if (!ENABLED) return;

    await registerGrowthCommand();
    const guild = client.guilds.cache.get(GUILD_ID) ||
      await client.guilds.fetch(GUILD_ID).catch(function() { return null; });

    if (guild) {
      const current = await snapshotInvites(guild);
      if (current) {
        state.inviteSnapshot = current;
        saveState();
      }
    }

    await runCampaign(client).catch(function(error) {
      console.warn('[GROWTH] Initial run failed:', error.message);
    });

    setInterval(function() {
      runCampaign(client).catch(function(error) {
        console.warn('[GROWTH] Scheduled run failed:', error.message);
      });
    }, INTERVAL_MS).unref();

    console.log('[GROWTH] Engine online. Approved targets:', parseTargets().length);
  });

  client.on('guildMemberAdd', async function(member) {
    if (!ENABLED || member.guild.id !== GUILD_ID) return;

    const before = state.inviteSnapshot || {};
    const after = await snapshotInvites(member.guild);
    const usedCode = detectUsedInvite(before, after);
    const source = joinSourceFromCode(usedCode);

    state.joins.push({
      userId: member.id,
      source: source,
      inviteCode: usedCode,
      at: Date.now()
    });
    state.joins = state.joins.slice(-5000);

    if (usedCode) {
      for (const sourceKey of Object.keys(state.invites)) {
        if (state.invites[sourceKey] && state.invites[sourceKey].code === usedCode) {
          state.invites[sourceKey].uses = Number(state.invites[sourceKey].uses || 0) + 1;
          break;
        }
      }
    }

    if (after) state.inviteSnapshot = after;
    saveState();
    console.log('[GROWTH] Join attributed:', source);
  });

  client.on('interactionCreate', async function(interaction) {
    if (!ENABLED || !interaction.isChatInputCommand() || interaction.commandName !== 'growth' || !interaction.guild) return;

    const allowed = interaction.guild.ownerId === interaction.user.id ||
      interaction.memberPermissions?.has('ManageGuild');

    if (!allowed) {
      return interaction.reply({
        content: '❌ This command is for FSMM staff/admins.',
        flags: MessageFlags.Ephemeral
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const targets = parseTargets();
      const today = state.sent.filter(function(x) { return x.day === todayKey(); }).length;
      const joins24h = state.joins.filter(function(x) { return Date.now() - x.at < 86400000; }).length;
      const description = [
        '**Engine:** ' + (state.paused ? '⏸️ Paused' : '🟢 Running'),
        '**Approved targets:** ' + targets.length,
        '**Posts today:** ' + today + '/' + DAILY_CAP,
        '**Tracked joins (24h):** ' + joins24h,
        '**Tracked joins (30d):** ' + joinStats(),
        '**Sources:** ' + SOURCES.join(', ')
      ].join('\n');

      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle('📈 FSMM GROWTH ENGINE').setDescription(description).setColor(0x5865f2)],
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === 'invite') {
      const source = interaction.options.getString('source', true);
      const invite = await getTargetInvite(client, source);
      if (!invite) {
        return interaction.reply({
          content: '❌ Configure GROWTH_INVITE_CHANNEL_ID first.',
          flags: MessageFlags.Ephemeral
        });
      }
      return interaction.reply({
        content: '🔗 **' + source + ' campaign invite:** ' + invite,
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === 'stats') {
      const rows = SOURCES.map(function(source) {
        return '**' + source + ':** ' + joinStats(source) + ' joins (30d)';
      });
      return interaction.reply({
        content: '📊 **Growth attribution — last 30 days**\n' + rows.join('\n'),
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === 'pause') {
      state.paused = true;
      saveState();
      return interaction.reply({ content: '⏸️ Automatic growth posting paused.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'resume') {
      state.paused = false;
      saveState();
      return interaction.reply({ content: '▶️ Automatic growth posting resumed.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'post') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await runCampaign(client);
      return interaction.editReply('✅ Growth campaign run completed. Use /growth status for delivery counts.');
    }
  });
}

const originalLogin = Client.prototype.login;
Client.prototype.login = function() {
  attach(this);
  return originalLogin.apply(this, arguments);
};
