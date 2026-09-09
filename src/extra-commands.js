require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const STAFF_ROLE = 'FSMM Staff';
const OWNER_ROLE = 'Owner';
const DATA_FILE = process.env.EXTRA_DATA_FILE || path.join(__dirname, '..', 'data', 'extra-store.json');

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { vouches: {}, warnings: {}, config: {} };
    return { vouches: {}, warnings: {}, config: {}, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch { return { vouches: {}, warnings: {}, config: {} }; }
}
let data = load();
function save() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) { console.error('[FSMM EXTRA DATA]', e.message); }
}

const owner = (i) => i.guild?.ownerId === i.user.id || i.member?.roles?.cache?.some(r => r.name === OWNER_ROLE);
const staff = (i) => owner(i) || i.member?.roles?.cache?.some(r => r.name === STAFF_ROLE);
const adminStaff = (i) => staff(i) || Boolean(i.member?.permissions?.has(PermissionFlagsBits.Administrator));
const reply = (i, content) => i.reply({ content, flags: MessageFlags.Ephemeral });
const clean = (v, max = 900) => String(v ?? '').replace(/@everyone|@here/gi, '@ mention').trim().slice(0, max) || 'Not provided';
const card = (title, description) => new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x5865f2).setFooter({ text: 'FSMM • Staff Tools' });

const commands = [
  new SlashCommandBuilder().setName('serverinfo').setDescription('Show FSMM server information.'),
  new SlashCommandBuilder().setName('userinfo').setDescription('Show information about a member.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(false)),
  new SlashCommandBuilder().setName('avatar').setDescription('Show a member avatar.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(false)),
  new SlashCommandBuilder().setName('vouch').setDescription('Leave a vouch for a member.')
    .addUserOption(o => o.setName('user').setDescription('Member you are vouching for').setRequired(true))
    .addStringOption(o => o.setName('service').setDescription('Service used').setMaxLength(80).setRequired(true))
    .addStringOption(o => o.setName('review').setDescription('Your review').setMaxLength(500).setRequired(true)),
  new SlashCommandBuilder().setName('vouches').setDescription('Show a member vouch stats.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(false)),
  new SlashCommandBuilder().setName('vouchleaderboard').setDescription('Show the FSMM vouch leaderboard.'),
  new SlashCommandBuilder().setName('stats').setDescription('Show FSMM community statistics.'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Show the FSMM vouch leaderboard.'),
  new SlashCommandBuilder().setName('warn').setDescription('Staff: warn a member.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setMaxLength(500).setRequired(true)),
  new SlashCommandBuilder().setName('warnings').setDescription('Staff: view warnings.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('Staff: delete recent messages.')
    .addIntegerOption(o => o.setName('amount').setDescription('1-100').setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('Staff: ban a member.')
    .addUserOption(o => o.setName('user').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setMaxLength(500).setRequired(false)),
  new SlashCommandBuilder().setName('unban').setDescription('Staff: unban a user.')
    .addStringOption(o => o.setName('user_id').setDescription('User ID').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setMaxLength(500).setRequired(false)),
  new SlashCommandBuilder().setName('kick').setDescription('Staff: kick a member.')
    .addUserOption(o => o.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setMaxLength(500).setRequired(false)),
  new SlashCommandBuilder().setName('timeout').setDescription('Staff: timeout a member.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('1-40320 minutes').setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setMaxLength(500).setRequired(false)),
  new SlashCommandBuilder().setName('untimeout').setDescription('Staff: remove a timeout.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('lock').setDescription('Staff: lock this channel.'),
  new SlashCommandBuilder().setName('unlock').setDescription('Staff: unlock this channel.'),
  new SlashCommandBuilder().setName('ticketstats').setDescription('Staff: show open FSMM ticket statistics.'),
  new SlashCommandBuilder().setName('transcript').setDescription('Staff: create a transcript of this ticket.'),
  new SlashCommandBuilder().setName('staffhelp').setDescription('Show FSMM staff commands.'),
  new SlashCommandBuilder().setName('setwelcome').setDescription('Owner/admin/staff: set the welcome channel.')
    .addChannelOption(o => o.setName('channel').setDescription('Welcome channel').setRequired(true)),
  new SlashCommandBuilder().setName('setautorole').setDescription('Owner/admin/staff: set the automatic join role.')
    .addRoleOption(o => o.setName('role').setDescription('Role to give new members').setRequired(true)),
  new SlashCommandBuilder().setName('settranscripts').setDescription('Owner/admin/staff: set the transcript log channel.')
    .addChannelOption(o => o.setName('channel').setDescription('Transcript channel').setRequired(true)),
].map(c => c.toJSON());

function canActOn(i, member) {
  if (!member) return false;
  if (member.id === i.user.id || member.id === i.guild.ownerId) return false;
  const executor = i.member;
  if (executor?.roles?.highest?.comparePositionTo(member.roles.highest) <= 0 && !owner(i)) return false;
  return true;
}

async function transcript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  return [...messages.values()].sort((a,b) => a.createdTimestamp - b.createdTimestamp)
    .map(m => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content || '[embed/attachment]'}`)
    .join('\n');
}

const originalLogin = Client.prototype.login;
Client.prototype.login = function patchedLogin(...args) {
  const client = this;
  if (!client.__fsmmExtraCommandsAttached) {
    client.__fsmmExtraCommandsAttached = true;

    client.once('clientReady', async () => {
      try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        const existing = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));
        const merged = [...existing.filter(c => !commands.some(x => x.name === c.name)), ...commands];
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: merged });
        console.log('[FSMM EXTRA COMMANDS] REGISTERED');
      } catch (e) { console.error('[FSMM EXTRA COMMANDS] Register failed:', e.message); }
    });

    client.on('guildMemberAdd', async member => {
      const cfg = data.config[member.guild.id] || {};
      if (cfg.autoRoleId) {
        const role = member.guild.roles.cache.get(cfg.autoRoleId);
        if (role && role.editable) await member.roles.add(role, 'FSMM auto-role').catch(() => null);
      }
      if (cfg.welcomeChannelId) {
        const ch = member.guild.channels.cache.get(cfg.welcomeChannelId);
        if (ch?.isTextBased()) await ch.send(`👋 Welcome ${member} to **${clean(member.guild.name, 80)}**!`).catch(() => null);
      }
    });

    const spam = new Map();
    client.on('messageCreate', async message => {
      if (!message.guild || message.author.bot || !message.member) return;
      if (adminStaff({ guild: message.guild, user: message.author, member: message.member })) return;
      const now = Date.now();
      const list = (spam.get(message.author.id) || []).filter(t => now - t < 8000);
      list.push(now); spam.set(message.author.id, list);
      if (list.length >= 7 && message.member.moderatable) {
        await message.member.timeout(60_000, 'FSMM anti-spam').catch(() => null);
        spam.delete(message.author.id);
        await message.channel.send(`🛡️ ${message.author}, slow down. You have been temporarily timed out for spam.`).then(m => setTimeout(() => m.delete().catch(() => null), 5000)).catch(() => null);
      }
    });

    client.on('interactionCreate', async interaction => {
      try {
        if (!interaction.isChatInputCommand() || !interaction.guild) return;
        const name = interaction.commandName;

        if (['warn','warnings','clear','ban','unban','kick','timeout','untimeout','lock','unlock','ticketstats','transcript','staffhelp','setwelcome','setautorole','settranscripts'].includes(name) && !adminStaff(interaction)) return reply(interaction, '❌ This command is for **FSMM Staff / Admins / Owners** only.');

        if (name === 'serverinfo') {
          const o = await interaction.guild.fetchOwner().catch(() => null);
          return interaction.reply({ embeds: [card('🏠 FSMM SERVER INFO', `**Server:** ${clean(interaction.guild.name, 100)}\n**Members:** ${interaction.guild.memberCount}\n**Channels:** ${interaction.guild.channels.cache.size}\n**Roles:** ${interaction.guild.roles.cache.size}\n**Owner:** ${o?.user?.tag || 'Unknown'}\n**Created:** <t:${Math.floor(interaction.guild.createdTimestamp/1000)}:D>`)], flags: MessageFlags.Ephemeral });
        }
        if (name === 'userinfo') {
          const u = interaction.options.getUser('user') || interaction.user;
          const m = await interaction.guild.members.fetch(u.id).catch(() => null);
          return interaction.reply({ embeds: [card('👤 USER INFO', `**User:** ${u.tag}\n**ID:** ${u.id}\n**Joined:** ${m ? `<t:${Math.floor(m.joinedTimestamp/1000)}:R>` : 'Not in server'}\n**Account:** <t:${Math.floor(u.createdTimestamp/1000)}:R>\n**Roles:** ${m?.roles?.cache?.filter(r => r.id !== interaction.guild.id).map(r => r.name).join(', ') || 'None'}`)], flags: MessageFlags.Ephemeral });
        }
        if (name === 'avatar') {
          const u = interaction.options.getUser('user') || interaction.user;
          return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ ${u.tag}'s Avatar`).setImage(u.displayAvatarURL({size:1024, extension:'png'})).setColor(0x5865f2)], flags: MessageFlags.Ephemeral });
        }

        if (name === 'vouch' || name === 'vouches' || name === 'vouchleaderboard' || name === 'leaderboard') {
          if (name === 'vouch') {
            const target = interaction.options.getUser('user', true);
            if (target.id === interaction.user.id) return reply(interaction, '❌ You cannot vouch for yourself.');
            if (target.bot) return reply(interaction, '❌ You cannot vouch for a bot.');
            const key = `${interaction.guild.id}:${target.id}`;
            const list = data.vouches[key] || [];
            if (list.some(v => v.from === interaction.user.id)) return reply(interaction, '❌ You have already vouched for this member.');
            list.push({ from: interaction.user.id, service: clean(interaction.options.getString('service', true), 80), review: clean(interaction.options.getString('review', true), 500), at: Date.now() });
            data.vouches[key] = list; save();
            return interaction.reply({ embeds: [card('⭐ VOUCH ADDED', `**For:** <@${target.id}>\n**Service:** ${list.at(-1).service}\n**Review:** ${list.at(-1).review}\n**Total vouches:** **${list.length}**`)] });
          }
          let target = interaction.user;
          if (name === 'vouches') target = interaction.options.getUser('user') || interaction.user;
          const entries = data.vouches[`${interaction.guild.id}:${target.id}`] || [];
          if (name === 'vouches') return interaction.reply({ embeds: [card(`⭐ ${target.tag}'S VOUCHES`, `**Total:** ${entries.length}\n\n${entries.slice(-5).reverse().map(v => `• <@${v.from}> — **${v.service}**: ${v.review}`).join('\n') || 'No vouches yet.')}] });
          const totals = Object.entries(data.vouches).filter(([k]) => k.startsWith(`${interaction.guild.id}:`)).map(([k,v]) => ({ id:k.split(':')[1], n:v.length })).sort((a,b)=>b.n-a.n).slice(0,10);
          return interaction.reply({ embeds: [card('🏆 FSMM VOUCH LEADERBOARD', totals.map((x,i)=>`**${i+1}.** <@${x.id}> — **${x.n}** vouch${x.n===1?'':'es'}`).join('\n') || 'No vouches yet.')] });
        }

        if (name === 'stats') {
          const totalVouches = Object.entries(data.vouches).filter(([k]) => k.startsWith(`${interaction.guild.id}:`)).reduce((n,[,v]) => n+v.length, 0);
          const openTickets = interaction.guild.channels.cache.filter(c => c.parent?.name === '🎫 FSMM SERVICES' && c.isTextBased()).size;
          return interaction.reply({ embeds: [card('📊 FSMM STATS', `**Members:** ${interaction.guild.memberCount}\n**Channels:** ${interaction.guild.channels.cache.size}\n**Roles:** ${interaction.guild.roles.cache.size}\n**Open service channels:** ${openTickets}\n**Total vouches:** ${totalVouches}`)], flags: MessageFlags.Ephemeral });
        }

        if (name === 'warn') {
          const u = interaction.options.getUser('user', true), reason = clean(interaction.options.getString('reason', true), 500);
          const key = `${interaction.guild.id}:${u.id}`; data.warnings[key] = data.warnings[key] || [];
          data.warnings[key].push({ by: interaction.user.id, reason, at: Date.now() }); save();
          return reply(interaction, `⚠️ **${u.tag}** warned. Total warnings: **${data.warnings[key].length}**.`);
        }
        if (name === 'warnings') {
          const u = interaction.options.getUser('user', true), list = data.warnings[`${interaction.guild.id}:${u.id}`] || [];
          return reply(interaction, `⚠️ **${u.tag}** has **${list.length}** warning(s).${list.length ? `\n${list.slice(-10).map((w,i)=>`${i+1}. ${w.reason}`).join('\n')}` : ''}`);
        }
        if (name === 'clear') {
          if (!interaction.channel?.isTextBased() || !interaction.channel.permissionsFor(interaction.guild.members.me)?.has(PermissionFlagsBits.ManageMessages)) return reply(interaction, '❌ I need **Manage Messages** here.');
          const deleted = await interaction.channel.bulkDelete(interaction.options.getInteger('amount', true), true);
          return reply(interaction, `🧹 Deleted **${deleted.size}** message(s).`);
        }

        if (['ban','kick','timeout','untimeout'].includes(name)) {
          const u = interaction.options.getUser('user', true), m = await interaction.guild.members.fetch(u.id).catch(()=>null);
          if (!canActOn(interaction, m)) return reply(interaction, '❌ You cannot moderate that member because of role hierarchy or protection.');
          if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers) && name==='ban') return reply(interaction, '❌ I need **Ban Members** permission.');
          if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.KickMembers) && name==='kick') return reply(interaction, '❌ I need **Kick Members** permission.');
          if (name==='timeout' || name==='untimeout') {
            if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ModerateMembers)) return reply(interaction, '❌ I need **Moderate Members** permission.');
            if (!m.moderatable) return reply(interaction, '❌ I cannot moderate that member.');
            const reason = clean(interaction.options.getString('reason') || 'FSMM moderation', 500);
            await m.timeout(name==='timeout' ? interaction.options.getInteger('minutes', true)*60_000 : null, reason);
            return reply(interaction, name==='timeout' ? `⏳ ${u.tag} timed out.` : `✅ Timeout removed from ${u.tag}.`);
          }
          const reason = clean(interaction.options.getString('reason') || 'FSMM moderation', 500);
          if (name==='ban') await m.ban({ reason }); else await m.kick(reason);
          return reply(interaction, name==='ban' ? `🔨 ${u.tag} banned.` : `👢 ${u.tag} kicked.`);
        }
        if (name==='unban') {
          if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)) return reply(interaction, '❌ I need **Ban Members** permission.');
          const id = interaction.options.getString('user_id', true).trim();
          if (!/^\d{15,25}$/.test(id)) return reply(interaction, '❌ Invalid Discord user ID.');
          await interaction.guild.members.unban(id, clean(interaction.options.getString('reason') || 'FSMM moderation', 500));
          return reply(interaction, `✅ <@${id}> unbanned.`);
        }
        if (name==='lock' || name==='unlock') {
          const everyone = interaction.guild.roles.everyone;
          await interaction.channel.permissionOverwrites.edit(everyone, { SendMessages: name==='lock' ? false : null });
          return reply(interaction, name==='lock' ? '🔒 Channel locked.' : '🔓 Channel unlocked.');
        }
        if (name==='ticketstats') {
          const channels = interaction.guild.channels.cache.filter(c => c.parent?.name === '🎫 FSMM SERVICES' && c.isTextBased());
          const count = { middleman:0, support:0, base:0, other:0 };
          channels.forEach(c => { if(c.topic?.includes('TYPE:middleman')) count.middleman++; else if(c.topic?.includes('TYPE:support')) count.support++; else if(c.topic?.includes('TYPE:base')) count.base++; else count.other++; });
          return reply(interaction, `🎫 **Open tickets:** ${channels.size}\n🤝 Middleman: **${count.middleman}**\n🛟 Support: **${count.support}**\n🎨 Base Painting: **${count.base}**\n📦 Other: **${count.other}**`);
        }
        if (name==='transcript') {
          if (!interaction.channel?.isTextBased()) return reply(interaction, '❌ This is not a text channel.');
          const text = await transcript(interaction.channel);
          const cfg = data.config[interaction.guild.id] || {};
          const log = cfg.transcriptChannelId ? interaction.guild.channels.cache.get(cfg.transcriptChannelId) : null;
          if (log?.isTextBased()) await log.send({ content:`📄 Transcript for **#${interaction.channel.name}** by <@${interaction.user.id}>`, files:[{attachment:Buffer.from(text || 'No messages.'), name:`${interaction.channel.name}-transcript.txt`}] });
          else await interaction.user.send({ content:`📄 FSMM transcript for **#${interaction.channel.name}**`, files:[{attachment:Buffer.from(text || 'No messages.'), name:`${interaction.channel.name}-transcript.txt`}] }).catch(()=>null);
          return reply(interaction, log ? '✅ Transcript sent to the configured log channel.' : '✅ Transcript sent to your DMs if DMs are open.');
        }
        if (name==='setwelcome' || name==='setautorole' || name==='settranscripts') {
          data.config[interaction.guild.id] = data.config[interaction.guild.id] || {};
          if (name==='setwelcome') data.config[interaction.guild.id].welcomeChannelId = interaction.options.getChannel('channel', true).id;
          if (name==='setautorole') data.config[interaction.guild.id].autoRoleId = interaction.options.getRole('role', true).id;
          if (name==='settranscripts') data.config[interaction.guild.id].transcriptChannelId = interaction.options.getChannel('channel', true).id;
          save();
          return reply(interaction, '✅ FSMM configuration saved.');
        }
        if (name==='staffhelp') {
          return reply(interaction, '🛡️ **FSMM STAFF COMMANDS**\n`/warn` `/warnings`\n`/clear`\n`/ban` `/unban` `/kick` `/timeout` `/untimeout`\n`/lock` `/unlock`\n`/ticketstats`\n`/transcript`\n`/setwelcome` `/setautorole` `/settranscripts`\n\nPublic: `/vouch` `/vouches` `/leaderboard` `/stats` `/serverinfo` `/userinfo` `/avatar`\n\n**Access:** FSMM Staff, Admins, and Owner only for moderation/configuration commands.');
        }
      } catch (e) {
        console.error('[FSMM EXTRA] Error:', e.message);
        if (!interaction.replied && !interaction.deferred) await reply(interaction, '❌ Something went wrong.');
      }
    });
  }
  return originalLogin.apply(this, args);
};
