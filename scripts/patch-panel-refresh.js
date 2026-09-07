const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'index.js');
let source = fs.readFileSync(file, 'utf8');

function replaceFunction(name, replacement) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find ${name}()`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) throw new Error(`Could not parse ${name}()`);
  source = source.slice(0, start) + replacement + source.slice(end);
}

replaceFunction('middlemanRows', `function middlemanRows() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('mm_tier_menu')
        .setPlaceholder('Choose your Middleman trade value')
        .addOptions(
          { label: '10M - 250M', value: '10M - 250M', description: 'Trades from 10M to 250M', emoji: '💰' },
          { label: '250M - 500M', value: '250M - 500M', description: 'Trades from 250M to 500M', emoji: '💰' },
          { label: '1B+', value: '1B+', description: 'Trades worth 1B or more', emoji: '💎' },
          { label: 'OG', value: 'OG', description: 'OG Middleman service', emoji: '⭐' }
        )
    )
  ];
}`);

replaceFunction('panelRows', `function panelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_service_menu')
        .setPlaceholder('Choose a service')
        .addOptions(
          { label: 'Middleman', value: 'middleman', description: 'Request a trusted FSMM middleman', emoji: '🤝' },
          { label: 'Trade', value: 'trade', description: 'Open a private trade ticket', emoji: '🎫' },
          { label: 'Support', value: 'support', description: 'Get help from FSMM staff', emoji: '🛟' }
        )
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vouch_modal').setLabel('Leave Vouch').setEmoji('⭐').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('server_stats').setLabel('Server Stats').setEmoji('📊').setStyle(ButtonStyle.Secondary)
    )
  ];
}`);

replaceFunction('ensureSetup', `async function ensureSetup(guild) {
  let ownerRole = store.config.ownerRoleId ? guild.roles.cache.get(store.config.ownerRoleId) : null;
  if (!ownerRole) {
    ownerRole = await guild.roles.create({ name: 'FSMM Owners', reason: 'FSMM owner control role' });
    store.config.ownerRoleId = ownerRole.id;
  }
  const ownerMember = await guild.members.fetch(guild.ownerId).catch(() => null);
  if (ownerMember && !ownerMember.roles.cache.has(ownerRole.id)) await ownerMember.roles.add(ownerRole).catch(() => {});

  let category = store.config.ticketCategoryId ? guild.channels.cache.get(store.config.ticketCategoryId) : null;
  if (!category) {
    category = await guild.channels.create({ name: 'FSMM TICKETS', type: ChannelType.GuildCategory });
    store.config.ticketCategoryId = category.id;
  }
  let staffRole = store.config.staffRoleId ? guild.roles.cache.get(store.config.staffRoleId) : null;
  if (!staffRole) {
    staffRole = await guild.roles.create({ name: 'FSMM Staff', reason: 'FSMM bot setup' });
    store.config.staffRoleId = staffRole.id;
  }
  let mmRole = store.config.mmRoleId ? guild.roles.cache.get(store.config.mmRoleId) : null;
  if (!mmRole) {
    mmRole = await guild.roles.create({ name: 'FSMM Middleman', reason: 'FSMM bot setup' });
    store.config.mmRoleId = mmRole.id;
  }
  let logs = store.config.logChannelId ? guild.channels.cache.get(store.config.logChannelId) : null;
  if (!logs) {
    logs = await guild.channels.create({ name: 'fsmm-logs', type: ChannelType.GuildText });
    store.config.logChannelId = logs.id;
  }
  let panel = store.config.panelChannelId ? guild.channels.cache.get(store.config.panelChannelId) : null;
  if (!panel) {
    panel = await guild.channels.create({ name: 'fsmm-ticket-panel', type: ChannelType.GuildText });
    store.config.panelChannelId = panel.id;
  }

  const messages = await panel.messages.fetch({ limit: 100 }).catch(() => null);
  const botMessages = messages ? [...messages.values()].filter(m => m.author.id === client.user.id) : [];

  // Remove every old FSMM panel message so stale buttons can never remain.
  for (const msg of botMessages) {
    if (msg.deletable) await msg.delete().catch(() => {});
  }

  await panel.send({ embeds: [mainPanelEmbed()], components: panelRows() });

  store.config.vouchChannelId = VOUCH_CHANNEL_ID;
  saveStore();
  return { ownerRole, category, staffRole, mmRole, logs, panel };
}`);

const selectHandler = `    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'ticket_service_menu') {
        const choice = interaction.values[0];
        if (choice === 'middleman') {
          return interaction.reply({
            embeds: [panelEmbed()],
            components: middlemanRows(),
            ephemeral: true
          });
        }
        return createTicket(interaction, choice);
      }

      if (interaction.customId === 'mm_tier_menu') {
        return openMiddlemanModal(interaction, interaction.values[0]);
      }
    }

`;

if (!source.includes("interaction.customId === 'mm_tier_menu'")) {
  const anchor = '    if (interaction.isModalSubmit()) {';
  if (!source.includes(anchor)) throw new Error('Could not find interaction handler anchor');
  source = source.replace(anchor, selectHandler + anchor);
}

fs.writeFileSync(file, source, 'utf8');
console.log('FSMM: applied ticket dropdown patch and forced panel refresh.');
