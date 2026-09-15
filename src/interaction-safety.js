'use strict';
const {Client}=require('discord.js');
if(!global.__fsmmInteractionSafety){
  global.__fsmmInteractionSafety=true;
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
