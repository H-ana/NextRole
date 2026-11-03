import assert from 'node:assert/strict';
import {applicationRows,matchesApplication,gmailLink,setupApplicationTracker} from './dist/application-tracker.mjs';
const remote={id:'one',company:'Example',role:'Software Engineer',reference:'JOB-123',status:'Interview',referred:true,referrers:['Alex'],events:[{message_id:'abcdef123456',category:'Interview invitation',subject:'<img src=x onerror=bad()>',received_at:1}],last_updated:100};
const legacy={id:'old',name:'Alex',contacted:'2026-10-20',added:'2026-10-20',status:'Referred',notes:'Responded',profile:'',job:{id:'legacy',source_job_id:'JOB-123',company:'Example',title:'Software Engineer',url:'https://example.com/job/123'}};
const rows=applicationRows([remote],[legacy]);assert.equal(rows.length,1);assert.equal(rows[0].manualReferrals[0].name,'Alex');assert.equal(rows[0].status,'Interview');
assert.equal(applicationRows([{...remote,reference:'JOB-999'}],[legacy]).length,2);
assert(matchesApplication(rows[0],'Referred','job-123'));assert(matchesApplication(rows[0],'Interview','software'));assert(!matchesApplication(rows[0],'Offer',''));
assert(matchesApplication({...remote,needs_details:true},'Needs job details',''));
assert.equal(applicationRows([],[{...legacy,status:'Not contacted yet'}]).length,0,'Exploration-only referral records are hidden');
assert.equal(gmailLink('test+label@example.com',remote.events[0]),'https://mail.google.com/mail/?authuser=test%2Blabel%40example.com#all/abcdef123456');assert.equal(gmailLink('',{message_id:'javascript:bad'}),'');

class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=false;this.value='';this.textContent='';this.nodes=new Map();created.push(this);}
 append(...nodes){this.children.push(...nodes);if(this.tag==='select'&&!this.value&&nodes[0])this.value=nodes[0].value||nodes[0].textContent;}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(key,value){this[key]=value;}
 set innerHTML(value){this.html=value;this.nodes=new Map();for(const key of ['select','input','[data-sync]','[data-application-status]','[data-application-records]'])this.nodes.set(key,new Element(key==='select'?'select':key==='input'?'input':'div'));}
 querySelector(key){return this.nodes.get(key);}
}
const created=[],main=new Element('main'),body=new Element();
globalThis.document={body,createElement:tag=>new Element(tag),querySelector:()=>main};
globalThis.location={origin:'http://localhost:8080',hostname:'localhost',port:'8080'};
globalThis.setTimeout=()=>0;
globalThis.fetch=async url=>({ok:true,json:async()=>url.endsWith('/api/status')?{connected:true}:url.endsWith('/api/applications/lifecycle')?{connected:true,email:'test@example.com',applications:[remote],last_checked:10}:{checking:true}});
const store=new Map(),storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
const tracker=setupApplicationTracker({storage});await new Promise(resolve=>setImmediate(resolve));
assert.equal(tracker.root.id,'applications-view');assert(created.some(n=>n.textContent==='<img src=x onerror=bad()>'),'Subjects render as text');assert(!created.some(n=>n.html?.includes('onerror=bad()')),'Mail content is never inserted as HTML');
assert.equal(tracker.trackJob({id:'job-two',title:'Data Engineer',company:'Example',url:'https://example.com/jobs/two'}),true);
assert(!store.has('nextrole-referrals-v1'),'Opening a referral search does not add a placeholder application');
console.log('Application grouping, job ID/status filters, referral migration, safe Gmail links and UI rendering passed.');
