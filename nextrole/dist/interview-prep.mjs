import {findBackend,apiRequest} from './api-client.mjs?v=91';
const el=(tag,text='',className='')=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;};
export function gmailInterviewUrl(email,item){return `https://mail.google.com/mail/?authuser=${encodeURIComponent(email||'')}#all/${encodeURIComponent(item.message_id||item.thread_id)}`;}
export function questionGroups(source){
 const clean=lines=>(lines||[]).filter(line=>!(/\b(?:tutorials?|courses?|explore|subscribe|sign in|log in)\b|CourseExplore/i.test(line)&&!line.includes('?')));
 const questions=clean(source.questions),patterns=clean(source.patterns);
 const reported=source.kind==='Candidate-reported experience';
 const dsa=/\b(?:arrays?|strings?|hash ?maps?|hash ?tables?|linked lists?|binary|trees?|graphs?|sorting|sliding window|two.sum|dynamic programming|recursion|complexity|\bdsa\b)\b/i;
 return [[reported?'Reported patterns':'Published interview patterns',patterns],[reported?'Reported DSA questions':'Published DSA practice questions',questions.filter(line=>dsa.test(line))],[reported?'Other reported questions / source excerpts':'Published practice questions / source excerpts',questions.filter(line=>!dsa.test(line))]];
}
export function setupInterviewPrep(){
 const button=el('button','Interview prep','interview-prep-tab');button.type='button';button.id='interview-prep-tab';button.setAttribute('aria-pressed','false');
 const header=document.querySelector('header');header.insertBefore(button,document.querySelector('#notifications-button'));
 const root=el('section','','content interview-prep-page');root.id='interview-prep-view';root.hidden=true;
 root.innerHTML='<div class="prep-heading"><div><div class="eyebrow">YOUR NEXT CONVERSATION</div><h1>Interview preparation</h1><p>Company and role guides for interview invitations and assessments in Gmail.</p></div><button type="button" class="secondary" id="prep-refresh">Refresh invitations</button></div><p id="prep-status" role="status"></p><div class="prep-layout"><div id="prep-invitations" aria-label="Interview invitations"></div><div id="prep-guide" aria-live="polite"></div></div>';
 document.querySelector('main').append(root);
 const $=id=>root.querySelector('#'+id),status=$('prep-status'),list=$('prep-invitations'),content=$('prep-guide');
 let backend=null,items=[],email='',selection=null,generation=0,pollTimer=null,open=false;
 async function api(path,body){backend=await findBackend();if(!backend.status.capabilities?.includes('interview-prep-v1'))throw Error('Restart the backend to load Interview prep. Your saved Gmail connection will be reused.');return apiRequest(backend.origin,path,body,35000);}
 function close(){open=false;generation++;clearTimeout(pollTimer);root.hidden=true;button.setAttribute('aria-pressed','false');}
 document.querySelectorAll('[data-view],#profile-link').forEach(node=>node.addEventListener('click',close));
 function show(){open=true;root.hidden=false;document.querySelector('main > .content').hidden=true;const referrals=document.querySelector('#referrals-view');if(referrals)referrals.hidden=true;button.setAttribute('aria-pressed','true');document.querySelector('#breadcrumb').textContent='Interview prep';root.scrollIntoView({block:'start'});}
 function drawInvitations(){
  list.replaceChildren();
  for(const item of items){const card=el('button','','prep-invitation');card.type='button';card.setAttribute('aria-pressed',String(selection===item.id));card.append(el('strong',item.company&&item.role?item.company+' · '+item.role:item.subject),el('small',item.category+' · '+new Date(item.received_at*1000).toLocaleDateString()));card.onclick=()=>select(item);list.append(card);}
 }
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
 async function select(item){
  clearTimeout(pollTimer);const token=++generation;selection=item.id;drawInvitations();content.replaceChildren();status.textContent='Reading the company and role from your invitation…';
  try{const context=await api('/api/interviews/context',{invitation_id:item.id});if(token!==generation||!open)return;status.textContent='';if(context.company&&context.role)await research(context,context.company,context.role,token);else confirmContext(context,token);}
  catch(error){if(token===generation)status.textContent=error.message;}
 }
 async function refresh(preferred){
  clearTimeout(pollTimer);const token=++generation;status.textContent='Loading interview invitations…';
  try{const result=await api('/api/interviews');if(!open||token!==generation)return;items=result.invitations||[];email=result.email||'';drawInvitations();status.textContent='';
   if(!items.length){content.replaceChildren(el('h2',result.connected?'No interview invitations yet':'Connect Gmail to get started'),el('p',result.connected?'Interview invitations and assessments will appear here after the next Gmail check.':'Open Notifications to complete the one-time Gmail connection.'));return;}
   await select(items.find(i=>i.id===preferred)||items.find(i=>i.id===selection)||items[0]);
  }catch(error){status.textContent=error.message;}
 }
 button.onclick=()=>{show();refresh();};$('prep-refresh').onclick=()=>refresh();
 document.addEventListener('nextrole:interview-prep',event=>{show();refresh(event.detail?.id);});
 return {root,refresh};
}
