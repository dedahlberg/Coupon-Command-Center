/**
 * Coupon Command Center - Step 3 live refresh
 * Uses only public source pages and preserves provider redemption.
 * It does NOT copy/generate coupon barcodes or bypass provider controls.
 *
 * Node 20+ (GitHub Actions runner supports built-in fetch).
 */
const fs = require("fs");

const OUT = "live-offers.json";
const UA = "CouponCommandCenter/0.3 (+public offer index; redemption stays with source)";

async function get(url) {
  const r = await fetch(url, {headers: {"user-agent": UA}});
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return await r.text();
}
function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}
function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70)}

async function grocerySmarts(){
  const url="https://www.grocerysmarts.com/";
  const html=await get(url), t=text(html);
  const count=(t.match(/(\d+)\s+Active coupons today/i)||[])[1];
  // Conservative parser: extract coupon-like phrases around common value patterns.
  const matches=[...t.matchAll(/(\$\d+(?:\.\d{2})?\/\d)\s+(.{8,130}?)(?=(?:\$\d+(?:\.\d{2})?\/\d)|Pick your store|Desktop view|$)/g)];
  const offers=[];
  for(const m of matches.slice(0,120)){
    const value=m[1], title=m[2].replace(/\s*(coupons\.com|Print)\s*/gi," ").trim();
    if(title.length<8) continue;
    offers.push({
      id:`gs-${slug(value+"-"+title)}`, brand:title.split(" ")[0], title, value,
      source:"GrocerySmarts", type:"Printable", expires:"See source", url,
      terms:"Open source for current eligibility, expiration and authorized print flow."
    });
  }
  return {offers, meta:{status:"active",count:Number(count||offers.length),refreshedAt:new Date().toISOString()}};
}

async function lozo(){
  const url="https://lozo.com/?hl=en_US";
  const html=await get(url), t=text(html);
  const count=(t.match(/(\d[\d,]*)\s+printable grocery coupons/i)||[])[1];
  // LOZO's page is highly dynamic. Record source health/count; don't fabricate individual offers.
  return {offers:[], meta:{status:"active",count:count?Number(count.replace(/,/g,"")):null,refreshedAt:new Date().toISOString(),note:"Directory indexed; individual redemption remains on LOZO/originating providers."}};
}

async function run(){
  const previous=JSON.parse(fs.readFileSync(OUT,"utf8"));
  const summary={};
  let offers=[];
  for(const [name,fn] of [["grocerysmarts",grocerySmarts],["lozo",lozo]]){
    try{const r=await fn();summary[name]=r.meta;offers.push(...r.offers)}
    catch(e){summary[name]={status:"error",error:String(e),refreshedAt:new Date().toISOString()}}
  }
  summary.couponscom={status:"link-only",note:"Provider keeps phone verification and print limits in its own flow."};
  summary.fetch={status:"personalized-link-only",note:"Offers vary by Fetch account; open Fetch for actual eligible offers."};

  // Fail-safe: retain last known offers if a refresh yields nothing.
  if(!offers.length) offers=previous.offers||[];
  const out={generatedAt:new Date().toISOString(),status:"automated",sourceSummary:summary,offers};
  fs.writeFileSync(OUT,JSON.stringify(out,null,2)+"\n");
  console.log(`Wrote ${offers.length} normalized offers to ${OUT}`);
}
run().catch(e=>{console.error(e);process.exit(1)});
