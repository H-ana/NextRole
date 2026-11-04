import {loadClosedJobs} from './job-availability.mjs?v=165';
import {extractDocxResume,loadMammoth} from './docx-text.mjs?v=159';
import {filterRoleAlignedJobs} from './role-alignment.mjs?v=153';
import {openJobResume} from './free-resume-tools.mjs?v=164';
import {searchPublicJobs} from './public-search.mjs?v=165';
import {setupPublicExperience} from './public-experience.mjs?v=165';
import {retainResumeFile,retainedResumeFile,retainedResumeMetadata,clearResumeFile} from './resume-file-store.mjs?v=126';
import {setupAutofillProfile} from './autofill-profile.mjs?v=133';
import {experienceFit,recommendationExperience} from './experience-policy.mjs?v=153';
import {employerIndex,isMncEmployer,mncListings} from './mnc-employers.mjs?v=113';
import {postingFreshness,matchesPostingFreshness} from './posting-freshness.mjs?v=113';
import {mountJobContacts,publishedJobContacts} from './job-contacts.mjs?v=113';
import {readRetainedResume,retainResume} from './resume-storage.mjs?v=126';
import {setupOpportunityTools,deduplicateJobs,matchExplanation,preferenceKey,additionalApplicationLinks} from './opportunity-tools.mjs?v=153';
import {jobCardDetails} from './job-card-details.mjs?v=113';
import {setupApplicationTracker} from './application-tracker.mjs?v=136';
import {mountApplicationWriting} from './application-writing.mjs?v=113';
import {eligibleListings} from './listing-checks.mjs?v=165';
import {setupRecruiterInbox} from './recruiter-inbox.mjs?v=134';
import {mountReferralTools} from './referral-tools.mjs?v=155';
import {findBackend,apiRequest} from './api-client.mjs?v=116';
import {setupAgentUI} from './agent-ui.mjs?v=153';
import {setupPlatformJobs,applicationLabel,matchesJobSite} from './platform-jobs.mjs?v=137';
import {displayedScore,strongMatch,fitReviewContext} from './job-ranking.mjs?v=113';
import {downloadOnePageResume} from './one-page-export.mjs?v=116';
import {formatSkillSections} from './skill-format.mjs?v=113';
import {mountResumeBuilder} from './resume-builder.mjs?v=113';
import {pdfPageText,setupExtractionReview} from './extraction-review.mjs?v=124';
import {HIRING_CITIES, canonicalCity, matchesPreferredCities} from './locations.mjs?v=153';
import {extract, safeUrl, evidenceFor, tailorResume, hasSkillOverlap, requiredYears, meetsKnownExperience} from './resume-tools.mjs?v=113';
await loadClosedJobs();
const mncIndex=employerIndex(await fetch(new URL('./mnc-employers.json?v=163',import.meta.url)).then(r=>{if(!r.ok)throw new Error('Employer policy unavailable');return r.json();}).catch(()=>({companies:[]})));
const recommendedListings=items=>filterRoleAlignedJobs(mncListings(eligibleListings(items),mncIndex).filter(job=>recommendationExperience(job,$('experience').value)),$('resume-text').value,{target_roles:$('search').value.trim()});
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function score(job,skills,years){if(!skills.length)return null;const hits=job.skills.filter(s=>skills.some(x=>x.toLowerCase()===s.toLowerCase()));const skillScore=job.skills.length?hits.length/job.skills.length:0;return Math.round(skillScore*80+(years>=job.years?20:20*years/Math.max(1,job.years)));}
let originalResume='', activeJob=null;
let relevantOnly=false, loadedOnce=false,resultsRanked=false;
const fitReviews=new Map();
let jobs=[],tab='all',view='all',saved=new Set();try{saved=new Set(JSON.parse(localStorage.getItem('nextrole-saved')||'[]'));}catch{}
const isSaved=job=>saved.has(job.id)||(job.alias_ids||[]).some(id=>saved.has(id));
let profile={experience:'',cities:[],workstyle:'any',include_nearby:false};try{profile={...profile,...JSON.parse(localStorage.getItem('nextrole-profile')||'{}')};}catch{}
let selectedCities=(Array.isArray(profile.cities)?profile.cities:[]).map(canonicalCity).filter(Boolean);
// Keep an old city preference; removed state/country preferences become Any city.
if(!selectedCities.length&&profile.location&&canonicalCity(profile.location))selectedCities=[canonicalCity(profile.location)];
selectedCities=[...new Set(selectedCities)];
$('city-options').innerHTML=HIRING_CITIES.map(city=>`<label class="city-option"><input type="checkbox" name="cities" value="${esc(city)}" aria-label="${esc(city)}" ${selectedCities.includes(city)?'checked':''}><span>${esc(city)}</span></label>`).join('');
for(const key of ['experience','workstyle'])$(key).value=profile[key];
$('include-nearby').checked=!!profile.include_nearby;$('include-nearby').onchange=saveProfile;
const opportunity=setupOpportunityTools({onChange:()=>render(),allowJob:job=>isMncEmployer(job,mncIndex)&&!!recommendationExperience(job,$('experience').value)&&filterRoleAlignedJobs([job],$('resume-text').value,{target_roles:$('search').value.trim()}).length>0});
$('upload-status').textContent='Resume not loaded. Upload or paste your full resume to rank jobs.';
const remoteMode=()=>$('workstyle').value==='Remote';
function updateCityPicker(){
 const remote=remoteMode();
 $('city-field').hidden=remote;$('nearby-option').hidden=remote;$('remote-location-note').hidden=!remote;
 $('city-options').disabled=remote;
 if(remote)$('city-picker').open=false;
 $('city-summary').textContent=selectedCities.length?selectedCities.length<=2?selectedCities.join(', '):`${selectedCities.length} cities selected`:'Any city';
}
function saveProfile(){
 profile={experience:$('experience').value,cities:selectedCities,workstyle:$('workstyle').value,include_nearby:!!$('include-nearby').checked};
 try{localStorage.setItem('nextrole-profile',JSON.stringify(profile));}catch{}
 updateCityPicker();invalidateAgentResults();opportunity.refresh();render();
}
function invalidateAgentResults(){
 if($('detail').open)$('detail').close();
 agentUI.invalidate();fitReviews.clear();
 resultsRanked=false;
 if(!jobs.some(job=>job.agent||job.ranking_method))return;
 jobs=jobs.map(({agent,relevance_score,semantic_score,ranking_method,...job})=>job);
 $('results-heading').firstChild.textContent='Search preferences changed ';
 $('source-note').textContent='Search again to update the results for your resume and preferences.';
 if($('search-status')){$('search-status').hidden=false;$('search-status').textContent='Your preferences changed. Find jobs again to update your results.';}
}
const resumeStorage=(()=>{try{return window.localStorage;}catch{return null;}})();
let resumeRetained=false;
const resumeSavedStatus=document.createElement('p');resumeSavedStatus.id='resume-saved-status';resumeSavedStatus.setAttribute('role','status');$('upload-status').after(resumeSavedStatus);let resumeStatusGeneration=0;
async function updateResumeSavedStatus(){const generation=++resumeStatusGeneration,source=$('resume-text').value;if(!source.trim()){resumeSavedStatus.textContent='';return;}const metadata=await retainedResumeMetadata(source);if(generation!==resumeStatusGeneration)return;let record;try{record=JSON.parse(resumeStorage?.getItem('nextrole-retained-resume-v1')||'null');}catch{}const time=metadata?.savedAt||record?.savedAt,when=time?' · '+new Date(time).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'';resumeSavedStatus.textContent=metadata?.matchesSource?'Resume saved: '+metadata.name+when:metadata?'Resume text saved on this device'+when+'. The stored file differs from the edited text; choose the matching PDF/Word file in autofill setup.':record?.text===source?'Resume text saved on this device'+when+'. Choose a PDF/Word file in autofill setup if you want to attach it.':'Resume loaded for this visit only. Browser storage could not retain it.';}
window.addEventListener('nextrole-resume-file-changed',updateResumeSavedStatus);
function persistResume(){updateResumeSavedStatus();originalResume=$('resume-text').value;resumeRetained=retainResume(resumeStorage,originalResume);$('remove-resume').hidden=!originalResume.trim();if(originalResume.trim())$('upload-status').textContent=resumeRetained?'Resume saved in this browser. Find jobs to update matches after editing.':'Resume is loaded for this visit, but browser storage is unavailable or full. It could not be retained.';else $('upload-status').textContent='Resume removed. Upload or paste another resume to rank jobs.';}
const removeResume=document.createElement('button');removeResume.id='remove-resume';removeResume.type='button';removeResume.className='secondary';removeResume.textContent='Remove resume';removeResume.hidden=true;$('upload-status').after(removeResume);
removeResume.onclick=async()=>{if(!await clearResumeFile()){$('upload-status').textContent='The saved resume file could not be removed. Try again or clear this website’s browser data.';return false;}$('resume-text').value='';$('resume-text').dispatchEvent(new Event('input'));browseGeneration++;clearTimeout(cachePoll);loadJobs(false);return true;};
$('resume-text').addEventListener('input',()=>{persistResume();invalidateAgentResults();extractionReview.render();render();});
$('city-options').onchange=()=>{selectedCities=[...$('city-options').querySelectorAll('input:checked')].map(input=>input.value);saveProfile();};
$('clear-cities').onclick=()=>{selectedCities=[];$('city-options').querySelectorAll('input').forEach(input=>input.checked=false);saveProfile();};
document.addEventListener('click',event=>{if(!$('city-picker').contains(event.target))$('city-picker').open=false;});
$('city-picker').addEventListener('keydown',event=>{if(event.key==='Escape'){$('city-picker').open=false;$('city-summary').focus();}});
updateCityPicker();
const skills=()=>extract($('resume-text').value).skills;
function render(){const skillList=skills(),years=Number($('experience').value),q=$('search').value.trim().toLowerCase();let list=jobs.map(j=>({...j,score:displayedScore(j,resultsRanked)})).filter(j=>recommendationExperience(j,$('experience').value)&&matchesPostingFreshness(j,$('posting-age').value)&&matchesJobSite(j,$('job-site').value)&&(view!=='saved'||isSaved(j))&&!opportunity.hidden(j)&&($('workstyle').value==='any'||j.style===$('workstyle').value||j.style==='unknown'||j.agent?.work_style==='unknown')&&matchesPreferredCities(j.location,selectedCities,remoteMode(),!!$('include-nearby').checked)&&(!relevantOnly||((!skillList.length||hasSkillOverlap(j.skills,skillList))&&meetsKnownExperience(j.years,years)))&&(!q||j.ranking_method||(j.title+' '+j.company+' '+j.skills.join(' ')).toLowerCase().includes(q)));list.sort($('sort').value==='title'?(a,b)=>a.title.localeCompare(b.title):(a,b)=>((b.score??0)-opportunity.penalty(b))-((a.score??0)-opportunity.penalty(a)));list.sort((a,b)=>Number(!experienceFit(a,$('experience').value))-Number(!experienceFit(b,$('experience').value)));const reviewCandidate=list.find(j=>j.score===null);if(tab==='strong')list=list.filter(j=>strongMatch(j,$('resume-text').value,currentFitPreferences()).strong);$('count').textContent=list.length;$('saved-count').textContent=saved.size;$('jobs').innerHTML=list.map((j,i)=>`${i===0||!!experienceFit(j,$('experience').value)!==!!experienceFit(list[i-1],$('experience').value)?`<h3 class="job-group-heading">${experienceFit(j,$('experience').value)?'Experience matched':'Experience not specified'}</h3>`:''}<article class="job${postingFreshness(j)?' recently-posted':''}"><div class="job-top"><div class="company-icon" style="--brand-bg:${j.color||'#eff4ea'}">${esc(j.logo||j.company[0])}</div><div class="company-name">${esc(j.company)}<small>${j.last_checked?(j.collection_method==='Added by you'?'Added by you · ':'Checked ')+new Date(j.last_checked*1000).toLocaleString():j.demo?'Illustrative company role':'Company listing'}</small></div><button class="save ${isSaved(j)?'saved':''}" data-save="${esc(j.id)}" aria-label="${isSaved(j)?'Unsave':'Save'} ${esc(j.title)}" aria-pressed="${isSaved(j)}">${isSaved(j)?'▣':'▱'}</button></div>${postingFreshness(j)?`<div class="posting-freshness"><span class="posted-badge posted-${postingFreshness(j).band}" title="${esc(postingFreshness(j).detail)}">${esc(postingFreshness(j).label)}</span></div>`:''}<h3>${safeUrl(j.url)?`<a class="job-title-link" href="${esc(safeUrl(j.url))}" target="_blank" rel="noopener noreferrer">${esc(j.title)} ↗</a>`:esc(j.title)}</h3><div class="meta"><span>⌖ ${esc(j.location)}</span><span>${esc(jobCardDetails(j).workStyle)}</span><span>${esc(jobCardDetails(j).experience)}</span></div><div class="chips">${j.listed_on?.length?`<span>${esc(j.listed_on.join(' · '))}</span>`:''}${strongMatch(j,$('resume-text').value,currentFitPreferences()).strong?'<span class="agent-badge">Evidence-supported strong match</span>':j.agent?`<span class="agent-badge">${j.agent.decision==='shortlist'?'AI shortlist':j.agent.decision==='exclude'?'Reviewed: gap':'Needs review'}</span>`:''}${j.skills.map(s=>`<span class="${skillList.some(x=>x.toLowerCase()===s.toLowerCase())?'matched':''}">${esc(s)}</span>`).join('')||'<span>Review listing for required skills</span>'}</div>${j.agent?`<p class="agent-card-reason">${esc(j.agent.reason)}</p>`:''}<div class="job-bottom"><span class="match">${j.score===null?'✦ Not ranked yet':`✦ <strong>${j.score}/100</strong> relevance`}</span><div class="job-actions"><button class="view" data-dismiss="${esc(j.id)}">Not a fit</button><button class="view" data-detail="${esc(j.id)}">Details & ATS resume</button>${publishedJobContacts(j).length?`<button class="view" data-contacts="${esc(j.id)}">Recruiter details</button>`:''}<button class="view" data-referral="${esc(j.id)}">Find a referral</button><button class="view" data-writing="${esc(j.id)}">Cover letter & message</button>${safeUrl(j.url)?`<a class="apply-link" href="${esc(safeUrl(j.url))}" target="_blank" rel="noopener noreferrer">${esc(applicationLabel(j))}</a>`:""}</div></div></article>`).join('')||`<div class="empty">${loadedOnce?(tab==='strong'?`No reviewed strong matches yet. A strong match needs evidence for the reviewed mandatory requirements and confirmed experience fit.${reviewCandidate&&$('resume-text').value.trim().length>=40?`<p><button class="secondary" data-review-fit="${esc(reviewCandidate.id)}">Review best unreviewed match · ${esc(reviewCandidate.company)}</button></p>`:''}`:$('posting-age').value!=='all'?'No jobs with a known recent posting date match these filters. Choose Any time or update your search.':$('job-site').value!=='all'?'No jobs from this site match the current results and filters. Choose All sites or update your search.':'No jobs match your current preferences. Try more cities or a broader search.'):'Start by uploading your resume. You can also explore job sites below or set up application autofill.'}</div>`;}
for(const key of ['experience','workstyle'])$(key).addEventListener('input',saveProfile);
$('search').addEventListener('input',()=>{invalidateAgentResults();render();});$('sort').addEventListener('input',render);$('job-site').addEventListener('change',render);$('posting-age').addEventListener('change',render);
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;updateCityPicker();document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('selected',x===b));render();});
const jobsContent=document.querySelector('main > .content');
const referralNav=document.createElement('button');referralNav.dataset.view='applications';referralNav.textContent='▤ Applications';$('profile-link').before(referralNav);
const tracker=setupApplicationTracker({onOpen:()=>referralNav.click()});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;jobsContent.hidden=view==='applications';tracker.root.hidden=view!=='applications';$('results-heading').firstChild.textContent=view==='saved'?'Your saved roles ':'Explore your possibilities ';$('breadcrumb').textContent=view==='applications'?'Applications':view==='saved'?'Saved jobs':'Discover jobs';document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));if(view==='applications')tracker.refresh();else tracker.hidePreparation();render();});
$('profile-link').onclick=()=>{document.querySelector('[data-view=all]').click();$('experience').scrollIntoView({behavior:'smooth',block:'center'});$('experience').focus();};
function openDetail(j){
 activeJob=j;
 const otherLinks=additionalApplicationLinks(j);
 const platformLinks=otherLinks.length?`<p>Also listed on: ${otherLinks.map(link=>`<a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.platform)} ↗</a>`).join(' · ')}</p>`:'';
 const matches=j.skills.filter(s=>skills().some(x=>x.toLowerCase()===s.toLowerCase()));
 $('detail-content').innerHTML=`<div class="eyebrow">${j.collection_method==='Added by you'?'ADDED BY YOU · VERIFY AVAILABILITY':j.demo?'DEMO ROLE':j.application_links?'PLATFORM JOB LISTING':'COMPANY OPPORTUNITY'}</div><h2>${esc(j.title)}</h2><p>${esc(j.company)} · ${esc(j.location)} · ${esc(j.style)}</p>${safeUrl(j.url)?`<a href="${esc(safeUrl(j.url))}" target="_blank" rel="noopener noreferrer">${esc(applicationLabel(j))}</a>`:'<p>This is an example role. Load live company jobs to apply.</p>'}${platformLinks}<details class="job-description"><summary>Read job description</summary><p class="description-text">${esc(j.description)}</p></details><h3>Your profile fit</h3><p>Matched profile skills: ${esc(matches.join(', ')||'None identified')}<br>${Number.isFinite(j.years)?`Experience mentioned in listing: ${j.years}+ years.`:'Experience: review employer requirements.'}</p><section class="tailoring"><h3>Tailor your resume for this role</h3><p>Use a simple text layout and highlight relevant skills already in your resume. Employers, dates, degrees, accomplishments, and experience stay as supplied. Drafts do not affect job recommendations.</p><p>Review the extracted resume before tailoring. For PDFs, check reading order and line breaks. ATS compatibility and selection are not guaranteed.</p><label class="source-label">Original resume text<textarea id="tailor-source" placeholder="Upload a resume above or paste the complete original here"></textarea></label><button id="analyze-resume" class="secondary">Review role keywords</button><div id="tailor-results" aria-live="polite"></div></section>`;
 const contactRoot=document.createElement('section');$('detail-content').querySelector('.job-description').after(contactRoot);mountJobContacts(contactRoot,j);
 const referralRoot=document.createElement('section');
 $('detail-content').querySelector('.job-description').after(referralRoot);
 mountReferralTools(referralRoot,j,{onExplore:job=>tracker.trackJob(job)});
 const writingRoot=document.createElement('details');writingRoot.id='application-writing';
 $('detail-content').querySelector('.job-description').after(writingRoot);
 mountApplicationWriting(writingRoot,j);
 $('tailor-source').value=$('resume-text').value;
 $('analyze-resume').onclick=analyzeResume;
 agentUI.showJobTools(j);
 if(!$('detail').open)$('detail').showModal();
}
$('jobs').onclick=e=>{const fit=e.target.closest('[data-review-fit]');if(fit){const job=jobs.find(j=>j.id===fit.dataset.reviewFit);if(job){openDetail(job);$('review-fit-button').click();}return;}const contact=e.target.closest('[data-contacts]');if(contact){const job=jobs.find(j=>j.id===contact.dataset.contacts);if(job){openDetail(job);$('job-recruiter-details').scrollIntoView({block:'start'});$('job-recruiter-details').focus({preventScroll:true});}return;}const dismiss=e.target.closest('[data-dismiss]');if(dismiss){const job=jobs.find(j=>j.id===dismiss.dataset.dismiss);if(job)opportunity.dismiss(job);return;}const save=e.target.closest('[data-save]');if(save){const id=save.dataset.save,job=jobs.find(j=>j.id===id);if(job&&isSaved(job)){for(const alias of [job.id,...(job.alias_ids||[])])saved.delete(alias);}else saved.add(id);try{localStorage.setItem('nextrole-saved',JSON.stringify([...saved]));}catch{}render();return;}const writing=e.target.closest('[data-writing]');if(writing){const job=jobs.find(x=>x.id===writing.dataset.writing);if(job){openDetail(job);$('application-writing').open=true;$('application-writing').scrollIntoView({block:'start'});}return;}const referral=e.target.closest('[data-referral]');if(referral){const job=jobs.find(x=>x.id===referral.dataset.referral);if(job){tracker.trackJob(job);openDetail(job);$('referral-tools').scrollIntoView({block:'start'});$('referral-tools').focus({preventScroll:true});}return;}const detail=e.target.closest('[data-detail]');if(detail)openDetail(jobs.find(x=>x.id===detail.dataset.detail));};
function analyzeResume(){
 const source=$('tailor-source').value;
 const results=$('tailor-results');
 try{
  const draft=tailorResume(source,activeJob);
  results.innerHTML=`<h4>Keywords found in your resume</h4><p>Select only skills the quoted text supports and you actually possess. Keyword detection does not determine proficiency or whether a mention is negated.</p>${draft.supported.map((skill,i)=>`<label class="evidence"><input type="checkbox" value="${esc(skill)}" data-evidence="${i}"><span><strong>${esc(skill)}</strong><small>${esc(evidenceFor(source,skill).join(' / '))}</small></span></label>`).join('')||'<p>No known role keywords found in the original. Your draft will preserve the original text.</p>'}<h4>Not evidenced in your resume</h4><p>${esc(draft.missing.join(', ')||'All recognized role keywords appear in your resume. Confirm their context above.')}</p><p>These gaps are not added to the draft. Review the full job description for requirements outside our keyword dictionary.</p><button id="build-draft" class="secondary">Create ATS text draft</button><div id="draft-output"></div>`;
  results.onchange=()=>{$('draft-output').replaceChildren();};
  $('build-draft').onclick=()=>{
   const selected=[...results.querySelectorAll('[data-evidence]:checked')].map(x=>x.value);
   const tailored=tailorResume(source,activeJob,selected);
   tailored.text=formatSkillSections(tailored.text);
   tailored.changes.push('Formatted existing skills as a comma-separated list; added no skills.');
   $('draft-output').innerHTML=`<h4>Draft for ${esc(activeJob.title)} at ${esc(activeJob.company)}</h4><p>${tailored.changes.map(esc).join('<br>')}</p><p>Review against your original before applying. The download contains resume content only.</p><div id="draft-builder"></div><details class="resume-plain-text"><summary>View plain resume text</summary><textarea id="draft-preview" readonly aria-label="Plain resume draft"></textarea></details><div class="download-actions"><button id="download-word" class="find-jobs">Download one-page Word (.docx)</button><button id="download-draft" class="secondary">Download text (.txt)</button></div><p id="download-status" role="status"></p>`;
   const builderRoot=$('draft-builder');
   const builder=mountResumeBuilder(builderRoot,{text:tailored.text,job:activeJob,onChange:text=>{$('draft-preview').value=text;$('download-status').textContent='Layout updated. Download again to verify the current draft.';}});
   $('draft-preview').value=tailored.text;
   if(!['localhost','127.0.0.1'].includes(location.hostname))$('download-word').textContent='Review & export locally';
   $('download-word').onclick=async()=>{
    if(!['localhost','127.0.0.1'].includes(location.hostname)){$('detail').close();openJobResume({description:activeJob.description,draft:builder.getText(),title:activeJob.title,company:activeJob.company});return;}
    const button=$('download-word'),status=$('download-status'),exportText=builder.getText();
    button.disabled=true;status.textContent='Fitting the resume and checking that it is one page...';
    try{
     const result=await downloadOnePageResume(exportText,`resume-${activeJob.company}-${activeJob.title}`.replace(/[^a-z0-9-]/gi,'-')+'.docx',()=>builderRoot.isConnected&&builder.getText()===exportText);
     status.textContent=`One-page Word resume downloaded. ${result.font}, ${result.font_size} pt. Your qualifications and experience are unchanged.`;
    }catch(e){status.textContent=e.message;}finally{button.disabled=false;}
   };
   $('download-draft').onclick=()=>{const url=URL.createObjectURL(new Blob([builder.getText()],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`resume-${activeJob.company}-${activeJob.title}`.replace(/[^a-z0-9-]/gi,'-')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  };
  $('tailor-source').oninput=()=>{results.replaceChildren();};
 }catch(e){results.textContent=e.message;}
}
$('close').onclick=()=>$('detail').close();
function importText(text){if(!text.trim())throw new Error('No readable text found. Paste your resume text instead.');originalResume=text;$('resume-text').value=text;$('resume-text').dispatchEvent(new Event('input'));const p=extract(text);if(p.years!==null){$('experience').value=String(p.years);}$('experience').dispatchEvent(new Event('input'));$('upload-status').textContent=(resumeRetained?'Resume loaded and saved in this browser. ':'Resume loaded for this visit; browser storage is unavailable or full. ')+'Review your extracted resume and confirm your total years of experience. Your application autofill profile is ready to review.';agentUI.search();}
$('extract').onclick=()=>{try{importText($('resume-text').value);}catch(e){$('upload-status').textContent=e.message;}};
$('resume').onchange=async e=>{const f=e.target.files[0];if(!f)return;$('upload-status').textContent='Reading your resume…';try{if(f.size>5*1024*1024)throw new Error('Please choose a file smaller than 5 MB.');const ext=f.name.split('.').pop().toLowerCase();let text;if(ext==='txt')text=await f.text();else if(ext==='pdf'){const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';const pdf=await pdfjs.getDocument({data:await f.arrayBuffer()}).promise;const pages=[];for(let i=1;i<=pdf.numPages;i++)pages.push(pdfPageText((await(await pdf.getPage(i)).getTextContent()).items));text=pages.join('\n');}else if(ext==='docx'){const parser=await loadMammoth();text=await extractDocxResume(parser,await f.arrayBuffer());}else throw new Error('Use a PDF, DOCX or TXT file.');importText(text);const fileSaved=await retainResumeFile(f,text);await updateResumeSavedStatus();if(!fileSaved&&ext!=='txt')resumeSavedStatus.textContent+=' The PDF/Word file could not be saved; select it again for autofill.';}catch(e){$('upload-status').textContent=`Could not read resume: ${e.message} You can paste text below.`;}e.target.value='';};
// Public jobs are collected by the backend, independently of Gemini and applicant searches.
let cachedApi=null,cachePoll=null,pollAttempts=0,browseGeneration=0;
function currentFitPreferences(){return {experience:Number($('experience').value),cities:remoteMode()?[]:selectedCities,workstyle:remoteMode()?'Remote':$('workstyle').value,target_roles:$('search').value.trim(),include_nearby:!!$('include-nearby').checked};}
function uiJobs(items){return deduplicateJobs(recommendedListings(items)).map(j=>{const style=jobCardDetails(j).workStyle.replace(/^◷ /,'');const job={...j,style:['Remote','Hybrid','On-site'].includes(style)?style:j.style,skills:extract(j.title+' '+j.description).skills};const review=fitReviews.get(job.id);if(review?.context===fitReviewContext(job,$('resume-text').value,currentFitPreferences()))job.agent=review.assessment;return job;});}
function observeMatches(){opportunity.observe(jobs,preferenceKey($('resume-text').value,{cities:selectedCities,workstyle:$('workstyle').value,experience:$('experience').value,query:$('search').value}),resultsRanked);}
function filterExplanation(data){
 if(data.jobs.length||!Number.isFinite(data.excluded_location))return '';
 const reasons=[];
 if(data.excluded_location)reasons.push(`${data.excluded_location} outside your selected cities or without a confirmed location`);
 if(data.excluded_workstyle)reasons.push(`${data.excluded_workstyle} with a different work style`);
 if(data.excluded_experience_unknown)reasons.push(`${data.excluded_experience_unknown} without a clear experience requirement`);
 if(data.experience_gaps)reasons.push(`${data.experience_gaps} outside your confirmed experience band`);
 return reasons.length?` Excluded: ${reasons.join('; ')}.`:'';
}
function showCacheMeta(data){
 return '';
}
async function loadJobs(refresh=false){
 if(!['localhost','127.0.0.1'].includes(location.hostname)){try{const data=await runPublicSearch(refresh);jobs=uiJobs(data.jobs);loadedOnce=true;resultsRanked=data.resume_ranked;observeMatches();$('results-heading').firstChild.textContent='Relevant openings ';$('source-note').textContent=publicResultNote(data);render();return true;}catch(e){$('source-note').textContent=e.message;return false;}}
 const generation=browseGeneration,button=$('live');button.disabled=true;
 try{
  const backend=await findBackend();cachedApi=backend.origin;
  if(!(backend.status.capabilities||[]).includes('careers-page-scraping')){
   jobs=[];loadedOnce=false;render();$('find-jobs').disabled=true;
   $('source-note').textContent='Job search is unavailable right now. You can explore job sites using the links below.';return false;
  }
  $('find-jobs').disabled=false;
  if(!(backend.status.capabilities||[]).includes('cached-job-search'))throw new Error('Job search is unavailable right now.');
  if(refresh)await apiRequest(cachedApi,'/api/jobs/refresh',{},10000);
  const resume=$('resume-text').value.trim().length>=40?$('resume-text').value:'';
  const data=await apiRequest(cachedApi,'/api/jobs/search',{resume,preferences:{experience:Number($('experience').value),cities:remoteMode()?[]:selectedCities,workstyle:remoteMode()?'Remote':$('workstyle').value,target_roles:$('search').value.trim()},limit:200},30000);
  if(generation!==browseGeneration)return false;
  jobs=uiJobs(data.jobs);loadedOnce=true;relevantOnly=false;
  resultsRanked=!!resume&&data.ranking_mode!=='browse';
  observeMatches();
  $('results-heading').firstChild.textContent=resultsRanked?'Relevant openings ':'Company openings ';
  $('source-note').textContent=(data.feed_updated?publicResultNote(data):showCacheMeta(data))+(resultsRanked?` Showing ${jobs.length} results ranked for your resume and preferences. Check each job's requirements before applying.`:` Showing ${jobs.length} jobs matching your preferences. Find jobs to rank them using your resume.`)+filterExplanation(data);
  render();
  if((refresh||!data.jobs.length||data.refreshing)&&pollAttempts<45){clearTimeout(cachePoll);cachePoll=setTimeout(()=>{pollAttempts++;loadJobs(false);},3000);}
  return true;
 }catch(e){$('source-note').textContent='Job listings are temporarily unavailable. Please try again shortly.';return false;}
 finally{button.disabled=false;button.textContent='Refresh jobs';}
}
function clearSearchMessage(){if($('search-status')){$('search-status').textContent='';$('search-status').hidden=true;}}
$('live').onclick=()=>{clearSearchMessage();browseGeneration++;pollAttempts=0;loadJobs(true);};
render();
function publicResultNote(data){if(data.manual_only)return 'Showing jobs added by you. Company listings are temporarily unavailable.';return `Company listings last refreshed ${new Date(data.feed_updated*1000).toLocaleString()}. Check availability on the company site. ${data.feed_note||''}`;}
let publicSearchGeneration=0;
async function runPublicSearch(refresh=false){if(!$('experience').value.trim())throw Error('Confirm your years of experience to find matching roles.');const id=++publicSearchGeneration,snapshot=JSON.stringify([$('resume-text').value,currentFitPreferences()]);const result=await searchPublicJobs($('resume-text').value,currentFitPreferences(),{refresh,useSemantic:!!$('local-semantic')?.checked,progress:text=>{if($('search-status')){$('search-status').hidden=false;$('search-status').textContent=text;}}});if(id!==publicSearchGeneration||snapshot!==JSON.stringify([$('resume-text').value,currentFitPreferences()]))throw Error('Your resume or preferences changed. Search again.');return result;}
const agentUI=setupAgentUI({
 publicSearch:!['localhost','127.0.0.1'].includes(location.hostname)?async()=>runPublicSearch(false):null,
 canTailor:source=>extractionReview.ready(source),
 filterJobs:recommendedListings,
 onSearchStart:()=>{browseGeneration++;clearTimeout(cachePoll);},
 getResume:()=>$('resume-text').value,
 getPreferences:()=>({experience:Number($('experience').value),cities:remoteMode()?[]:selectedCities,workstyle:remoteMode()?'Remote':$('workstyle').value,target_roles:$('search').value.trim()}),
 acceptSearch:data=>{
  browseGeneration++;clearTimeout(cachePoll);jobs=uiJobs(data.jobs);loadedOnce=true;relevantOnly=false;if(!data.incremental){if(view!=='applications')view='all';tab='all';}updateCityPicker();
  resultsRanked=data.resume_ranked===true&&data.ranking_mode!=='browse';
  observeMatches();
  $('results-heading').firstChild.textContent=resultsRanked?'Relevant openings ':'Company openings ';
  $('source-note').textContent=(data.feed_updated?publicResultNote(data):showCacheMeta(data))+(resultsRanked?` Showing ${jobs.length} results ranked for your resume and preferences. Check each job's requirements before applying.`:` Showing ${jobs.length} jobs matching your preferences. Upload a resume to rank them.`)+filterExplanation(data);
  render();
 },
 acceptAssessment:(job,assessment)=>{const context=fitReviewContext(job,$('resume-text').value,currentFitPreferences());fitReviews.set(job.id,{context,assessment});jobs=jobs.map(j=>j.id===job.id&&fitReviewContext(j,$('resume-text').value,currentFitPreferences())===context?{...j,agent:assessment}:j);render();}
});
const extractionReview=setupExtractionReview({getResume:()=>$('resume-text').value,onCorrected:text=>importText(text)});
const retainedResume=readRetainedResume(resumeStorage);
if(retainedResume){originalResume=retainedResume;$('resume-text').value=retainedResume;resumeRetained=true;removeResume.hidden=false;$('upload-status').textContent='';extractionReview.render();updateResumeSavedStatus();}
setupPlatformJobs({localOnly:!['localhost','127.0.0.1'].includes(location.hostname),getPreferences:()=>({query:$('search').value.trim(),cities:remoteMode()?[]:selectedCities,workstyle:remoteMode()?'Remote':$('workstyle').value}),onImported:async job=>{browseGeneration++;clearTimeout(cachePoll);if(job){job.skills=extract(job.description).skills;openDetail(job);}else await loadJobs(false);}});
loadJobs(false);


setupRecruiterInbox();

// Refresh cached, locally ranked results while the app is visible. No Gemini call.
setInterval(()=>{if(!document.hidden&&!$('detail').open&&!$('find-jobs').disabled&&$('resume-text').value.trim().length>=40)loadJobs(false);},300000);

setupAutofillProfile({getResume:()=>$('resume-text').value,getYears:()=>$('experience').value,getResumeFile:retainedResumeFile,saveResumeFile:async(file,text)=>{const saved=await retainResumeFile(file,text);await updateResumeSavedStatus();return saved;},clearWebsiteResume:async()=>{if(!await removeResume.onclick())throw Error('Resume removal failed.');}});

setupPublicExperience();
