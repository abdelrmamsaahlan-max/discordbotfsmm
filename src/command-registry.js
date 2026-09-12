'use strict';
const {REST,Routes}=require('discord.js');
const TOKEN=process.env.DISCORD_TOKEN,CLIENT_ID=process.env.CLIENT_ID,GUILD_ID=process.env.GUILD_ID;
if(!global.__fsmmRegistryPatched){
  global.__fsmmRegistryPatched=true;
  const originalPut=REST.prototype.put;
  let queue=Promise.resolve();
  REST.prototype.put=function(route,options={}){
    if(!CLIENT_ID||!GUILD_ID||!String(route).includes(`/applications/${CLIENT_ID}/guilds/${GUILD_ID}/commands`)) return originalPut.call(this,route,options);
    const incoming=Array.isArray(options.body)?options.body:[];
    queue=queue.then(async()=>{
      const rest=this;
      try{
        const current=await rest.get(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID));
        const map=new Map();
        for(const c of current||[]) if(!['announce','transcript'].includes(c.name)) map.set(c.name,c);
        for(const c of incoming) if(c?.name&&!['announce','transcript'].includes(c.name)) map.set(c.name,c);
        const body=[...map.values()];
        console.log(`[FSMM REGISTRY] synced ${body.length} guild commands`);
        return await originalPut.call(rest,route,{...options,body});
      }catch(e){console.error('[FSMM REGISTRY] sync failed:',e.message);throw e;}
    });
    return queue;
  };
}
