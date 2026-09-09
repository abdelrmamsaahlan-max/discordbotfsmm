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
const newPanel="['🎨・base-painting',embed('🎨 FSMM BASE PAINTING','Want your base painted?\\n\\nChoose a mutation base from **Candy → Crystal**, then answer the payment and collateral questions to start your request.'),mutationMenu()]";
source=source.replace(oldPanel,newPanel);

const oldMm="const mmValues=[['10M - 250M','Middleman for trades from 10M to 250M'],['250M - 500M','Middleman for trades from 250M to 500M'],['500M - 1B','Middleman for trades from 500M to 1B'],['1B - 5B','Middleman for trades from 1B to 5B'],['5B+','Middleman for trades worth 5B+']];";
const newMm="const mmValues=[['10M - 250M','Middleman for trades from 10M to 250M'],['250M - 500M','Middleman for trades from 250M to 500M'],['500M - 1B','Middleman for trades from 500M to 1B'],['1B - 5B','Middleman for trades from 1B to 5B'],['5B+','Middleman for trades worth 5B+'],['OG / Rare Items','OG / rare-item trade • FSMM staff will review the value']];";
if(!source.includes(oldMm)) throw new Error('FSMM boot patch: middleman values changed.');
source=source.replace(oldMm,newMm);

const oldFields="if(d.notes)e.addFields({name:'📝 Details',value:safe(d.notes,900)});if(d.roblox)e.addFields({name:'🎮 Roblox Username',value:safe(d.roblox,100),inline:true});";
const newFields="if(d.you)e.addFields({name:'👤 You',value:safe(d.you,900)});if(d.their)e.addFields({name:'👤 Other Trader',value:safe(d.their,900)});if(d.payment)e.addFields({name:'💳 Payment',value:safe(d.payment,300),inline:true});if(d.collateral)e.addFields({name:'🛡️ Collateral',value:safe(d.collateral,300),inline:true});if(d.notes)e.addFields({name:'📝 Details',value:safe(d.notes,900)});if(d.roblox)e.addFields({name:'🎮 Roblox Username',value:safe(d.roblox,100),inline:true});";
if(!source.includes(oldFields)) throw new Error('FSMM boot patch: ticket fields changed.');source=source.replace(oldFields,newFields);

const customListener="\n\nfunction fsmmMmModal(value){const m=new ModalBuilder().setCustomId(`fsmm_mm_modal_v2:${encodeURIComponent(value)}`).setTitle('FSMM Middleman Request');const a=new TextInputBuilder().setCustomId('you').setLabel('What are YOU giving?').setPlaceholder('Your items / brainrots').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900);const b=new TextInputBuilder().setCustomId('their').setLabel('What is the OTHER TRADER giving?').setPlaceholder('Their items / brainrots').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900);const c=new TextInputBuilder().setCustomId('other').setLabel('Other trader username').setPlaceholder('@username').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);const d=new TextInputBuilder().setCustomId('tip').setLabel('What are you tipping?').setPlaceholder('Optional').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(300);return m.addComponents(row(a),row(b),row(c),row(d))}\nfunction fsmmPaintModal(base){const m=new ModalBuilder().setCustomId(`fsmm_paint_modal_v2:${encodeURIComponent(base)}`).setTitle(`${base} Base Painting`);const a=new TextInputBuilder().setCustomId('roblox').setLabel('Roblox username').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);const b=new TextInputBuilder().setCustomId('payment').setLabel('What is your payment?').setPlaceholder('Payment amount / offer').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(300);const c=new TextInputBuilder().setCustomId('collateral').setLabel('What is your collateral?').setPlaceholder('Collateral you are providing').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);const d=new TextInputBuilder().setCustomId('notes').setLabel('Extra details (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(900);return m.addComponents(row(a),row(b),row(c),row(d))}\n\nclient.on('interactionCreate',async interaction=>{\n  if(interaction.isStringSelectMenu() && interaction.customId==='fsmm_base_pick'){const value=interaction.values[0];const base=ALL_BASES.find(b=>b.name===value&&b.category==='Mutation');if(!base)return interaction.reply({content:'❌ That base is not available right now.',flags:MessageFlags.Ephemeral});return interaction.showModal(fsmmPaintModal(base.name));}\n  if(interaction.isStringSelectMenu() && interaction.customId==='mm_value'){const value=interaction.values[0];return interaction.showModal(fsmmMmModal(value));}\n  if(interaction.isModalSubmit() && interaction.customId.startsWith('fsmm_paint_modal_v2:')){const base=decodeURIComponent(interaction.customId.split(':').slice(1).join(':'));return createTicket(interaction,'basepainting',{base,roblox:interaction.fields.getTextInputValue('roblox'),payment:interaction.fields.getTextInputValue('payment'),collateral:interaction.fields.getTextInputValue('collateral'),notes:interaction.fields.getTextInputValue('notes')});}\n  if(interaction.isModalSubmit() && interaction.customId.startsWith('fsmm_mm_modal_v2:')){const value=decodeURIComponent(interaction.customId.split(':').slice(1).join(':'));return createTicket(interaction,'middleman',{value,you:interaction.fields.getTextInputValue('you'),their:interaction.fields.getTextInputValue('their'),other:interaction.fields.getTextInputValue('other'),tip:interaction.fields.getTextInputValue('tip')});}\n});\n";
const marker='client.login(TOKEN);';
const pos=source.indexOf(marker);if(pos<0)throw new Error('FSMM boot patch: login marker not found.');
source=source.slice(0,pos)+customListener+source.slice(pos);

const giveawaySetup="\nconst fsmmGiveawayCommand=require('./giveaway')({client,store,saveStore,normalize});\nif(fsmmGiveawayCommand && !commands.some(c=>c.name==='giveaway')) commands.push(fsmmGiveawayCommand);\n";
if(!source.includes("const fsmmGiveawayCommand=require('./giveaway')")) source=source.slice(0,pos)+giveawaySetup+source.slice(pos);

const compiled=new Module(indexPath,module.parent);compiled.filename=indexPath;compiled.paths=Module._nodeModulePaths(path.dirname(indexPath));compiled._compile(source,indexPath);
