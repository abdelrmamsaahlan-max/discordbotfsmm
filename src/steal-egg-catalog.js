/**
 * Curated Steal an Egg pet catalog.
 * This is validation data, not a live spawn source.
 * Values are BASE income; mutations/size/bonuses can change actual $/s.
 * "disputed" entries are never silently treated as certain.
 */
const entries = [
  {name:"King Snake", rarity:"SECRET", baseIncome:3500000, location:"Jungle", eggName:"King Snake Egg", confidence:"high"},
  {name:"Yeti", rarity:"SECRET", baseIncome:5000000, location:"Snow", eggName:"Yeti Egg", confidence:"high"},
  {name:"Cerberus", rarity:"SECRET", baseIncome:8000000, location:"Volcano", eggName:"Cerberus Egg", confidence:"high"},
  {name:"Kraken", rarity:"SECRET", baseIncome:15000000, location:"Abyss Ocean", eggName:"Kraken Egg", confidence:"high", disputed:true, alternateRarities:["ETERNAL"], note:"Some community sources list Kraken as Eternal; current config-focused sources list Secret."},
  {name:"T-Rex", rarity:"SECRET", baseIncome:25000000, location:"Prehistoric", eggName:"T-Rex Egg", confidence:"high"},
  {name:"Tralaledon", rarity:"SECRET", baseIncome:32000000, location:"Prehistoric", eggName:"Tralaledon Egg", confidence:"medium", disputed:true, alternateIncome:[850000,32000000], note:"Published community references disagree on base income."},
  {name:"Cosmic Skeleton Boss", rarity:"SECRET", baseIncome:45000000, location:"Cosmic", eggName:"Cosmic Skeleton Boss Egg", confidence:"medium", disputed:true, alternateIncome:[40000000,45000000]},
  {name:"Cosmic Dragon", rarity:"SECRET", baseIncome:60000000, location:"Cosmic", eggName:"Cosmic Dragon Egg", confidence:"high"},
  {name:"Stag", rarity:"SECRET", baseIncome:145000000, location:"Cherry Blossom", eggName:"Stag Egg", confidence:"high"},
  {name:"Mutant Shark", rarity:"SECRET", baseIncome:215000000, location:"Titan Temple", eggName:"Mutant Shark Egg", confidence:"high"},
  {name:"Ice Dragon", rarity:"ETERNAL", baseIncome:65000000, location:"Snow", eggName:"Ice Dragon Egg", confidence:"high"},
  {name:"Phoenix", rarity:"ETERNAL", baseIncome:85000000, location:"Volcano", eggName:"Phoenix Egg", confidence:"high"},
  {name:"Lava Dragon", rarity:"ETERNAL", baseIncome:100000000, location:"Volcano", eggName:"Lava Dragon Egg", confidence:"high"},
  {name:"El Maja", rarity:"ETERNAL", baseIncome:130000000, location:"Abyss Ocean", eggName:"El Maja Egg", confidence:"high"},
  {name:"Mosasaurus", rarity:"ETERNAL", baseIncome:180000000, location:"Prehistoric", eggName:"Mosasaurus Egg", confidence:"high"},
  {name:"Eternal Lunar Dragon", rarity:"ETERNAL", baseIncome:250000000, location:"Cosmic", eggName:"Eternal Lunar Dragon Egg", confidence:"medium"},
  {name:"Oni Tiger", rarity:"ETERNAL", baseIncome:600000000, location:"Cherry Blossom", eggName:"Oni Tiger Egg", confidence:"high"},
  {name:"Gorilla King", rarity:"ETERNAL", baseIncome:880000000, location:"Titan Temple", eggName:"Gorilla King Egg", confidence:"high"},
  {name:"Unicorn", rarity:"DIVINE", baseIncome:1000000000, location:"Cosmic", eggName:"Unicorn Egg", confidence:"high"},
  {name:"Kitsune", rarity:"DIVINE", baseIncome:1800000000, location:"Cherry Blossom", eggName:"Kitsune Egg", confidence:"high"},
  {name:"Nightflame", rarity:"DIVINE", baseIncome:3000000000, location:"Titan Temple", eggName:"Nightflame Egg", confidence:"medium", disputed:true, note:"Public references disagree on the exact base income; rarity is consistently reported as Divine."},
  {name:"Shattered Colossus", rarity:"DIVINE", baseIncome:3500000000, location:"Angels and Demons", eggName:"Shattered Colossus Egg", confidence:"medium"}
];

const byName = new Map(entries.map(x => [normalizeName(x.name), x]));
function normalizeName(v) {
  return String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function find(name) {
  const n = normalizeName(name);
  return byName.get(n) || byName.get(n.replace(/\begg$/, "").trim()) || null;
}
function formatMoney(n) {
  if (!Number.isFinite(Number(n))) return "Unknown";
  const x = Number(n);
  if (x >= 1e9) return "$" + (x/1e9).toFixed(x%1e9 ? 2 : 0) + "B/s";
  if (x >= 1e6) return "$" + (x/1e6).toFixed(x%1e6 ? 2 : 0) + "M/s";
  if (x >= 1e3) return "$" + (x/1e3).toFixed(x%1e3 ? 1 : 0) + "K/s";
  return "$" + x + "/s";
}
module.exports = { entries, find, formatMoney, normalizeName };
