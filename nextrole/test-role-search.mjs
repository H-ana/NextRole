import assert from 'node:assert/strict';
import {searchPublicJobs,stopSemantic,titleExperienceFit} from './dist/public-search.mjs';
const originalFetch=globalThis.fetch,description='Requires 2–4 years of experience. Build Python, SQL and agentic AI workflows.',band={status:'known',minimum:2,maximum:4,quote:'2–4 years of experience',quotes:['2–4 years of experience'],policy_version:'strict-experience-v2'};
const titles=['AI Engineer','GenAI Engineer','Machine Learning Engineer','Forward-Deployed Engineer','Software Development Engineer II','Support Engineer','Support Specialist','Incident Management Analyst'];
const jobs=titles.map((title,i)=>({id:String(i),title,company:'Microsoft',url:'https://careers.microsoft.com/jobs/'+i,location:'Bengaluru',style:'Hybrid',description,experience_requirement:band,last_checked:Date.now()/1000}));
globalThis.fetch=async()=>({ok:true,text:async()=>JSON.stringify({format:'nextrole-public-jobs',version:1,jobs,sources:[],generated_at:Date.now()/1000})});
let workerJobs=[];globalThis.Worker=class{postMessage(data){workerJobs=data.jobs;queueMicrotask(()=>this.onmessage({data:{id:data.id,scores:data.jobs.map(()=>.8)}}));}terminate(){}};
const resume='Alex Example\nPROFILE\nAgentic AI Developer building Python, SQL and AI workflows.\nEXPERIENCE\nBuilt support ticket triage and incident management automation.';
const preferences={experience:2,cities:['Bengaluru'],workstyle:'Hybrid',target_roles:'Python'};
try{for(const useSemantic of [false,true]){const result=await searchPublicJobs(resume,preferences,{useSemantic});assert.equal(result.jobs.length,5);assert(result.jobs.every(j=>!/support|incident/i.test(j.title)));assert(result.jobs.every(j=>j.role_alignment.aligned));}assert(workerJobs.length===5);assert(workerJobs.every(text=>!/^support|^incident/i.test(text)),'Excluded roles never reach the semantic worker');
const noFit=await searchPublicJobs(resume,{...preferences,experience:1});assert.equal(noFit.jobs.length,0,'Role alignment cannot relax experience requirements');
const wrongCity=await searchPublicJobs(resume,{...preferences,cities:['Chennai']});assert.equal(wrongCity.jobs.length,0);
}finally{stopSemantic();globalThis.fetch=originalFetch;}
console.log('Public ranking integration: role gating before lexical and semantic ranking, no unrelated support/incident jobs, and unchanged strict experience/city filtering passed.');

assert.equal(titleExperienceFit('AI Engineer (0-1 years)',2),true);
assert.equal(titleExperienceFit('AI Engineer (3-5 years)',2),false);
