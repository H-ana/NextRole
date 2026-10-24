import assert from 'node:assert/strict';
import {downloadOnePageResume} from './dist/one-page-export.mjs';
globalThis.location={origin:'http://localhost:8080',hostname:'localhost',port:'8080'};
let pages=2,clicks=0,fontSize=11,available=true,expectedText='Synthetic resume';
globalThis.fetch=async(url,options)=>{
 if(url.endsWith('/api/status'))return{ok:true,json:async()=>({connected:false,capabilities:available?['one-page-resume-export','resume-export-v2']:[]})};
 assert(url.endsWith('/api/resume/export'));assert.equal(JSON.parse(options.body).text,expectedText);
 return{ok:true,json:async()=>({pages,font_size:fontSize,font:'Calibri',checks:{content_preserved:true,reading_order_preserved:true,contact_preserved:true,sections_preserved:true},base64:Buffer.from('PKsynthetic').toString('base64')})};
};
globalThis.document={body:{append(){}},createElement:()=>({click(){clicks++;},remove(){}})};
globalThis.setTimeout=fn=>{fn();};
await assert.rejects(()=>downloadOnePageResume('Synthetic resume','resume.docx'),/one-page/);assert.equal(clicks,0);
pages=1;fontSize=8;await assert.rejects(()=>downloadOnePageResume('Synthetic resume','resume.docx'),/one-page/);assert.equal(clicks,0);
fontSize=10.5;await downloadOnePageResume('Synthetic resume','resume.docx');assert.equal(clicks,1);
expectedText='Alex Example\nSkills\nPython, SQL';await downloadOnePageResume('Alex Example\nSkills\nPythonSQL','resume.docx');assert.equal(clicks,2,'Downloaded text uses the same comma-separated skills as the preview');
await assert.rejects(()=>downloadOnePageResume('Alex Example\nSkills\nPythonSQL','resume.docx',()=>false),/draft changed/);assert.equal(clicks,2,'A changed layout must not download an obsolete resume');
await assert.rejects(()=>downloadOnePageResume('RELEVANT SKILLS\nPython, Alex Example, alex@example.com','resume.docx'),/name must come before/);assert.equal(clicks,2);
available=false;await assert.rejects(()=>downloadOnePageResume('Synthetic resume','resume.docx'),/Restart the backend/);
console.log('Passed: only a verified one-page Word export at a readable font size can download; restart requirement is explicit.');

