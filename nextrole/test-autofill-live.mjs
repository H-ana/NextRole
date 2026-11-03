import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import './browser-extension/autofill-parser.js';
import './browser-extension/autofill-history.js';
import './browser-extension/documents.js';
const stored={};let failWrite=false,access='';
globalThis.chrome={storage:{local:{get:async()=>structuredClone(stored),set:async data=>{if(failWrite)throw Error('Storage quota exceeded');Object.assign(stored,structuredClone(data));},remove:async keys=>{for(const key of [keys].flat())delete stored[key];},setAccessLevel:async data=>{access=data.accessLevel;}}}};
const docs=NextRoleAutofillDocuments;
const profileFile={size:120,text:async()=>JSON.stringify({format:'nextrole-autofill',version:2,reviewed:true,profile:{firstName:'Alex',email:'alex@example.com',employmentHistory:[{company:'Example Ltd',title:'Analyst',startMonth:'June',startYear:'2024',current:'Yes'}]}})};
const file=content=>({name:'resume.pdf',size:content.length,arrayBuffer:async()=>new TextEncoder().encode(content).buffer});
await assert.rejects(()=>docs.revision({payload:null,resume:null}),/both/);
await docs.saveProfile(profileFile);await assert.rejects(async()=>docs.revision(await docs.load()),/both/);
await docs.saveResume(file('%PDF-1.7 synthetic'));let saved=await docs.load();assert.equal(access,'TRUSTED_CONTEXTS');assert.equal(saved.resume.name,'resume.pdf');assert.equal(saved.payload.profile.employmentHistory[0].startMonth,'June');
const firstRevision=await docs.revision(saved);assert.equal(await docs.revision(await docs.load()),firstRevision,'Reopening preserves both documents');
await assert.rejects(()=>docs.saveResume(file('not a PDF')),/does not look/);assert.equal(await docs.revision(await docs.load()),firstRevision,'An invalid upload must not erase the previous document');
failWrite=true;await assert.rejects(()=>docs.saveResume(file('%PDF-1.7 replacement')),/quota/);failWrite=false;assert.equal(await docs.revision(await docs.load()),firstRevision);
await assert.rejects(()=>docs.saveProfile({size:10,text:async()=>'{}'}),/reviewed/);assert.equal(await docs.revision(await docs.load()),firstRevision);
class Element{constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.value='';this.hidden=false;this.disabled=false;this.files=[];}append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}replaceChildren(...nodes){this.children=[];this.append(...nodes);}get childElementCount(){return this.children.length;}querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll(selector)]);return all.filter(n=>selector==='input:checked'?n.tagName==='input'&&n.checked:selector==='[data-field]'?n.dataset.field:false);}}
let fills=0;
const source=await fs.readFile(new URL('./browser-extension/popup.js',import.meta.url),'utf8');
function popup(){const ids=['fields','questions','missing','fill','profile-status','profile-file','resume-status','remove-profile','remove-resume','resume-file','status','scan','destination','use-answers','review'],elements=Object.fromEntries(ids.map(id=>[id,new Element()]));const sandbox={console,URL,NextRoleAutofillDocuments:docs,document:{getElementById:id=>elements[id],createElement:tag=>new Element(tag)},chrome:{tabs:{query:async()=>[{id:9,url:'https://careers.example/apply'}]},scripting:{executeScript:async request=>{if(request.files)return [];if(request.func.toString().includes('.scan('))return [{result:{origin:'https://careers.example',rows:[{id:'first',key:'firstName',label:'First name',value:'Alex'}],questions:[]}}];if(request.func.toString().includes('.fill(')){fills++;return [{result:{filled:1,skipped:0,failed:0}}];}return [];}}}};vm.runInNewContext(source,sandbox);return elements;}
let screen=popup();await screen.scan.onclick();assert.equal(screen.fields.childElementCount,1);assert.match(screen['resume-status'].textContent,/resume.pdf/);
await docs.saveResume(file('%PDF-1.7 another version'));await screen.review.onsubmit({preventDefault(){}});assert.equal(fills,0);assert.match(screen.status.textContent,/changed/);
screen=popup();await screen.scan.onclick();await screen.review.onsubmit({preventDefault(){}});assert.equal(fills,1,'A reopened popup can use both saved documents without re-upload');
await screen['remove-profile'].onclick();saved=await docs.load();assert.equal(saved.payload,null);assert(saved.resume);await screen.scan.onclick();assert.equal(screen.fields.childElementCount,0);assert.match(screen.status.textContent,/both/);
await docs.saveProfile(profileFile);await screen['remove-resume'].onclick();saved=await docs.load();assert(saved.payload);assert.equal(saved.resume,null);await screen.scan.onclick();assert.equal(screen.fill.disabled,true);
console.log('Required documents, persistent reopen, replacement, independent removal, quota failure and stale-preview blocking passed.');
