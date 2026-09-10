'use strict';

// FSMM security layer. Loaded before the command handlers and wraps interaction
// listeners so authorization is checked before command code runs.
const { Client, MessageFlags } = require('discord.js');

const OWNER_ROLE = process.env.FSMM_OWNER_ROLE_ID || '1466090947170406617';
const MOD_ROLE = process.env.FSMM_MOD_ROLE_ID || '1466085137459712114';
const STAFF_ROLE = process.env.FSMM_STAFF_ROLE_ID || '1466088151331242015';

const STAFF_COMMANDS = new Set([
  'warn','warnings','unwarn','clear','ban','unban','kick','timeout','untimeout',
  'lock','unlock','slowmode','nick','role','modlogs','ticketstats','transcript',
  'staffhelp','setwelcome','setautorole','settranscripts','setlogs'
]);
const OWNER_COMMANDS = new Set(['config']);

function hasRole(member, id) { return Boolean(member?.roles?.cache?.has(id)); }
function isOwner(i) { return Boolean(i.guild?.ownerId === i.user?.id || hasRole(i.member, OWNER_ROLE)); }
function isStaff(i) { return isOwner(i) || hasRole(i.member, MOD_ROLE) || hasRole(i.member, STAFF_ROLE); }
function deny(i, text) {
  if (i.replied || i.deferred) return;
  return i.reply({ content: text, flags: MessageFlags.Ephemeral }).catch(() => {});
}

const originalOn = Client.prototype.on;
Client.prototype.on = function(event, listener) {
  if (event !== 'interactionCreate' || listener.__fsmmSecurityWrapped) {
    return originalOn.call(this, event, listener);
  }

  const wrapped = async (interaction) => {
    try {
      if (!interaction?.guild) return listener(interaction);

      if (interaction.isChatInputCommand()) {
        const name = interaction.commandName;
        if (OWNER_COMMANDS.has(name) && !isOwner(interaction)) {
          return deny(interaction, '❌ This command is restricted to the **FSMM Owner**.');
        }
        if (STAFF_COMMANDS.has(name) && !isStaff(interaction)) {
          return deny(interaction, '❌ This command is restricted to **FSMM Staff**.');
        }
      }

      // Ticket controls are never available to regular members.
      if (interaction.isButton() && (interaction.customId === 'fsmm_claim' || interaction.customId === 'fsmm_close')) {
        const topic = interaction.channel?.topic || '';
        if (!topic.includes('FSMM_USER:')) return deny(interaction, '❌ This button is only valid inside an FSMM ticket.');
        if (!isStaff(interaction)) return deny(interaction, '❌ Only authorized FSMM staff can use this ticket control.');
      }

      // Reject suspiciously oversized custom IDs before command handlers parse them.
      if (interaction.isButton() && interaction.customId.length > 100) {
        return deny(interaction, '❌ Invalid interaction. Please reopen the ticket panel.');
      }

      return listener(interaction);
    } catch (err) {
      console.error('[FSMM SECURITY]', err?.stack || err?.message || err);
      return deny(interaction, '❌ Security validation failed. Please try again.');
    }
  };
  wrapped.__fsmmSecurityWrapped = true;
  return originalOn.call(this, event, wrapped);
};

process.on('warning', warning => console.warn('[FSMM NODE WARNING]', warning.name, warning.message));
