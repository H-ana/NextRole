import {html,publicLink} from './opportunity-tools.mjs?v=91';
export function interviewAnchors(source){
 let section='';return source.split('\n').flatMap((line,index)=>{
  if(/^(profile|summary|professional summary|experience|work experience|professional experience|employment history|projects|education|skills|technical skills|certifications)\s*:?$/i.test(line.trim())){section=line.trim().replace(/:$/,'').toLowerCase();return [];}
  return /summary|profile|experience|history|projects/.test(section)&&line.trim().length>=35&&!/@|https?:\/\/|\b(?:jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}|\b(?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|present|current)\b/i.test(line)?[{index,text:line,section}]:[];
 });
}
export function approveInterviewFacts(source,facts){
 const lines=source.split('\n'),anchors=interviewAnchors(source),approved=[];
 for(const fact of facts){
  if(!fact.approved)continue;
  const anchor=anchors.find(a=>a.index===fact.index);
  if(!anchor||anchor.text!==fact.original)throw new Error('The resume changed. Review these answers again.');
  const answer=String(fact.answer||'').trim();if(!answer||answer.length>400||/[\r\n]/.test(answer))throw new Error('Use one short, factual sentence per answer (up to 400 characters).');
  if(fact.kind==='link'&&!publicLink(answer))throw new Error('Use a public HTTPS project or portfolio link without credentials.');
  approved.push({...fact,answer});
 }
 // Keep each addition with its original role/project and preserve all source
 // lines, protected headers and employment chronology.
 for(const fact of approved)lines[fact.index]+=' '+(fact.kind==='link'?'Project link: ':'')+fact.answer;
 const text=lines.join('\n');if(text.length>60000)throw new Error('The resume is too long; shorten your approved additions.');
 return {source:text,facts:approved};
}
const words=value=>String(value||'').toLowerCase().match(/[a-z0-9+#]+/g)||[];
const stops=new Set(['with','from','that','this','have','using','experience','required','skills','years','year','role','work','and','the','for','of','in','to','a']);
const terms=value=>words(value).filter(w=>!stops.has(w)&&w.length>1).map(w=>w.length>6?w.slice(0,6):w);
const hasResult=line=>/\b(?:\d[\d,.]*\s*(?:%|records?|users?|customers?|reports?|hours?|minutes?|days?|transactions?|pipelines?|projects?|datasets?|files?|applications?)|reduced|improved|saved|ensur(?:ed|ing)|enabled|prevented|eliminated|resulted|leading to|so that|accuracy|consistency)\b/i.test(line)||/\d[\d,.]*\s*%/.test(line);
export function clarificationQuestions(job,source){
 const anchors=interviewAnchors(source),questions=[];
 if(!anchors.length)return {anchors,questions};
 const target=new Set(terms([job.title,...(job.skills||[])].join(' ')));
 const ranked=[...anchors].sort((a,b)=>terms(b.text).filter(w=>target.has(w)).length-terms(a.text).filter(w=>target.has(w)).length);
 const resumeTerms=new Set(terms(source));
 // Never ask for a generic description of work already provided. A gap question
 // needs a genuine missing term and an unambiguous related source accomplishment.
 for(const gap of job.agent?.requirements||[]){
  if(!['missing','partial'].includes(gap.status)||!gap.requirement)continue;
  const needed=terms(gap.requirement);if(!needed.length||needed.every(t=>resumeTerms.has(t)))continue;
  const scored=anchors.map(a=>({a,score:terms(a.text).filter(t=>needed.includes(t)).length})).sort((a,b)=>b.score-a.score);
  if(!scored[0]?.score||scored.length>1&&scored[0].score===scored[1].score)continue;
  questions.push({kind:'gap',anchor:scored[0].a,label:`For “${scored[0].a.text.slice(0,160)}”, is there additional evidence for “${gap.requirement}” that is not already in your resume?`,hint:'Add only a missing fact you can substantiate. Leave blank if there is no additional evidence.'});break;
 }
 const best=ranked.find(a=>!/summary|profile/.test(a.section))||ranked[0];
 if(best&&!hasResult(best.text))questions.push({kind:'outcome',anchor:best,label:`For “${best.text.slice(0,160)}”, what verified result or scope could you add?`,hint:'Only add information missing from the resume, such as measured volume, time saved or a specific outcome. Leave blank if unavailable; do not estimate a number.'});
 const project=ranked.find(a=>a.section==='projects');
 const existingProof=[...source.matchAll(/https?:\/\/[^\s<>]+/gi)].some(m=>!/(?:^|\.)linkedin\.com$/i.test((()=>{try{return new URL(m[0]).hostname;}catch{return '';}})()));
 if(project&&!existingProof)questions.push({kind:'link',anchor:project,label:`Do you have a public repository, demo or case study for “${project.text.slice(0,160)}”?`,hint:'Only provide a public project link that is not already in your resume. Leave blank if you do not have one.'});
 return {anchors,questions:questions.slice(0,3)};
}
export function clarifyResume(source,job){
 const {anchors,questions}=clarificationQuestions(job,source);
 if(!questions.length)return Promise.resolve({source,facts:[]});
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.id='resume-interview';dialog.className='resume-interview';document.body.append(dialog);let settled=false;
  function finish(result){if(settled)return;settled=true;dialog.close();dialog.remove();resolve(result);}
  dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
  function ask(saved=[]){
   dialog.innerHTML=`<h2>A few facts before tailoring</h2><p>For ${html(job.title)} at ${html(job.company)}. Answer only what you can support. These answers stay in memory and are not sent to AI until you approve them and allow AI sharing.</p><p>Only missing details are requested. Your matching resume stays unchanged.</p><form>${questions.map((q,i)=>`<fieldset><legend>${i+1}. ${html(q.label)}</legend><p>${html(q.hint)}</p><label>${q.kind==='link'?'Public project link (optional)':'Your answer (optional)'}<input name="answer-${i}" maxlength="400" ${q.kind==='link'?'type="url"':'type="text"'}></label></fieldset>`).join('')}<p role="alert" data-error></p><button type="submit">Review my answers</button> <button type="button" class="secondary" data-skip>Continue without additions</button> <button type="button" class="secondary" data-cancel>Cancel</button></form>`;
   const form=dialog.querySelector('form');saved.forEach((f,i)=>{if(f)form.elements['answer-'+i].value=f.answer;});
   dialog.querySelector('[data-cancel]').onclick=()=>finish(null);dialog.querySelector('[data-skip]').onclick=()=>finish({source,facts:[]});
   form.onsubmit=e=>{e.preventDefault();const facts=questions.map((q,i)=>{return {kind:q.kind,index:q.anchor.index,original:q.anchor.text,answer:form.elements['answer-'+i].value.trim()};});
    try{approveInterviewFacts(source,facts.map(f=>({...f,approved:!!f.answer})));review(facts);}catch(error){dialog.querySelector('[data-error]').textContent=error.message;}};
  }
  function review(facts){
   const available=facts.filter(f=>f.answer);
   dialog.innerHTML='<h2>Approve the facts to include</h2><p>Nothing is selected automatically. Check that every addition is accurate, belongs to the chosen role/project and can be discussed in an interview. No dates, employers, titles or existing claims are replaced.</p><form>'+available.map((f,i)=>`<label class="ai-edit"><input type="checkbox" name="fact" value="${i}"><span><strong>Original context</strong><p>${html(f.original)}</p><strong>Your addition</strong><p>${html(f.answer)}</p></span></label>`).join('')+'<p role="alert" data-error></p><button type="submit">Continue with selected facts</button> <button type="button" class="secondary" data-back>Edit answers</button> <button type="button" class="secondary" data-cancel>Cancel</button></form>';
   dialog.querySelector('[data-back]').onclick=()=>ask(facts);dialog.querySelector('[data-cancel]').onclick=()=>finish(null);
   dialog.querySelector('form').onsubmit=e=>{e.preventDefault();const selected=new Set([...dialog.querySelectorAll('[name=fact]:checked')].map(x=>Number(x.value)));try{finish(approveInterviewFacts(source,available.map((f,i)=>({...f,approved:selected.has(i)}))));}catch(error){dialog.querySelector('[data-error]').textContent=error.message;}};
  }
  ask();dialog.showModal();
 });
}
export function draftChanges(original,approvedSource,draft,data,selection,facts=[]){
 const changes=facts.map(f=>({kind:'Confirmed evidence',before:f.original,after:f.answer,reason:'Added from your clarification answer with your approval.'}));
 for(const index of selection.wordings||[]){const s=data.suggestions[index];if(s)changes.push({kind:'Wording',before:s.original,after:s.replacement,reason:s.rationale,job:s.job_quote});}
 if(selection.summary&&data.summary_suggestion)changes.push({kind:'Summary',before:data.summary_suggestion.original||'No existing summary',after:data.summary_suggestion.text,reason:data.summary_suggestion.rationale,job:data.summary_suggestion.job_quote});
 for(const index of selection.orderings||[]){const s=data.ordering_suggestions[index];if(s)changes.push({kind:'Ordering',before:'Original order within the role/project',after:s.label,reason:s.rationale,job:s.job_quote});}
 return changes;
}
