'use strict';
const {Client}=require('discord.js');
if(!global.__fsmmInteractionSafety){
  global.__fsmmInteractionSafety=true;
  process.on('unhandledRejection',e=>console.error('[FSMM UNHANDLED REJECTION]',e?.stack||e));
  process.on('uncaughtException',e=>{
    const m=String(e?.message||e);
    if(/Unexpected server response:\s*503/i.test(m)||/websocket/i.test(String(e?.stack||''))){
      console.error('[FSMM GATEWAY] transient Discord websocket error; keeping process alive:',m);
      return;
    }
    console.error('[FSMM UNCAUGHT]',e?.stack||e);
    process.exitCode=1;
  });
  const originalLogin=Client.prototype.login;
  Client.prototype.login=function(...args){
    if(!this.__fsmmSafetyAttached){
      this.__fsmmSafetyAttached=true;
      this.on('error',e=>console.error('[FSMM DISCORD ERROR]',e?.stack||e));
      this.on('shardError',e=>console.error('[FSMM SHARD ERROR]',e?.stack||e));
    }
    return originalLogin.apply(this,args);
  };
  const originalEmit=Client.prototype.emit;
  Client.prototype.emit=function(event,...args){
    if(event==='interactionCreate'){
      const i=args[0];
      if(i?.isInteraction?.()){
        console.log(`[FSMM INTERACTION] ${i.isChatInputCommand?.()?'command':i.isButton?.()?'button':i.isStringSelectMenu?.()?'select':'interaction'} ${i.commandName||i.customId||''}`);
        setTimeout(()=>{
          if(!i.replied&&!i.deferred){
            i.reply({content:'❌ FSMM had an internal interaction error. Please try again.',ephemeral:true}).catch(()=>null);
            console.error('[FSMM INTERACTION] fallback reply used');
          }
        },2500);
      }
    }
    return originalEmit.call(this,event,...args);
  };
}
