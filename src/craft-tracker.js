const fs=require('fs');
const path=require('path');
const {EmbedBuilder,ChannelType,PermissionFlagsBits}=require('discord.js');

const CRAFT_CHANNEL=process.env.CRAFT_CHANNEL_ID||'';
const CRAFT_CHANNEL_NAME=process.env.CRAFT_CHANNEL_NAME||'craft-machine';
const CRAFT_POLL_MS=Math.max(60,Number(process.env.CRAFT_POLL_SECONDS||120))*1000;
const CRAFT_SOURCE_URL=process.env.CRAFT_SOURCE_URL||'';
const DATA=path.join(__dirname,'..','data','craft-tracker.json');

// Recipe catalogue for the current OG Craft/Craft Machine family.
// The live rotation itself is intentionally NOT fabricated: it must come from a live source.
const RECIPES={
  'Electro Quacko':[['Strawberrelli Flamingelli',1],['Burbaloni Loliloli',1],['Chimpanzini Bananini',1]],
  'Los Noobinis':[['Noobini Pizzanini',3],['Tracoducotulu Delapeladustuz',1]],
  'Squalanana':[['Bananito Bandito',1],['Orangutini Ananassini',1],['Tractoro Dinosauro',1]],
  'Orcalita Orcala':[['Orcalero Orcala',1],['Tralalita Tralala',1],['Girafa Celestre',2]],
  'Hippo Jacuzzo':[['Aquanaut',1],['Tralalero Tralala',2]],
  'Pelican Pachetto':[['Appelini',1],['Graipuss Medussi',1],['Los Tralaleritos',1]],
  'Deputy Leopard':[['La Grande Combinasion',1],['Sir Mangus',1],['Gub',1]],
  'Chicli Chicla':[['Tang Tang Keletang',1],['Los Chicleteiras',1],['Bananito',1]],
  'Panda Popanda':[['DJ Panda',1],['Candini Fluffini',1]],
  'La Craft Machine':[['Fragola La La La',1],['Celularcini Viciosini',1],['Las Sis',1],['La Sahur Combinasion',1]],
  'Gold and Diamond':[['Gold Gold Gold',1],['Gym Bros',1],['Chillin Chili',1]],
  'Los Dragons':[['Dragon Cannelloni',1],['Dragon Gingerini',1],['Dragon Aquanini',1]],
  'Koala Parabala':[],
  'Bandito Axolito':[['Trippi Troppi',2],['Bandito Bobritto',2]],
  'Sigma Girl':[],
  'Bee Loco':[['Sigma Boy',1],['Quivioli Ameleonni',1],['Te Te Te Sahur',1],['Frigo Camelo',1]]
};

let clientRef=null;
let lastHash=null;
let lastSourceError='';

function loadState(){try{if(fs.existsSync(DATA)){const x=JSON.parse(fs.readFileSync(DATA,'utf8'));lastHash=x.lastHash||null}}catch(e){console.error('[CRAFT] state load:',e.message)}}
function saveState(){try{fs.mkdirSync(path.dirname(DATA),{recursive:true});fs.writeFileSync(DATA,JSON.stringify({lastHash,updatedAt:Date.now()},null,2))}catch(e){console.error('[CRAFT] state save:',e.message)}}
function clean(v){return String(v??'').replace(/@everyone|@here/gi,'@ mention').trim().slice(0,900)}
function hash(x){return JSON.stringify(x)}
function recipeText(name){const r=RECIPES[name];if(!r)return 'Recipe data not confirmed yet.';if(!r.length)return 'Recipe data not confirmed yet.';return r.map(([n,q])=>`${q}x ${n}`).join('\n')}
function normalize(x){
  if(!x)return null;
  const list=Array.isArray(x)?x:(x.brainrots||x.items||x.recipes||x.selected||x.available||x.data);
  if(!Array.isArray(list))return null;
  const out=list.map(v=>{
    if(typeof v==='string')return{name:v};
    if(!v||typeof v!=='object')return null;
    const name=v.name||v.brainrot||v.target||v.output||v.title;
    if(!name)return null;
    return{name:String(name),time:v.time||v.craftingTime||v.craftTime||null,requirements:v.requirements||v.recipe||v.ingredients||null};
  }).filter(Boolean);
  return out.length?out:null;
}

async function fetchLive(){
  if(!CRAFT_SOURCE_URL)return null;
  const r=await fetch(CRAFT_SOURCE_URL,{headers:{accept:'application/json,text/html,*/*'},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const type=r.headers.get('content-type')||'';
  if(type.includes('json'))return normalize(await r.json());
  const text=await r.text();
  // Supports a simple JSON blob embedded in a page, if the source exposes one.
  const candidates=[...text.matchAll(/(?:craft|recipe|selected|available)[^\[]*\[([\s\S]{20,20000})\]/gi)];
  for(const m of candidates){try{const parsed=JSON.parse('['+m[1]+']');const n=normalize(parsed);if(n)return n}catch{}}
  return null;
}

async function getChannel(guild){
  if(CRAFT_CHANNEL){const c=guild.channels.cache.get(CRAFT_CHANNEL);if(c?.type===ChannelType.GuildText)return c}
  let c=guild.channels.cache.find(x=>x.type===ChannelType.GuildText&&x.name===CRAFT_CHANNEL_NAME);
  if(c)return c;
  try{return await guild.channels.create({name:CRAFT_CHANNEL_NAME,type:ChannelType.GuildText,reason:'FSMM Craft Machine tracker'})}catch(e){console.error('[CRAFT] channel:',e.message);return null}
}

async function post(guild,items){
  const ch=await getChannel(guild);if(!ch)return;
  const e=new EmbedBuilder().setTitle('🔄 CRAFT MACHINE REFRESHED').setDescription('The Craft Machine rotation changed.').setColor(0x5865f2).setTimestamp().setFooter({text:'FSMM Craft Tracker'});
  e.addFields({name:'🧠 Available Brainrots',value:items.map((x,i)=>`${i+1}. **${clean(x.name)}**`).join('\n').slice(0,1024)||'No data'});
  for(const x of items.slice(0,5)){
    let body=recipeText(x.name);
    if(x.requirements){try{body=Array.isArray(x.requirements)?x.requirements.map(v=>typeof v==='string'?v:`${v.quantity||v.amount||1}x ${v.name||v.brainrot||v}`).join('\n'):typeof x.requirements==='string'?x.requirements:JSON.stringify(x.requirements)}catch{}}
    if(x.time)body+=`\n⏱️ ${clean(x.time)}`;
    e.addFields({name:`📋 ${clean(x.name)}`,value:body.slice(0,1024)});
  }
  await ch.send({embeds:[e]});
}

function attach(client){
  if(clientRef)return;
  clientRef=client;loadState();
  client.once('ready',()=>{
    const guild=client.guilds.cache.first();
    if(!guild){console.log('[CRAFT] No guild available');return}
    console.log(`[CRAFT] tracker started; polling every ${CRAFT_POLL_MS/1000}s`);
    if(!CRAFT_SOURCE_URL){console.log('[CRAFT] No live source configured. Set CRAFT_SOURCE_URL; tracker will not invent rotations.');return}
    const tick=async()=>{
      try{
        const items=await fetchLive();
        if(!items){if(lastSourceError!=='NO_DATA'){lastSourceError='NO_DATA';console.warn('[CRAFT] live source returned no machine rotation data')}return}
        lastSourceError='';
        const h=hash(items.map(x=>({name:x.name,time:x.time,requirements:x.requirements})));
        if(lastHash===null){lastHash=h;saveState();console.log('[CRAFT] baseline initialized silently');return}
        if(h!==lastHash){lastHash=h;saveState();await post(guild,items);console.log('[CRAFT] rotation change posted')}
      }catch(e){if(lastSourceError!==e.message){lastSourceError=e.message;console.error('[CRAFT]',e.message)}}
    };
    tick();setInterval(tick,CRAFT_POLL_MS).unref();
  });
}

module.exports={attach,RECIPES};
