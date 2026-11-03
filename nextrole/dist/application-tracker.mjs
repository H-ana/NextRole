import {setupLocalApplications} from './local-applications.mjs?v=136';
import {findBackend,apiRequest} from './api-client.mjs?v=116';
import {canPrepareApplication,createApplicationPrep} from './interview-prep.mjs?v=113';
import {readReferrals,saveReferrals,referralRecord,sourceJobId,STATUSES as REFERRAL_STATUSES} from './referral-tracker.mjs?v=113';
const stages=['All statuses','Referred','Applied','Recruiter reached out','Assessment / next step','Interview','Offer','Rejected','Withdrawn'];
const make=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
const date=value=>new Date(value*1000).toLocaleString(undefined,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
export function gmailLink(email,event){
 const id=event.message_id||event.thread_id;
 return /^[a-f0-9]{8,64}$/i.test(id||'')?`https://mail.google.com/mail/?authuser=${encodeURIComponent(email||'')}#all/${encodeURIComponent(id)}`:'';
}
export function applicationRows(remote,legacy){
 const rows=remote.map(r=>({...r,origin:'gmail'}));
 for(const item of legacy){
  if(item.status==='Not contacted yet')continue;
  const reference=sourceJobId(item.job),candidates=rows.filter(r=>r.company?.toLowerCase()===item.job.company.toLowerCase()&&(reference&&r.reference?reference===r.reference:r.role?.toLowerCase()===item.job.title.toLowerCase())),same=candidates.length===1?candidates[0]:null;
  const referral={name:item.name,status:item.status,notes:item.notes,profile:item.profile,record:item};
  if(same){same.manualReferrals=[...(same.manualReferrals||[]),referral];continue;}
  rows.push({id:'local:'+item.id,origin:'local',company:item.job.company,role:item.job.title,reference:reference||item.job.id,url:item.job.url,status:item.status==='Referred'?'Referred':'Referral request',referred:item.status==='Referred',events:[],manualReferrals:[referral],last_updated:Date.parse(item.added||item.contacted)/1000||0});
 }
 return rows.sort((a,b)=>b.last_updated-a.last_updated);
}
export function matchesApplication(row,status,query){
 const q=query.trim().toLowerCase();
 return (status==='All statuses'||status==='Needs job details'&&row.needs_details||row.status===status||status==='Referred'&&(row.referred||row.manualReferrals?.some(r=>r.status==='Referred')))&&(!q||[row.company,row.role,row.reference,row.id,...(row.referrers||[])].some(v=>String(v||'').toLowerCase().includes(q)));
}
export function setupApplicationTracker({onOpen,storage=localStorage}){
 if(!['localhost','127.0.0.1'].includes(location.hostname))return setupLocalApplications({storage});
 const root=make('section','','content application-tracker');root.id='applications-view';root.hidden=true;document.querySelector('main').append(root);
 root.innerHTML='<div class="eyebrow">YOUR APPLICATIONS</div><h1>Applications</h1><div class="application-toolbar"><label>Status<select aria-label="Filter applications by status"></select></label><label>Search applications<input type="search" aria-label="Search applications by company, role or job ID" placeholder="Company, role or job ID"></label><button type="button" class="secondary" data-sync>Check Gmail updates</button></div><p role="status" data-application-status></p><div data-application-records></div>';
 const select=root.querySelector('select');for(const stage of stages){const option=make('option',stage);option.value=stage;select.append(option);}
 const list=root.querySelector('[data-application-records]'),status=root.querySelector('[data-application-status]'),search=root.querySelector('input');
 const editor=make('dialog','','referral-editor');document.body.append(editor);
 let remote=[],legacy=readReferrals(storage),email='',connected=false,loading=false,initialized=false;
 let preparation=null,activePreparation=null,renderSignature='';
 const preparationContext=row=>JSON.stringify([row.company,row.role,row.status,row.needs_details,(row.events||[]).map(e=>e.message_id)]);
 const link=(label,url)=>{try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)return null;const a=make('a',label);a.href=parsed.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return null;}};
 function render(){
  const signature=JSON.stringify([remote,legacy,email,select.value,search.value,initialized]);
  if(signature===renderSignature)return;
  renderSignature=signature;
  const rows=applicationRows(remote,legacy).filter(r=>matchesApplication(r,select.value,search.value));
  if(activePreparation&&!rows.some(r=>r.id===activePreparation.id&&canPrepareApplication(r)&&preparationContext(r)===activePreparation.context)){preparation?.close();activePreparation=null;}
  list.replaceChildren();
  if(!rows.length){list.append(make('p',initialized?'No applications match yet. Gmail updates will appear here as they are found.':'Loading applications…','empty'));return;}
  for(const row of rows){
   const card=make('article','','application-record');card.append(make('span',row.status,'referral-status'),make('h2',row.role||'Role not identified'),make('p',row.company||'Company not identified'));
   if(row.reference)card.append(make('p','Job ID: '+row.reference));
   if(row.referred)card.append(make('p',(row.origin==='gmail'?'✓ Referral confirmed by email':'Referred · updated by you')+(row.referrers?.length?' · '+row.referrers.join(', '):''),'application-referral'));
   if(row.needs_details)card.append(make('p','Needs job details · this update has not been linked to a guessed role.'));
   for(const referral of row.manualReferrals||[]){
    const block=make('div','','application-manual-referral');block.append(make('p','Referral: '+(referral.name||'Contact not added')+' · '+referral.status));
    if(referral.notes)block.append(make('p',referral.notes));
    const update=make('button','Update referral','secondary');update.onclick=()=>editReferral(referral.record);block.append(update);card.append(block);
   }
   const timeline=make('ol','','application-timeline');
   for(const event of row.events||[]){
    const item=make('li');item.append(make('strong',event.category),make('small',date(event.received_at)),make('p',event.subject));
    if(event.referrer)item.append(make('p','Referred by '+event.referrer));
    const a=link('Open email in Gmail ↗',gmailLink(email,event));if(a)item.append(a);timeline.append(item);
   }
   if(timeline.children.length)card.append(timeline);
   const actions=make('div','','referral-record-actions'),job=link('View job ↗',row.url);if(job)actions.append(job);
   if(row.origin==='gmail'){const edit=make('button','Edit job details','secondary');edit.onclick=()=>editDetails(row);actions.append(edit);}
   const prepHost=make('div');
   if(canPrepareApplication(row)){
    const prepButton=make('button',activePreparation?.id===row.id?'Hide preparation':'Interview preparation','secondary');prepButton.type='button';prepButton.setAttribute('aria-expanded',String(activePreparation?.id===row.id));
    prepButton.onclick=()=>{
     if(activePreparation?.id===row.id){preparation?.close();activePreparation=null;renderSignature='';render();return;}
     preparation=preparation||createApplicationPrep();preparation.close();activePreparation={id:row.id,context:preparationContext(row)};renderSignature='';render();preparation.show(row,email);
    };
    actions.append(prepButton);if(activePreparation?.id===row.id)prepHost.append(preparation.root);
   }
   card.append(actions,prepHost);list.append(card);
  }
 }
 async function request(path,body){const backend=await findBackend();return apiRequest(backend.origin,path,body,30000);}
 async function refresh(){
  if(loading)return;loading=true;
  try{const state=await request('/api/applications/lifecycle');remote=state.applications||[];email=state.email||'';connected=!!state.connected;initialized=true;root.querySelector('[data-sync]').disabled=!connected;status.textContent=state.error||(!connected?'Connect Gmail in Notifications to sync application updates.':state.checking?'Checking Gmail for application updates…':state.last_checked?'Last checked '+date(state.last_checked):'Updates appear automatically from connected Gmail.');render();}
  catch{status.textContent='Email-based application updates are not available right now. Any referral details saved in this browser remain available.';initialized=true;render();}
  finally{loading=false;}
 }
 function editDetails(row){
  editor.innerHTML='<form><h2>Application details</h2><label>Company<input name="company" required maxlength="100"></label><label>Job title<input name="role" required maxlength="100"></label><label>Job ID (optional)<input name="reference" maxlength="80"></label><p role="alert"></p><button type="submit">Save details</button><button type="button" class="secondary" data-cancel>Cancel</button></form>';
  const form=editor.querySelector('form');for(const key of ['company','role','reference'])form.elements[key].value=row[key]||'';
  editor.querySelector('[data-cancel]').onclick=()=>editor.close();form.onsubmit=async event=>{event.preventDefault();try{await request('/api/applications/details',{id:row.id,...Object.fromEntries(new FormData(form))});editor.close();await refresh();}catch(error){editor.querySelector('[role=alert]').textContent=error.message;}};editor.showModal();
 }
 function editReferral(record){
  editor.innerHTML='<form><h2>Referral details</h2><label>Contact name<input name="name" maxlength="300"></label><label>Status<select name="status"></select></label><label>Date contacted<input name="contacted" type="date"></label><label>Notes<textarea name="notes" maxlength="2000"></textarea></label><p role="alert"></p><button type="submit">Save referral</button><button type="button" class="secondary" data-cancel>Cancel</button></form>';
  const form=editor.querySelector('form');for(const value of REFERRAL_STATUSES){const option=make('option',value);option.value=value;form.elements.status.append(option);}
  for(const key of ['name','status','contacted','notes'])form.elements[key].value=record[key]||'';
  editor.querySelector('[data-cancel]').onclick=()=>editor.close();form.onsubmit=event=>{event.preventDefault();try{const updated=referralRecord({...record,...Object.fromEntries(new FormData(form))},record.job,record.id);const next=legacy.map(r=>r.id===record.id?updated:r);saveReferrals(storage,next);legacy=next;editor.close();render();}catch(error){editor.querySelector('[role=alert]').textContent=error.message;}};editor.showModal();
 }
 select.onchange=render;search.oninput=render;
 root.querySelector('[data-sync]').onclick=async()=>{try{await request('/api/gmail/check',{});status.textContent='Checking Gmail for application updates…';await refresh();}catch(error){status.textContent=error.message;}};
 async function poll(){await refresh();setTimeout(poll,root.hidden?60000:5000);}poll();
 // Opening a LinkedIn search is not an application or a completed referral.
 return {root,refresh,render,hidePreparation(){if(activePreparation){preparation?.close();activePreparation=null;renderSignature='';render();}},trackJob(){return true;}};
}
