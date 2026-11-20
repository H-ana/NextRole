import {HIRING_CITIES,canonicalCity} from './locations.mjs?v=168';
const ROOT='https://raw.githubusercontent.com/H-ana/NextRole/main/nextrole/dist/';
const slug=city=>city.toLowerCase().replaceAll(' ','-');
const ALLOWED=new Set([...HIRING_CITIES.map(slug),'other','remote']);
export function selectedDeliveryKeys(preferences={}){if(preferences.workstyle==='Remote')return new Set(['remote']);const cities=(preferences.cities||[]).map(canonicalCity).filter(Boolean);if(preferences.include_nearby&&cities.some(c=>['Gurugram','Noida','New Delhi'].includes(c)))cities.push('Gurugram','Noida','New Delhi');return cities.length?new Set([...cities.map(slug),'other','remote']):ALLOWED;}
export function deliveryParts(index,preferences={}){
 if(index?.format!=='nextrole-job-index'||index.version!==1||!Number.isFinite(index.generated_at)||!Array.isArray(index.shards)||index.shards.length>400)throw Error('Invalid delivery index');
 const keys=selectedDeliveryKeys(preferences);
 return index.shards.filter(part=>{if(!ALLOWED.has(part.key)||!/^job-feeds\/[a-z-]+-\d+-[a-f0-9]{16}\.json\.gz$/.test(part.url)||!Number.isInteger(part.bytes)||part.bytes<1||part.bytes>3_000_000)throw Error('Invalid job shard');return keys.has(part.key);});
}
async function read(url,refresh,timeout=20000){const response=await fetch(url,{cache:refresh?'reload':'no-cache',signal:AbortSignal.timeout(timeout)});if(!response.ok)throw Error('Delivery unavailable');let text;if(url.endsWith('.gz')){const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>3_000_000)throw Error('Delivery too large');const stream=new Blob([bytes]).stream();text=bytes[0]===31&&bytes[1]===139?await new Response(stream.pipeThrough(new DecompressionStream('gzip'))).text():new TextDecoder().decode(bytes);}else text=await response.text();if(text.length>3_000_000)throw Error('Delivery too large');return JSON.parse(text);}
let indices=null,indexRead=0,indexPending=null;
export async function preloadJobIndex(refresh=false){
 if(indices&&!refresh&&Date.now()-indexRead<120000)return indices;if(indexPending)return indexPending;
 indexPending=(async()=>{const reads=await Promise.allSettled([ROOT,new URL('./',import.meta.url).href].map(async base=>{const index=await read(base+'jobs-index.json',refresh,5000);deliveryParts(index);if(index.generated_at>Date.now()/1000+300)throw Error('Invalid index timestamp');return {base,index};}));
  const valid=reads.filter(r=>r.status==='fulfilled').map(r=>r.value).sort((a,b)=>b.index.generated_at-a.index.generated_at);if(!valid.length)throw Error('Delivery unavailable');indices=valid;indexRead=Date.now();return valid;
 })().finally(()=>indexPending=null);return indexPending;
}
export async function loadJobDelivery(preferences={},refresh=false,validate=rows=>rows){
 const candidates=await preloadJobIndex(refresh);
 for(const {base,index} of candidates){const parts=deliveryParts(index,preferences),jobs=[],errors=[];let next=0;
  await Promise.all(Array.from({length:Math.min(4,parts.length)},async()=>{while(next<parts.length){const part=parts[next++];try{jobs.push(...validate(await read(base+part.url,refresh)));}catch(error){errors.push(error);}}}));
  if(errors.length&&!jobs.length)continue;
  return {...index,format:'nextrole-public-jobs',jobs:[...new Map(jobs.map(j=>[j.id,j])).values()],delivery_partial:!!errors.length,delivery_bytes:parts.reduce((n,p)=>n+p.bytes,0)};
 }
 throw Error('Selected job feeds could not be loaded');
}
