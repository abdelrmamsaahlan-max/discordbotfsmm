const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'index.js');
let source = fs.readFileSync(file, 'utf8');

const oldBlock = `  let panel = store.config.panelChannelId ? guild.channels.cache.get(store.config.panelChannelId) : null;\n  if (!panel) {\n    panel = await guild.channels.create({ name: 'fsmm-ticket-panel', type: ChannelType.GuildText });\n    store.config.panelChannelId = panel.id;\n    await panel.send({ embeds: [mainPanelEmbed()], components: panelRows() });\n    await panel.send({ embeds: [panelEmbed()], components: middlemanRows() });\n  }`;

const newBlock = `  let panel = store.config.panelChannelId ? guild.channels.cache.get(store.config.panelChannelId) : null;\n  if (!panel) {\n    panel = await guild.channels.create({ name: 'fsmm-ticket-panel', type: ChannelType.GuildText });\n    store.config.panelChannelId = panel.id;\n  }\n\n  // Always refresh the FSMM panel so existing servers receive new buttons/components.\n  // Only bot-authored panel messages are touched; normal user messages are left alone.\n  const panelMessages = await panel.messages.fetch({ limit: 100 }).catch(() => null);\n  const botMessages = panelMessages\n    ? [...panelMessages.values()]\n        .filter(m => m.author?.id === client.user?.id)\n        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)\n    : [];\n\n  const mainMessage = botMessages.find(m => m.embeds?.[0]?.footer?.text === 'FSMM • Steal a Brainrot Trading');\n  const middlemanMessage = botMessages.find(m => m.embeds?.[0]?.footer?.text === 'FSMM • Middleman Service');\n\n  if (mainMessage) {\n    await mainMessage.edit({ embeds: [mainPanelEmbed()], components: panelRows() }).catch(() => {});\n  } else if (botMessages[0]) {\n    await botMessages[0].edit({ embeds: [mainPanelEmbed()], components: panelRows() }).catch(() => {});\n  } else {\n    await panel.send({ embeds: [mainPanelEmbed()], components: panelRows() }).catch(() => {});\n  }\n\n  if (middlemanMessage) {\n    await middlemanMessage.edit({ embeds: [panelEmbed()], components: middlemanRows() }).catch(() => {});\n  } else {\n    await panel.send({ embeds: [panelEmbed()], components: middlemanRows() }).catch(() => {});\n  }`;

if (source.includes(newBlock)) {
  console.log('Panel refresh patch already applied.');
  process.exit(0);
}

if (!source.includes(oldBlock)) {
  console.error('Could not find the expected ensureSetup panel block. No changes made.');
  process.exit(1);
}

source = source.replace(oldBlock, newBlock);
fs.writeFileSync(file, source, 'utf8');
console.log('Applied FSMM panel refresh patch.');
