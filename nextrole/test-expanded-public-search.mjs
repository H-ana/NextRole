import assert from 'node:assert/strict';
import {searchPublicJobs,stopSemantic,titleExperienceFit} from './dist/public-search.mjs';
const description='Minimum qualifications\nPython and SQL\nRequires 2–4 years of experience. Build AI services.',band={status:'known',minimum:2,maximum:4,quote:'2–4 years of experience',quotes:['2–4 years of experience'],policy_version:'strict-experience-v2'};
const jobs=Array.from({length:300},(_,i)=>({id:String(i),title:'AI Engineer',company:'Microsoft',url:'https://careers.microsoft.com/jobs/'+i,location:'Bengaluru, India',style:'Hybrid',description,experience_requirement:band,last_checked:Date.now()/1000}));
const oldFetch=globalThis.fetch,oldWorker=globalThis.Worker;
globalThis.fetch=async()=>({ok:true,text:async()=>JSON.stringify({format:'nextrole-public-jobs',version:1,jobs,sources:[],generated_at:Date.now()/1000})});
globalThis.Worker=class{postMessage(v){queueMicrotask(()=>this.onmessage({data:{id:v.id,scores:v.jobs.map(()=>.7)}}));}terminate(){}};
try{
 const resume='Alex Example\nPROFILE\nAgentic AI Developer\nEXPERIENCE\nBuilt Python and SQL services.';
 const prefs={experience:2,cities:['Bengaluru'],workstyle:'Hybrid',target_roles:''};
 const result=await searchPublicJobs(resume,prefs,{useSemantic:true});assert.equal(result.eligible_count,300,'Semantic batch must not delete other eligible candidates');assert.equal(result.jobs.length,200);
 const missing=await searchPublicJobs('PROFILE\nAgentic AI Developer\nEXPERIENCE\nBuilt Python services.',prefs);assert.equal(missing.jobs.length,200,'Role-aligned partial matches must remain available despite missing SQL evidence');assert(missing.jobs.every(j=>j.qualification_fit.gaps.length>0),'Qualification gaps must remain available for review instead of being represented as confirmed skills');
 const wrongYears=await searchPublicJobs(resume,{...prefs,experience:1});assert.equal(wrongYears.jobs.length,0,'Flexible skill matching must preserve the confirmed experience preference');
 const wrongLocation=await searchPublicJobs(resume,{...prefs,cities:['Mumbai']});assert.equal(wrongLocation.jobs.length,0,'Flexible skill matching must preserve selected cities');
}finally{stopSemantic();globalThis.fetch=oldFetch;globalThis.Worker=oldWorker;}
console.log('Expanded public ranking retains role-aligned partial matches and their qualification gaps while preserving experience and city preferences.');

assert(!titleExperienceFit('Software Engineer (3-4 years)',2));assert(titleExperienceFit('Software Engineer II',2));assert(!titleExperienceFit('Engineer 5+ years',2));
