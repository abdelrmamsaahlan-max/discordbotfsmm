const http=require('http');
const fs=require('fs');
const path=require('path');

const PORT=Number(process.env.PORT||3000);
const HOST='0.0.0.0';
const TOKEN=process.env.CRAFT_COLLECTOR_TOKEN||'';
const DATA=path.join(__dirname,'..','data','craft-live.json');
const MAX_BODY=64*1024;

function normalize(body){
  const list=Array.isArray(body)?body:(body?.brainrots||body?.items||body?.recipes||body?.selected||body?.available||body?.data);
  if(!Array.isArray(list)||!list.length)return null;
  const out=list.map(v=>{
    if(typeof v==='string')return {name:v};
    if(!v||typeof v!=='object')return null;
    const name=v.name||v.brainrot||v.target||v.output||v.title;
    if(!name)return null;
    return {
      name:String(name).trim(),
      time:v.time||v.craftingTime||v.craftTime||null,
      requirements:v.requirements||v.recipe||v.ingredients||null
    };
  }).filter(x=>x&&x.name);
  return out.length?out:null;
}
function save(items){
  fs.mkdirSync(path.dirname(DATA),{recursive:true});
  const tmp=DATA+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify({items,updatedAt:Date.now()},null,2));
  fs.renameSync(tmp,DATA);
}
function load(){
  try{return JSON.parse(fs.readFileSync(DATA,'utf8'))}catch{return null}
}
function authorized(req){
  if(!TOKEN)return true;
  const h=req.headers.authorization||'';
  return h===`Bearer ${TOKEN}`||req.headers['x-craft-token']===TOKEN;
}
function json(res,status,data){
  const out=JSON.stringify(data);
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':Buffer.byteLength(out)});
  res.end(out);
}
const server=http.createServer((req,res)=>{
  if(req.method==='GET'&&req.url==='/health')return json(res,200,{ok:true,service:'fsmm-craft-collector'});
  if(req.method==='GET'&&req.url==='/craft/current')return json(res,200,load()||{items:[],updatedAt:null});
  if(req.method!=='POST'||req.url!=='/craft/update')return json(res,404,{ok:false,error:'Not found'});
  if(!authorized(req))return json(res,401,{ok:false,error:'Unauthorized'});
  let size=0;let raw='';
  req.on('data',chunk=>{
    size+=chunk.length;
    if(size<=MAX_BODY)raw+=chunk;
  });
  req.on('end',()=>{
    if(size>MAX_BODY)return json(res,413,{ok:false,error:'Payload too large'});
    try{
      const body=JSON.parse(raw||'{}');
      const items=normalize(body);
      if(!items)return json(res,400,{ok:false,error:'Expected a non-empty Brainrot rotation array'});
      save(items);
      console.log(`[CRAFT COLLECTOR] received ${items.length} items`);
      return json(res,200,{ok:true,items:items.length,updatedAt:Date.now()});
    }catch(e){return json(res,400,{ok:false,error:'Invalid JSON'})}
  });
});
server.listen(PORT,HOST,()=>console.log(`[CRAFT COLLECTOR] listening on ${HOST}:${PORT}`));
