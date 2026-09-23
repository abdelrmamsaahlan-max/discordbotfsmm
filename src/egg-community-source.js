const {ingestEggSpawn}=require('./egg-tracker');

const CHANNEL_ID=process.env.EGG_REPORT_CHANNEL_ID||'';
const REPORTER_ROLE_ID=process.env.EGG_REPORTER_ROLE_ID||'';

function clean(v,n=300){
  return String(v??'').replace(/@everyone|@here/gi,'@ mention').trim().slice(0,n);
}

function parse(content){
  const m=content.match(/^!egg\\s+(.+)$/i);
  if(!m)return null;

  const parts=m[1].split('|').map(x=>x.trim());
  const [rarity,egg,zone,server,joinUrl]=parts;
  if(!rarity||!egg)return null;

  return {
    rarity:clean(rarity,40),
    egg:clean(egg,120),
    zone:clean(zone||'Unknown',100),
    server:clean(server||'Unknown',120),
    joinUrl:clean(joinUrl||'',500),
    source:'community'
  };
}

function startCommunityEggSource(client){
  if(!CHANNEL_ID){
    console.log('[EGG SOURCE] EGG_REPORT_CHANNEL_ID not configured; community source disabled');
    return;
  }

  client.on('messageCreate',async message=>{
    try{
      if(message.author.bot||message.channel.id!==CHANNEL_ID)return;
      if(REPORTER_ROLE_ID&&!message.member?.roles?.cache?.has(REPORTER_ROLE_ID))return;

      const payload=parse(message.content);
      if(!payload)return;

      const result=await ingestEggSpawn(client,payload);
      if(result.ok&&result.alerted){
        await message.react('🥚').catch(()=>{});
      }
    }catch(e){
      console.error('[EGG SOURCE]',e.message);
    }
  });

  console.log('[EGG SOURCE] community reporter enabled');
}

module.exports={startCommunityEggSource};
