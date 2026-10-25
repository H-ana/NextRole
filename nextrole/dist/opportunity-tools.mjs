import {platformName} from './platform-jobs.mjs?v=91';
const norm=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function publicLink(value){try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}return '';}
export function canonicalLink(value){try{const u=new URL(publicLink(value));u.hash='';for(const k of [...u.searchParams.keys()])if(/^(utm_|source$|ref$|referral$|tracking|gh_src|trk$)/i.test(k))u.searchParams.delete(k);return u.href;}catch{return '';}}
export function additionalApplicationLinks(job){
 const seenUrls=new Set([canonicalLink(job.url)]),seenSites=new Set([platformName(job.url)||'Company careers']);
 return (job.application_links||[]).flatMap(link=>{
  const url=publicLink(link.url),canonical=canonicalLink(url),platform=platformName(url)||'Company careers';
  if(!url||seenUrls.has(canonical)||seenSites.has(platform))return [];
  seenUrls.add(canonical);seenSites.add(platform);return [{url,platform}];
 });
}
const roleIdentity=job=>norm(job.company)+'|'+norm(job.title)+'|'+norm(job.location);
export function jobIdentity(job){
 const links=[job.url,...(job.application_links||[]).map(l=>l.url)].map(canonicalLink).filter(Boolean);
 const direct=links.filter(url=>!platformName(url)).sort();
 return roleIdentity(job)+'|'+(direct[0]||links.sort()[0]||job.id);
}
export function deduplicateJobs(items){
 const groups=[];
 for(const input of items){
  const job={...input,application_links:[...(input.application_links||[])]},url=canonicalLink(job.url);
  // Same title/location alone is insufficient: distinct requisition IDs on the
  // same site remain separate. Cross-site grouping also needs matching text.
  const existing=groups.find(g=>canonicalLink(g.url)===url&&url||roleIdentity(g)===roleIdentity(job)&&platformName(g.url)!==platformName(job.url)&&norm(g.description)===norm(job.description)&&norm(job.description).length>=100);
  const links=[{url:job.url,platform:platformName(job.url)||'Company careers'},...job.application_links].filter(l=>publicLink(l.url));
  if(!existing){job.application_links=[...new Map(links.map(l=>[canonicalLink(l.url),l])).values()];job.alias_ids=[job.id];groups.push(job);continue;}
  existing.application_links=[...new Map([...existing.application_links,...links].map(l=>[canonicalLink(l.url),l])).values()];existing.alias_ids=[...new Set([...existing.alias_ids,job.id])];
  existing.listed_on=[...new Set([...(existing.listed_on||[]),...(job.listed_on||[])])];
  if(!platformName(job.url)&&platformName(existing.url)){existing.url=job.url;existing.description=job.description;}
  if(Number.isFinite(job.relevance_score))existing.relevance_score=Math.max(existing.relevance_score||0,job.relevance_score);
 }
 return groups;
}
export function matchExplanation(job,resume,confirmedYears){
 if(!resume.trim())return 'Upload your resume to see the evidence behind this match.';
 const normalized=norm(resume),skills=(job.skills||[]).filter(s=>(' '+normalized+' ').includes(' '+norm(s)+' '));
 const gaps=job.agent?.requirements?.filter(r=>['missing','partial'].includes(r.status)).slice(0,2).map(r=>r.requirement)||[];
 const parts=[];if(skills.length)parts.push('Resume mentions '+skills.slice(0,4).join(', '));
 if(Number.isFinite(job.years))parts.push(Number(confirmedYears)>=job.years?`Your confirmed ${confirmedYears} years meet the stated ${job.years}+ year minimum; check domain experience`:`Experience gap: listing asks for ${job.years}+ years; you confirmed ${confirmedYears}`);
 if(gaps.length)parts.push('Review: '+gaps.join('; '));
 if(!parts.length)parts.push('Related responsibilities found by local ranking; qualifications need review');
 return parts.join('. ')+'.';
}
export function feedbackPenalty(job,feedback){
 let penalty=0;for(const entry of feedback){
  if(entry.reason==='Wrong role'&&norm(entry.title)===norm(job.title))penalty+=12;
  if(entry.reason==='Wrong location'&&norm(entry.location)===norm(job.location))penalty+=8;
  if(entry.reason==='Wrong work style'&&entry.style&&entry.style!=='unknown'&&entry.style===job.style)penalty+=8;
  if(entry.reason==='Wrong seniority'){const level=norm(entry.title).match(/\b(senior|lead|principal|junior|intern|director|manager)\b/)?.[1];if(level&&norm(job.title).split(' ').includes(level))penalty+=10;}
 }return Math.min(30,penalty);
}
export function preferenceKey(resume,preferences){let hash=2166136261;for(const c of resume+'|'+JSON.stringify(preferences)){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16);}
export function collectNewMatches(state,jobs,context,ranked,now=Date.now()){
 if(!ranked)return state;
 const prior=state.contexts?.[context],seen=new Set(prior||[]),fresh=prior?jobs.filter(j=>!seen.has(jobIdentity(j))&&typeof j.relevance_score==='number'&&j.relevance_score>=70):[];
 const notifications=[...fresh.map(j=>({key:context+'|'+jobIdentity(j),title:j.title,company:j.company,url:publicLink(j.url),posted:j.date_posted||null,discovered:now,seen:false})),...(state.notifications||[])];
 const contexts={...(state.contexts||{}),[context]:[...new Set([...seen,...jobs.map(jobIdentity)])].slice(-5000)};
 while(Object.keys(contexts).length>6)delete contexts[Object.keys(contexts)[0]];
 return {contexts,notifications:[...new Map(notifications.map(n=>[n.key,n])).values()].slice(0,50)};
}
const KEY='nextrole-opportunities-v1';
export function setupOpportunityTools({onChange,onOpenJob,storage=localStorage}){
 let state={feedback:[],contexts:{},notifications:[]};try{const value=JSON.parse(storage.getItem(KEY)||'null');if(value&&Array.isArray(value.feedback)&&Array.isArray(value.notifications)&&value.contexts)state=value;}catch{}
 const status=document.createElement('p');status.className='opportunity-status';status.setAttribute('role','status');document.querySelector('.results-title').after(status);
 const controls=document.createElement('details');controls.className='feedback-controls';controls.innerHTML='<summary>Recommendation preferences</summary><p>Dismissed jobs are hidden. Similar roles are moved lower based on your reasons; your resume and eligibility scores stay unchanged.</p><button class="secondary" type="button">Reset job feedback</button>';status.after(controls);
 const bell=document.createElement('button');bell.type='button';bell.className='inbox-bell';document.querySelector('header').append(bell);
 const alerts=document.createElement('dialog');alerts.id='new-match-alerts';document.body.append(alerts);
 const feedbackDialog=document.createElement('dialog');feedbackDialog.id='job-feedback-dialog';document.body.append(feedbackDialog);
 function save(){try{storage.setItem(KEY,JSON.stringify(state));status.textContent='';}catch{status.textContent='Browser storage is unavailable. These updates will last only for this session.';}}
 function render(){const count=state.notifications.filter(n=>!n.seen).length;bell.textContent='✦ New matches'+(count?' ('+count+')':'');bell.setAttribute('aria-label','New job matches, '+count+' unseen');controls.querySelector('summary').textContent='Recommendation preferences'+(state.feedback.length?' · '+state.feedback.length+' dismissed':'');}
 controls.querySelector('button').onclick=()=>{state.feedback=[];save();render();onChange();};
 bell.onclick=()=>{
  alerts.innerHTML='<button type="button" class="inbox-close" aria-label="Close job alerts">×</button><h2>New matching jobs</h2><div data-alerts></div><button class="secondary" data-seen>Mark all seen</button>';
  alerts.querySelector('.inbox-close').onclick=()=>alerts.close();
  const list=alerts.querySelector('[data-alerts]');
  for(const n of state.notifications){const row=document.createElement('article');row.className='referral-record';row.innerHTML=`<h3>${html(n.title)}</h3><p>${html(n.company)}</p><p>Source posted: ${html(n.posted||'Date unavailable')}<br>Discovered by NextRole: ${html(new Date(n.discovered).toLocaleString())}</p>${publicLink(n.url)?`<a href="${html(publicLink(n.url))}" target="_blank" rel="noopener noreferrer">Open job ↗</a>`:''}`;list.append(row);}
  if(!state.notifications.length)list.textContent='No new matches yet. Find jobs with your resume to set the baseline.';
  alerts.querySelector('[data-seen]').onclick=()=>{state.notifications=state.notifications.map(n=>({...n,seen:true}));save();render();};alerts.showModal();
 };
 function dismiss(job){
  feedbackDialog.innerHTML='<form><h2>Why isn’t this role a fit?</h2><p data-job></p><label>Reason<select name="reason">'+['Wrong role','Wrong seniority','Wrong location','Wrong work style','Not interested in this job'].map(r=>'<option>'+r+'</option>').join('')+'</select></label><p>This hides this job and adjusts ordering for similar roles. Reset your feedback anytime.</p><button type="submit">Dismiss job</button> <button type="button" class="secondary" data-cancel>Cancel</button></form>';
  feedbackDialog.querySelector('[data-job]').textContent=job.title+' · '+job.company;
  feedbackDialog.querySelector('[data-cancel]').onclick=()=>feedbackDialog.close();
  feedbackDialog.querySelector('form').onsubmit=e=>{e.preventDefault();state.feedback=[{key:jobIdentity(job),title:job.title,location:job.location,style:job.style,reason:feedbackDialog.querySelector('select').value},...state.feedback.filter(f=>f.key!==jobIdentity(job))].slice(0,100);save();render();feedbackDialog.close();onChange();};feedbackDialog.showModal();
 }
 render();return {dismiss,hidden:job=>state.feedback.some(f=>f.key===jobIdentity(job)),penalty:job=>feedbackPenalty(job,state.feedback),observe(jobs,context,ranked){state={...state,...collectNewMatches(state,jobs.filter(j=>!this.hidden(j)),context,ranked)};save();render();}};
}
