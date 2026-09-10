const { GuildChannelManager, TextChannel, ChannelType } = require('discord.js');

const ROLE_IDS = Object.freeze({
  owner: '1466090947170406617',
  mod: '1466085137459712114',
  staff: '1466088151331242015',
  indexProvider: '1466245073820844211',
  middleman: '1466091035510706262',
});

function ticketType(topic = '') {
  return topic.match(/TYPE:([^\s]+)/)?.[1] || null;
}

function openerId(topic = '') {
  return topic.match(/FSMM_USER:(\d+)/)?.[1] || null;
}

function teamRoleId(type) {
  if (type === 'middleman') return ROLE_IDS.middleman;
  if (type === 'base-painting') return ROLE_IDS.indexProvider;
  return ROLE_IDS.staff;
}

const originalCreate = GuildChannelManager.prototype.create;
GuildChannelManager.prototype.create = async function fsmmRoleAwareCreate(options = {}) {
  const topic = typeof options.topic === 'string' ? options.topic : '';
  const type = ticketType(topic);

  if (options.type === ChannelType.GuildText && topic.includes('FSMM_USER:') && type) {
    const userId = openerId(topic);
    const teamId = teamRoleId(type);
    const guild = this.guild;
    const everyoneId = guild.roles.everyone.id;

    options = {
      ...options,
      permissionOverwrites: [
        { id: everyoneId, deny: ['ViewChannel'] },
        ...(userId ? [{ id: userId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }] : []),
        { id: ROLE_IDS.owner, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
        { id: ROLE_IDS.mod, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
        { id: ROLE_IDS.staff, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
        { id: teamId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
      ],
    };
  }

  return originalCreate.call(this, options);
};

const originalSend = TextChannel.prototype.send;
TextChannel.prototype.send = function fsmmTicketRoleMention(options) {
  const topic = this.topic || '';
  const type = ticketType(topic);

  if (type && topic.includes('FSMM_USER:') && options && typeof options === 'object' && options.embeds?.length && options.components?.length) {
    const userId = openerId(topic);
    const teamId = teamRoleId(type);
    options = {
      ...options,
      content: `${userId ? `<@${userId}> ` : ''}<@&${teamId}>`,
      allowedMentions: {
        parse: [],
        users: userId ? [userId] : [],
        roles: [teamId],
      },
    };
  }

  return originalSend.call(this, options);
};

console.log('[FSMM ROLES] exact role IDs + ticket mentions loaded');
console.log('[FSMM DEPLOY TRIGGER] latest role configuration active');
