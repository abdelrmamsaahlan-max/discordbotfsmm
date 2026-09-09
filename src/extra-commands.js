require('dotenv').config();
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
const CATEGORY_NAME = '🎫 FSMM SERVICES';

const clean = (value, max = 900) => String(value ?? '').replace(/@everyone|@here/gi, '@ mention').trim().slice(0, max) || 'Not provided';
const isOwner = (i) => i.guild?.ownerId === i.user.id || Boolean(i.member?.roles?.cache?.some((r) => r.name === OWNER_ROLE));
const isStaff = (i) => isOwner(i) || Boolean(i.member?.roles?.cache?.some((r) => r.name === STAFF_ROLE));
const reply = (i, content) => i.reply({ content, flags: MessageFlags.Ephemeral });
const card = (title, description) => new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x5865f2).setFooter({ text: 'FSMM • Staff Tools' });

const commands = [
  new SlashCommandBuilder().setName('serverinfo').setDescription('Show FSMM server information.'),
  new SlashCommandBuilder().setName('userinfo').setDescription('Show information about a member.')
    .addUserOption((o) => o.setName('user').setDescription('Member to inspect').setRequired(false)),
  new SlashCommandBuilder().setName('avatar').setDescription('Show a member avatar.')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(false)),
  new SlashCommandBuilder().setName('warn').setDescription('Staff: warn a member.')
    .addUserOption((o) => o.setName('user').setDescription('Member to warn').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Warning reason').setMaxLength(500).setRequired(true)),
  new SlashCommandBuilder().setName('warnings').setDescription('Staff: show a member warning count.')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('Staff: delete recent messages.')
    .addIntegerOption((o) => o.setName('amount').setDescription('1-100 messages').setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName('announce').setDescription('Staff: send an announcement in this channel.')
    .addStringOption((o) => o.setName('message').setDescription('Announcement text').setMaxLength(1800).setRequired(true)),
  new SlashCommandBuilder().setName('lock').setDescription('Staff: lock this channel.'),
  new SlashCommandBuilder().setName('unlock').setDescription('Staff: unlock this channel.'),
  new SlashCommandBuilder().setName('ticketstats').setDescription('Staff: show open FSMM ticket statistics.'),
  new SlashCommandBuilder().setName('staffhelp').setDescription('Show FSMM staff commands.'),
].map((c) => c.toJSON());

const originalLogin = Client.prototype.login;
Client.prototype.login = function patchedLogin(...args) {
  const client = this;
  if (!client.__fsmmExtraCommandsAttached) {
    client.__fsmmExtraCommandsAttached = true;
    client.once('clientReady', async () => {
      try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        const existing = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));
        const merged = [...existing.filter((c) => !commands.some((x) => x.name === c.name)), ...commands];
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: merged });
        console.log('[FSMM EXTRA COMMANDS] REGISTERED');
      } catch (error) {
        console.error('[FSMM EXTRA COMMANDS] Register failed:', error.message);
      }
    });

    client.on('interactionCreate', async (interaction) => {
      try {
        if (!interaction.isChatInputCommand()) return;
        const guild = interaction.guild;
        if (!guild) return;

        if (interaction.commandName === 'serverinfo') {
          const owner = await guild.fetchOwner().catch(() => null);
          return interaction.reply({ embeds: [card('🏠 FSMM SERVER INFO', `**Server:** ${clean(guild.name, 100)}\n**Members:** ${guild.memberCount}\n**Channels:** ${guild.channels.cache.size}\n**Roles:** ${guild.roles.cache.size}\n**Owner:** ${owner ? owner.user.tag : 'Unknown'}\n**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`)], flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'userinfo') {
          const user = interaction.options.getUser('user') || interaction.user;
          const member = await guild.members.fetch(user.id).catch(() => null);
          return interaction.reply({ embeds: [card('👤 USER INFO', `**User:** ${user.tag}\n**ID:** ${user.id}\n**Joined:** ${member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Not in server'}\n**Account:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>\n**Roles:** ${member?.roles?.cache?.filter((r) => r.id !== guild.id).map((r) => r.name).join(', ') || 'None'}`)], flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'avatar') {
          const user = interaction.options.getUser('user') || interaction.user;
          return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ ${user.tag}'s Avatar`).setImage(user.displayAvatarURL({ size: 1024, extension: 'png' })).setColor(0x5865f2)], flags: MessageFlags.Ephemeral });
        }

        if (['warn', 'warnings', 'clear', 'announce', 'lock', 'unlock', 'ticketstats', 'staffhelp'].includes(interaction.commandName) && !isStaff(interaction)) return reply(interaction, '❌ FSMM Staff only.');

        if (interaction.commandName === 'warn') {
          const user = interaction.options.getUser('user', true);
          const reason = clean(interaction.options.getString('reason', true), 500);
          const warnings = guild.__fsmmWarnings || (guild.__fsmmWarnings = new Map());
          const count = (warnings.get(user.id) || 0) + 1;
          warnings.set(user.id, count);
          await interaction.channel.send({ content: `⚠️ **FSMM Warning**\n${user} has received warning **#${count}**.\n**Reason:** ${reason}\n**Staff:** <@${interaction.user.id}>`, allowedMentions: { users: [user.id, interaction.user.id] } }).catch(() => null);
          return reply(interaction, `✅ ${user.tag} warned. Total warnings this session: **${count}**.`);
        }

        if (interaction.commandName === 'warnings') {
          const user = interaction.options.getUser('user', true);
          const count = guild.__fsmmWarnings?.get(user.id) || 0;
          return reply(interaction, `⚠️ **${user.tag}** has **${count}** warning(s) recorded by the bot.`);
        }

        if (interaction.commandName === 'clear') {
          if (!interaction.channel?.isTextBased() || !interaction.channel.permissionsFor(interaction.guild.members.me)?.has(PermissionFlagsBits.ManageMessages)) return reply(interaction, '❌ I need **Manage Messages** permission in this channel.');
          const amount = interaction.options.getInteger('amount', true);
          const deleted = await interaction.channel.bulkDelete(amount, true);
          return reply(interaction, `🧹 Deleted **${deleted.size}** message(s).`);
        }

        if (interaction.commandName === 'announce') {
          const message = clean(interaction.options.getString('message', true), 1800);
          await interaction.channel.send({ embeds: [card('📢 FSMM ANNOUNCEMENT', message)], allowedMentions: { parse: [] } });
          return reply(interaction, '✅ Announcement sent.');
        }

        if (interaction.commandName === 'lock' || interaction.commandName === 'unlock') {
          const lock = interaction.commandName === 'lock';
          const everyone = guild.roles.everyone;
          await interaction.channel.permissionOverwrites.edit(everyone, { SendMessages: lock ? false : null });
          return reply(interaction, lock ? '🔒 Channel locked.' : '🔓 Channel unlocked.');
        }

        if (interaction.commandName === 'ticketstats') {
          const category = guild.channels.cache.find((c) => c.type === 4 && c.name === CATEGORY_NAME);
          const channels = category ? [...category.children.cache.values()].filter((c) => c.type === 0) : [];
          const counts = { middleman: 0, support: 0, 'base-painting': 0, other: 0 };
          for (const c of channels) {
            const key = Object.keys(counts).find((k) => c.topic?.includes(`TYPE:${k === 'base-painting' ? 'base' : k}`));
            if (key) counts[key] += 1; else counts.other += 1;
          }
          return interaction.reply({ embeds: [card('🎫 FSMM TICKET STATS', `**Total open:** ${channels.length}\n🤝 **Middleman:** ${counts.middleman}\n🛟 **Support:** ${counts.support}\n🎨 **Base Painting:** ${counts['base-painting']}\n📦 **Other:** ${counts.other}`)], flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'staffhelp') {
          return interaction.reply({ embeds: [card('🛡️ FSMM STAFF COMMANDS', '`/warn` — warn a member\n`/warnings` — view warning count\n`/clear` — delete messages\n`/announce` — send an announcement\n`/lock` / `/unlock` — lock or unlock a channel\n`/ticketstats` — view ticket stats\n`/serverinfo` — server information\n`/userinfo` — member information\n`/avatar` — member avatar\n`/staffhelp` — this menu')], flags: MessageFlags.Ephemeral });
        }
      } catch (error) {
        console.error('[FSMM EXTRA] Error:', error.message);
        if (!interaction.replied && !interaction.deferred) await reply(interaction, '❌ Something went wrong.');
      }
    });
  }
  return originalLogin.apply(this, args);
};
