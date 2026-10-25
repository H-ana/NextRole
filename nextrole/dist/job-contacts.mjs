import {html,publicLink} from './opportunity-tools.mjs?v=91';
const hiring=/\b(?:recruiter|recruitment|hiring contact|hiring manager|talent acquisition|contact person|send (?:your )?(?:cv|resume|application)|(?:apply|applications?) (?:at|to|via))\b/i;
const excluded=/accommodat|disabilit|privacy|legal|security|compliance|grievance|accessibility|no[-_.]?reply|unsubscribe|support@/i;
export function publishedJobContacts(job){
 const lines=String(job.description||'').split(/\n|(?<=[.!?])\s+(?=[A-Z])/).map(s=>s.trim()).filter(Boolean),contacts=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  // A general contact address (e.g. accessibility assistance) is not a recruiter.
  if(excluded.test(line))continue;
  const context=lines.slice(Math.max(0,i-1),i+1).join(' ');
  if(!hiring.test(context)||excluded.test(context))continue;
  const labelled=line.match(/\b(?:recruiter|hiring contact|hiring manager|contact person|talent acquisition)\s*[:–-]\s*(.+)/i)?.[1]||'';
  const name=labelled.match(/^([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,3})(?=\s*[,|;(—–-]|\s+(?:Email|Phone|LinkedIn)\b|\s*$)/)?.[1]||'';
  const emails=[...line.matchAll(/\b[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}\b/g)].map(m=>m[0]).filter(e=>!excluded.test(e));
  const profiles=[...line.matchAll(/https:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_%.-]+\/?/gi)].map(m=>m[0]);
  if(!name&&!emails.length&&!profiles.length)continue;
  const email=emails[0]||'',profile=profiles[0]||'';
  const prior=contacts.at(-1);
  if(!name&&prior?.name&&prior.lineIndex===i-1&&emails.length<=1&&profiles.length<=1&&(!email||!prior.email||prior.email===email)&&(!profile||!prior.profile||prior.profile===profile)){
   prior.email||=email;prior.profile||=profile;prior.quote+='\n'+line;prior.lineIndex=i;
  }else contacts.push({name,email,profile,quote:line,source:publicLink(job.url),lineIndex:i});
  for(const extra of emails.slice(1))contacts.push({name:'',email:extra,profile:'',quote:line,source:publicLink(job.url)});
 }
 return [...new Map(contacts.map(c=>[[c.name,c.email.toLowerCase(),c.profile].join('|'),c])).values()].slice(0,5).map(({lineIndex,...c})=>c);
}
export function mountJobContacts(root,job){
 root.id='job-recruiter-details';root.className='referral-tools';root.tabIndex=-1;
 const contacts=publishedJobContacts(job);if(!contacts.length){root.hidden=true;root.replaceChildren();return false;}root.hidden=false;
 root.innerHTML='<h3>Recruiter details</h3>'+contacts.map(c=>`<article class="job-contact"><strong>${html(c.name||'Recruitment contact')}</strong>${c.email?`<p><a href="mailto:${html(c.email)}">${html(c.email)}</a></p>`:''}${c.profile?`<p><a href="${html(c.profile)}" target="_blank" rel="noopener noreferrer">LinkedIn profile ↗</a></p>`:''}${c.source?`<a href="${html(c.source)}" target="_blank" rel="noopener noreferrer">Contact listed in this job ↗</a>`:''}</article>`).join('');
 return true;
}
