const fs = require('fs');
const path = require('path');
const Module = require('module');
const indexPath = path.join(__dirname, 'index.js');
let source = fs.readFileSync(indexPath, 'utf8');

const ALL_BASES = [
  ['Default','Classic','DefaultBase.png'],['Gold','Classic','GoldBase.png'],['Diamond','Classic','DiamondBase.png'],['Rainbow','Classic','RainbowBase.png'],
  ['Candy','Mutation','CandyBase.png'],['Lava','Mutation','LavaBase.png'],['Galaxy','Mutation','GalaxyBase.png'],['Yin Yang','Mutation','YinYangBase.png'],['Radioactive','Mutation','RadioactiveBase.png'],['Cursed','Mutation','CursedBase.png'],['Divine','Mutation','DivineBase.png'],['Cyber','Mutation','CyberBase.png'],['Phantom','Mutation','PhantomBase.png'],['Crystal','Mutation','CrystalBase.png'],
  ['Skibidi','OG','SkibidiBase.png'],['John Pork','OG','JohnPorkBase.png'],['Headless Horseman','OG','HeadlessHorsemanBase.png'],['Meowl','OG','MeowlBase.png'],['Strawberry','OG','StrawberryBase.png'],['Spyder','OG','SpyderBase.png'],
  ['Halloween','Seasonal','HalloweenBase.png'],['Aquatic','Seasonal','AquaticBase.png'],['Christmas','Seasonal','ChristmasBase.png'],['Gingerbread','Seasonal','GingerbreadBase.png'],['Taco','Seasonal','TacoBase.png'],["Valentine's",'Seasonal','ValentinesBase.png'],['Rose','Seasonal','RoseBase.png'],['Pot of Gold','Seasonal','PotOfGoldBase.png'],['Lucky','Seasonal','LuckyBase.png'],['Bunny Basket','Seasonal','BunnyBasketBase.png'],['Easter','Seasonal','EasterBase.png'],['Summer','Seasonal','SummerBase.png'],['Red Octo','Seasonal','RedOctoBase.png'],['Bee Emperor','Seasonal','BeeEmperorBase.png'],['Honey Bee','Seasonal','HoneyBeeBase.png'],
  ["SpyderSammy's Base",'Admin','SpyderSammysBase.png'],['Tralalero','Admin','TralaleroBase.png'],['1/1','Admin','1of1Base.png']
].map(([name,category,file])=>({name,category,file}));

const oldDefs = "const mutationBases=['Candy','Lava','Galaxy','Yin Yang','Radioactive','Cursed','Divine','Cyber','Phantom','Crystal'];\nconst baseFiles={Candy:'CandyBase.png',Lava:'LavaBase.png',Galaxy:'GalaxyBase.png','Yin Yang':'YinYangBase.png',Radioactive:'RadioactiveBase.png',Cursed:'CursedBase.png',Divine:'DivineBase.png',Cyber:'CyberBase.png',Phantom:'PhantomBase.png',Crystal:'CrystalBase.png'};";
if(!source.includes(oldDefs)) throw new Error('FSMM boot patch: base definitions changed.');
source=source.replace(oldDefs,`const ALL_BASES=${JSON.stringify(ALL_BASES)};\nconst mutationBases=ALL_BASES.filter(b=>b.category==='Mutation').map(b=>b.name);\nconst baseFiles=Object.fromEntries(ALL_BASES.map(b=>[b.name,b.file]));`);

const oldImage="function baseImage(n){return `https://stealabrainrot.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(baseFiles[n]||n+'Base.png')}`}";
if(!source.includes(oldImage)) throw new Error('FSMM boot patch: baseImage changed.');
source=source.replace(oldImage,"function baseImage(n){const f=baseFiles[n]||n+'Base.png';return `https://stealabrainrot.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(f)}`}" );

const oldMenu="function mutationMenu(){return row(new StringSelectMenuBuilder().setCustomId('mutation_pick').setPlaceholder('🎨 Select a mutation base...').addOptions(mutationBases.map(b=>({label:b,value:b,description:`${b} Base • mutation painting`}))))}";
if(!source.includes(oldMenu)) throw new Error('FSMM boot patch: mutation menu changed.');
const newMenu="function mutationMenu(){return row(new StringSelectMenuBuilder().setCustomId('fsmm_base_pick').setPlaceholder('🎨 Select a base to paint...').addOptions(mutationBases.map(b=>({label:b,value:b,description:`${b} Base • FSMM painting`}))))}";
source=source.replace(oldMenu,newMenu);

const oldPanel="['🎨・base-painting',embed('🎨 FSMM BASE PAINTING','Want your base painted?\\n\\nSelect the mutation base you want, preview it privately, then start your request.'),mutationMenu()]";
if(!source.includes(oldPanel)) throw new Error('FSMM boot patch: base panel changed.');
const newPanel="['🎨・base-painting',embed('🎨 FSMM BASE PAINTING','Want your base painted?\\n\\nChoose a mutation base from **Candy → Crystal**, preview it privately, then start your request.'),mutationMenu()]";
source=source.replace(oldPanel,newPanel);

// Add an OG / rare-trade option to the Middleman selector.
const oldMm="const mmValues=[['10M - 250M','Middleman for trades from 10M to 250M'],['250M - 500M','Middleman for trades from 250M to 500M'],['500M - 1B','Middleman for trades from 500M to 1B'],['1B - 5B','Middleman for trades from 1B to 5B'],['5B+','Middleman for trades worth 5B+']];";
const newMm="const mmValues=[['10M - 250M','Middleman for trades from 10M to 250M'],['250M - 500M','Middleman for trades from 250M to 500M'],['500M - 1B','Middleman for trades from 500M to 1B'],['1B - 5B','Middleman for trades from 1B to 5B'],['5B+','Middleman for trades worth 5B+'],['OG / Rare Items','OG or rare-item trades • FSMM staff will review the value']];";
if(!source.includes(oldMm)) throw new Error('FSMM boot patch: middleman values changed.');
source=source.replace(oldMm,newMm);

const listener="\n\nclient.on('interactionCreate',async interaction=>{\n  if(!interaction.isStringSelectMenu())return;\n  if(interaction.customId!=='fsmm_base_pick')return;\n  const value=interaction.values[0];\n  const base=ALL_BASES.find(b=>b.name===value && b.category==='Mutation');\n  if(!base)return interaction.reply({content:'❌ That base is not available right now.',flags:MessageFlags.Ephemeral});\n  return interaction.showModal(paintModal(base.name));\n});\n";
const marker='client.login(TOKEN);';
if(!source.includes('fsmm_base_pick')){const pos=source.indexOf(marker);if(pos<0)throw new Error('FSMM boot patch: login marker not found.');source=source.slice(0,pos)+listener+source.slice(pos);}

// giveaway.js already contains the giveaway interaction logic; register its slash command and pass normalize.
const giveawaySetup="\nconst fsmmGiveawayCommand=require('./giveaway')({client,store,saveStore,normalize});\nif(fsmmGiveawayCommand && !commands.some(c=>c.name==='giveaway')) commands.push(fsmmGiveawayCommand);\n";
if(!source.includes("require('./giveaway')({client,store,saveStore,env:{TOKEN,CLIENT_ID,GUILD_ID}})")){
  const pos=source.indexOf(marker);if(pos<0)throw new Error('FSMM giveaway patch: login marker not found.');
  source=source.slice(0,pos)+giveawaySetup+source.slice(pos);
}

const compiled=new Module(indexPath,module.parent);compiled.filename=indexPath;compiled.paths=Module._nodeModulePaths(path.dirname(indexPath));compiled._compile(source,indexPath);
