const KEY='nextrole-referrals-v1';
export const STATUSES=['Not contacted yet','Awaiting reply','Responded','Referred','Declined'];
const text=(value,max=300)=>String(value??'').trim().slice(0,max);
const escape=value=>text(value,3000).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function linkedinUrl(value){
 if(!value)return '';
 try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='linkedin.com'||u.hostname==='www.linkedin.com')&&/^\/(?:in\/[^/]+\/?|messaging\/thread\/[^/]+\/?)$/.test(u.pathname))return u.href;}catch{}
 throw new Error('Use a LinkedIn profile or conversation URL.');
}
function jobUrl(value){try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}return '';}
export function sourceJobId(job){
 if(job.source_job_id)return text(job.source_job_id);
 try{const u=new URL(job.url);for(const key of ['currentJobId','jobId','job_id','jk','gh_jid']){if(u.searchParams.get(key))return text(u.searchParams.get(key));}
 if(/(^|\.)linkedin\.com$/.test(u.hostname))return u.pathname.match(/\/jobs\/view\/(?:.*-)?(\d+)\/?$/)?.[1]||'';
 if(/(^|\.)naukri\.com$/.test(u.hostname))return u.pathname.match(/-(\d{10,})\/?$/)?.[1]||'';
 }catch{}return '';
}
export function matchesReferral(record,status='All',jobId=''){
 const query=text(jobId).toLowerCase();return (status==='All'||record.status===status)&&(!query||[record.job.id,sourceJobId(record.job)].some(id=>String(id||'').toLowerCase().includes(query)));
}
export function referralRecord(input,job,id=globalThis.crypto.randomUUID()){
 const name=text(input.name),contacted=text(input.contacted,10),status=input.status||'Awaiting reply';
 if(!name&&status!=='Not contacted yet')throw new Error('Enter the person’s name.');
 if((contacted||status!=='Not contacted yet')&&(!/^\d{4}-\d{2}-\d{2}$/.test(contacted)||Number.isNaN(Date.parse(contacted+'T12:00:00Z'))||new Date(contacted+'T12:00:00Z').toISOString().slice(0,10)!==contacted))throw new Error('Choose a valid date you contacted them.');
 if(!STATUSES.includes(status))throw new Error('Choose a response status.');
 if(!text(job.title)||!text(job.company))throw new Error('A company and job title are required.');
 return {id:text(id),name,contacted,added:text(input.added||input.contacted||new Date().toISOString(),40),status,profile:linkedinUrl(input.profile),notes:text(input.notes,2000),responseSource:'Manual update',job:{id:text(job.id),title:text(job.title),company:text(job.company),location:text(job.location),url:jobUrl(job.url),source_job_id:sourceJobId(job)}};
}
export function addReferralJob(records,job){
 if(records.some(r=>(job.id&&r.job.id===String(job.id))||(job.url&&r.job.url===jobUrl(job.url))))return records;
 return [...records,referralRecord({status:'Not contacted yet'},job)];
}
export function readReferrals(storage){
 try{const items=JSON.parse(storage.getItem(KEY)||'[]');if(!Array.isArray(items))return [];return items.flatMap(item=>{try{return [referralRecord(item,item.job,item.id)];}catch{return [];}});}catch{return [];}
}
export function saveReferrals(storage,records){storage.setItem(KEY,JSON.stringify(records));}
export function setupReferralTracker({onOpen,storage=localStorage}){
 const root=document.createElement('section');root.id='referrals-view';root.className='content referral-tracker';root.hidden=true;
 document.querySelector('main').append(root);
 const editor=document.createElement('dialog');editor.className='referral-editor';document.body.append(editor);
 let records=readReferrals(storage),filter='All',jobFilter='';
 const persist=next=>{try{saveReferrals(storage,next);records=next;return true;}catch{alert('Could not save referrals on this browser. Your changes have not been saved.');return false;}};
 function render(){
  const visible=records.filter(r=>matchesReferral(r,filter,jobFilter)).sort((a,b)=>(b.added||b.contacted).localeCompare(a.added||a.contacted));
  root.innerHTML='<div class="eyebrow">YOUR OUTREACH</div><h1>Referrals</h1><p>Jobs you explored for a LinkedIn referral. Add the person’s name and update replies here.</p><p class="referral-privacy">Saved only in this browser. Opening a search adds the job; it does not mark anyone as contacted. LinkedIn messages are not synced.</p><label>Show <select aria-label="Filter referrals">'+['All',...STATUSES].map(s=>`<option ${s===filter?'selected':''}>${s}</option>`).join('')+'</select></label><label>Filter by job ID<input type="search" data-job-filter placeholder="Enter job ID" aria-label="Filter by job ID"></label><div data-referral-records></div><p role="status" data-tracker-status></p>';
  root.querySelector('select').onchange=e=>{filter=e.target.value;render();};
  const search=root.querySelector('[data-job-filter]');search.value=jobFilter;search.oninput=()=>{const position=search.selectionStart;jobFilter=search.value;render();const next=root.querySelector('[data-job-filter]');next.focus();if(position!==null)next.setSelectionRange(position,position);};
  const list=root.querySelector('[data-referral-records]');
  if(!visible.length)list.innerHTML='<div class="empty">'+(records.length?'No referrals match these filters.':'No referral jobs yet. Open a job → Find a referral → Find people at the company on LinkedIn. The job will appear here automatically.')+'</div>';
  for(const record of visible){
   const card=document.createElement('article');card.className='referral-record';
   card.innerHTML=`<span class="referral-status">${escape(record.status)}</span><h2>${escape(record.job.title)}</h2><p><strong>${escape(record.job.company)}</strong> · ${escape(record.job.location)}</p><p>Job ID: ${escape(sourceJobId(record.job)||record.job.id)}${sourceJobId(record.job)&&record.job.id!==sourceJobId(record.job)?` · NextRole ID: ${escape(record.job.id)}`:''}</p><p>${record.name?'Contact: '+escape(record.name):'Contact not added yet'}${record.contacted?' · Contacted '+escape(record.contacted):''}</p><p>${escape(record.notes)}</p><div class="referral-record-actions">${record.profile?`<a href="${escape(record.profile)}" target="_blank" rel="noopener noreferrer">Open LinkedIn ↗</a>`:''}${record.job.url?`<a href="${escape(record.job.url)}" target="_blank" rel="noopener noreferrer">View job ↗</a>`:''}<button class="secondary" data-edit>Update referral</button><button class="secondary" data-delete>Delete</button></div><small>Reply status updated by you</small>`;
   card.querySelector('[data-edit]').onclick=()=>edit(record.job,record);
   card.querySelector('[data-delete]').onclick=()=>{if(confirm('Delete this referral record?')&&persist(records.filter(r=>r.id!==record.id)))render();};list.append(card);
  }
 }
 function edit(job,existing){
  editor.innerHTML='<form><h2>'+ (existing?'Update referral':'Track a referral')+'</h2><p data-job></p><p>Add the contact and update the status after sending your request or receiving a reply.</p><label>Contact name<input name="name" maxlength="300"></label><label>LinkedIn profile or conversation link (optional)<input name="profile" type="url"></label><label>Date contacted<input name="contacted" type="date"></label><label>Status<select name="status">'+STATUSES.map(s=>'<option>'+s+'</option>').join('')+'</select></label><label>Reply or notes (optional)<textarea name="notes" rows="3" maxlength="2000"></textarea></label><p role="alert" data-error></p><button type="submit">Save referral</button> <button type="button" class="secondary" data-cancel>Cancel</button></form>';
  editor.querySelector('[data-job]').textContent=job.title+' · '+job.company;
  const form=editor.querySelector('form'),today=new Date(),date=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
  for(const field of ['name','profile','contacted','status','notes'])form.elements[field].value=existing?.[field]??(field==='contacted'?date:field==='status'?'Awaiting reply':'');
  const updateRequired=()=>{const contacted=form.elements.status.value!=='Not contacted yet';form.elements.name.required=contacted;form.elements.contacted.required=contacted;if(contacted&&!form.elements.contacted.value)form.elements.contacted.value=date;};form.elements.status.onchange=updateRequired;updateRequired();
  editor.querySelector('[data-cancel]').onclick=()=>editor.close();
  form.onsubmit=e=>{e.preventDefault();try{const record=referralRecord({...Object.fromEntries(new FormData(form)),added:existing?.added},job,existing?.id);const next=existing?records.map(r=>r.id===record.id?record:r):[...records,record];if(persist(next)){editor.close();filter='All';render();onOpen();}}catch(error){editor.querySelector('[data-error]').textContent=error.message;}};
  editor.showModal();form.elements.name.focus();
 }
 function trackJob(job){const next=addReferralJob(records,job);if(next===records)return true;if(persist(next)){render();return true;}return false;}
 render();return {root,edit,render,trackJob};
}
