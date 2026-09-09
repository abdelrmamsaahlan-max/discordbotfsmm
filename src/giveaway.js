const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, ActivityType } = require('discord.js');

module.exports = function setupGiveaways({ client, store, saveStore, normalize }) {
  store.giveaways ||= [];
  const timers = new Map();
  const HOST_ROLE = 'giveaway host';

  const command = new SlashCommandBuilder().setName('giveaway').setDescription('Create an FSMM giveaway contest.').toJSON();
  const hasHost = i => Boolean(i.member?.roles?.cache?.some(r => normalize(r.name) === normalize(HOST_ROLE)) || i.guild?.ownerId === i.user.id);
  const clean = v => String(v || '').replace(/@everyone|@here/gi, '@ mention').trim();
  const validImage = v => { try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol); } catch { return false; } };
  const parseDuration = v => { const m = String(v).trim().toLowerCase().match(/^(\d+)\s*(m|h|d)$/); if (!m) return null; const ms = Number(m[1]) * ({m:60000,h:3600000,d:86400000}[m[2]]); return ms >= 60000 && ms <= 30 * 86400000 ? ms : null; };
  const row = (...c) => new ActionRowBuilder().addComponents(c);

  const giveawayEmbed = g => new EmbedBuilder()
    .setTitle('🎉 FSMM GIVEAWAY')
    .setDescription(`## 🎁 ${clean(g.item)}\n\nEnter using the button below for your chance to win.`)
    .addFields(
      { name: '🎁 Prize', value: clean(g.item).slice(0, 1024), inline: false },
      { name: '🏆 Winners', value: String(g.winners), inline: true },
      { name: '👥 Entries', value: String(g.entries.length), inline: true },
      { name: '👤 Hosted by', value: `<@${g.hostId}>`, inline: true },
      { name: '⏰ Ends', value: `<t:${Math.floor(g.endAt / 1000)}:R>\n<t:${Math.floor(g.endAt / 1000)}:F>`, inline: false },
      { name: '📋 Requirements', value: (clean(g.requirements) || 'No extra requirements.').slice(0, 1024), inline: false },
    )
    .setImage(g.image)
    .setColor(0x8b5cf6)
    .setTimestamp()
    .setFooter({ text: 'FSMM • Giveaway System' });

  const endedEmbed = g => new EmbedBuilder()
    .setTitle('🏁 FSMM GIVEAWAY ENDED')
    .setDescription(`## 🎁 ${clean(g.item)}\n\nThis giveaway is now closed.`)
    .addFields(
      { name: '🎁 Prize', value: clean(g.item).slice(0, 1024), inline: false },
      { name: '👥 Final Entries', value: String(g.entries.length), inline: true },
      { name: '🏆 Winners', value: String(g.winners), inline: true },
      { name: '👤 Hosted by', value: `<@${g.hostId}>`, inline: true },
    )
    .setImage(g.image)
    .setColor(0x57F287)
    .setTimestamp()
    .setFooter({ text: 'FSMM • Giveaway System' });

  const controls = id => row(new ButtonBuilder().setCustomId(`fsmm_gw_join:${id}`).setLabel('Enter Giveaway').setEmoji('🎉').setStyle(ButtonStyle.Success));
  const modal = () => new ModalBuilder().setCustomId('fsmm_gw_modal').setTitle('Create FSMM Giveaway').addComponents(
    row(new TextInputBuilder().setCustomId('item').setLabel('Giveaway item / prize').setPlaceholder('Example: 1x1x1x').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(150)),
    row(new TextInputBuilder().setCustomId('image').setLabel('Prize image URL').setPlaceholder('https://...').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500)),
    row(new TextInputBuilder().setCustomId('duration').setLabel('Duration (10m, 2h, 1d)').setPlaceholder('2h').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8)),
    row(new TextInputBuilder().setCustomId('winners').setLabel('Number of winners').setPlaceholder('1').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2)),
    row(new TextInputBuilder().setCustomId('requirements').setLabel('Requirements / extra info').setPlaceholder('Optional').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(700))
  );

  async function end(id) {
    const g = store.giveaways.find(x => x.id === id);
    if (!g || g.ended) return;
    g.ended = true;
    g.endedAt = Date.now();
    saveStore();
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.delete(id);

    try {
      const ch = await client.channels.fetch(g.channelId);
      const msg = await ch.messages.fetch(g.messageId);
      await msg.edit({ embeds: [endedEmbed(g)], components: [] });
      await ch.send({ content: `🏁 **Giveaway closed:** ${clean(g.item)}\nThere were **${g.entries.length}** eligible participant(s). FSMM Staff can now review and announce the winner(s).` });
    } catch (e) {
      console.error('[FSMM] giveaway end:', e.message);
    }
  }

  function schedule(g) {
    const delay = Math.max(1000, g.endAt - Date.now());
    timers.set(g.id, setTimeout(() => end(g.id), Math.min(delay, 2147483647)));
  }

  client.on('ready', () => {
    client.user.setPresence({ activities: [{ name: 'FSMM', type: ActivityType.Watching }], status: 'online' });
    for (const g of store.giveaways) if (!g.ended && g.endAt > Date.now()) schedule(g);
  });

  client.on('interactionCreate', async i => {
    if (i.isChatInputCommand() && i.commandName === 'giveaway') {
      if (!hasHost(i)) return i.reply({ content: '❌ You need the **Giveaway Host** role to create a giveaway.', flags: MessageFlags.Ephemeral });
      return i.showModal(modal());
    }

    if (i.isModalSubmit() && i.customId === 'fsmm_gw_modal') {
      if (!hasHost(i)) return i.reply({ content: '❌ You no longer have the Giveaway Host role.', flags: MessageFlags.Ephemeral });
      const item = clean(i.fields.getTextInputValue('item'));
      const image = clean(i.fields.getTextInputValue('image'));
      const duration = parseDuration(i.fields.getTextInputValue('duration'));
      const winners = Number(i.fields.getTextInputValue('winners'));
      const requirements = clean(i.fields.getTextInputValue('requirements'));
      if (!validImage(image)) return i.reply({ content: '❌ Please enter a valid image URL.', flags: MessageFlags.Ephemeral });
      if (!duration) return i.reply({ content: '❌ Duration must be like **10m, 2h, or 1d**.', flags: MessageFlags.Ephemeral });
      if (!Number.isInteger(winners) || winners < 1 || winners > 20) return i.reply({ content: '❌ Winners must be between 1 and 20.', flags: MessageFlags.Ephemeral });

      const g = { id: require('crypto').randomBytes(8).toString('hex'), guildId: i.guildId, channelId: i.channelId, messageId: null, hostId: i.user.id, item, image, duration, winners, requirements, entries: [], endAt: Date.now() + duration, ended: false };
      store.giveaways.push(g);
      saveStore();
      const msg = await i.channel.send({ embeds: [giveawayEmbed(g)], components: [controls(g.id)], allowedMentions: { parse: [] } });
      g.messageId = msg.id;
      saveStore();
      schedule(g);
      return i.reply({ content: `✅ Giveaway created for **${item}**.`, flags: MessageFlags.Ephemeral });
    }

    if (i.isButton() && i.customId.startsWith('fsmm_gw_join:')) {
      const g = store.giveaways.find(x => x.id === i.customId.slice(14));
      if (!g || g.ended) return i.reply({ content: '❌ This giveaway has ended.', flags: MessageFlags.Ephemeral });
      if (g.entries.includes(i.user.id)) return i.reply({ content: 'ℹ️ You are already entered.', flags: MessageFlags.Ephemeral });
      g.entries.push(i.user.id);
      saveStore();
      await i.message.edit({ embeds: [giveawayEmbed(g)], components: [controls(g.id)] }).catch(() => {});
      return i.reply({ content: '🎉 You are entered. Good luck!', flags: MessageFlags.Ephemeral });
    }
  });

  return command;
};
