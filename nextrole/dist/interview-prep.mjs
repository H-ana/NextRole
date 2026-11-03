import {findBackend,apiRequest} from './api-client.mjs?v=116';
const el=(tag,text='',className='')=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;};
export function gmailInterviewUrl(email,item){return `https://mail.google.com/mail/?authuser=${encodeURIComponent(email||'')}#all/${encodeURIComponent(item.message_id||item.thread_id)}`;}
export function questionGroups(source){
 const clean=lines=>(lines||[]).filter(line=>!(/\b(?:tutorials?|courses?|explore|subscribe|sign in|log in)\b|CourseExplore/i.test(line)&&!line.includes('?')));
 const questions=clean(source.questions),patterns=clean(source.patterns);
 const reported=source.kind==='Candidate-reported experience';
 const dsa=/\b(?:arrays?|strings?|hash ?maps?|hash ?tables?|linked lists?|binary|trees?|graphs?|sorting|sliding window|two.sum|dynamic programming|recursion|complexity|\bdsa\b)\b/i;
 return [[reported?'Reported patterns':'Published interview patterns',patterns],[reported?'Reported DSA questions':'Published DSA practice questions',questions.filter(line=>dsa.test(line))],[reported?'Other reported questions / source excerpts':'Published practice questions / source excerpts',questions.filter(line=>!dsa.test(line))]];
}
export function canPrepareApplication(application){return application.origin!=='local'&&['Interview','Assessment / next step'].includes(application.status);}
export function invitationForApplication(application,invitations){
 if(!canPrepareApplication(application))return null;
 const ids=new Set((application.events||[]).filter(e=>['Interview invitation','Assessment / next step'].includes(e.category)).map(e=>e.message_id));
 return [...invitations].filter(i=>ids.has(i.message_id)&&['Interview invitation','Assessment / next step'].includes(i.category)).sort((a,b)=>b.received_at-a.received_at)[0]||null;
}
export function createApplicationPrep(){
 const root=el('section','','application-preparation');root.hidden=true;
 root.innerHTML='<h3>Interview preparation</h3><p id="prep-status" role="status"></p><div id="prep-guide" aria-live="polite"></div>';
 const status=root.querySelector('#prep-status'),content=root.querySelector('#prep-guide');
 let generation=0,pollTimer=null,open=false,email='';
 async function api(path,body){const backend=await findBackend();if(!backend.status.capabilities?.includes('interview-prep-v1'))throw Error('Interview preparation is unavailable.');return apiRequest(backend.origin,path,body,35000);}
 function close(){open=false;generation++;clearTimeout(pollTimer);root.hidden=true;}
 function drawGuide(result,mail){
  content.replaceChildren();const heading=el('h2',result.company+' · '+result.role);content.append(heading);
  const retry=el('button','Refresh research','secondary');retry.type='button';retry.onclick=()=>{clearTimeout(pollTimer);const token=++generation;retry.disabled=true;research(mail,result.company,result.role,token,true).finally(()=>{retry.disabled=false;});};content.append(retry);
  const inbox=el('a','Open invitation in Gmail ↗','prep-source-link');inbox.href=gmailInterviewUrl(email,mail);inbox.target='_blank';inbox.rel='noopener noreferrer';content.append(inbox);
  content.append(el('p',result.coverage,'prep-note'));
  const reports=el('section','','prep-block');reports.append(el('h3','Reported questions and interview patterns'));
  if(!result.sources?.length)reports.append(el('p',result.resources?.length?'Relevant sources were found below. Their question text could not be collected automatically.':result.research_status));
  for(const source of result.sources||[]){
   const article=el('article','','prep-report');const link=el('a',source.title);link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';article.append(link);
   article.append(el('small',[source.publisher,source.kind,source.reported_year?'Year in report title: '+source.reported_year:'',source.published?'Published: '+source.published:'Date not available',source.role_match].filter(Boolean).join(' · ')));
   for(const [label,lines] of questionGroups(source))if(lines.length){article.append(el('h4',label));const ul=el('ul');for(const line of lines)ul.append(el('li',line));article.append(ul);}
   reports.append(article);
  }
  content.append(reports);
  if(result.resources?.length){const resources=el('section','','prep-block');resources.append(el('h3','More relevant sources'),el('p','These sources match the company and role. Their question text could not be collected; open the original pages to read them.','prep-note'));
   for(const source of result.resources){const row=el('p');const link=el('a',source.title+' ↗','prep-source-link');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';row.append(link);resources.append(row);}content.append(resources);}
  const practice=el('section','','prep-block');practice.append(el('h3','Your preparation checklist'),el('p','General practice for this role; these are not claimed to be past questions from this company.','prep-note'));
  for(const area of result.practice||[]){practice.append(el('h4',area.area));const ul=el('ul');for(const task of area.tasks)ul.append(el('li',task));practice.append(ul);}content.append(practice);
  const links=el('section','','prep-block');links.append(el('h3','Explore more interview experiences'));
  for(const source of result.search_links||[]){const link=el('a',source.name+' ↗','prep-source-link');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';links.append(link);}content.append(links,el('small','Research checked '+new Date(result.checked_at).toLocaleString()));
 }
 async function research(item,company,role,token,force=false){
  status.textContent='Finding published interview experiences for this role…';
  try{
   const response=await api('/api/interviews/prepare',{invitation_id:item.id,company,role,refresh:force});
   if(token!==generation||!open)return;
   if(response.state==='researching'){pollTimer=setTimeout(()=>research(item,company,role,token),2500);return;}
   if(response.state==='error')throw Error(response.error);
   status.textContent='';drawGuide(response.guide,item);
  }catch(error){if(token===generation){status.textContent=error.message;}}
 }
 function confirmContext(item,token){
  content.replaceChildren(el('h2','Confirm the company and role'),el('p','The invitation did not clearly identify both details. Only the company and role are used for public research.'));
  const form=el('form','','prep-context');const company=el('input'),role=el('input');
  for(const [node,title,value] of [[company,'Company',item.company],[role,'Job title',item.role]]){node.value=value||'';node.required=true;node.minLength=2;node.maxLength=100;const label=el('label',title);label.append(node);form.append(label);}
  const submit=el('button','Prepare my guide','primary');submit.type='submit';form.append(submit);
  form.onsubmit=e=>{e.preventDefault();submit.disabled=true;research(item,company.value.trim(),role.value.trim(),token).finally(()=>{submit.disabled=false;});};content.append(form);
 }
 async function show(application,accountEmail){
  close();open=true;root.hidden=false;email=accountEmail;const token=++generation;
  content.replaceChildren();status.textContent='Loading preparation for this application…';
  try{
   if(!canPrepareApplication(application))throw Error('Preparation is available for interview and assessment applications.');
   const state=await api('/api/interviews');if(!open||token!==generation)return;
   if(state.email&&state.email!==accountEmail)throw Error('Your Gmail account changed. Refresh Applications before preparing.');
   const item=invitationForApplication(application,state.invitations||[]);
   if(!item)throw Error('No matching interview or assessment message is available for this application. Check Gmail updates and try again.');
   if(application.company&&application.role&&!application.needs_details){await research(item,application.company,application.role,token);return;}
   const context=await api('/api/interviews/context',{invitation_id:item.id});if(!open||token!==generation)return;
   status.textContent='';if(context.company&&context.role)await research(context,context.company,context.role,token);else confirmContext(context,token);
  }catch(error){if(open&&token===generation)status.textContent=error.message;}
 }
 return {root,show,close};
}
