const http=require('http');
const https=require('https');

const SOURCE=String(process.env.CRAFT_SOURCE_URL||'').trim();
const TARGET=`http://127.0.0.1:${process.env.PORT||3000}/craft/update`;
const INTERVAL=Math.max(30,Number(process.env.CRAFT_SOURCE_POLL_SECONDS||120))*1000;
const TOKEN=String(process.env.CRAFT_COLLECTOR_TOKEN||'');

function request(url,options={},body=null){
  return new Promise((resolve,reject)=>{
    const u=new URL(url); const lib=u.protocol==='https:'?https:http;
    const req=lib.request(u,{method:options.method||'GET',headers:options.headers||{}},res=>{
      let raw=''; res.setEncoding('utf8');
      res.on('data',c=>raw+=c);
      res.on('end',()=>resolve({status:res.statusCode||0,headers:res.headers,body:raw}));
    });
    req.on('error',reject);
    req.setTimeout(15000,()=>req.destroy(new Error('timeout')));
    if(body)req.write(body);
    req.end();
  });
}

function extract(raw,contentType=''){
  let body=raw;
  if(contentType.includes('json')){try{return JSON.parse(raw)}catch{return null}}
  try{return JSON.parse(raw)}catch{}
  const blocks=[];
  for(const m of raw.matchAll(/<script[^>]*>([\\s\\S]*?)<\\/script>/gi))blocks.push(m[1]);
  for(const b of blocks){
    const text=b.trim();
    if(!text)continue;
    try{const v=JSON.parse(text); if(v)return v}catch{}
    const candidates=text.match(/\\[[\\s\\S]*?\\]/g)||[];
    for(const c of candidates){try{const v=JSON.parse(c); if(Array.isArray(v)&&v.length)return v}catch{}}
  }
  const names=[...raw.matchAll(/(?:brainrot|name|title)\\s*[:=]\\s*["']([^"']+)["']/gi)].map(m=>m[1].trim()).filter(Boolean);
  return names.length?names.map(name=>({name})):null;
}

function normalize(body){
  const list=Array.isArray(body)?body:(body?.brainrots||body?.items||body?.recipes||body?.selected||body?.available||body?.data);
  if(!Array.isArray(list)||!list.length)return null;
  const out=list.map(v=>{
    if(typeof v==='string')return {name:v};
    if(!v||typeof v!=='object')return null;
    const name=v.name||v.brainrot||v.target||v.output||v.title;
    if(!name)return null;
    return {name:String(name).trim(),time:v.time||v.craftingTime||v.craftTime||null,requirements:v.requirements||v.recipe||v.ingredients||null};
  }).filter(x=>x&&x.name);
  return out.length?out:null;
}

async function poll(){
  if(!SOURCE)return;
  try{
    const r=await request(SOURCE,{headers:{accept:'application/json,text/html;q=0.9,*/*;q=0.8','user-agent':'FSMM-Craft-Source/1.0'}});
    if(r.status<200||r.status>=300)throw new Error(`source HTTP ${r.status}`);
    const data=extract(r.body,String(r.headers['content-type']||''));
    const items=normalize(data);
    if(!items||items.length<5){
      console.log('[CRAFT SOURCE] source returned no valid 5-item rotation; ignoring');
      return;
    }
    const payload=JSON.stringify({items:items.slice(0,5)});
    const headers={'content-type':'application/json','content-length':Buffer.byteLength(payload)};
    if(TOKEN)headers.authorization=`Bearer ${TOKEN}`;
    const pushed=await request(TARGET,{method:'POST',headers},payload);
    if(pushed.status<200||pushed.status>=300)throw new Error(`collector HTTP ${pushed.status}`);
    console.log(`[CRAFT SOURCE] synced ${Math.min(5,items.length)} live items`);
  }catch(e){console.log(`[CRAFT SOURCE] ${e.message}`)}
}

if(SOURCE){
  console.log(`[CRAFT SOURCE] enabled: ${SOURCE}`);
  poll();
  setInterval(poll,INTERVAL);
}else{
  console.log('[CRAFT SOURCE] no external live source configured; tracker will not invent rotations');
}
