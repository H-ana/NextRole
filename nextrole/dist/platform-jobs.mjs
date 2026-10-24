import {findBackend,apiRequest} from './api-client.mjs?v=39';

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
 if(site==='careers')return !sites.size&&!/^(platform|manual):/.test(job.source||'');
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

export function setupPlatformJobs({getPreferences,onImported}){
 const toolbar=document.querySelector('.toolbar');
 const section=document.createElement('div');section.className='platform-sources';
 section.innerHTML='<p>Jobs across platforms <small>LinkedIn, Indeed, Glassdoor, ZipRecruiter, Bayt, Naukri, BDJobs and HelloWork. Coverage depends on your location. Available listings are ranked with your original resume.</small></p><div><a id="search-linkedin" class="secondary" target="_blank" rel="noopener noreferrer">Search LinkedIn ↗</a><a id="search-naukri" class="secondary" target="_blank" rel="noopener noreferrer">Search Naukri ↗</a><a id="search-indeed" class="secondary" target="_blank" rel="noopener noreferrer">Search Indeed ↗</a><button id="add-platform-job" class="secondary" type="button">Add a job</button></div><span id="platform-status" role="status"></span>';
 toolbar.before(section);
 const update=()=>{const urls=platformSearches(getPreferences());for(const name of ['linkedin','naukri','indeed'])section.querySelector('#search-'+name).href=urls[name];};
 document.addEventListener('input',update);document.addEventListener('change',update);update();
 const dialog=document.createElement('dialog');dialog.id='platform-job-dialog';
 dialog.innerHTML='<form id="platform-job-form"><h2>Add a platform job</h2><p>Paste a LinkedIn, Indeed, Glassdoor, ZipRecruiter, Bayt, Naukri, BDJobs or HelloWork job and its full description to check your fit here. Confirm availability on the original site.</p><label>Job link<input name="url" type="url" required placeholder="https://www.linkedin.com/jobs/view/…"></label><label>Company<input name="company" maxlength="200" required></label><label>Job title<input name="title" maxlength="300" required></label><label>Location / work style<input name="location" maxlength="500" placeholder="e.g. Bengaluru, Hybrid or Remote - India"></label><label>Full job description<textarea name="description" minlength="100" maxlength="80000" rows="8" required></textarea></label><p id="platform-import-error" role="alert"></p><div class="permission-actions"><button id="cancel-platform-job" class="secondary" type="button">Cancel</button><button id="save-platform-job" class="primary" type="submit">Add job</button></div></form>';
 document.body.append(dialog);
 section.querySelector('#add-platform-job').onclick=()=>{dialog.querySelector('#platform-import-error').textContent='';dialog.showModal();};
 dialog.querySelector('#cancel-platform-job').onclick=()=>dialog.close();
 dialog.querySelector('form').onsubmit=async event=>{
  event.preventDefault();const button=dialog.querySelector('#save-platform-job');button.disabled=true;
  try{
   const backend=await findBackend();
   if(!(backend.status.capabilities||[]).includes('platform-job-import'))throw new Error('Restart the backend with python start_agent.py to load job imports.');
   const body=Object.fromEntries(new FormData(event.currentTarget));
   const parsed=new URL(body.url);
   if(!platformName(body.url))throw new Error('Paste a direct job link from one of the eight supported platforms.');
   if(platformName(body.url)==='Indeed'&&!(backend.status.capabilities||[]).includes('platform-job-search'))throw new Error('Restart the backend to load Indeed job imports.');
   await apiRequest(backend.origin,'/api/jobs/import',body,30000);
   dialog.close();dialog.querySelector('form').reset();
   section.querySelector('#platform-status').textContent='Job added. Find jobs to rank it with your resume and preferences.';
   await onImported();
  }catch(error){dialog.querySelector('#platform-import-error').textContent=error.message;}
  finally{button.disabled=false;}
 };
}
