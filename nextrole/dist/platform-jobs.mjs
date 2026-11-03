
export function platformName(value){
 try{const p=new URL(value),host=p.hostname;
 if(p.protocol!=='https:'||p.username||p.password||p.port)return null;
 if((host==='linkedin.com'||host.endsWith('.linkedin.com'))&&p.pathname.startsWith('/jobs/view/'))return 'LinkedIn';
 if((host==='naukri.com'||host.endsWith('.naukri.com'))&&p.pathname.startsWith('/job-listings-'))return 'Naukri';
 if(['indeed.com','indeed.co.in'].some(base=>host===base||host.endsWith('.'+base))&&/\/(?:m\/)?viewjob|\/rc\/clk/.test(p.pathname)&&p.searchParams.get('jk'))return 'Indeed';
 if(['glassdoor.com','glassdoor.co.in','glassdoor.co.uk','glassdoor.fr'].some(base=>host===base||host.endsWith('.'+base))&&/\/job-listing\/|\/partner\/jobListing/i.test(p.pathname))return 'Glassdoor';
 if((host==='ziprecruiter.com'||host.endsWith('.ziprecruiter.com'))&&/\/(jobs|c|k|job)\//i.test(p.pathname))return 'ZipRecruiter';
 if((host==='bayt.com'||host.endsWith('.bayt.com'))&&/\/jobs\/[^/]+-\d+\/?$/.test(p.pathname))return 'Bayt';
 if((host==='bdjobs.com'||host.endsWith('.bdjobs.com'))&&/jobdetail|jobdetails/i.test(p.pathname))return 'BDJobs';
 if((host==='hellowork.com'||host.endsWith('.hellowork.com'))&&/\/emplois\/\d+/.test(p.pathname))return 'HelloWork';
 }catch{}return null;
}

export function applicationLabel(job){return platformName(job.url)?`Apply on ${platformName(job.url)} →`:'Apply on careers site →';}

export function matchesJobSite(job,site='all'){
 if(site==='all')return true;
 const sites=new Set([job.url,...(job.application_links||[]).map(link=>link.url)].map(platformName).filter(Boolean));
 if(site==='careers')return (job.application_links||[]).some(link=>!platformName(link.url)&&/^https:\/\//.test(link.url))||!sites.size&&!/^(platform|manual):/.test(job.source||'');
 return sites.has(site);
}

export function platformSearches({query='',cities=[],workstyle='any'}={}){
 const location=workstyle==='Remote'?'India':cities.length===1?cities[0]+', India':'India';
 const keywords=[query.trim(),workstyle==='Remote'?'remote':''].filter(Boolean).join(' ');
 const linkedin=new URL('https://www.linkedin.com/jobs/search/');
 linkedin.searchParams.set('keywords',keywords);linkedin.searchParams.set('location',location);
 if(workstyle==='Remote')linkedin.searchParams.set('f_WT','2');
 const slug=keywords.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 const city=workstyle!=='Remote'&&cities.length===1?cities[0].toLowerCase().replace(/[^a-z0-9]+/g,'-'):'india';
 const indeed=new URL('https://in.indeed.com/jobs');indeed.searchParams.set('q',keywords);indeed.searchParams.set('l',location);
 return {linkedin:linkedin.href,naukri:`https://www.naukri.com/${slug?slug+'-':''}jobs-in-${city}`,indeed:indeed.href};
}

const MANUAL_KEY='nextrole-manual-jobs-v1';
export function manualExperienceRequirement(description){
 const text=String(description).split(/preferred qualifications|nice.to.have|preferred experience/i)[0],quotes=[],bands=[];
 const pattern=/\b(\d{1,2})(?:\s*[-–—]\s*(\d{1,2}))?\s*(\+)?\s*(?:years|yrs)(?:\s+of)?\s+(?:[a-z/-]+\s+){0,5}experience\b/gi;
 for(const match of text.matchAll(pattern)){const minimum=Number(match[1]),maximum=match[2]?Number(match[2]):null;if(minimum>80||maximum!==null&&(maximum<minimum||maximum>80))continue;quotes.push(match[0]);bands.push({minimum,maximum});}
 if(!bands.length)return null;const minimum=Math.max(...bands.map(b=>b.minimum)),upper=bands.filter(b=>b.maximum!==null),maximum=upper.length?Math.min(...upper.map(b=>b.maximum)):null;
 if(maximum!==null&&minimum>maximum)return null;
 return {status:'known',minimum,maximum,quote:quotes[0],quotes,policy_version:'strict-experience-v2'};
}
export async function createManualJob(input,now=Date.now()/1000){
 const body=Object.fromEntries(['url','company','title','location','description'].map(key=>[key,String(input[key]||'').trim()]));
 const site=platformName(body.url);if(!site)throw Error('Paste a direct job link from one of the eight supported platforms.');
 if(!body.company||body.company.length>200||!body.title||body.title.length>300||body.location.length>500||body.description.length<100||body.description.length>80000||body.url.length>2048)throw Error('Enter a company, job title and full description (100–80,000 characters).');
 const url=new URL(body.url);url.hash='';body.url=url.href;const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.url)),id='manual:'+ [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
 const location=body.location||'Location unavailable',style=/\bhybrid\b/i.test(location)?'Hybrid':/\bremote\b/i.test(location)?'Remote':/\bon[- ]site\b/i.test(location)?'On-site':'unknown';
 return {...body,id,location,style,source:'manual:browser',listed_on:[site],application_links:[{platform:site,url:body.url}],collection_method:'Added by you',last_checked:now,experience_requirement:manualExperienceRequirement(body.description),skills:[]};
}
export function readManualJobs(storage){try{const rows=JSON.parse(storage.getItem(MANUAL_KEY)||'[]');return Array.isArray(rows)?rows.slice(0,100).filter(j=>j&&typeof j.id==='string'&&j.id.startsWith('manual:')&&platformName(j.url)&&typeof j.company==='string'&&j.company.length<=200&&typeof j.title==='string'&&j.title.length<=300&&typeof j.location==='string'&&j.location.length<=500&&typeof j.description==='string'&&j.description.length>=100&&j.description.length<=80000&&Number.isFinite(j.last_checked)&&j.last_checked>Date.now()/1000-7*86400).map(j=>({...j,experience_requirement:manualExperienceRequirement(j.description)})):[];}catch{return [];}}
export async function saveManualJob(storage,input){const job=await createManualJob(input),rows=readManualJobs(storage).filter(j=>j.id!==job.id);try{storage.setItem(MANUAL_KEY,JSON.stringify([job,...rows].slice(0,100)));}catch{throw Error('Browser storage could not save this job. Free some space and try again.');}return job;}

export function setupPlatformJobs({getPreferences,onImported,localOnly=false,storage=globalThis.localStorage}){
 const toolbar=document.querySelector('.toolbar');
 const section=document.createElement('div');section.className='platform-sources';
 section.innerHTML='<p>Explore job sites <small>Search LinkedIn, Naukri and Indeed with your selected keywords and location. Applications are completed on the employer or job site.</small></p><div><a id="search-linkedin" class="secondary" target="_blank" rel="noopener noreferrer">Search LinkedIn ↗</a><a id="search-naukri" class="secondary" target="_blank" rel="noopener noreferrer">Search Naukri ↗</a><a id="search-indeed" class="secondary" target="_blank" rel="noopener noreferrer">Search Indeed ↗</a></div><span id="platform-status" role="status"></span>';
 toolbar.before(section);
 const update=()=>{const urls=platformSearches(getPreferences());for(const name of ['linkedin','naukri','indeed'])section.querySelector('#search-'+name).href=urls[name];};
 document.addEventListener('input',update);document.addEventListener('change',update);update();
}
