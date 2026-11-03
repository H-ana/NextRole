import {experienceLabel} from './experience-policy.mjs?v=153';
import {platformName} from './platform-jobs.mjs?v=116';
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
 const groups=new Set(),index=new Map();
 const employer=j=>norm(j.company).replace(/(?: (?:private limited|pvt ltd|limited|ltd|incorporated|inc|corporation|corp|llc|llp|plc))+$/,'');
 function keys(j){const result=[j.url,...(j.application_links||[]).map(l=>l.url)].map(canonicalLink).filter(Boolean).map(u=>'url:'+u);if(j.id)result.push('id:'+employer(j)+'|'+j.id);if(j.job_requisition_id)result.push('req:'+employer(j)+'|'+String(j.job_requisition_id).toLowerCase().trim());const site=platformName(j.url);if(site){const u=new URL(j.url);let id=site==='LinkedIn'?u.pathname.match(/(?:\/|[-])(\d+)\/?$/)?.[1]:site==='Indeed'?u.searchParams.get('jk'):site==='Naukri'?u.pathname.match(/-(\d{10,})\/?$/)?.[1]:null;if(id)result.push('platform:'+site+'|'+id);}return result;}
 for(const input of items){
  const job={...input,application_links:[...(input.application_links||[])]},identity=keys(job),hits=[...new Set(identity.map(k=>index.get(k)).filter(Boolean))];
  // Exact cross-site descriptions are secondary evidence; titles alone never merge jobs.
  if(!hits.length&&norm(job.description).length>=100){const key='text:'+roleIdentity(job)+'|'+norm(job.description),same=index.get(key);if(same&&platformName(same.url)!==platformName(job.url))hits.push(same);if(!same)identity.push(key);}
  const existing=hits[0]||job;if(!hits.length){groups.add(job);job.alias_ids=[...new Set([job.id,...(job.alias_ids||[])])];}
  for(const copy of [job,...hits.slice(1)]){
   const links=[{url:copy.url,platform:platformName(copy.url)||'Company careers'},...(copy.application_links||[]),...(existing.application_links||[])].filter(l=>publicLink(l.url));
   existing.application_links=[...new Map(links.map(l=>[canonicalLink(l.url),l])).values()];existing.alias_ids=[...new Set([...(existing.alias_ids||[]),copy.id,...(copy.alias_ids||[])])];existing.listed_on=[...new Set([...(existing.listed_on||[]),...(copy.listed_on||[])])];
   if(!platformName(copy.url)&&platformName(existing.url)){existing.url=copy.url;existing.source=copy.source;existing.description=copy.description;existing.experience_requirement=copy.experience_requirement||existing.experience_requirement;}
   if(Number.isFinite(copy.relevance_score))existing.relevance_score=Math.max(existing.relevance_score||0,copy.relevance_score);
   if(copy!==existing&&groups.has(copy)){groups.delete(copy);for(const [key,value] of index)if(value===copy)index.set(key,existing);}
  }
  for(const key of identity)index.set(key,existing);
 }
 return [...groups];
}
export function matchExplanation(job,resume,confirmedYears){
 if(!resume.trim())return 'Upload your resume to see the evidence behind this match.';
 const normalized=norm(resume),skills=(job.skills||[]).filter(s=>(' '+normalized+' ').includes(' '+norm(s)+' '));
 const gaps=job.agent?.requirements?.filter(r=>['missing','partial'].includes(r.status)).slice(0,2).map(r=>r.requirement)||[];
 const parts=[];if(skills.length)parts.push('Resume mentions '+skills.slice(0,4).join(', '));
 if(job.experience_requirement){const label=experienceLabel(job,confirmedYears);if(label)parts.push(label.replace(/\.$/,''));}
 else if(Number.isFinite(job.years))parts.push(Number(confirmedYears)>=job.years?`Your confirmed ${confirmedYears} years meet the stated ${job.years}+ year minimum; check domain experience`:`Experience gap: listing asks for ${job.years}+ years; you confirmed ${confirmedYears}`);
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
 const notifications=[...fresh.map(j=>({key:context+'|'+jobIdentity(j),title:j.title,company:j.company,url:publicLink(j.url),posted:j.date_posted||null,discovered:now,seen:false,experience_requirement:j.experience_requirement,description:(j.experience_requirement?.quotes||[]).join('\n')})),...(state.notifications||[])];
 const contexts={...(state.contexts||{}),[context]:[...new Set([...seen,...jobs.map(jobIdentity)])].slice(-5000)};
 while(Object.keys(contexts).length>6)delete contexts[Object.keys(contexts)[0]];
 return {contexts,notifications:[...new Map(notifications.map(n=>[n.key,n])).values()].slice(0,50)};
}
const KEY='nextrole-opportunities-v1';
export function setupOpportunityTools({onChange,onOpenJob,storage=localStorage,allowJob=()=>true}){
 let state={feedback:[],contexts:{},notifications:[]};try{const value=JSON.parse(storage.getItem(KEY)||'null');if(value&&Array.isArray(value.feedback)&&Array.isArray(value.notifications)&&value.contexts)state=value;}catch{}
 state.notifications=state.notifications.filter(allowJob);
 const status=document.createElement('p');status.className='opportunity-status';status.setAttribute('role','status');document.querySelector('.results-title').after(status);
 const controls=document.createElement('details');controls.className='feedback-controls';controls.innerHTML='<summary>Recommendation preferences</summary><p>Dismissed jobs are hidden. Similar roles are moved lower based on your reasons; your resume and eligibility scores stay unchanged.</p><button class="secondary" type="button">Reset job feedback</button>';status.after(controls);
 const bell=document.createElement('button');bell.type='button';bell.className='inbox-bell';(document.querySelector('#header-actions')||document.querySelector('header')).append(bell);
 const alerts=document.createElement('dialog');alerts.id='new-match-alerts';document.body.append(alerts);
 const feedbackDialog=document.createElement('dialog');feedbackDialog.id='job-feedback-dialog';document.body.append(feedbackDialog);
 function save(){try{storage.setItem(KEY,JSON.stringify(state));status.textContent='';}catch{status.textContent='Browser storage is unavailable. These updates will last only for this session.';}}
 function render(){const count=state.notifications.filter(n=>allowJob(n)&&!n.seen).length;bell.textContent='✦ New matches'+(count?' ('+count+')':'');bell.setAttribute('aria-label','New job matches, '+count+' unseen');controls.querySelector('summary').textContent='Recommendation preferences'+(state.feedback.length?' · '+state.feedback.length+' dismissed':'');}
 controls.querySelector('button').onclick=()=>{state.feedback=[];save();render();onChange();};
 bell.onclick=()=>{
  alerts.innerHTML='<button type="button" class="inbox-close" aria-label="Close job alerts">×</button><h2>New matching jobs</h2><div data-alerts></div><button class="secondary" data-seen>Mark all seen</button>';
  alerts.querySelector('.inbox-close').onclick=()=>alerts.close();
  const list=alerts.querySelector('[data-alerts]');
  for(const n of state.notifications.filter(allowJob)){const row=document.createElement('article');row.className='referral-record';row.innerHTML=`<h3>${html(n.title)}</h3><p>${html(n.company)}</p><p>Source posted: ${html(n.posted||'Date unavailable')}<br>Discovered by NextRole: ${html(new Date(n.discovered).toLocaleString())}</p>${publicLink(n.url)?`<a href="${html(publicLink(n.url))}" target="_blank" rel="noopener noreferrer">Open job ↗</a>`:''}`;list.append(row);}
  if(!state.notifications.some(allowJob))list.textContent='No new matches yet. Find jobs with your resume to set the baseline.';
  alerts.querySelector('[data-seen]').onclick=()=>{state.notifications=state.notifications.map(n=>({...n,seen:true}));save();render();};alerts.showModal();
 };
 function dismiss(job){
  feedbackDialog.innerHTML='<form><h2>Why isn’t this role a fit?</h2><p data-job></p><label>Reason<select name="reason">'+['Wrong role','Wrong seniority','Wrong location','Wrong work style','Not interested in this job'].map(r=>'<option>'+r+'</option>').join('')+'</select></label><p>This hides this job and adjusts ordering for similar roles. Reset your feedback anytime.</p><button type="submit">Dismiss job</button> <button type="button" class="secondary" data-cancel>Cancel</button></form>';
  feedbackDialog.querySelector('[data-job]').textContent=job.title+' · '+job.company;
  feedbackDialog.querySelector('[data-cancel]').onclick=()=>feedbackDialog.close();
  feedbackDialog.querySelector('form').onsubmit=e=>{e.preventDefault();state.feedback=[{key:jobIdentity(job),title:job.title,location:job.location,style:job.style,reason:feedbackDialog.querySelector('select').value},...state.feedback.filter(f=>f.key!==jobIdentity(job))].slice(0,100);save();render();feedbackDialog.close();onChange();};feedbackDialog.showModal();
 }
 render();return {dismiss,refresh:render,hidden:job=>state.feedback.some(f=>f.key===jobIdentity(job)),penalty:job=>feedbackPenalty(job,state.feedback),observe(jobs,context,ranked){state={...state,...collectNewMatches(state,jobs.filter(j=>allowJob(j)&&!this.hidden(j)),context,ranked)};save();render();}};
}
