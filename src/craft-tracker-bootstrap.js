const {Client}=require('discord.js');
const tracker=require('./craft-tracker');
const originalLogin=Client.prototype.login;
if(!Client.prototype.__fsmmCraftTrackerPatched){
  Client.prototype.__fsmmCraftTrackerPatched=true;
  Client.prototype.login=function(...args){
    try{tracker.attach(this)}catch(e){console.error('[CRAFT] attach failed:',e.message)}
    return originalLogin.apply(this,args);
  };
}
