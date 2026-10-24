import {mountCompanyBrief} from './company-brief.mjs?v=39';
import {mountReferralTools} from './referral-tools.mjs?v=39';
import {findBackend,apiRequest} from './api-client.mjs?v=39';
import {setupAgentUI} from './agent-ui.mjs?v=39';
import {setupPlatformJobs,applicationLabel,matchesJobSite} from './platform-jobs.mjs?v=39';
import {displayedScore} from './job-ranking.mjs?v=39';
import {downloadOnePageResume} from './one-page-export.mjs?v=39';
import {formatSkillSections} from './skill-format.mjs?v=39';
import {mountResumeBuilder} from './resume-builder.mjs?v=39';
import {pdfPageText,setupExtractionReview} from './extraction-review.mjs?v=39';
import {HIRING_CITIES, canonicalCity, matchesCities} from './locations.mjs?v=39';
import {extract, safeUrl, evidenceFor, tailorResume, hasSkillOverlap, requiredYears, meetsKnownExperience} from './resume-tools.mjs?v=39';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function score(job,skills,years){if(!skills.length)return null;const hits=job.skills.filter(s=>skills.some(x=>x.toLowerCase()===s.toLowerCase()));const skillScore=job.skills.length?hits.length/job.skills.length:0;return Math.round(skillScore*80+(years>=job.years?20:20*years/Math.max(1,job.years)));}
let originalResume='', activeJob=null,activeCompanyBrief=null;
let relevantOnly=false, loadedOnce=false,resultsRanked=false;
let jobs=[],tab='all',view='all',saved=new Set();try{saved=new Set(JSON.parse(localStorage.getItem('nextrole-saved')||'[]'));}catch{}
let profile={skills:'',experience:'2',cities:[],workstyle:'any'};try{profile={...profile,...JSON.parse(localStorage.getItem('nextrole-profile')||'{}')};}catch{}
let selectedCities=(Array.isArray(profile.cities)?profile.cities:[]).map(canonicalCity).filter(Boolean);
// Keep an old city preference; removed state/country preferences become Any city.
if(!selectedCities.length&&profile.location&&canonicalCity(profile.location))selectedCities=[canonicalCity(profile.location)];
selectedCities=[...new Set(selectedCities)];
$('city-options').innerHTML=HIRING_CITIES.map(city=>`<label class="city-option"><input type="checkbox" name="cities" value="${esc(city)}" aria-label="${esc(city)}" ${selectedCities.includes(city)?'checked':''}><span>${esc(city)}</span></label>`).join('');
for(const key of ['skills','experience','workstyle'])$(key).value=profile[key];
$('upload-status').textContent='Resume not loaded. Upload or paste your full resume to rank jobs.';
const remoteMode=()=>$('workstyle').value==='Remote'||tab==='Remote';
function updateCityPicker(){
 const remote=remoteMode();
 $('city-field').hidden=remote;$('remote-location-note').hidden=!remote;
 $('city-options').disabled=remote;
 if(remote)$('city-picker').open=false;
 $('city-summary').textContent=selectedCities.length?selectedCities.length<=2?selectedCities.join(', '):`${selectedCities.length} cities selected`:'Any city';
}
function saveProfile(){
 profile={skills:$('skills').value,experience:$('experience').value,cities:selectedCities,workstyle:$('workstyle').value};
 try{localStorage.setItem('nextrole-profile',JSON.stringify(profile));}catch{}
 updateCityPicker();invalidateAgentResults();render();
}
function invalidateAgentResults(){
 if($('detail').open)$('detail').close();
 agentUI.invalidate();
 resultsRanked=false;
 if(!jobs.some(job=>job.agent||job.ranking_method))return;
 jobs=jobs.map(({agent,relevance_score,semantic_score,ranking_method,...job})=>job);
 $('results-heading').firstChild.textContent='Search preferences changed ';
 $('source-note').textContent='Search again to update the results for your resume and preferences.';
 if($('search-status')){$('search-status').hidden=false;$('search-status').textContent='Your preferences changed. Find jobs again to update your results.';}
}
$('resume-text').addEventListener('input',()=>{invalidateAgentResults();extractionReview.render();});
$('city-options').onchange=()=>{selectedCities=[...$('city-options').querySelectorAll('input:checked')].map(input=>input.value);saveProfile();};
$('clear-cities').onclick=()=>{selectedCities=[];$('city-options').querySelectorAll('input').forEach(input=>input.checked=false);saveProfile();};
document.addEventListener('click',event=>{if(!$('city-picker').contains(event.target))$('city-picker').open=false;});
$('city-picker').addEventListener('keydown',event=>{if(event.key==='Escape'){$('city-picker').open=false;$('city-summary').focus();}});
updateCityPicker();
const skills=()=> $('skills').value.split(',').map(s=>s.trim()).filter(Boolean);
function render(){const skillList=skills(),years=Number($('experience').value),q=$('search').value.trim().toLowerCase();let list=jobs.map(j=>({...j,score:displayedScore(j,resultsRanked)})).filter(j=>matchesJobSite(j,$('job-site').value)&&(view!=='saved'||saved.has(j.id))&&(tab!=='strong'||j.score>=70)&&(tab!=='Remote'||j.style==='Remote'||j.style==='unknown')&&($('workstyle').value==='any'||j.style===$('workstyle').value||j.style==='unknown'||j.agent?.work_style==='unknown')&&matchesCities(j.location,selectedCities,remoteMode())&&(!relevantOnly||((!skillList.length||hasSkillOverlap(j.skills,skillList))&&meetsKnownExperience(j.years,years)))&&(!q||j.ranking_method||(j.title+' '+j.company+' '+j.skills.join(' ')).toLowerCase().includes(q)));list.sort($('sort').value==='title'?(a,b)=>a.title.localeCompare(b.title):(a,b)=>(b.score??0)-(a.score??0));$('count').textContent=list.length;$('saved-count').textContent=saved.size;$('jobs').innerHTML=list.map(j=>`<article class="job"><div class="job-top"><div class="company-icon" style="--brand-bg:${j.color||'#eff4ea'}">${esc(j.logo||j.company[0])}</div><div class="company-name">${esc(j.company)}<small>${j.last_checked?(j.collection_method==='Added by you'?'Added by you · ':'Checked ')+new Date(j.last_checked*1000).toLocaleString():j.demo?'Illustrative company role':'Company listing'}</small></div><button class="save ${saved.has(j.id)?'saved':''}" data-save="${esc(j.id)}" aria-label="${saved.has(j.id)?'Unsave':'Save'} ${esc(j.title)}" aria-pressed="${saved.has(j.id)}">${saved.has(j.id)?'▣':'▱'}</button></div><h3>${safeUrl(j.url)?`<a class="job-title-link" href="${esc(safeUrl(j.url))}" target="_self">${esc(j.title)} ↗</a>`:esc(j.title)}</h3><div class="meta"><span>⌖ ${esc(j.location)}</span><span>◷ ${esc(j.style)}</span><span>${Number.isFinite(j.years)?j.years+'+ years required':'Experience: unverified'}</span></div><div class="chips">${j.listed_on?.length?`<span>${esc(j.listed_on.join(' · '))}</span>`:''}${j.agent?`<span class="agent-badge">${j.agent.decision==='shortlist'?'AI shortlist':j.agent.decision==='exclude'?'Reviewed: gap':'Needs review'}</span>`:''}${j.skills.map(s=>`<span class="${skillList.some(x=>x.toLowerCase()===s.toLowerCase())?'matched':''}">${esc(s)}</span>`).join('')||'<span>Review listing for required skills</span>'}</div>${j.agent?`<p class="agent-card-reason">${esc(j.agent.reason)}</p>`:''}<div class="job-bottom"><span class="match">${j.score===null?'✦ Not ranked yet':`✦ <strong>${j.score}/100</strong> ${j.agent?'documented fit':'relevance'}`}</span><div class="job-actions"><button class="view" data-detail="${esc(j.id)}">Details & ATS resume</button><button class="view" data-referral="${esc(j.id)}">Find a referral</button><button class="view" data-company="${esc(j.id)}">Company brief</button>${safeUrl(j.url)?`<a class="apply-link" href="${esc(safeUrl(j.url))}" target="_self">${esc(applicationLabel(j))}</a>`:""}</div></div></article>`).join('')||`<div class="empty">${loadedOnce?($('job-site').value!=='all'?'No jobs from this site match the current results and filters. Choose All sites or update your search.':'No live roles match these filters. Try another title, broader location, or Find jobs.'):'Add your skills or upload a resume, then click Find jobs to search live company openings.'}</div>`;}
for(const key of ['skills','experience','workstyle'])$(key).addEventListener('input',saveProfile);
$('search').addEventListener('input',()=>{invalidateAgentResults();render();});$('sort').addEventListener('input',render);$('job-site').addEventListener('change',render);
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;updateCityPicker();document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('selected',x===b));render();});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;$('results-heading').firstChild.textContent=view==='saved'?'Your saved roles ':'Explore your possibilities ';$('breadcrumb').textContent=view==='saved'?'Saved jobs':'Discover jobs';document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));render();});
$('profile-link').onclick=()=>{$('skills').scrollIntoView({behavior:'smooth',block:'center'});$('skills').focus();};
function openDetail(j){
 activeJob=j;
 const platformLinks=j.application_links?.length?`<p>Also listed on: ${j.application_links.filter(link=>safeUrl(link.url)).map(link=>`<a href="${esc(safeUrl(link.url))}" target="_self">${esc(link.platform)} ↗</a>`).join(' · ')}. Confirm availability on the destination site.</p>`:'';
 const matches=j.skills.filter(s=>skills().some(x=>x.toLowerCase()===s.toLowerCase()));
 $('detail-content').innerHTML=`<div class="eyebrow">${j.collection_method==='Added by you'?'ADDED BY YOU · VERIFY AVAILABILITY':j.demo?'DEMO ROLE':j.application_links?'PLATFORM JOB LISTING':'COMPANY OPPORTUNITY'}</div><h2>${esc(j.title)}</h2><p>${esc(j.company)} · ${esc(j.location)} · ${esc(j.style)}</p>${safeUrl(j.url)?`<a href="${esc(safeUrl(j.url))}" target="_self">${esc(applicationLabel(j))}</a>`:'<p>This is an example role. Load live company jobs to apply.</p>'}${platformLinks}<details class="job-description"><summary>Read job description</summary><p class="description-text">${esc(j.description)}</p></details><h3>Your profile fit</h3><p>Matched profile skills: ${esc(matches.join(', ')||'None identified')}<br>${Number.isFinite(j.years)?`Experience mentioned in listing: ${j.years}+ years.`:'Experience: review employer requirements.'}</p><section class="tailoring"><h3>Tailor your resume for this role</h3><p>Use a simple text layout and highlight relevant skills already in your resume. Employers, dates, degrees, accomplishments, and experience stay as supplied. Drafts do not affect job recommendations.</p><p>Review the extracted resume before tailoring. For PDFs, check reading order and line breaks. ATS compatibility and selection are not guaranteed.</p><label class="source-label">Original resume text<textarea id="tailor-source" placeholder="Upload a resume above or paste the complete original here"></textarea></label><button id="analyze-resume" class="secondary">Review role keywords</button><div id="tailor-results" aria-live="polite"></div></section>`;
 const companyRoot=document.createElement('details');
 $('detail-content').querySelector('.job-description').after(companyRoot);
 activeCompanyBrief=mountCompanyBrief(companyRoot,j);
 const referralRoot=document.createElement('section');
 $('detail-content').querySelector('.job-description').after(referralRoot);
 mountReferralTools(referralRoot,j);
 $('tailor-source').value=$('resume-text').value;
 $('analyze-resume').onclick=analyzeResume;
 agentUI.showJobTools(j);
 if(!$('detail').open)$('detail').showModal();
}
$('jobs').onclick=e=>{const save=e.target.closest('[data-save]');if(save){const id=save.dataset.save;saved.has(id)?saved.delete(id):saved.add(id);try{localStorage.setItem('nextrole-saved',JSON.stringify([...saved]));}catch{}render();return;}const company=e.target.closest('[data-company]');if(company){const job=jobs.find(x=>x.id===company.dataset.company);if(job){openDetail(job);activeCompanyBrief.open();}return;}const referral=e.target.closest('[data-referral]');if(referral){const job=jobs.find(x=>x.id===referral.dataset.referral);if(job){openDetail(job);$('referral-tools').scrollIntoView({block:'start'});$('referral-tools').focus({preventScroll:true});}return;}const detail=e.target.closest('[data-detail]');if(detail)openDetail(jobs.find(x=>x.id===detail.dataset.detail));};
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
   $('download-word').onclick=async()=>{
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
function importText(text){if(!text.trim())throw new Error('No readable text found. Paste your resume text instead.');originalResume=text;$('resume-text').value=text;$('resume-text').dispatchEvent(new Event('input'));const p=extract(text);$('skills').value=p.skills.join(', ');if(p.years!==null){$('experience').value=String(p.years);}$('skills').dispatchEvent(new Event('input'));$('upload-status').textContent='Resume loaded. Ranking jobs locally using your current preferences. Review the imported text and confirm your total years of experience.';agentUI.search();}
$('extract').onclick=()=>{try{importText($('resume-text').value);}catch(e){$('upload-status').textContent=e.message;}};
$('resume').onchange=async e=>{const f=e.target.files[0];if(!f)return;$('upload-status').textContent='Reading your resume…';try{if(f.size>5*1024*1024)throw new Error('Please choose a file smaller than 5 MB.');const ext=f.name.split('.').pop().toLowerCase();let text;if(ext==='txt')text=await f.text();else if(ext==='pdf'){const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';const pdf=await pdfjs.getDocument({data:await f.arrayBuffer()}).promise;const pages=[];for(let i=1;i<=pdf.numPages;i++)pages.push(pdfPageText((await(await pdf.getPage(i)).getTextContent()).items));text=pages.join('\n');}else if(ext==='docx'){if(!window.mammoth)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('DOCX reader could not load. Paste your resume text instead.'));document.head.appendChild(s);});text=(await window.mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()})).value;}else throw new Error('Use a PDF, DOCX or TXT file.');importText(text);}catch(e){$('upload-status').textContent=`Could not read resume: ${e.message} You can paste text below.`;}e.target.value='';};
// Public jobs are collected by the backend, independently of Gemini and applicant searches.
let cachedApi=null,cachePoll=null,pollAttempts=0,browseGeneration=0;
function uiJobs(items){return items.map(j=>({...j,skills:extract(j.title+' '+j.description).skills}));}
function filterExplanation(data){
 if(data.jobs.length||!Number.isFinite(data.excluded_location))return '';
 const reasons=[];
 if(data.excluded_location)reasons.push(`${data.excluded_location} outside your selected cities or without a confirmed location`);
 if(data.excluded_workstyle)reasons.push(`${data.excluded_workstyle} with a different work style`);
 if(data.experience_gaps)reasons.push(`${data.experience_gaps} requiring more than your confirmed experience`);
 return reasons.length?` Excluded: ${reasons.join('; ')}.`:'';
}
function showCacheMeta(data){
 return `${data.total??data.jobs?.length??0} openings available.`;
}
async function loadJobs(refresh=false){
 const generation=browseGeneration,button=$('live');button.disabled=true;
 try{
  const backend=await findBackend();cachedApi=backend.origin;
  if(!(backend.status.capabilities||[]).includes('careers-page-scraping')){
   jobs=[];loadedOnce=false;render();$('find-jobs').disabled=true;
   $('source-note').textContent='Restart the backend with python start_agent.py to load careers-page scraping. Then reload this page.';return false;
  }
  $('find-jobs').disabled=false;
  if(!(backend.status.capabilities||[]).includes('cached-job-search'))throw new Error('Restart the backend with python start_agent.py to load cached job search.');
  if(refresh)await apiRequest(cachedApi,'/api/jobs/refresh',{},10000);
  const resume=$('resume-text').value.trim().length>=40?$('resume-text').value:'';
  const data=await apiRequest(cachedApi,'/api/jobs/search',{resume,preferences:{experience:Number($('experience').value),cities:remoteMode()?[]:selectedCities,workstyle:remoteMode()?'Remote':$('workstyle').value,target_roles:$('search').value.trim()},limit:200},30000);
  if(generation!==browseGeneration)return false;
  jobs=uiJobs(data.jobs);loadedOnce=true;relevantOnly=false;
  resultsRanked=!!resume&&data.ranking_mode!=='browse';
  $('results-heading').firstChild.textContent=resultsRanked?'Relevant openings ':'Company openings ';
  $('source-note').textContent=showCacheMeta(data)+(resultsRanked?` Showing ${data.jobs.length} results ranked for your resume and preferences. Check each job's requirements before applying.`:` Showing ${data.jobs.length} jobs matching your preferences. Find jobs to rank them using your resume.`)+filterExplanation(data);
  render();
  if((refresh||!data.jobs.length||data.refreshing)&&pollAttempts<45){clearTimeout(cachePoll);cachePoll=setTimeout(()=>{pollAttempts++;loadJobs(false);},3000);}
  return true;
 }catch(e){$('source-note').textContent='Job listings are temporarily unavailable. Please try again shortly.';return false;}
 finally{button.disabled=false;button.textContent='Refresh jobs';}
}
function clearSearchMessage(){if($('search-status')){$('search-status').textContent='';$('search-status').hidden=true;}}
$('live').onclick=()=>{clearSearchMessage();browseGeneration++;pollAttempts=0;loadJobs(true);};
render();
const agentUI=setupAgentUI({
 canTailor:source=>extractionReview.ready(source),
 onSearchStart:()=>{browseGeneration++;clearTimeout(cachePoll);},
 getResume:()=>$('resume-text').value,
 getPreferences:()=>({experience:Number($('experience').value),cities:remoteMode()?[]:selectedCities,workstyle:remoteMode()?'Remote':$('workstyle').value,target_roles:$('search').value.trim()}),
 acceptSearch:data=>{
  browseGeneration++;clearTimeout(cachePoll);jobs=uiJobs(data.jobs);loadedOnce=true;relevantOnly=false;if(!data.incremental){view='all';tab='all';}updateCityPicker();
  resultsRanked=data.resume_ranked===true&&data.ranking_mode!=='browse';
  $('results-heading').firstChild.textContent=resultsRanked?'Relevant openings ':'Company openings ';
  $('source-note').textContent=showCacheMeta(data)+(resultsRanked?` Showing ${data.jobs.length} results ranked for your resume and preferences. Check each job's requirements before applying.`:` Showing ${data.jobs.length} jobs matching your preferences. Upload a resume to rank them.`)+filterExplanation(data);
  render();
 },
 acceptAssessment:(job,assessment)=>{jobs=jobs.map(j=>j.id===job.id?{...j,agent:assessment}:j);render();}
});
const extractionReview=setupExtractionReview({getResume:()=>$('resume-text').value,onCorrected:text=>importText(text)});
setupPlatformJobs({getPreferences:()=>({query:$('search').value.trim(),cities:remoteMode()?[]:selectedCities,workstyle:remoteMode()?'Remote':$('workstyle').value}),onImported:async()=>{browseGeneration++;clearTimeout(cachePoll);await loadJobs(false);}});
loadJobs(false);

