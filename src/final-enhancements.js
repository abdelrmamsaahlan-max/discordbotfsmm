const {
  Client, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, PermissionFlagsBits, ModalBuilder,
  TextInputBuilder, TextInputStyle, ChannelType,
} = require('discord.js');

const ROLE_IDS = {
  owner: '1466090947170406617',
  mod: '1466085137459712114',
  staff: '1466088151331242015',
  indexProvider: '1466245073820844211',
  middleman: '1466091035510706262',
};
const LOG_MARKER = 'FSMM_LOG_CHANNEL=';
const locks = new Set();

function isStaff(i) {
  return i.guild?.ownerId === i.user.id || i.member?.roles?.cache?.some(r => [ROLE_IDS.owner, ROLE_IDS.mod, ROLE_IDS.staff].includes(r.id));
}
function hasRole(i, id) { return Boolean(i.member?.roles?.cache?.has(id)); }
function typeFromTopic(t = '') { return t.match(/TYPE:([^\s]+)/)?.[1] || 'ticket'; }
function userFromTopic(t = '') { return t.match(/FSMM_USER:(\d+)/)?.[1] || null; }
function teamRole(t) { return t === 'middleman' ? ROLE_IDS.middleman : t === 'base-painting' ? ROLE_IDS.indexProvider : ROLE_IDS.staff; }
function isTicket(i) { return i.channel?.topic?.includes('FSMM_USER:') && i.channel?.topic?.includes('TYPE:'); }
async function configuredLogs(guild) {
  return guild.channels.cache.find(c => c.type === ChannelType.GuildText && typeof c.topic === 'string' && c.topic.includes(LOG_MARKER)) ||
    guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === 'fsmm-logs') || null;
}
async function writeLog(guild, title, description) {
  try {
    const ch = await configuredLogs(guild);
    if (ch) await ch.send({ embeds: [new EmbedBuilder().setTitle(`🛡️ ${title}`).setDescription(description).setColor(0x5865f2).setFooter({ text: 'FSMM' })] });
  } catch (e) { console.error('[FSMM LOG]', e.message); }
}
async function setLogChannel(guild, ch) {
  for (const c of guild.channels.cache.filter(c => c.type === ChannelType.GuildText && typeof c.topic === 'string' && c.topic.includes(LOG_MARKER)).values()) {
    try { await c.setTopic(c.topic.split('\n').filter(x => !x.startsWith(LOG_MARKER)).join('\n') || null, 'FSMM log channel moved'); } catch {}
  }
  await ch.setTopic(`${ch.topic ? ch.topic + '\n' : ''}${LOG_MARKER}${ch.id}`.slice(0, 1024), 'FSMM log channel configured');
}

const originalLogin = Client.prototype.login;
Client.prototype.login = async function (...args) {
  if (!this.__fsmmFinalLoginHook) {
    this.__fsmmFinalLoginHook = true;
    this.once('clientReady', async () => {
      try { this.user.setPresence({ activities: [{ name: 'FSMM • Services', type: 3 }], status: 'online' }); } catch (e) { console.error('[FSMM PRESENCE]', e.message); }
      try {
        const cmd = new SlashCommandBuilder().setName('setlogs').setDescription('Set the channel where FSMM logs are sent')
          .addChannelOption(o => o.setName('channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
          .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).toJSON();
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        const route = Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID);
        const existing = await rest.get(route);
        await rest.put(route, { body: [...existing.filter(c => c.name !== 'setlogs'), cmd] });
        console.log('[FSMM CONFIG] /setlogs registered');
      } catch (e) { console.error('[FSMM CONFIG]', e.message); }
    });
  }
  return originalLogin.apply(this, args);
};

async function finalInteractionHandler(i) {
  try {
    if (i.isChatInputCommand() && i.commandName === 'setlogs') {
      if (!isStaff(i)) return i.reply({ content: '❌ Staff only.', ephemeral: true });
      const ch = i.options.getChannel('channel', true);
      await setLogChannel(i.guild, ch);
      await i.reply({ content: `✅ Logs will now be sent to <#${ch.id}>.`, ephemeral: true });
      await writeLog(i.guild, 'LOG CHANNEL UPDATED', `${i.user} set logs to ${ch}.`);
      return;
    }
    if (!isTicket(i)) return;
    const type = typeFromTopic(i.channel.topic), uid = userFromTopic(i.channel.topic), team = teamRole(type);

    if (i.isModalSubmit() && i.customId === 'fsmm_adduser_modal') {
      if (!isStaff(i) && !hasRole(i, team)) return i.reply({ content: '❌ Team members only.', ephemeral: true });
      const raw = i.fields.getTextInputValue('user').trim().replace(/[<@!>]/g, '');
      if (!/^\d{15,22}$/.test(raw)) return i.reply({ content: '❌ Enter a valid Discord user ID.', ephemeral: true });
      const member = await i.guild.members.fetch(raw).catch(() => null);
      if (!member) return i.reply({ content: '❌ I could not find that member in this server.', ephemeral: true });
      await i.channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      await i.reply({ content: `✅ Added ${member} to this ticket.`, ephemeral: true });
      await writeLog(i.guild, 'USER ADDED', `${i.user} added ${member} to ${i.channel}.`);
      return;
    }

    if (i.isModalSubmit() && i.customId === 'fsmm_rename_modal') {
      if (!isStaff(i) && !hasRole(i, team)) return i.reply({ content: '❌ Team members only.', ephemeral: true });
      const name = i.fields.getTextInputValue('name').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').slice(0, 80);
      if (!name) return i.reply({ content: '❌ Enter a valid ticket name.', ephemeral: true });
      await i.channel.setName(name);
      await i.reply({ content: `✅ Ticket renamed to **${name}**.`, ephemeral: true });
      await writeLog(i.guild, 'TICKET RENAMED', `${i.user} renamed ${i.channel} to ${name}.`);
      return;
    }

    if (!i.isButton()) return;
    if (i.customId === 'fsmm_claim') {
      const allowed = isStaff(i) || (type === 'middleman' && hasRole(i, ROLE_IDS.middleman)) || (type === 'base-painting' && hasRole(i, ROLE_IDS.indexProvider));
      if (!allowed) return i.reply({ content: '❌ You do not have permission to claim this ticket.', ephemeral: true });
      if (locks.has(i.channel.id) || i.channel.topic.includes('CLAIMED_BY:')) return i.reply({ content: '❌ This ticket is already claimed.', ephemeral: true });
      locks.add(i.channel.id);
      try {
        await i.channel.setTopic(`${i.channel.topic} CLAIMED_BY:${i.user.id}`);
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('fsmm_claimed').setLabel(`Claimed by ${i.user.username}`.slice(0, 80)).setEmoji('✅').setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('fsmm_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('fsmm_adduser').setLabel('Add User').setEmoji('👤').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('fsmm_rename').setLabel('Rename').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('fsmm_transcript').setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary)
        );
        const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fsmm_pingteam').setLabel('Ping Team').setEmoji('🔔').setStyle(ButtonStyle.Primary));
        await i.update({ content: `<@${uid || i.user.id}> <@&${team}>`, embeds: [new EmbedBuilder().setTitle('✅ TICKET CLAIMED').setDescription(`Claimed by **${i.user.tag}**\n\nThis ticket is now being handled by this team member.`).setColor(0x57f287).setFooter({ text: 'FSMM' })], components: [row1, row2] });
        await writeLog(i.guild, 'TICKET CLAIMED', `${i.user} claimed ${i.channel} (${type}).`);
      } finally { locks.delete(i.channel.id); }
      return;
    }
    if (i.customId === 'fsmm_adduser') {
      if (!isStaff(i) && !hasRole(i, team)) return i.reply({ content: '❌ Team members only.', ephemeral: true });
      return i.showModal(new ModalBuilder().setCustomId('fsmm_adduser_modal').setTitle('Add User to Ticket').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user').setLabel('User ID').setPlaceholder('123456789012345678').setStyle(TextInputStyle.Short).setRequired(true))));
    }
    if (i.customId === 'fsmm_rename') {
      if (!isStaff(i) && !hasRole(i, team)) return i.reply({ content: '❌ Team members only.', ephemeral: true });
      return i.showModal(new ModalBuilder().setCustomId('fsmm_rename_modal').setTitle('Rename Ticket').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('New ticket name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80))));
    }
    if (i.customId === 'fsmm_transcript') {
      if (!isStaff(i) && !hasRole(i, team)) return i.reply({ content: '❌ Team members only.', ephemeral: true });
      const ms = await i.channel.messages.fetch({ limit: 100 });
      const text = [...ms.values()].reverse().map(m => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content || '[attachment/embed]'}`).join('\n');
      return i.reply({ content: '📄 Transcript of the latest 100 messages:', files: [{ attachment: Buffer.from(text), name: `${i.channel.name}-transcript.txt` }], ephemeral: true });
    }
    if (i.customId === 'fsmm_pingteam') {
      if (!isStaff(i) && !hasRole(i, team)) return i.reply({ content: `❌ Team members only.`, ephemeral: true });
      await i.reply({ content: `🔔 <@&${team}> this ticket needs attention.`, allowedMentions: { roles: [team] } });
      await writeLog(i.guild, 'TEAM PINGED', `${i.user} pinged the ${type} team in ${i.channel}.`);
      return;
    }
    if (i.customId === 'fsmm_close' && !isStaff(i)) return i.reply({ content: '❌ Only FSMM Staff/Mod/Owner can close tickets.', ephemeral: true });
  } catch (e) {
    console.error('[FSMM FINAL]', e.stack || e.message);
    if (!i.replied && !i.deferred) await i.reply({ content: '❌ Something went wrong. Please try again.', ephemeral: true }).catch(() => {});
  }
}

const originalOn = Client.prototype.on;
Client.prototype.on = function (event, listener) {
  if (event !== 'interactionCreate') return originalOn.call(this, event, listener);

  if (!this.__fsmmInteractionRouter) {
    this.__fsmmInteractionRouter = true;
    this.__fsmmInteractionListeners = [];
    originalOn.call(this, 'interactionCreate', async i => {
      for (const fn of this.__fsmmInteractionListeners) {
        if (i.replied || i.deferred) break;
        try { await fn(i); } catch (e) { console.error('[FSMM INTERACTION]', e.stack || e.message); }
      }
    });
    this.__fsmmInteractionListeners.push(finalInteractionHandler);
  }

  this.__fsmmInteractionListeners.push(listener);
  return this;
};

process.on('unhandledRejection', reason => console.error('[FSMM UNHANDLED REJECTION]', reason?.stack || reason));
process.on('uncaughtException', error => console.error('[FSMM UNCAUGHT EXCEPTION]', error?.stack || error));

console.log('[FSMM FINAL] interaction router loaded — one handler per interaction');
