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
          { label: '10M - 250M', value: '10M - 250M', description: 'Middleman fee tier for trades from 10M to 250M', emoji: '💰' },
          { label: '250M - 500M', value: '250M - 500M', description: 'Middleman fee tier for trades from 250M to 500M', emoji: '💰' },
          { label: '1B+', value: '1B+', description: 'Middleman fee tier for trades worth 1B or more', emoji: '💎' },
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
    )
  ];
}`);

const oldPanelSend = "    await panel.send({ embeds: [mainPanelEmbed()], components: panelRows() });\n    await panel.send({ embeds: [panelEmbed()], components: middlemanRows() });";
const newPanelSend = "    await panel.send({ embeds: [mainPanelEmbed()], components: panelRows() });";
source = source.replace(oldPanelSend, newPanelSend);

const oldMiddlemanRefresh = `    const mmMessage = botMessages.find(m => m.embeds?.[0]?.footer?.text === 'FSMM • Middleman Service');\n    if (mainMessage) await mainMessage.edit({ embeds: [mainPanelEmbed()], components: panelRows() }).catch(() => {});\n    else await panel.send({ embeds: [mainPanelEmbed()], components: panelRows() }).catch(() => {});\n    if (mmMessage) await mmMessage.edit({ embeds: [panelEmbed()], components: middlemanRows() }).catch(() => {});\n    else await panel.send({ embeds: [panelEmbed()], components: middlemanRows() }).catch(() => {});`;
const newMiddlemanRefresh = `    if (mainMessage) await mainMessage.edit({ embeds: [mainPanelEmbed()], components: panelRows() }).catch(() => {});\n    else await panel.send({ embeds: [mainPanelEmbed()], components: panelRows() }).catch(() => {});\n\n    // Remove the old standalone Middleman panel so the new flow is one clean dropdown.\n    for (const msg of botMessages) {\n      if (msg !== mainMessage && msg.embeds?.[0]?.footer?.text === 'FSMM • Middleman Service') {\n        await msg.delete().catch(() => {});\n      }\n    }`;
source = source.replace(oldMiddlemanRefresh, newMiddlemanRefresh);

const oldButtonHandler = `      if (interaction.customId === 'middleman_panel') {\n        return interaction.reply({ embeds: [panelEmbed()], components: middlemanRows(), ephemeral: true });\n      }\n      const tierMap = {\n        mm_value_10_250: '10M - 250M',\n        mm_value_250_500: '250M - 500M',\n        mm_value_500_1b: '500M - 1B',\n        mm_value_1b_5b: '1B - 5B',\n        mm_value_5b_plus: '5B+'\n      };\n      if (tierMap[interaction.customId]) return openMiddlemanModal(interaction, tierMap[interaction.customId]);`;
const newSelectHandler = `      if (interaction.customId === 'middleman_panel') {\n        return interaction.reply({ embeds: [panelEmbed()], components: middlemanRows(), ephemeral: true });\n      }\n      const tierMap = {\n        mm_value_10_250: '10M - 250M',\n        mm_value_250_500: '250M - 500M',\n        mm_value_500_1b: '500M - 1B',\n        mm_value_1b_5b: '1B - 5B',\n        mm_value_5b_plus: '5B+'\n      };\n      if (tierMap[interaction.customId]) return openMiddlemanModal(interaction, tierMap[interaction.customId]);`;
source = source.replace(oldButtonHandler, newSelectHandler);

const anchor = `    if (interaction.isModalSubmit()) {`;
const selectHandler = `    if (interaction.isStringSelectMenu()) {\n      if (interaction.customId === 'ticket_service_menu') {\n        const choice = interaction.values[0];\n        if (choice === 'middleman') {\n          return interaction.reply({\n            embeds: [panelEmbed()],\n            components: middlemanRows(),\n            ephemeral: true\n          });\n        }\n        return createTicket(interaction, choice);\n      }\n\n      if (interaction.customId === 'mm_tier_menu') {\n        return openMiddlemanModal(interaction, interaction.values[0]);\n      }\n    }\n\n`;
if (!source.includes(selectHandler)) source = source.replace(anchor, selectHandler + anchor);

fs.writeFileSync(file, source, 'utf8');
console.log('Applied FSMM dropdown ticket panel patch.');
