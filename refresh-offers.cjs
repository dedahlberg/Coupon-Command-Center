/**
 * Coupon Command Center — Step 8 broader live source ingestion.
 *
 * Public-index policy:
 * - Normalize public offer/deal metadata.
 * - Keep redemption with the original provider.
 * - Do not copy or generate coupon barcodes/QR codes.
 * - Do not bypass phone verification, login, print limits, or personalized offers.
 */
const fs = require("fs");
const OUT = "live-offers.json";
const UA = "CouponCommandCenter/0.8 (+public savings index; redemption stays with source)";

async function get(url){
  const r=await fetch(url,{headers:{"user-agent":UA}});
  if(!r.ok) throw new Error(`${url} -> ${r.status}`);
  return await r.text();
}
function plain(html){
  return html
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"')
    .replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
}
function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,90)}
function uniq(arr){
  const map=new Map();
  for(const o of arr){
    const key=`${o.source}|${o.title}|${o.value||""}`.toLowerCase().replace(/\s+/g," ");
    if(!map.has(key)) map.set(key,o);
  }
  return [...map.values()];
}
async function grocerySmarts(){
  const url="https://www.grocerysmarts.com/";
  const html=await get(url), t=plain(html);
  const count=(t.match(/(\d+)\s+Active coupons today/i)||[])[1];
  const matches=[...t.matchAll(/(\$\d+(?:\.\d{2})?\/\d)\s+(.{8,150}?)(?=(?:\$\d+(?:\.\d{2})?\/\d)|Pick your store|Desktop view|$)/g)];
  const offers=[];
  for(const m of matches.slice(0,160)){
    const value=m[1], title=m[2].replace(/\s*(coupons\.com|Print)\s*/gi," ").trim();
    if(title.length<8) continue;
    offers.push({
      id:`gs-${slug(value+"-"+title)}`,brand:title.split(" ")[0],title,value,
      source:"GrocerySmarts",type:"Printable",store:"See source",expires:"See source",url,
      firstSeen:new Date().toISOString(),
      terms:"Open GrocerySmarts/originating provider for current eligibility, expiration and authorized print flow."
    });
  }
  return {offers:uniq(offers),meta:{status:"active",count:Number(count||offers.length),refreshedAt:new Date().toISOString()}};
}
async function kcl(){
  const url="https://thekrazycouponlady.com/deals";
  const html=await get(url), t=plain(html);
  // KCL exposes recent public deal titles followed by "Here's the deal".
  const pieces=t.split(/Here's the deal/i);
  const offers=[];
  for(let i=0;i<pieces.length-1 && offers.length<40;i++){
    const left=pieces[i].trim();
    const candidate=left.slice(Math.max(0,left.length-180)).replace(/\s+/g," ").trim();
    // Heuristic: take sentence/title after last large navigation delimiter.
    const title=candidate.split(/Jump to:|Deals by Store|Deals by Brand|Deals by Category/i).pop().trim();
    if(title.length<12 || title.length>175) continue;
    offers.push({
      id:`kcl-${slug(title)}`,brand:"",title,value:"VIEW DEAL",
      source:"KCL",type:"Store Deal",store:"See source",expires:"See source",url,
      firstSeen:new Date().toISOString(),
      terms:"Public deal-discovery headline. Open KCL for the current retailer, requirements, price and coupon/reward stack."
    });
  }
  return {offers:uniq(offers),meta:{status:"active",count:offers.length,refreshedAt:new Date().toISOString()}};
}
async function lozo(){
  const url="https://lozo.com/?hl=en_US";
  const html=await get(url),t=plain(html);
  const count=(t.match(/(\d[\d,]*)\s+printable grocery coupons/i)||[])[1];
  return {offers:[],meta:{status:"active",count:count?Number(count.replace(/,/g,"")):null,refreshedAt:new Date().toISOString(),note:"Directory indexed; individual redemption stays with LOZO/originating providers."}};
}
async function couponsCom(){
  const url="https://www.coupons.com/printable";
  await get(url);
  return {offers:[],meta:{status:"active",refreshedAt:new Date().toISOString(),note:"Provider page reachable. Printable coupon selection/phone verification/printing remains on Coupons.com."}};
}
async function run(){
  let previous={offers:[]};
  try{previous=JSON.parse(fs.readFileSync(OUT,"utf8"))}catch{}
  const summary={};
  let offers=[];
  for(const [name,fn] of [["grocerysmarts",grocerySmarts],["kcl",kcl],["lozo",lozo],["couponscom",couponsCom]]){
    try{
      const r=await fn();summary[name]=r.meta;offers.push(...r.offers);
    }catch(e){
      summary[name]={status:"error",error:String(e),refreshedAt:new Date().toISOString()};
    }
  }
  summary.fetch={status:"personalized-link-only",note:"Offers vary by account; open Fetch for actual eligible offers."};
  summary.manufacturer={status:"curated-link-layer",note:"Official manufacturer programs remain source-linked unless a provider supplies an authorized feed."};

  offers=uniq(offers);
  // Fail-safe: if broader refresh collapses, retain last known usable offers.
  if(!offers.length && previous.offers?.length) offers=previous.offers;

  const out={
    generatedAt:new Date().toISOString(),
    status:"automated-step8",
    sourceSummary:summary,
    offers
  };
  fs.writeFileSync(OUT,JSON.stringify(out,null,2)+"\n");
  console.log(`Wrote ${offers.length} normalized savings records from public source adapters.`);
}
run().catch(e=>{console.error(e);process.exit(1)});
