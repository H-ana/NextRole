import {clarifyResume,draftChanges} from './resume-interview.mjs?v=91';
import {downloadOnePageResume} from './one-page-export.mjs?v=91';
import {buildReviewedDraft} from './tailoring-draft.mjs?v=91';
import {mountResumeBuilder} from './resume-builder.mjs?v=91';
import {allCorrectionChoices,mergeCorrectionBatch} from './correction-selection.mjs?v=91';
import {findBackend,apiRequest} from './api-client.mjs?v=91';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function withConfirmedExperience(assessment,years){
 if(assessment.experience!=='gap')return assessment;
 return {...assessment,reason:`Experience gap flagged against the employer requirement: "${assessment.experience_quote}". Your confirmed total experience is ${Number(years)} years. Check any domain-specific experience requirement against your resume.`};
}
export function friendlyAiError(error){
 const message=String(error?.message||'');
 if(/quota|billing|rate.limit|credits|usage limit/i.test(message))return 'The AI service has reached its usage limit. Try again later; you can still search and apply for jobs.';
 if(/consent|permission declined/i.test(message))return 'AI assistance was not enabled. You can still browse and apply for jobs.';
 if(/changed|complete.*resume|upload|paste|acknowledge|warnings|Restart the backend/i.test(message))return message;
 return 'AI assistance is temporarily unavailable. Please try again later. Job search and applications are still available.';
}
export function setupAgentUI({getResume,getPreferences,acceptSearch,acceptAssessment,onSearchStart=()=>{},canTailor=()=>true,filterJobs=jobs=>jobs,interview=clarifyResume}){
 let running=false,consented=false,permissionPromise=null,consentResolver=null,revision=0;
 const completedReviews=new Map();
 try{consented=sessionStorage.getItem('nextrole-ai-consent')==='allowed';}catch{}
 const searchStatus=document.createElement('p');searchStatus.id='search-status';searchStatus.setAttribute('role','status');searchStatus.hidden=true;$('job-search-form').append(searchStatus);
 $('find-jobs').textContent='Find jobs';
 $('job-search-form').onsubmit=e=>{e.preventDefault();run();};
 const consentDialog=document.createElement('dialog');consentDialog.id='ai-permission';consentDialog.setAttribute('aria-labelledby','ai-permission-title');consentDialog.setAttribute('aria-describedby','ai-permission-description');
 consentDialog.innerHTML='<h2 id="ai-permission-title">Use AI-assisted resume help?</h2><p id="ai-permission-description">To review your fit or suggest resume edits, we send your resume, preferences and the selected job description to Google Gemini. Your original resume stays unchanged. API usage limits and charges may apply.</p><p>You can search and apply for jobs without enabling AI assistance.</p><div class="permission-actions"><button id="ai-permission-decline" type="button" class="secondary" autofocus>Not now</button><button id="ai-permission-allow" type="button" class="find-jobs">Allow for this session</button></div>';
 document.body.append(consentDialog);
 function finishPermission(allowed){
  if(!allowed)invalidate();
  consented=allowed;try{if(allowed)sessionStorage.setItem('nextrole-ai-consent','allowed');else sessionStorage.removeItem('nextrole-ai-consent');}catch{}
  const resolve=consentResolver;consentResolver=null;permissionPromise=null;if(consentDialog.open)consentDialog.close();resolve?.(allowed);
 }
 function dismissPermission(){
  const resolve=consentResolver;consentResolver=null;permissionPromise=null;if(consentDialog.open)consentDialog.close();resolve?.(false);
 }
 $('ai-permission-allow').onclick=()=>finishPermission(true);$('ai-permission-decline').onclick=()=>finishPermission(false);
 consentDialog.addEventListener('cancel',event=>{event.preventDefault();dismissPermission();});
 consentDialog.addEventListener('close',()=>{if(consentResolver)dismissPermission();});
 function permission(force=false){
  if(consented&&!force)return Promise.resolve(true);
  if(permissionPromise)return permissionPromise;
  $('ai-permission-decline').textContent=consented?'Stop AI sharing':'Not now';
  permissionPromise=new Promise(resolve=>{consentResolver=resolve;consentDialog.showModal();});return permissionPromise;
 }
 async function requireAI(){
  const context=await findBackend();
  if(!context.status.connected||!(context.status.capabilities||[]).includes('resume-profile'))throw new Error('AI service unavailable.');
  if(!await permission())throw new Error('Permission declined.');
  return {...context,model:context.status.model};
 }
 async function requestAI(context,path,body){
  if(!consented)throw new Error('Permission declined.');
  return apiRequest(context.origin,path,{...body,model:context.model,consent:true});
 }
 const fingerprint=()=>JSON.stringify({resume:getResume(),preferences:getPreferences()});
 let platformPoll=null,searchSequence=0;
 const searchMessage=(result,hasResume)=>result.jobs.length?(hasResume?`${result.jobs.length} jobs ranked for your resume.`:`${result.jobs.length} jobs found for your preferences. Upload a resume to rank them.`):(result.filtered_count?'No matching jobs found. Try another search or refresh jobs.':'No matching jobs found. Try more cities or a broader search.');
 function pollPlatform(body,snapshot,sequence,hasResume,attempt=0){
  platformPoll=setTimeout(async()=>{
   if(sequence!==searchSequence||snapshot!==fingerprint())return;
   try{
    const context=await findBackend();const result=await apiRequest(context.origin,'/api/jobs/search',body);
    if(sequence!==searchSequence||snapshot!==fingerprint())return;
    const visible={...result,jobs:filterJobs(result.jobs)};visible.filtered_count=result.jobs.length-visible.jobs.length;
    acceptSearch({...visible,resume_ranked:hasResume,incremental:true});
    searchStatus.textContent=searchMessage(visible,hasResume);
    if(result.platform_search?.refreshing&&attempt<99)pollPlatform(body,snapshot,sequence,hasResume,attempt+1);
   }catch{/* Keep the current results while a background update is unavailable. */}
  },3000);
 }
 function current(snapshot){if(snapshot!==fingerprint())throw new Error('Your resume or preferences changed. Try again with the updated information.');if(!consented)throw new Error('Permission declined.');}
 async function run(){
  if(running)return;running=true;$('find-jobs').disabled=true;searchStatus.hidden=false;searchStatus.textContent='Finding relevant jobs...';
  const snapshot=fingerprint(),sequence=++searchSequence;clearTimeout(platformPoll);
  try{
   const resume=getResume(),hasResume=resume.trim().length>=40;
   if(resume.trim()&&!hasResume){searchStatus.textContent='The resume text is too short to rank reliably. Paste your full resume, or clear it to search by preferences.';return;}
   onSearchStart();
   const context=await findBackend();
   if(!(context.status.capabilities||[]).includes('cached-job-search'))throw new Error('Search service unavailable.');
   const body={resume:hasResume?resume:'',preferences:getPreferences(),limit:100};
   if(context.status.platform_jobs?.configured&&context.status.platform_jobs.provider==='JobSpy'&&(context.status.capabilities||[]).includes('jobspy-platform-search')){
    try{await apiRequest(context.origin,'/api/jobs/platform-search',body,10000);}catch{/* Company search must remain available. */}
   }
   const result=await apiRequest(context.origin,'/api/jobs/search',body);
   if(snapshot!==fingerprint())throw new Error('Your resume or preferences changed. Search again with the updated information.');
   const visible={...result,jobs:filterJobs(result.jobs)};visible.filtered_count=result.jobs.length-visible.jobs.length;
   acceptSearch({...visible,resume_ranked:hasResume});searchStatus.textContent=searchMessage(visible,hasResume);
   if(result.platform_search?.refreshing)pollPlatform(body,snapshot,sequence,hasResume);
  }catch(e){searchStatus.textContent=/changed/.test(e.message)?e.message:'Job search is temporarily unavailable. Please try again shortly.';}
  finally{running=false;$('find-jobs').disabled=false;}
 }
 function assessmentHtml(a){
  if(!a)return '';
  return `<section class="agent-assessment"><h3>${a.decision==='shortlist'?'AI shortlist':a.decision==='exclude'?'Requirements gap':'Needs your review'} · ${a.score}/100 documented fit</h3><p>${esc(a.reason)}</p>${a.requirements.map(r=>`<div class="requirement ${esc(r.status)}"><strong>${esc(r.requirement)}</strong><span>${esc(r.importance)} · ${esc(r.status)}</span><p><b>Job:</b> ${esc(r.job_quote||'Evidence unavailable')}</p><p><b>Resume:</b> ${esc(r.resume_quote||'Not evidenced in the resume')}</p></div>`).join('')}<p><strong>Experience:</strong> ${esc(a.experience)} · ${esc(a.experience_quote||'Not established by the listing')}</p><p><strong>Work style:</strong> ${esc(a.work_style)} · ${esc(a.work_style_quote||'Ask the employer to confirm')}</p>${a.questions.length?`<h4>Check before applying</h4><p>${a.questions.map(esc).join('<br>')}</p>`:''}</section>`;
 }
 function showJobTools(job){
  const description=$('detail-content').querySelector('.job-description');
  const reviewArea=document.createElement('div');reviewArea.id='ai-fit-review';description.after(reviewArea);reviewArea.innerHTML=assessmentHtml(job.agent);
  const reviewButton=document.createElement('button');reviewButton.id='review-fit-button';reviewButton.className='secondary';reviewButton.type='button';reviewButton.textContent='Review my fit';reviewArea.before(reviewButton);
  const dataPermission=document.createElement('button');dataPermission.type='button';dataPermission.className='data-permission';dataPermission.textContent='AI data permission';reviewArea.after(dataPermission);dataPermission.onclick=()=>permission(true);
  reviewButton.onclick=async()=>{
   const source=getResume().replace(/\r\n?/g,'\n'),snapshot=fingerprint();
   if(source.trim().length<40){reviewArea.textContent='Upload or paste your full resume first.';return;}
   reviewButton.disabled=true;
   try{
    const context=await requireAI();current(snapshot);
    const key=JSON.stringify({source,preferences:getPreferences(),model:context.model,job:{id:job.id,company:job.company,title:job.title,description:job.description,location:job.location}});
    reviewArea.textContent='Reviewing your experience against this role...';let result=completedReviews.get(key);
    if(!result){
     // The backend understands the original resume once and reuses that profile internally.
     const data=await requestAI(context,'/api/agent/shortlist',{resume:source,preferences:getPreferences(),jobs:[{id:job.id,title:job.title,company:job.company,description:job.description,location:job.location}],limit:4});
     if(data.assessments.length!==1||data.assessments[0].job_id!==job.id)throw new Error('The job review was incomplete.');
     result=withConfirmedExperience(data.assessments[0],getPreferences().experience);
    }
    current(snapshot);completedReviews.set(key,result);while(completedReviews.size>100)completedReviews.delete(completedReviews.keys().next().value);
    if(!reviewArea.isConnected)return;reviewArea.innerHTML=assessmentHtml(result);job.agent=result;acceptAssessment(job,result);
   }catch(e){if(reviewArea.isConnected)reviewArea.textContent=friendlyAiError(e);}finally{reviewButton.disabled=false;}
  };
  const button=document.createElement('button');button.className='find-jobs';button.type='button';button.id='ai-tailor';button.textContent='Tailor my resume';
  $('analyze-resume').textContent='Simple formatting';$('analyze-resume').after(button);
  const container=document.createElement('div');container.id='ai-tailoring';button.after(container);
  $('tailor-source').addEventListener('input',()=>{revision++;container.replaceChildren();});
  button.onclick=async()=>{
   const matchingSource=$('tailor-source').value.replace(/\r\n?/g,'\n');let source=matchingSource,confirmedFacts=[],previousContent=null;
   const startedRevision=++revision;
   if(source.trim().length<40){container.textContent='Provide your complete original resume first.';return;}
   button.disabled=true;
   try{
    if(matchingSource!==getResume().replace(/\r\n?/g,'\n'))throw new Error('Your resume changed here. Update the matching resume using Use this resume before AI tailoring.');
    if(!canTailor(matchingSource))throw new Error('Review your imported resume warnings above the job results and acknowledge them before AI tailoring.');
    const answers=await interview(matchingSource,job);if(!answers)return;source=answers.source;confirmedFacts=answers.facts||[];
    if(!container.isConnected||startedRevision!==revision||getResume().replace(/\r\n?/g,'\n')!==matchingSource)throw new Error('Your resume changed. Start a fresh review.');
    const context=await requireAI();
    if(!(context.status.capabilities||[]).includes('tailoring-evidence-v2'))throw new Error('Restart the backend with python start_agent.py to load evidence-based tailoring.');
    if(!(context.status.capabilities||[]).includes('bulk-resume-corrections'))throw new Error('Restart the backend with python start_agent.py to load full resume review and bulk corrections.');
    if(!container.isConnected||$('tailor-source').value.replace(/\r\n?/g,'\n')!==matchingSource)throw new Error('Your resume changed. Request fresh suggestions.');
    if(matchingSource!==getResume().replace(/\r\n?/g,'\n'))throw new Error('Your resume changed here. Update the matching resume using Use this resume before AI tailoring.');
    if(!canTailor(matchingSource))throw new Error('Review your imported resume warnings above the job results and acknowledge them before AI tailoring.');
    previousContent=[...container.childNodes];
    container.textContent='Preparing the job evidence map and checking role-specific suggestions against your original experience...';
    let data=await requestAI(context,'/api/agent/tailor',{resume:source,job:{id:job.id,title:job.title,company:job.company,description:job.description,location:job.location}});
    if(!container.isConnected||startedRevision!==revision||getResume().replace(/\r\n?/g,'\n')!==matchingSource||$('tailor-source').value.replace(/\r\n?/g,'\n')!==matchingSource||!consented)return;
    function renderSuggestions(selection=null){
    const labels={supported:'Supported',partial:'Partially supported',missing:'Missing',unknown:'Unclear'};
    container.innerHTML=`<h4>Job requirement evidence</h4><p>A focused review of up to eight decisive requirements, not an exhaustive eligibility assessment. Missing qualifications are never added to your resume.</p>${(data.requirements||[]).map(r=>`<div class="requirement ${esc(r.status)}"><strong>${esc(r.requirement)}</strong><span>${esc(r.importance)} · ${esc(labels[r.status]||'Unclear')}</span><p><b>Job:</b> ${esc(r.job_quote||'Evidence unavailable')}</p><p><b>Resume:</b> ${esc(r.resume_quote||'Not evidenced')}</p></div>`).join('')||'<p>No validated evidence map was returned.</p>'}<h4>Review proposed wording changes</h4><p>${esc(data.note)}</p><p>${data.review_progress?`${data.review_progress.reviewed} of ${data.review_progress.total} editable wording lines reviewed. ${data.review_progress.remaining} remaining.`:""}</p><div class="correction-actions"><button type="button" id="select-all-ai" class="secondary">Select all compatible changes</button><button type="button" id="clear-ai-selection" class="secondary">Clear selection</button><button type="button" id="apply-all-ai" class="find-jobs">Apply all compatible changes</button>${data.review_progress?.remaining?`<button type="button" id="review-more-lines" class="secondary">Review next ${Math.min(8,data.review_progress.remaining)} lines</button>`:""}</div><p id="correction-selection-status" role="status"></p>${data.suggestions.map((s,i)=>`<label class="ai-edit"><input type="checkbox" data-wording="${i}" value="${i}"><span><strong>Original</strong><p>${esc(s.original)}</p><strong>Suggestion</strong><p>${esc(s.replacement)}</p><small>${esc(s.rationale)}</small><p><b>Job evidence:</b> ${esc(s.job_quote)}</p></span></label>`).join('')||'<p>No wording changes passed the factual checks. Keep the original text and review the advice below.</p>'}${data.summary_suggestion?`<h4>Optional role-specific summary</h4><label class="ai-edit"><input type="checkbox" id="select-summary"><span><strong>${data.summary_suggestion.replace_indices.length?'Replace existing summary':'Insert summary'}</strong><p>${esc(data.summary_suggestion.text)}</p><small>${esc(data.summary_suggestion.rationale)}</small><p><b>Resume evidence:</b> ${data.summary_suggestion.resume_quotes.map(esc).join('<br>')}</p><p><b>Job evidence:</b> ${esc(data.summary_suggestion.job_quote)}</p></span></label>`:''}${(data.ordering_suggestions||[]).length?`<h4>Optional emphasis and ordering</h4>${data.ordering_suggestions.map((o,i)=>`<label class="ai-edit"><input type="checkbox" data-ordering="${i}"><span><strong>${esc(o.label)}</strong><p>${esc(o.rationale)}</p><p><b>Proposed order:</b> ${o.item_order.map(n=>esc(source.split('\n')[o.items[n][0]])).join(' → ')}</p><p><b>Job evidence:</b> ${esc(o.job_quote)}</p></span></label>`).join('')}`:''}<h4>Job-specific advice</h4><p>${data.advice.map(esc).join('<br>')}</p><button id="apply-ai-edits" class="secondary">Build draft with selected edits</button><div id="ai-draft"></div>`;
    container.onchange=()=>{
     $('ai-draft').replaceChildren();
     for(const input of container.querySelectorAll('[data-wording]')){
      const overlaps=(data.summary_suggestion?.replace_indices||[]).includes(data.suggestions[Number(input.dataset.wording)].line_index);
      input.disabled=!!$('select-summary')?.checked&&overlaps;
      if(input.disabled)input.checked=false;
     }
    };
    const choose=choices=>{
     if($('select-summary'))$('select-summary').checked=!!choices.summary;
     for(const input of container.querySelectorAll('[data-wording]'))input.checked=choices.wordings.includes(Number(input.dataset.wording));
     for(const input of container.querySelectorAll('[data-ordering]'))input.checked=choices.orderings.includes(Number(input.dataset.ordering));
     container.onchange();
    };
    $('select-all-ai').onclick=()=>{const choices=allCorrectionChoices(data);choose(choices);$('correction-selection-status').textContent=choices.conflict?'All wording corrections and ordering changes selected. The replacement summary is an alternative to edits of those same lines; choose it separately if preferred.':'All compatible corrections selected.';};
    $('clear-ai-selection').onclick=()=>{choose({wordings:[],orderings:[],summary:false});$('correction-selection-status').textContent='Selection cleared.';};
    $('apply-all-ai').onclick=()=>{$('select-all-ai').onclick();$('apply-ai-edits').onclick();};
    if(selection){choose({wordings:data.suggestions.flatMap((s,i)=>selection.wordingIds.includes(s.line_index)?[i]:[]),orderings:(data.ordering_suggestions||[]).flatMap((o,i)=>selection.orderingIds.includes(o.group_id)?[i]:[]),summary:selection.summary});}
    if(data.review_progress?.remaining)$('review-more-lines').onclick=async()=>{
     const nextButton=$('review-more-lines'),progressStatus=$('correction-selection-status');nextButton.disabled=true;progressStatus.textContent='Reviewing the next wording lines. Existing corrections remain available.';
     try{
      if(!consented||startedRevision!==revision||getResume().replace(/\r\n?/g,'\n')!==matchingSource)throw new Error('Your resume or permission changed. Start a fresh review.');
      const next=await requestAI(context,'/api/agent/tailor',{resume:source,job:{id:job.id,title:job.title,company:job.company,description:job.description,location:job.location},reviewed_line_indices:data.review_progress.reviewed_line_indices});
      if(!container.isConnected||!consented||startedRevision!==revision||getResume().replace(/\r\n?/g,'\n')!==matchingSource)return;
      const selected={wordingIds:[...container.querySelectorAll('[data-wording]:checked')].map(x=>data.suggestions[Number(x.dataset.wording)].line_index),orderingIds:[...container.querySelectorAll('[data-ordering]:checked')].map(x=>data.ordering_suggestions[Number(x.dataset.ordering)].group_id),summary:!!$('select-summary')?.checked};
      data=mergeCorrectionBatch(data,next);renderSuggestions(selected);
     }catch(error){progressStatus.textContent=friendlyAiError(error)+' Your earlier corrections are still available.';}finally{nextButton.disabled=false;}
    };
    $('apply-ai-edits').onclick=()=>{
     if(!consented||getResume().replace(/\r\n?/g,'\n')!==matchingSource||$('tailor-source').value.replace(/\r\n?/g,'\n')!==matchingSource){container.textContent='Your resume or AI permission changed. Request fresh suggestions.';return;}
     const approvedSelection={wordings:[...container.querySelectorAll('[data-wording]:checked')].map(x=>Number(x.dataset.wording)),summary:!!$('select-summary')?.checked,orderings:[...container.querySelectorAll('[data-ordering]:checked')].map(x=>Number(x.dataset.ordering))};let draft;try{draft=buildReviewedDraft(source,data,approvedSelection);}catch(error){container.textContent=error.message;return;}
     const changes=draftChanges(matchingSource,source,draft,data,approvedSelection,confirmedFacts);
     $('ai-draft').innerHTML=`<h4>Your reviewed ATS draft</h4><details class="draft-change-review"><summary>Review changes and job evidence (${changes.length})</summary>${changes.map(c=>`<article><strong>${esc(c.kind)}</strong><p><b>Before / source:</b> ${esc(c.before)}</p><p><b>After / addition:</b> ${esc(c.after)}</p><p>${esc(c.reason)}</p>${c.job?`<p><b>Job requirement:</b> ${esc(c.job)}</p>`:''}</article>`).join('')||'<p>No content changes selected. Formatting only.</p>'}<p>Unmet or unclear requirements remain in the evidence map above. No ATS or selection guarantee is implied.</p></details><p>Only your approved clarification facts and selected wording, summary, and ordering changes are applied. Existing skills are separated with commas; AI cannot add unsupported skills. Review the full draft before applying. Your original matching resume is unchanged.</p><div id="ai-builder"></div><details class="resume-plain-text"><summary>View plain resume text</summary><textarea id="ai-preview" readonly aria-label="AI tailored resume draft"></textarea></details><button id="ai-word" class="find-jobs">Download one-page Word resume (.docx)</button><p id="ai-download-status" role="status"></p>`;
     const builderRoot=$('ai-builder');
     const builder=mountResumeBuilder(builderRoot,{text:draft,job,onChange:text=>{$('ai-preview').value=text;$('ai-download-status').textContent='Layout updated. Download again to verify the current draft.';}});
     $('ai-preview').value=draft;
     $('ai-word').onclick=async()=>{
      const button=$('ai-word'),status=$('ai-download-status'),exportText=builder.getText();
      button.disabled=true;status.textContent='Fitting the resume and checking that it is one page...';
      try{const result=await downloadOnePageResume(exportText,('resume-'+job.company+'-'+job.title).replace(/[^a-z0-9-]/gi,'-')+'.docx',()=>builderRoot.isConnected&&builder.getText()===exportText);status.textContent=`One-page Word resume downloaded. ${result.font}, ${result.font_size} pt.`;}
      catch(error){status.textContent=error.message;}finally{button.disabled=false;}
     };
    };
    }
    renderSuggestions();
   }catch(e){if(container.isConnected&&startedRevision===revision){if(previousContent?.length){container.replaceChildren(...previousContent);const error=document.createElement('p');error.setAttribute('role','status');error.textContent=friendlyAiError(e)+' Your previous draft is unchanged.';container.append(error);}else container.textContent=friendlyAiError(e);}}finally{button.disabled=false;}
  };
 }
 function invalidate(){revision++;completedReviews.clear();$('ai-tailoring')?.replaceChildren();$('ai-fit-review')?.replaceChildren();$('draft-output')?.replaceChildren();}
 return {showJobTools,search:run,invalidate};
}

