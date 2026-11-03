// Match the named employer only; mentioning an MNC client/tool does not qualify.
export function normalizeEmployer(value){
 let name=String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const suffix=/\s+(?:private limited|pvt ltd|pvt limited|pte ltd|limited|ltd|incorporated|inc|corporation|corp|llc|llp|plc)$/;
 while(suffix.test(name))name=name.replace(suffix,'').trim();
 return name;
}
export function employerIndex(registry){
 return new Map((registry?.companies||[]).flatMap(row=>[row.name,...(row.aliases||[])].map(alias=>[normalizeEmployer(alias),row])));
}
export function isMncEmployer(job,index){return index.has(normalizeEmployer(job.company));}
export function mncListings(jobs,index){return jobs.filter(job=>isMncEmployer(job,index));}
