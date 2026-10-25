// Synthetic UI/transport tests. No applicant documents or real Gemini requests.
import assert from 'node:assert/strict';
import {setupAgentUI,withConfirmedExperience,friendlyAiError} from './dist/agent-ui.mjs';
const elements=new Map(),created=[],storage=new Map();
class Element{
 constructor(id=''){this.value='';this.checked=false;this.disabled=false;this.textContent='';this.children=[];this.listeners={};this.isConnected=true;this.open=false;this.hidden=false;this.id=id;created.push(this);}
 set id(value){this._id=value;if(value)elements.set(value,this);}get id(){return this._id;}
 set innerHTML(value){this.html=value;}get innerHTML(){return this.html||'';}
 setAttribute(name,value){this[name]=value;}addEventListener(name,handler){(this.listeners[name]??=[]).push(handler);}
 get childNodes(){return this.children;}
 append(e){this.children.push(e);}after(){}before(){}replaceChildren(...items){this.children=items;this.html='';this.textContent='';}scrollIntoView(){}
 querySelector(){return el('description');}querySelectorAll(){return [];}
 showModal(){this.open=true;}close(){this.open=false;for(const handler of this.listeners.close||[])handler({});}
}
const el=id=>elements.get(id)||new Element(id);
globalThis.document={getElementById:el,createElement:()=>new Element(),body:new Element('body')};
globalThis.sessionStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.location={origin:'http://localhost:8080',hostname:'localhost',port:'8080'};
let resume='Synthetic complete resume with demonstrated Python services and SQL reconciliation.',preferences={experience:2,workstyle:'any'},connected=false,quota=false,changeDuringSearch=false,extractionReady=true;
const calls=[],searches=[],reviews=[];let searchStarts=0;
const job={id:'one',title:'Engineer',company:'Example',description:'Python services. Requires 4 years of experience.',location:'Bengaluru'};
globalThis.fetch=async(url,options)=>{
 if(url.endsWith('/api/status'))return {ok:true,json:async()=>({connected,model:'gemini-3.6-flash',capabilities:['cached-job-search','resume-profile','tailoring-evidence-v2','bulk-resume-corrections']})};
 const body=JSON.parse(options.body);calls.push({url,body});
 if(url.endsWith('/api/jobs/search')){if(changeDuringSearch){resume+=' Changed.';changeDuringSearch=false;}return {ok:true,json:async()=>({jobs:[job],total:50})};}
 if(quota)return {ok:false,json:async()=>({error:'Gemini account quota or billing limit is exhausted.'})};
 if(url.endsWith('/api/agent/shortlist'))return {ok:true,json:async()=>({assessments:[{job_id:'one',decision:'exclude',score:45,reason:'Candidate has under 1 year.',experience:'gap',experience_quote:'Requires 4 years of experience.',work_style:'unknown',requirements:[],questions:[]}]})};
 if(url.endsWith('/api/agent/tailor'))return {ok:true,json:async()=>({suggestions:[],advice:[],note:'Preserve original facts.'})};
 throw new Error('Unexpected endpoint '+url);
};
let approvedAddition='';
const app=setupAgentUI({interview:async source=>({source:source+approvedAddition,facts:[]}),getResume:()=>resume,getPreferences:()=>preferences,acceptSearch:r=>searches.push(r),acceptAssessment:(j,a)=>reviews.push(a),onSearchStart:()=>{searchStarts++;},canTailor:()=>extractionReady});
assert.equal(calls.length,0,'No diagnostic/model requests on startup');
assert.equal(created.some(e=>/Your resume, understood once|Compare model speed|GEMINI MODEL/.test(e.innerHTML)),false,'No technical panel is created');
const submit=()=>el('job-search-form').onsubmit({preventDefault(){}});
await submit();await new Promise(resolve=>setImmediate(resolve));
assert.equal(searches.length,1);assert.equal(calls.length,1);assert.match(calls[0].url,/jobs\/search$/);assert.equal(calls[0].body.consent,undefined);
assert.equal(searchStarts,1,'Starting a resume search invalidates pending browse updates');
assert.equal(el('find-jobs').disabled,false);
el('tailor-source').value=resume;app.showJobTools(job);
const review=created.find(e=>e.textContent==='Review my fit');
await review.onclick();assert.match(el('ai-fit-review').textContent,/temporarily unavailable/);assert.equal(el('ai-permission').open,false);
connected=true;
let pending=review.onclick();await new Promise(resolve=>setImmediate(resolve));
assert.equal(el('ai-permission').open,true);assert.equal(calls.length,1,'Permission precedes any resume transmission');
el('ai-permission-decline').onclick();await pending;
assert.equal(calls.length,1);assert.match(el('ai-fit-review').textContent,/not enabled/);
pending=review.onclick();await new Promise(resolve=>setImmediate(resolve));el('ai-permission-allow').onclick();await pending;
assert.equal(storage.get('nextrole-ai-consent'),'allowed');assert.equal(reviews.length,1);
assert.equal(calls.at(-1).body.model,'gemini-3.6-flash','Backend selects the model internally');assert.equal(calls.at(-1).body.consent,true);assert.equal(calls.at(-1).body.resume,resume);
assert.match(reviews[0].reason,/confirmed total experience is 2 years/);assert.doesNotMatch(reviews[0].reason,/under 1 year/);
const before=calls.length;await review.onclick();assert.equal(calls.length,before,'Unchanged fit review is reused internally');
preferences={experience:3,cities:['Mumbai'],workstyle:'Hybrid'};await review.onclick();assert.equal(calls.length,before+1,'Updated preferences require a fresh fit review');
const beforeWarning=calls.length;extractionReady=false;await el('ai-tailor').onclick();assert.equal(calls.length,beforeWarning);assert.match(el('ai-tailoring').textContent,/acknowledge/);
extractionReady=true;await el('ai-tailor').onclick();assert.match(calls.at(-1).url,/agent\/tailor$/);assert.equal(el('ai-tailor').disabled,false);
approvedAddition=' Confirmed scope: 500 records.';await el('ai-tailor').onclick();assert.equal(calls.at(-1).body.resume,resume+approvedAddition);assert.equal(el('tailor-source').value,resume,'The original matching resume remains unchanged');approvedAddition='';
const retainedDraft=new Element('retained-draft');el('ai-tailoring').append(retainedDraft);quota=true;await el('ai-tailor').onclick();assert(el('ai-tailoring').children.includes(retainedDraft),'Quota failures retain the existing draft DOM and controls');quota=false;
assert.equal(calls.some(c=>/profile$|benchmark$|connection-test$/.test(c.url)),false,'No separate parse or diagnostic action is exposed or invoked');
const manage=created.find(e=>e.textContent==='AI data permission');pending=manage.onclick();
for(const handler of el('ai-permission').listeners.cancel)handler({preventDefault(){}});await pending;
assert.equal(storage.get('nextrole-ai-consent'),'allowed','Dismissing settings preserves an existing permission');
pending=manage.onclick();assert.equal(el('ai-permission').open,true);el('ai-permission-decline').onclick();await pending;
assert.equal(storage.has('nextrole-ai-consent'),false,'Session permission can be revoked');
const beforeCancel=calls.length;pending=review.onclick();await new Promise(resolve=>setImmediate(resolve));
for(const handler of el('ai-permission').listeners.cancel)handler({preventDefault(){}});await pending;
assert.equal(calls.length,beforeCancel,'Escape cancels without sending the resume');
quota=true;resume+=' Fresh details.';el('tailor-source').value=resume;
pending=review.onclick();await new Promise(resolve=>setImmediate(resolve));el('ai-permission-allow').onclick();await pending;
assert.match(el('ai-fit-review').textContent,/usage limit/);assert.doesNotMatch(el('ai-fit-review').textContent,/Gemini|billing/);
await submit();await new Promise(resolve=>setImmediate(resolve));assert.equal(searches.length,2,'Local search survives AI quota errors');
changeDuringSearch=true;const count=searches.length;await submit();await new Promise(resolve=>setImmediate(resolve));assert.equal(searches.length,count,'Stale search results are discarded');
const beforeEmptySearch=calls.length;resume='';await submit();await new Promise(resolve=>setImmediate(resolve));
assert.equal(calls.length,beforeEmptySearch+1,'The same button searches by preferences when no resume is loaded');
assert.equal(calls.at(-1).body.resume,'');assert.equal(searches.at(-1).resume_ranked,false);
assert.match(el('search-status').textContent,/Upload a resume to rank them/);
const beforePartial=calls.length;resume='Too short';await app.search();
assert.equal(calls.length,beforePartial,'Partial resume text must not be silently treated as an empty resume');
assert.match(el('search-status').textContent,/too short/);
assert.equal(el('find-jobs').disabled,false);
assert.match(friendlyAiError(new Error('Daily quota exhausted')),/usage limit/);
resume='Synthetic imported resume demonstrating financial reconciliation and SQL analysis.';
const beforeImportSearch=calls.length;await app.search();
assert.equal(calls.length,beforeImportSearch+1,'Resume import can trigger the same local search directly');
assert.equal(calls.at(-1).body.resume,resume);
assert.match(calls.at(-1).url,/jobs\/search$/);
const grounded=withConfirmedExperience({experience:'gap',experience_quote:'4+ years required',reason:'Under 1 year.'},2);assert.match(grounded.reason,/confirmed total experience is 2 years/);
console.log('Passed: no technical panel/startup AI calls; one search action; contextual consent, cancellation, Escape and revocation; internal model/profile workflow; cached fit; stale results; quota-safe local search.');

